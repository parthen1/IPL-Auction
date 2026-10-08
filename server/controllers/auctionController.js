import AuctionState from '../models/AuctionState.js';
import Player from '../models/Player.js';
import Team from '../models/Team.js';
import mongoose from 'mongoose';
import { getIO, updateAuctionTimer } from '../socketHandler.js';

// Helper to get or create the singleton state
const getAuctionState = async () => {
    let state = await AuctionState.findOne();
    if (!state) {
        state = await AuctionState.create({
            status: 'WAITING',
            timerEndsAt: null
        });
    }
    return state;
};

// --- STANDARDIZATION HELPER ---
const getStandardizedState = (state, teams) => {
    const stateObj = state.toObject ? state.toObject() : state;

    // 1. Standardize Teams
    const standardizedTeams = teams.map(t => {
        const tObj = t.toObject ? t.toObject() : t;
        return {
            ...tObj,
            id: tObj.code,            // Requirement: team.id = team code
            budget: tObj.remainingPurse // Requirement: team.budget = remainingPurse
        };
    });

    // 2. Standardize Highest Bidder
    let highestBidderObj = null;
    if (stateObj.highestBidder) {
        const bidderTeam = standardizedTeams.find(t => t.code === stateObj.highestBidder);
        if (bidderTeam) {
            highestBidderObj = { id: bidderTeam.code, name: bidderTeam.name, logo: bidderTeam.logo };
        } else {
            // Fallback
            highestBidderObj = { id: stateObj.highestBidder, name: 'Unknown' };
        }
    }

    return {
        ...stateObj,
        highestBidder: highestBidderObj, // Requirement: Object { id, name }
        teams: standardizedTeams
    };
};
// ------------------------------

