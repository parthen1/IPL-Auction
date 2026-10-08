import getFantasyMatchModel from '../models/FantasyMatch.js';
import getFantasyPlayerModel from '../models/FantasyPlayer.js';
import getFantasyTeamModel from '../models/FantasyTeam.js';
import { getSyncState, manualTriggerSync } from '../services/livePointsSync.js';
import {
    calculateFantasyTeamPoints,
    findFantasyMatchByIdentifier,
    groupFantasyPlayers,
    normalizeFantasyMatch,
    serializeFantasyPlayer,
    validateFantasyTeamSelection,
    isMatchLocked
} from '../utils/fantasyUtils.js';

const getAuthenticatedUserId = (req) => req.user?.userId || req.user?._id || req.user?.id || null;

const ensureFantasyUser = async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        res.status(401).json({ message: 'Fantasy actions require a signed-in user account.' });
        return null;
    }

    return req.user;
};

const formatFantasyTeam = (team) => {
    const serializedPlayers = (team.players || []).map((player) => serializeFantasyPlayer(player));

    return {
        _id: team._id.toString(),
        matchId: team.matchId.toString(),
        totalPoints: Number(team.totalPoints || 0),
        players: serializedPlayers,
        captain: team.captain ? {
            _id: team.captain._id.toString(),
            name: team.captain.name
        } : null,
        viceCaptain: team.viceCaptain ? {
            _id: team.viceCaptain._id.toString(),
            name: team.viceCaptain.name
        } : null,
        summary: {
            playerCount: serializedPlayers.length,
            creditsUsed: Number(serializedPlayers.reduce((sum, player) => sum + player.value, 0).toFixed(1)),
            valueUsed: Number(serializedPlayers.reduce((sum, player) => sum + player.value, 0).toFixed(1)),
            roleCounts: serializedPlayers.reduce((acc, player) => {
                acc[player.role] = (acc[player.role] || 0) + 1;
                return acc;
            }, {}),
            teamCounts: serializedPlayers.reduce((acc, player) => {
                acc[player.orgIPLTeam26] = (acc[player.orgIPLTeam26] || 0) + 1;
                return acc;
            }, {})
        },
        createdAt: team.createdAt,
        updatedAt: team.updatedAt
    };
};

export const getFantasyMatches = async (req, res) => {
    try {
        const FantasyMatch = await getFantasyMatchModel();
        const matches = await FantasyMatch.find({})
            .sort({ date: 1, legacyMatchId: 1 })
            .lean();

        res.json(matches.map((match) => normalizeFantasyMatch(match)));
    } catch (error) {
        console.error('Fantasy matches fetch failed:', error);
        res.status(500).json({ message: 'Failed to fetch fantasy matches.' });
    }
};

export const getFantasyPlayersForMatch = async (req, res) => {
    try {
        const FantasyPlayer = await getFantasyPlayerModel();
        const match = await findFantasyMatchByIdentifier(req.params.matchId);
        if (!match) {
            return res.status(404).json({ message: 'Match not found.' });
        }

        const normalizedMatch = normalizeFantasyMatch(match);
        const players = await FantasyPlayer.find({
            orgIPLTeam26: { $in: [normalizedMatch.team1, normalizedMatch.team2] }
        }).sort({ value: -1, name: 1 }).lean();

        const { groupedPlayers, allPlayers } = groupFantasyPlayers(players);

        res.json({
            match: normalizedMatch,
            players: groupedPlayers,
            allPlayers
        });
    } catch (error) {
        console.error('Fantasy players fetch failed:', error);
        res.status(500).json({ message: 'Failed to fetch fantasy players.' });
    }
};

