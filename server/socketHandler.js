import Team from './models/Team.js';
import AuctionState from './models/AuctionState.js';
import jwt from 'jsonwebtoken';

let ioInstance;
let timerInterval = null;
const connectedUsers = new Map(); // socket.id -> teamCode

export const getIO = () => ioInstance;

// In-memory state for timer to avoid DB polling
let activeTimerEndsAt = null;
let isProcessingTurn = false;

// Export function for controllers to update the in-memory timer
export const updateAuctionTimer = (endsAt) => {
    activeTimerEndsAt = endsAt ? new Date(endsAt) : null;
    isProcessingTurn = false; // Reset processing flag on new timer
};

// Timer / Auction Loop
export const startAuctionCheckLoop = () => {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(async () => {
        try {
            // ONLY check in-memory state
            if (activeTimerEndsAt && !isProcessingTurn) {
                const now = new Date();

                if (now >= activeTimerEndsAt) {
                    // Time Expired!
                    console.log('Timer expired (In-Memory Check), resolving turn...');

                    // 1. Immediate Local Lock to prevent double-fire in next tick
                    isProcessingTurn = true;
                    activeTimerEndsAt = null; // Clear local timer immediately

                    // 2. Delegate to Controller for Atomic DB Resolution
                    const controller = await import('./controllers/auctionController.js');
                    await controller.resolveAuctionTurn(true); // Pass true to indicate Timer Trigger

                    // Note: We don't need to reset isProcessingTurn here because 
                    // controller.resolveAuctionTurn will eventually call updateAuctionTimer 
                    // which resets it, OR if it fails/ignores, the timer is gone anyway.
                }
            }
        } catch (err) {
            console.error("Auction Queue Error:", err);
            isProcessingTurn = false;
        }
    }, 1000); // Check every second, but cheaply (in-memory)
};

export const stopAuctionCheckLoop = () => {
    if (timerInterval) clearInterval(timerInterval);
};

export const setupSocket = (io) => {
    ioInstance = io;

    // Middleware for Auth
    // Middleware for Auth
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error("Authentication error: No token provided"));

        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) return next(new Error("Authentication error: Invalid token"));

            // Validate Session from DB (Strict Consistency)
            // Admin bypasses this check as they might have a different auth flow or static token
            if (decoded.role?.toLowerCase() === 'team' && !decoded.tournamentId) {
                try {
                    const team = await Team.findOne({ code: decoded.teamCode });
                    if (!team) {
                        return next(new Error("Authentication error: Team not found"));
                    }
                    if (team.activeSessionId !== decoded.sessionId) {
                        return next(new Error("Authentication error: Session expired or invalid"));
                    }
                } catch (dbErr) {
                    console.error("Socket Auth DB Error:", dbErr);
                    return next(new Error("Authentication error: Internal Server Error"));
                }
            }

            socket.user = decoded; // { teamCode, role, sessionId }
            next();
        });
    });

    io.on('connection', async (socket) => {
        const teamCode = socket.user.teamCode || 'ADMIN';
        console.log(`Socket connected: ${socket.id} (User: ${teamCode})`);

        connectedUsers.set(socket.id, teamCode);
        
        // Broadcast active user list (unique team codes)
        const activeList = Array.from(new Set(connectedUsers.values()));
        io.emit('users:active_list', activeList);

        // Send current state from DB
        try {
            const state = await AuctionState.findOne().populate('currentPlayer');
            const teams = await Team.find({});

            // Calculate current timer if active
            let timerVal = 0;
            if (state?.timerEndsAt && state.status === 'ACTIVE') {
                timerVal = Math.max(0, Math.ceil((new Date(state.timerEndsAt) - new Date()) / 1000));
            }

            // Standardize Teams
            const standardizedTeams = teams.map(t => ({
                ...t.toObject(),
                id: t.code,
                budget: t.remainingPurse
            }));

            // Standardize Highest Bidder
            let highestBidderObj = null;
            if (state && state.highestBidder) {
                const bidderTeam = standardizedTeams.find(t => t.code === state.highestBidder);
                highestBidderObj = bidderTeam ? { id: bidderTeam.code, name: bidderTeam.name } : { id: state.highestBidder, name: 'Unknown' };
            }

            // Format for frontend
            // NOTE: This must match getStandardizedState structure in auctionController
            socket.emit('auction:sync', {
                ...state?.toObject(),
                highestBidder: highestBidderObj,
                teams: standardizedTeams,
                timer: timerVal, // Legacy support
                timerEndsAt: state?.timerEndsAt
            });
        } catch (err) {
            console.error(err);
        }

        socket.on('auction:request_sync', async () => {
            try {
                const state = await AuctionState.findOne().populate('currentPlayer');
                const teams = await Team.find({});

                let timerVal = 0;
                if (state?.timerEndsAt && state.status === 'ACTIVE') {
                    timerVal = Math.max(0, Math.ceil((new Date(state.timerEndsAt) - new Date()) / 1000));
                }

                const standardizedTeams = teams.map(t => ({
                    ...t.toObject(),
                    id: t.code,
                    budget: t.remainingPurse
                }));

                let highestBidderObj = null;
                if (state && state.highestBidder) {
                    const bidderTeam = standardizedTeams.find(t => t.code === state.highestBidder);
                    highestBidderObj = bidderTeam ? { id: bidderTeam.code, name: bidderTeam.name } : { id: state.highestBidder, name: 'Unknown' };
                }

                socket.emit('auction:sync', {
                    ...state?.toObject(),
                    highestBidder: highestBidderObj,
                    teams: standardizedTeams,
                    timer: timerVal,
                    timerEndsAt: state?.timerEndsAt
                });
            } catch (err) {
                console.error("Manual sync error", err);
            }
        });

        socket.on('disconnect', async () => {
            console.log(`Socket disconnected: ${socket.id} (User: ${teamCode})`);
            connectedUsers.delete(socket.id);
            const activeList = Array.from(new Set(connectedUsers.values()));
            io.emit('users:active_list', activeList);
        });
    });
};