export const endTurn = async (req, res) => {
    try {
        const { winner, amount } = req.body;
        const state = await getAuctionState();
        if (!state) return res.status(404).json({ message: 'Auction state not found' });

        // If winner is provided, mark as SOLD to that team
        // If not, mark UNSOLD

        if (winner) {
            state.highestBidder = winner;
            state.currentBid = amount;
            state.timerEndsAt = null; // Stop timer
            state.status = 'RESOLVING';
            await state.save();
            updateAuctionTimer(null); // Clear in-memory timer

            // Trigger resolution (Will pass checks because we just set state)
            await resolveAuctionTurn();
        } else {
            // Mark UNSOLD (Manual)
            state.highestBidder = null;
            state.timerEndsAt = null;
            state.status = 'RESOLVING';
            await state.save();
            updateAuctionTimer(null);

            await resolveAuctionTurn();
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const resetTimer = async (req, res) => {
    try {
        const state = await getAuctionState();
        const io = getIO();

        if (req.query.action === 'pause') {
            state.status = 'PAUSED';
            if (state.timerEndsAt) {
                const now = new Date();
                const remaining = Math.max(0, state.timerEndsAt - now);
                state.remainingTime = remaining;
            }
            state.timerEndsAt = null;
        } else if (req.query.action === 'resume') {
            state.status = 'ACTIVE';
            const durationToAdd = state.remainingTime || 10000;
            state.timerEndsAt = new Date(Date.now() + durationToAdd);
            state.remainingTime = null; // Clear after using
        } else if (req.query.action === 'reset') {
            state.timerEndsAt = new Date(Date.now() + 10000); // 10 seconds
            state.status = 'ACTIVE';
            state.remainingTime = null;
            state.highestBidder = null;
            state.bidHistory = [];
            // Ensure populate before accessing basePrice
            await state.populate('currentPlayer');
            if (state.currentPlayer) {
                state.currentBid = state.currentPlayer.basePrice;
            } else {
                state.currentBid = 0;
            }
        }
        await state.save();

        // 3. Sync In-Memory Timer
        updateAuctionTimer(state.timerEndsAt);

        // Broadcast Update
        if (io) {
            const fullState = await AuctionState.findById(state._id).populate('currentPlayer');
            const teams = await Team.find({});
            const payload = getStandardizedState(fullState, teams);
            io.emit('auction:state', payload);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getAuctionStatus = async (req, res) => {
    try {
        const state = await getAuctionState();
        await state.populate('currentPlayer');

        const teams = await Team.find({});
        const payload = getStandardizedState(state, teams);

        res.json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const startAuction = async (req, res) => {
    try {
        let state = await getAuctionState();

        // If already active, don't restart unless explicitly forced (or maybe just return current)
        // Requirement: "Admin starts auction ONCE"
        if (state.status === 'ACTIVE' && state.currentPlayer) {
            return res.status(400).json({ message: 'Auction is already active' });
        }

        // 0. Hard Reset any stranded LIVE players to prevent ghost states
        await Player.updateMany({ status: 'LIVE' }, { $set: { status: 'AVAILABLE' } });

        // Find next available player based on Set (randomly within the earliest set)
        const minSetDoc = await Player.findOne({ status: 'AVAILABLE' }).sort({ set: 1 }).select('set');

        let nextPlayer = null;
        if (minSetDoc) {
            const randomPlayers = await Player.aggregate([
                { $match: { status: 'AVAILABLE', set: minSetDoc.set } },
                { $sample: { size: 1 } }
            ]);

            if (randomPlayers.length > 0) {
                nextPlayer = await Player.findById(randomPlayers[0]._id);
            }
        }

        if (!nextPlayer) {
            return res.status(404).json({ message: 'No available players left' });
        }

        nextPlayer.status = 'LIVE';
        await nextPlayer.save();

        state.status = 'ACTIVE';
        state.currentPlayer = nextPlayer._id;
        state.currentBid = nextPlayer.basePrice;
        state.highestBidder = null;
        state.bidHistory = [];
        state.bidDuration = 10; // Force 10 seconds default
        state.timerEndsAt = new Date(Date.now() + (state.bidDuration * 1000));
        await state.save();

        // Sync In-Memory Timer
        updateAuctionTimer(state.timerEndsAt);

        // Fetch full populated state
        const fullState = await AuctionState.findById(state._id).populate('currentPlayer');
        const teams = await Team.find({});
        const standardizedState = getStandardizedState(fullState, teams);

        // Broadcast via Socket
        const io = getIO();
        if (io) {
            io.emit('auctionStart', {
                currentPlayer: fullState.currentPlayer,
                currentBid: fullState.currentBid,
                timerEndsAt: state.timerEndsAt
            });
            io.emit('auction:state', standardizedState);
        }

        res.json({ success: true, state: standardizedState });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const nextPlayer = async (req, res) => {
    try {
        await Player.updateMany(
            { status: 'LIVE' },
            { $set: { status: 'AVAILABLE' } }
        );

        // 1. Resolve current turn if active (Force End)
        await resolveAuctionTurn();

        // HARD RESET: Directly clear the auction state in DB first
        await AuctionState.updateOne({}, {
            status: 'WAITING',
            currentPlayer: null,
            highestBidder: null,
            currentBid: 0,
            timerEndsAt: null,
            bidHistory: []
        });

        // 1. Find the lowest available set number
        const minSetDoc = await Player.findOne({ status: 'AVAILABLE' }).sort({ set: 1 }).select('set');

        let nextP = null;
        if (minSetDoc) {
            // 2. Select a RANDOM player from that specific set
            const randomPlayers = await Player.aggregate([
                { $match: { status: 'AVAILABLE', set: minSetDoc.set } },
                { $sample: { size: 1 } }
            ]);

            if (randomPlayers.length > 0) {
                // Aggregate returns plain objects, so we need to instantiate a Mongoose document 
                // or just findById the selected random ID to save it properly
                nextP = await Player.findById(randomPlayers[0]._id);
            }
        }

        console.log('[nextPlayer] Next Player Found:', nextP ? nextP.name : 'None');

        if (!nextP) {
            return res.status(404).json({ message: 'No more players available' });
        }

        // 2b. Mark Player as LIVE
        nextP.status = 'LIVE';
        await nextP.save();

        // 3. Start Auction for Next Player (Upsert ensures existence)
        const newState = await AuctionState.findOneAndUpdate({}, {
            status: 'ACTIVE',
            currentPlayer: nextP._id,
            currentBid: nextP.basePrice,
            highestBidder: null,
            bidHistory: [],
            timerEndsAt: new Date(Date.now() + 10000) // Default 10s
        }, { new: true, upsert: true }).populate('currentPlayer');

        // Sync In-Memory Timer
        updateAuctionTimer(newState.timerEndsAt);

        const fullState = await AuctionState.findById(newState._id).populate('currentPlayer');
        const teams = await Team.find({});
        const standardizedState = getStandardizedState(fullState, teams);

        const io = getIO();
        if (io) {
            io.emit('auctionStart', {
                currentPlayer: fullState.currentPlayer,
                currentBid: fullState.currentBid,
                timerEndsAt: newState.timerEndsAt
            });
            io.emit('auction:state', standardizedState);
        }

        res.json({ success: true, message: `Started auction for ${nextP.name}`, state: standardizedState });

    } catch (error) {
        console.error('[nextPlayer] Error:', error);
        res.status(500).json({ message: error.message });
    }
};

export const placeBid = async (req, res) => {
    try {
        const { amount } = req.body;

        // --- STRICT AUTH LOGIC ---
        // 1. Identify Team from Token
        const teamCode = req.user?.teamCode;

        if (!teamCode) {
            console.error('[placeBid] No teamCode in req.user');
            return res.status(401).json({ message: 'Unauthorized. Please login.' });
        }

        const normalizedTeamId = teamCode.toUpperCase();

        // 2. Lookup Team in DB
        const team = await Team.findOne({ code: normalizedTeamId });

        if (!team) {
            console.error(`[placeBid] DB Team not found for code: ${normalizedTeamId}`);
            return res.status(404).json({ message: 'Team not found' });
        }
        // -------------------------

        // --- RESTORED AUCTION LOGIC ---
        let state = await getAuctionState();

        if (state.status !== 'ACTIVE' || !state.currentPlayer) {
            return res.status(400).json({ message: 'No active auction' });
        }

        await state.populate('currentPlayer');
        const player = state.currentPlayer;

        if (team.squadSize >= 25) {
            return res.status(400).json({ message: 'Maximum squad size of 25 reached' });
        }

        if (team.overseasCount >= 8 && player.country !== 'India') {
            return res.status(400).json({ message: 'Maximum overseas limit of 8 reached' });
        }

        if (state.highestBidder === team.code) { // Compare with Normalized DB Code
            return res.status(400).json({ message: 'You already hold the highest bid' });
        }

        // Logic Change: Treat `amount` as TOTAL BID VALUE (Cleaner control from frontend)
        const newBidAmount = Math.round(parseFloat(amount) * 100) / 100;

        if (isNaN(newBidAmount) || newBidAmount <= 0) {
            return res.status(400).json({ message: 'Invalid bid amount' });
        }

        const currentBid = state.currentBid || 0;

        let minIncrement = 0.05;
        if (currentBid >= 1 && currentBid < 2) minIncrement = 0.10;
        else if (currentBid >= 2 && currentBid < 5) minIncrement = 0.20;
        else if (currentBid >= 5) minIncrement = 0.25;

        // Validation 1: Bid must be higher than current OR equal if it's the opening bid
        if (state.highestBidder) {
            const requiredBid = Math.round((currentBid + minIncrement) * 100) / 100;
            if (newBidAmount < requiredBid) {
                return res.status(400).json({ message: `Bid must be at least ₹${requiredBid} Cr` });
            }
        } else {
            // Opening Bid Logic: Must be at least Base Price (which is currentBid initially)
            // We allow newBidAmount == currentBid here
            if (newBidAmount < currentBid) {
                return res.status(400).json({ message: `Bid must be at least Base Price (₹${currentBid})` });
            }
        }

        // Check Budget
        if (team.remainingPurse < newBidAmount) {
            return res.status(400).json({ message: `Insufficient purse. You need ₹${newBidAmount} but have ₹${team.remainingPurse}` });
        }

        // Update State Atomically
        const atomicUpdate = await AuctionState.findOneAndUpdate(
            {
                _id: state._id,
                status: 'ACTIVE',
                $or: [
                    { highestBidder: { $ne: null }, currentBid: { $lt: newBidAmount } },
                    { highestBidder: null, currentBid: { $lte: newBidAmount } }
                ]
            },
            {
                $set: {
                    currentBid: newBidAmount,
                    highestBidder: team.code,
                    timerEndsAt: new Date(Date.now() + 10000)
                },
                $push: {
                    bidHistory: {
                        $each: [{ team: team.code, amount: newBidAmount, timestamp: new Date() }],
                        $position: 0
                    }
                }
            },
            { new: true }
        );

        if (!atomicUpdate) {
            return res.status(400).json({ message: 'Bid rejected: Race condition or invalid amount' });
        }

        state = atomicUpdate;
        updateAuctionTimer(state.timerEndsAt); // Update in-memory timer

        const io = getIO();
        if (io) {
            // Send full state update for perfect sync with fresh team data
            const teams = await Team.find({});
            const populatedState = await state.populate('currentPlayer');

            const payload = getStandardizedState(populatedState, teams);

            // Single Truth Emission
            io.emit('auction:state', payload);
            io.emit('bidPlaced', { amount: newBidAmount }); // Only for sound/toast effect
        }

        res.json({ success: true, bid: newBidAmount });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Called by Timer Expiry or Admin Force Sell
// Called by Timer Expiry or Admin Force Sell
export const resolveAuctionTurn = async (triggeredByTimer = false) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        let state = await getAuctionState();

        // 1. Idempotency Check
        if (triggeredByTimer) {
            const now = new Date();
            // 500ms grace period for slight clock skews
            if (!state.timerEndsAt || new Date(state.timerEndsAt) > now) {
                console.log(`[resolveAuctionTurn] Ignored premature timer. Ends at: ${state.timerEndsAt}, Now: ${now}`);
                await session.abortTransaction();
                return;
            }
        }

        // 2. Active Check
        if ((state.status !== 'ACTIVE' && state.status !== 'RESOLVING') || !state.currentPlayer) {
            console.log(`[resolveAuctionTurn] Ignored. Status: ${state.status}`);
            await session.abortTransaction();
            return;
        }

        const io = getIO();
        await state.populate('currentPlayer');
        const player = state.currentPlayer;

        if (state.highestBidder) {
            // SOLD
            const teamCode = state.highestBidder;
            const amount = state.currentBid;

            // ATOMIC UPDATE to prevent double-spend or double-sell
            const success = await AuctionState.findOneAndUpdate(
                { _id: state._id, status: { $in: ['ACTIVE', 'RESOLVING'] }, currentPlayer: player._id },
                { status: 'SOLD', timerEndsAt: null },
                { new: true, session }
            );

            if (!success) {
                console.log('[resolveAuctionTurn] Race condition detected. Turn already resolved.');
                await session.abortTransaction();
                return;
            }
            state = success; // Update local ref

            // Update Team (WITH SESSION)
            const teamDoc = await Team.findOne({ code: teamCode }).session(session);
            if (!teamDoc) throw new Error("Winning team no longer exists");

            if (teamDoc.remainingPurse < amount) {
                throw new Error("Insufficient purse for winning team");
            }

            teamDoc.remainingPurse -= amount;
            teamDoc.squadSize += 1;
            if (player.country !== 'India') teamDoc.overseasCount += 1;
            teamDoc.totalSpent += amount;

            // Update Player (WITH SESSION)
            const playerDoc = await Player.findById(player._id).session(session);
            playerDoc.status = 'SOLD';
            playerDoc.soldPrice = amount;
            playerDoc.soldToTeam = teamCode;
            await playerDoc.save({ session });

            teamDoc.playersBought.push(playerDoc._id);
            await teamDoc.save({ session });

            await session.commitTransaction();
            updateAuctionTimer(null); // Execute only AFTER successful commit

            if (io) {
                // Legacy event for toasts
                io.emit('playerSold', {
                    player: player,
                    soldTo: { id: teamCode, name: teamDoc.name, logo: teamDoc.logo },
                    price: amount,
                    isSold: true
                });

                // Full Sync
                const teams = await Team.find({}); // Read-only, eventual consistency ok
                const standardizedState = getStandardizedState(state, teams);

                io.emit('auction:state', {
                    ...standardizedState,
                    timer: 0 // Explicitly stop timer on clients
                });
            }

        } else {
            // UNSOLD
            // Atomic Update
            const success = await AuctionState.findOneAndUpdate(
                { _id: state._id, status: { $in: ['ACTIVE', 'RESOLVING'] }, currentPlayer: player._id },
                { status: 'UNSOLD', timerEndsAt: null },
                { new: true, session }
            );

            if (!success) {
                console.log('[resolveAuctionTurn] Race condition detected (Unsold). Turn already resolved.');
                await session.abortTransaction();
                return;
            }
            state = success;

            const playerDoc = await Player.findById(player._id).session(session);
            playerDoc.status = 'UNSOLD';
            await playerDoc.save({ session });

            await session.commitTransaction();
            updateAuctionTimer(null);

            if (io) {
                io.emit('playerSold', {
                    player: player,
                    soldTo: null,
                });

                // Full Sync
                const teams = await Team.find({});
                const standardizedState = getStandardizedState(state, teams);

                io.emit('auction:state', {
                    ...standardizedState,
                    timer: 0
                });
            }
        }

    } catch (error) {
        console.error("Error resolving turn:", error);
        await session.abortTransaction();
    } finally {
        session.endSession();
    }
};



export const requeueUnsoldPlayer = async (req, res) => {
    try {
        const { playerId } = req.body;
        if (!playerId) return res.status(400).json({ message: 'Player ID required' });

        const player = await Player.findById(playerId);
        if (!player) return res.status(404).json({ message: 'Player not found' });

        if (player.status !== 'UNSOLD') {
            return res.status(400).json({ message: `Player status is ${player.status}, must be UNSOLD` });
        }

        player.status = 'AVAILABLE';
        await player.save();

        res.json({ success: true, message: `Player ${player.name} added back to queue` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const toggleTrading = async (req, res) => {
    try {
        let state = await getAuctionState();
        state.isTradingOpen = !state.isTradingOpen;
        await state.save();
        
        const io = getIO();
        if (io) {
            // Broadcast new trading state to all clients
            io.emit('trading:status', { isOpen: state.isTradingOpen });
        }
        
        res.json({ success: true, isTradingOpen: state.isTradingOpen });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