export const saveFantasyTeam = async (req, res) => {
    try {
        const user = await ensureFantasyUser(req, res);
        if (!user) return;

        const [FantasyPlayer, FantasyTeam] = await Promise.all([
            getFantasyPlayerModel(),
            getFantasyTeamModel()
        ]);
        const { matchId, players = [], captain, viceCaptain } = req.body;

        const match = await findFantasyMatchByIdentifier(matchId);
        if (!match) {
            return res.status(404).json({ message: 'Match not found.' });
        }
        
        const normalizedMatch = normalizeFantasyMatch(match);
        if (isMatchLocked(normalizedMatch)) {
            return res.status(403).json({ message: 'Team editing is locked. This match has already started.' });
        }

        const uniquePlayerIds = [...new Set((players || []).map((playerId) => String(playerId)))];
        const selectedPlayers = await FantasyPlayer.find({ _id: { $in: uniquePlayerIds } });

        if (selectedPlayers.length !== uniquePlayerIds.length) {
            return res.status(400).json({ message: 'One or more selected players are invalid.' });
        }

        const validation = validateFantasyTeamSelection({
            players: selectedPlayers,
            captain,
            viceCaptain,
            team1: normalizedMatch.team1,
            team2: normalizedMatch.team2
        });

        if (!validation.isValid) {
            return res.status(400).json({
                message: validation.errors[0],
                errors: validation.errors,
                summary: validation.summary
            });
        }

        const playerMap = new Map(selectedPlayers.map((player) => [player._id.toString(), player]));
        const totalPoints = calculateFantasyTeamPoints({
            players: uniquePlayerIds,
            captain,
            viceCaptain
        }, playerMap);

        const fantasyTeam = await FantasyTeam.findOneAndUpdate(
            {
                userId: user._id,
                matchId: match._id
            },
            {
                $set: {
                    players: uniquePlayerIds,
                    captain,
                    viceCaptain,
                    totalPoints
                }
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true
            }
        )
            .populate('players', 'name role orgIPLTeam26 basePrice value points image')
            .populate('captain', 'name')
            .populate('viceCaptain', 'name');

        res.status(200).json({
            success: true,
            message: 'Fantasy team saved successfully.',
            match: normalizedMatch,
            team: formatFantasyTeam(fantasyTeam)
        });
    } catch (error) {
        console.error('Fantasy team save failed:', error);
        res.status(500).json({ message: 'Failed to save fantasy team.' });
    }
};

export const getMyFantasyTeams = async (req, res) => {
    try {
        const user = await ensureFantasyUser(req, res);
        if (!user) return;

        const FantasyTeam = await getFantasyTeamModel();
        const match = await findFantasyMatchByIdentifier(req.params.matchId);
        if (!match) {
            return res.status(404).json({ message: 'Match not found.' });
        }

        const teams = await FantasyTeam.find({
            userId: user._id,
            matchId: match._id
        })
            .populate('players', 'name role orgIPLTeam26 basePrice value points image')
            .populate('captain', 'name')
            .populate('viceCaptain', 'name')
            .sort({ createdAt: -1 });

        // Live-recalculate totalPoints from current player.points (avoids stale stored value)
        const bulkUpdates = [];
        for (const team of teams) {
            const playerMap = new Map(
                (team.players || []).map((p) => [p._id.toString(), p])
            );
            // Pass team directly — calculateFantasyTeamPoints handles populated objects via extractId
            const freshPoints = calculateFantasyTeamPoints(team, playerMap);
            if (freshPoints !== team.totalPoints) {
                team.totalPoints = freshPoints;
                bulkUpdates.push({
                    updateOne: {
                        filter: { _id: team._id },
                        update: { $set: { totalPoints: freshPoints } }
                    }
                });
            }
        }
        if (bulkUpdates.length > 0) {
            await FantasyTeam.bulkWrite(bulkUpdates);
        }

        res.json({
            match: normalizeFantasyMatch(match),
            teams: teams.map((team) => formatFantasyTeam(team))
        });
    } catch (error) {
        console.error('My fantasy teams fetch failed:', error);
        res.status(500).json({ message: 'Failed to fetch your fantasy teams.' });
    }
};

