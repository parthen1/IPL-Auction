import Trade from '../models/Trade.js';
import Team from '../models/Team.js';
import Player from '../models/Player.js';
import AuctionState from '../models/AuctionState.js';

const getIsTradingOpen = async () => {
    let state = await AuctionState.findOne();
    return state ? state.isTradingOpen : false;
};

export const getCompletedTrades = async (req, res) => {
    try {
        const completedProposals = await Trade.find({ status: 'ACCEPTED' })
            .populate('senderTeam', 'name code logo')
            .populate('receiverTeam', 'name code logo')
            .populate('offerPlayers', 'name basePrice soldPrice isOverseas role image')
            .populate('requestPlayers', 'name basePrice soldPrice isOverseas role image')
            .sort({ updatedAt: -1 });
            
        res.json(completedProposals);
    } catch (error) {
        console.error('Error fetching completed trades:', error);
        res.status(500).json({ message: 'Server error fetching completed trades', error: error.message });
    }
};

export const createProposal = async (req, res) => {
    try {
        const isOpen = await getIsTradingOpen();
        if (!isOpen) {
            return res.status(403).json({ message: 'Trading window is currently closed.' });
        }

        const { receiverTeamId, offerPlayerIds, requestPlayerIds } = req.body;
        const senderTeamCode = req.user.teamCode;
        
        if (!senderTeamCode) {
            return res.status(403).json({ message: 'Team selection required to propose trades.' });
        }
        
        const senderTeam = await Team.findOne({ code: senderTeamCode });
        if (!senderTeam) return res.status(404).json({ message: 'Sender team not found' });
        
        if (senderTeam._id.toString() === receiverTeamId) {
            return res.status(400).json({ message: 'Cannot trade with yourself' });
        }

        if ((!offerPlayerIds || offerPlayerIds.length === 0) && (!requestPlayerIds || requestPlayerIds.length === 0)) {
            return res.status(400).json({ message: 'Must provide at least one player to offer or request' });
        }
        
        const offerPlayers = offerPlayerIds?.length > 0 ? await Player.find({ _id: { $in: offerPlayerIds } }) : [];
        const requestPlayers = requestPlayerIds?.length > 0 ? await Player.find({ _id: { $in: requestPlayerIds } }) : [];
        
        if (offerPlayers.length !== (offerPlayerIds?.length || 0) || requestPlayers.length !== (requestPlayerIds?.length || 0)) {
            return res.status(400).json({ message: 'Some players not found' });
        }
        
        // Validate ownership
        const invalidOffer = offerPlayers.filter(p => p.soldToTeam !== senderTeam.code);
        if (invalidOffer.length > 0) {
            const playerNames = invalidOffer.map(p => p.name).join(', ');
            return res.status(400).json({ message: `Ownership Error: You do not own ${playerNames}.` });
        }
        
        const receiverTeam = await Team.findById(receiverTeamId);
        if (!receiverTeam) return res.status(404).json({ message: 'Receiver team not found' });
        
        const invalidRequest = requestPlayers.filter(p => p.soldToTeam !== receiverTeam.code);
        if (invalidRequest.length > 0) {
            const playerNames = invalidRequest.map(p => p.name).join(', ');
            return res.status(400).json({ message: `Ownership Error: Target team does not own ${playerNames}.` });
        }

        // --- NEW CONSTRAINTS (Prevent invalid trades from entering Pending state) ---
        // 1. Check if any involved players are ALREADY in a PENDING trade
        const allInvolvedPlayerIds = [...(offerPlayerIds || []), ...(requestPlayerIds || [])];
        const playerInPendingTrade = await Trade.findOne({
            status: 'PENDING',
            $or: [
                { offerPlayers: { $in: allInvolvedPlayerIds } },
                { requestPlayers: { $in: allInvolvedPlayerIds } }
            ]
        }).populate('offerPlayers', 'name').populate('requestPlayers', 'name');

        if (playerInPendingTrade) {
            // Find which specific players are causing the conflict to give a better error message
            const conflictingPlayers = [];
            const checkPlayers = (players) => {
                players.forEach(p => {
                    if (allInvolvedPlayerIds.includes(p._id.toString())) {
                        conflictingPlayers.push(p.name);
                    }
                });
            };
            if (playerInPendingTrade.offerPlayers) checkPlayers(playerInPendingTrade.offerPlayers);
            if (playerInPendingTrade.requestPlayers) checkPlayers(playerInPendingTrade.requestPlayers);
            
            const playerNames = [...new Set(conflictingPlayers)].join(', ');
            return res.status(400).json({ message: `Trade rejected: ${playerNames} ${conflictingPlayers.length > 1 ? 'are' : 'is'} already involved in an active pending trade proposal.` });
        }

        // 2. Validate Squad Limits & Overseas Limits pre-emptively
        const senderSizeChange = requestPlayers.length - offerPlayers.length;
        const receiverSizeChange = offerPlayers.length - requestPlayers.length;

        if (senderTeam.squadSize + senderSizeChange > 25) {
            return res.status(400).json({ message: `Limit Exceeded: Your squad size would reach ${senderTeam.squadSize + senderSizeChange} (Limit: 25).` });
        }
        if (receiverTeam.squadSize + receiverSizeChange > 25) {
            return res.status(400).json({ message: `Limit Exceeded: Target team squad size would reach ${receiverTeam.squadSize + receiverSizeChange} (Limit: 25).` });
        }

        const offerOverseasCount = offerPlayers.filter(p => p.isOverseas).length;
        const requestOverseasCount = requestPlayers.filter(p => p.isOverseas).length;

        const senderOverseasChange = requestOverseasCount - offerOverseasCount;
        const receiverOverseasChange = offerOverseasCount - requestOverseasCount;

        if (senderTeam.overseasCount + senderOverseasChange > 8) {
             return res.status(400).json({ message: `Limit Exceeded: Your overseas players would reach ${senderTeam.overseasCount + senderOverseasChange} (Limit: 8).` });
        }
        if (receiverTeam.overseasCount + receiverOverseasChange > 8) {
             return res.status(400).json({ message: `Limit Exceeded: Target team overseas players would reach ${receiverTeam.overseasCount + receiverOverseasChange} (Limit: 8).` });
        }
        // --------------------------------------------------------------------------
        
        // Exact Duplicate Check still applies just in case
        const existingTrade = await Trade.findOne({
            senderTeam: senderTeam._id,
            receiverTeam: receiverTeam._id,
            offerPlayers: { $size: offerPlayerIds.length, $all: offerPlayerIds },
            requestPlayers: { $size: requestPlayerIds.length, $all: requestPlayerIds },
            status: 'PENDING'
        });
        
        if (existingTrade) {
            return res.status(400).json({ message: 'An identical exact trade proposal is already pending' });
        }
        
        const trade = new Trade({
            senderTeam: senderTeam._id,
            receiverTeam: receiverTeam._id,
            offerPlayers: offerPlayerIds || [],
            requestPlayers: requestPlayerIds || []
        });
        
        await trade.save();
        
        res.status(201).json({ message: 'Trade proposal created successfully', trade });
    } catch (error) {
        console.error('Error creating trade proposal:', error);
        res.status(500).json({ message: 'Server error creating trade proposal', error: error.message });
    }
};

