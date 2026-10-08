import express from 'express';
import { fantasyAuth } from '../middleware/fantasyAuth.js';
import {
    getFantasyLeaderboard,
    getFantasyMatches,
    getFantasyPlayersForMatch,
    getMyFantasyTeams,
    getAllUserFantasyTeams,
    recalculateFantasyPoints,
    saveFantasyTeam,
    getLiveMatchStatus,
    getExternalLiveMatch,
    getExternalLivePoints,
    manualTriggerSyncHandler,
    triggerSumPerMatchPoints,
    triggerSyncManualPoints
} from '../controllers/fantasyController.js';

const router = express.Router();

const adminOnly = (req, res, next) => {
    if (req.user?.role === 'admin') {
        return next();
    }

    return res.status(403).json({ message: 'Admin access required.' });
};

router.get('/matches', fantasyAuth, getFantasyMatches);
router.get('/live-status', getLiveMatchStatus);  // public — no auth needed
router.get('/external/match', getExternalLiveMatch); // public proxy for match
router.get('/external/points/:matchId', getExternalLivePoints); // public proxy for points
router.get('/players/:matchId', fantasyAuth, getFantasyPlayersForMatch);
router.post('/team', fantasyAuth, saveFantasyTeam);
router.get('/my-teams', fantasyAuth, getAllUserFantasyTeams);
router.get('/my-teams/:matchId', fantasyAuth, getMyFantasyTeams);
router.get('/leaderboard/:matchId', fantasyAuth, getFantasyLeaderboard);
router.post('/admin/recalculate/:matchId', fantasyAuth, adminOnly, recalculateFantasyPoints);
router.post('/admin/sync/manual', fantasyAuth, adminOnly, manualTriggerSyncHandler);
router.post('/admin/sync-manual-match/:matchId', fantasyAuth, adminOnly, triggerSyncManualPoints);
router.post('/admin/sum-per-match-points', fantasyAuth, adminOnly, triggerSumPerMatchPoints);

export default router;