export const getAllUserFantasyTeams = async (req, res) => {
    try {
        const user = await ensureFantasyUser(req, res);
        if (!user) return;

        const FantasyTeam = await getFantasyTeamModel();
        
        const teams = await FantasyTeam.find({ userId: user._id })
            .populate('matchId')
            .populate('captain', 'name')
            .populate('viceCaptain', 'name')
            .sort({ createdAt: -1 });

        const formattedTeams = teams.map((team) => {
            const matchData = team.matchId ? normalizeFantasyMatch(team.matchId) : null;
            return {
                ...formatFantasyTeam(team),
                match: matchData
            };
        });

        res.json({
            teams: formattedTeams
        });
    } catch (error) {
        console.error('Fetch all user fantasy teams failed:', error);
        res.status(500).json({ message: 'Failed to fetch all your fantasy teams.' });
    }
};

export const getFantasyLeaderboard = async (req, res) => {
    try {
        const FantasyTeam = await getFantasyTeamModel();
        const match = await findFantasyMatchByIdentifier(req.params.matchId);
        if (!match) {
            return res.status(404).json({ message: 'Match not found.' });
        }

        const normalizedMatch = normalizeFantasyMatch(match);

        // Fetch without sort first — we'll sort after live-recalculating
        const teams = await FantasyTeam.find({ matchId: match._id })
            .populate('players', 'name role orgIPLTeam26 basePrice value points image')
            .populate('captain', 'name')
            .populate('viceCaptain', 'name')
            .populate('userId', 'username name email');

        // Live-recalculate totalPoints from current player.points
        const bulkUpdates = [];
        for (const team of teams) {
            const playerMap = new Map(
                (team.players || []).map((p) => [p._id.toString(), p])
            );
            // Pass team directly — calculateFantasyTeamPoints handles populated objects via extractId
            const freshPoints = calculateFantasyTeamPoints(team, playerMap);
            if (freshPoints !== team.totalPoints) {
                team.totalPoints = freshPoints;
                bulkUpdates.push({
                    updateOne: {
                        filter: { _id: team._id },
                        update: { $set: { totalPoints: freshPoints } }
                    }
                });
            }
        }
        if (bulkUpdates.length > 0) {
            await FantasyTeam.bulkWrite(bulkUpdates);
        }

        // Sort by freshly-calculated totalPoints descending
        teams.sort((a, b) => b.totalPoints - a.totalPoints || a.updatedAt - b.updatedAt);

        const leaderboard = teams.map((team, index) => ({
            rank: index + 1,
            team: formatFantasyTeam(team),
            user: {
                _id: team.userId?._id?.toString() || null,
                username: team.userId?.username || null,
                name: team.userId?.name || null,
                displayName: team.userId?.username || team.userId?.name || team.userId?.email || 'User'
            }
        }));

        res.json({
            match: normalizedMatch,
            leaderboard
        });
    } catch (error) {
        console.error('Fantasy leaderboard fetch failed:', error);
        res.status(500).json({ message: 'Failed to fetch fantasy leaderboard.' });
    }
};

export const recalculateFantasyPoints = async (req, res) => {
    try {
        const [FantasyPlayer, FantasyTeam] = await Promise.all([
            getFantasyPlayerModel(),
            getFantasyTeamModel()
        ]);
        const match = await findFantasyMatchByIdentifier(req.params.matchId);
        if (!match) {
            return res.status(404).json({ message: 'Match not found.' });
        }

        const fantasyTeams = await FantasyTeam.find({ matchId: match._id });
        if (fantasyTeams.length === 0) {
            return res.json({
                success: true,
                message: 'No fantasy teams found for this match.',
                updatedCount: 0
            });
        }

        const playerIds = [...new Set(fantasyTeams.flatMap((team) => team.players.map((playerId) => playerId.toString())))];
        const players = await FantasyPlayer.find({ _id: { $in: playerIds } }).select('points');
        const playerMap = new Map(players.map((player) => [player._id.toString(), player]));

        const bulkUpdates = fantasyTeams.map((team) => ({
            updateOne: {
                filter: { _id: team._id },
                update: {
                    $set: {
                        totalPoints: calculateFantasyTeamPoints(team, playerMap)
                    }
                }
            }
        }));

        if (bulkUpdates.length > 0) {
            await FantasyTeam.bulkWrite(bulkUpdates);
        }

        res.json({
            success: true,
            message: 'Fantasy points recalculated successfully.',
            updatedCount: bulkUpdates.length
        });
    } catch (error) {
        console.error('Fantasy points recalculation failed:', error);
        res.status(500).json({ message: 'Failed to recalculate fantasy points.' });
    }
};