export const getProposals = async (req, res) => {
    try {
        const teamCode = req.user.teamCode;
        if (!teamCode) {
            return res.status(403).json({ message: 'Team selection required to view trade proposals.' });
        }
        const team = await Team.findOne({ code: teamCode });
        
        if (!team) return res.status(404).json({ message: 'Team not found' });
        
        const sentProposals = await Trade.find({ senderTeam: team._id })
            .populate('receiverTeam', 'name code')
            .populate('offerPlayers', 'name basePrice soldPrice isOverseas role')
            .populate('requestPlayers', 'name basePrice soldPrice isOverseas role')
            .sort({ createdAt: -1 });
            
        const receivedProposals = await Trade.find({ receiverTeam: team._id })
            .populate('senderTeam', 'name code')
            .populate('offerPlayers', 'name basePrice soldPrice isOverseas role')
            .populate('requestPlayers', 'name basePrice soldPrice isOverseas role')
            .sort({ createdAt: -1 });
            
        res.json({ sent: sentProposals, received: receivedProposals });
    } catch (error) {
        console.error('Error fetching trade proposals:', error);
        res.status(500).json({ message: 'Server error fetching trade proposals', error: error.message });
    }
};

export const updateProposalStatus = async (req, res) => {
    try {
        const isOpen = await getIsTradingOpen();
        if (!isOpen) {
            return res.status(403).json({ message: 'Trading window is currently closed.' });
        }

        const { proposalId } = req.params;
        const { status } = req.body; 
        const teamCode = req.user.teamCode;
        if (!teamCode) {
            return res.status(403).json({ message: 'Team selection required to respond to trades.' });
        }
        
        if (!['ACCEPTED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }
        
        const currentTeam = await Team.findOne({ code: teamCode });
        if (!currentTeam) return res.status(404).json({ message: 'Team not found' });
        
        const trade = await Trade.findById(proposalId)
            .populate('senderTeam')
            .populate('receiverTeam')
            .populate('offerPlayers')
            .populate('requestPlayers');
            
        if (!trade) return res.status(404).json({ message: 'Trade proposal not found' });
        
        // --- DEFENSIVE CHECK: Ensure teams populated correctly ---
        if (!trade.senderTeam || !trade.receiverTeam) {
            console.error('[Trade Error] Sender/Receiver Team population failed:', { sender: trade.senderTeam, receiver: trade.receiverTeam });
            return res.status(400).json({ message: 'Incomplete trade data: One or more teams involved no longer exist.' });
        }

        if (trade.status !== 'PENDING') {
            return res.status(400).json({ message: `Trade is already ${trade.status}` });
        }
        
        if (trade.receiverTeam._id.toString() !== currentTeam._id.toString()) {
            return res.status(403).json({ message: 'Only the receiving team can accept or reject this proposal' });
        }
        
        if (status === 'REJECTED') {
            trade.status = 'REJECTED';
            await trade.save();
            return res.json({ message: 'Trade rejected', trade });
        }
        
        // ACCEPTED LOGIC (0-Cost True Trading)
        const sender = trade.senderTeam;
        const receiver = trade.receiverTeam;
        
        // Filter out any players that failed to populate (e.g. were deleted from DB)
        const offerPlayers = (trade.offerPlayers || []).filter(p => p !== null); 
        const requestPlayers = (trade.requestPlayers || []).filter(p => p !== null); 
        
        if (offerPlayers.length !== (trade.offerPlayers?.length || 0) || requestPlayers.length !== (trade.requestPlayers?.length || 0)) {
            return res.status(400).json({ message: 'One or more players in this trade proposal no longer exist in the database.' });
        }
        
        // Squad Size Validations
        const senderSizeChange = requestPlayers.length - offerPlayers.length;
        const receiverSizeChange = offerPlayers.length - requestPlayers.length;

        if (sender.squadSize + senderSizeChange > 25) {
            return res.status(400).json({ message: `Limit Exceeded: Sender team squad size would reach ${sender.squadSize + senderSizeChange} (Limit: 25).` });
        }
        if (receiver.squadSize + receiverSizeChange > 25) {
            return res.status(400).json({ message: `Limit Exceeded: Your squad size would reach ${receiver.squadSize + receiverSizeChange} (Limit: 25).` });
        }

        // Overseas Validations
        const offerOverseasCount = offerPlayers.filter(p => p.isOverseas).length;
        const requestOverseasCount = requestPlayers.filter(p => p.isOverseas).length;

        const senderOverseasChange = requestOverseasCount - offerOverseasCount;
        const receiverOverseasChange = offerOverseasCount - requestOverseasCount;

        if (sender.overseasCount + senderOverseasChange > 8) {
             return res.status(400).json({ message: `Limit Exceeded: Sender team overseas players would reach ${sender.overseasCount + senderOverseasChange} (Limit: 8).` });
        }
        if (receiver.overseasCount + receiverOverseasChange > 8) {
             return res.status(400).json({ message: `Limit Exceeded: Your overseas players would reach ${receiver.overseasCount + receiverOverseasChange} (Limit: 8).` });
        }

        // --- EXECUTE ---
        
        // 1. Update Players: Swap teams and set 'Traded' price flag (-1)
        const offerIds = offerPlayers.map(p => p._id.toString());
        const requestIds = requestPlayers.map(p => p._id.toString());

        for (const p of offerPlayers) {
            p.soldToTeam = receiver.code;
            p.soldPrice = -1; // -1 represents "Traded"
            await p.save();
        }
        for (const p of requestPlayers) {
            p.soldToTeam = sender.code;
            p.soldPrice = -1; // -1 represents "Traded"
            await p.save();
        }
        
        // 2. Update Sender Team (No Purse Impact)
        sender.overseasCount += senderOverseasChange;
        sender.squadSize += senderSizeChange;
        
        sender.playersBought = sender.playersBought.filter(pId => !offerIds.includes(pId.toString()));
        for (const id of requestIds) sender.playersBought.push(id);
        
        // Forcefully clear Playing XI logic due to massive roster shift
        sender.playing11 = [];
        sender.captain = null;
        sender.viceCaptain = null;
        
        // 3. Update Receiver Team (No Purse Impact)
        receiver.overseasCount += receiverOverseasChange;
        receiver.squadSize += receiverSizeChange;
        
        receiver.playersBought = receiver.playersBought.filter(pId => !requestIds.includes(pId.toString()));
        for (const id of offerIds) receiver.playersBought.push(id);
        
        // Forcefully clear Playing XI logic due to massive roster shift
        receiver.playing11 = [];
        receiver.captain = null;
        receiver.viceCaptain = null;
        
        await sender.save();
        await receiver.save();
        
        // Clear Playing XI flags on all players involved in the trade (their XI was wiped above)
        const allTradedIds = [...offerIds, ...requestIds];
        
        // Also clear flags for all squad members of both teams since XI was nullified
        // Using filter(Boolean) to ensure no null values throw error on toString()
        const allAffectedPlayerIds = [
            ...(sender.playersBought || []).filter(id => id).map(id => id.toString()),
            ...(receiver.playersBought || []).filter(id => id).map(id => id.toString())
        ];
        
        const uniqueAffectedIds = [...new Set([...allAffectedPlayerIds, ...allTradedIds])];
        
        if (uniqueAffectedIds.length > 0) {
            await Player.updateMany(
                { _id: { $in: uniqueAffectedIds } },
                { $set: { isInPlaying11: false, isCaptain: false, isViceCaptain: false } }
            );
        }
        
        
        // 4. Mark status
        trade.status = 'ACCEPTED';
        await trade.save();
        
        // 5. Auto-reject other pending trades involving these players
        const allInvolvedIds = [
            ...offerPlayers.filter(p => p?._id).map(p => p._id), 
            ...requestPlayers.filter(p => p?._id).map(p => p._id)
        ];
        
        await Trade.updateMany({
            status: 'PENDING',
            _id: { $ne: trade._id },
            $or: [
                { offerPlayers: { $in: allInvolvedIds } },
                { requestPlayers: { $in: allInvolvedIds } }
            ]
        }, { status: 'REJECTED' });
        
        res.json({ message: 'Trade completed successfully', trade });
    } catch (error) {
        console.error('Error updating trade status:', error);
        res.status(500).json({ message: 'Server error updating trade status', error: error.message });
    }
};