/**
 * GET /api/fantasy/live-status
 * Returns whether the external points sync is currently active,
 * along with today's match info. Used by the frontend to decide
 * whether to display a LIVE badge and how frequently to refresh.
 */
export const getLiveMatchStatus = (req, res) => {
    try {
        const syncState = getSyncState();
        res.json(syncState);
    } catch (error) {
        console.error('Live status fetch failed:', error);
        res.status(500).json({ message: 'Failed to fetch live status.' });
    }
};

const EXTERNAL_API_BASE = 'https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com';

export const getExternalLiveMatch = async (req, res) => {
    try {
        const response = await fetch(`${EXTERNAL_API_BASE}/match`);
        if (!response.ok) {
            return res.status(response.status).json({ message: `External API responded with ${response.status}` });
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Proxy live match failed:', error);
        res.status(500).json({ message: 'Failed to fetch external live match data.' });
    }
};

export const getExternalLivePoints = async (req, res) => {
    try {
        const matchId = req.params.matchId;
        const response = await fetch(`${EXTERNAL_API_BASE}/points?match_id=${matchId}`);
        if (!response.ok) {
            return res.status(response.status).json({ message: `External API responded with ${response.status}` });
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Proxy live points failed:', error);
        res.status(500).json({ message: 'Failed to fetch external live points data.' });
    }
};

export const manualTriggerSyncHandler = async (req, res) => {
    try {
        const result = await manualTriggerSync();
        res.json(result);
    } catch (error) {
        console.error('Manual sync trigger failed:', error);
        res.status(500).json({ message: 'Failed to trigger manual sync.' });
    }
};

import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

export const triggerSumPerMatchPoints = async (req, res) => {
    try {
        console.log('Triggering sumPerMatchPoints script...');
        // Run the script using node
        const { stdout, stderr } = await execPromise('node server/scripts/sumPerMatchPoints.js');
        if (stderr && !stdout.includes('Success')) {
            console.warn('sumPerMatchPoints stderr:', stderr);
        }
        res.json({ success: true, message: 'Successfully aggregated per-match points.', output: stdout });
    } catch (error) {
        console.error('Failed to trigger sumPerMatchPoints:', error);
        res.status(500).json({ message: 'Failed to aggregate points.', error: error.message });
    }
};

export const triggerSyncManualPoints = async (req, res) => {
    try {
        const { matchId } = req.params;
        if (!matchId) {
            return res.status(400).json({ message: 'Match ID is required.' });
        }
        console.log(`Triggering syncManualPoints script for match ${matchId}...`);
        const { stdout, stderr } = await execPromise(`node server/scripts/syncManualPoints.js ${matchId}`);
        if (stderr && !stdout.includes('Updated')) {
            console.warn('syncManualPoints stderr:', stderr);
        }
        res.json({ success: true, message: `Successfully synced manual points for match ${matchId}.`, output: stdout });
    } catch (error) {
        console.error(`Failed to trigger syncManualPoints for match ${req.params.matchId}:`, error);
        res.status(500).json({ message: 'Failed to sync manual points.', error: error.message });
    }
};
