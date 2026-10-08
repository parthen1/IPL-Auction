import Team from '../models/Team.js';
import Tournament from '../models/Tournament.js';
import { calculatePointsForWindow } from '../utils/weekManager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schedulePath = path.join(__dirname, '..', '..', 'ipl_schedule_export.json');

/** Parse IST date string from schedule JSON */
function parseISTDate(dateStr, timeStr) {
    const [day, monthStr, year] = dateStr.split(' ');
    const months = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    const month = months[monthStr];
    const [hours, minutes] = timeStr.split(':');
    const isoMonth = (month + 1).toString().padStart(2, '0');
    const isoDay = day.padStart(2, '0');
    return new Date(`${year}-${isoMonth}-${isoDay}T${hours}:${minutes}:00+05:30`);
}

/**
 * Builds a full per-player breakdown for every player in the squad.
 * Shows: season total, total contributed to team (with C/VC bonus),
 * points not counted (benched weeks), live points, and week-by-week history.
 *
 * Gracefully handles Week 1 where no playing11History snapshot exists.
 *
 * @param {Object} team - Mongoose Team document (with playing11History)
 * @param {Object} tournament - Mongoose Tournament document (with weekData)
 * @param {Array}  squadPlayers - Fully populated Player documents (with perMatchPoints)
 * @param {Object} livePlayerPoints - Map of { playerId: { total, batting, bowling, fielding } } from calculatePointsForWindow
 * @returns {Object} breakdown map: { playerId: { seasonTotal, contributed, benched, livePoints, weekBreakdown } }
 */
async function buildPlayerBreakdown(team, tournament, squadPlayers, livePlayerPoints = {}) {
    try {
        const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
        const breakdown = {};

        // --- Initialise breakdown for each player ---
        for (const player of squadPlayers) {
            const pid = player._id.toString();
            // perMatchPoints must be available (i.e. playersBought is populated)
            if (player.perMatchPoints === undefined) continue;

            const pmp = player.perMatchPoints || [];
            breakdown[pid] = {
                seasonTotal: Number(pmp.reduce((s, m) => s + (m.total || 0), 0).toFixed(1)),
                contributed: 0,
                benched: 0,
                livePoints: Number((livePlayerPoints[pid]?.total || 0).toFixed(1)),
                weekBreakdown: []
            };
        }

        if (Object.keys(breakdown).length === 0) return {};

        // --- Process each finalized week from playing11History ---
        const historySorted = [...(team.playing11History || [])].sort((a, b) => a.week - b.week);

        for (const weekHistory of historySorted) {
            const weekNum = weekHistory.week;
            const weekData = tournament?.weekData?.find(w => w.week === weekNum);

            // Week 1 (or any week) without timing data — history not available
            if (!weekData?.startTime || !weekData?.endTime) {
                for (const pid of Object.keys(breakdown)) {
                    // Only add placeholder if we don't already have this week
                    const alreadyAdded = breakdown[pid].weekBreakdown.some(w => w.week === weekNum);
                    if (!alreadyAdded) {
                        breakdown[pid].weekBreakdown.push({
                            week: weekNum,
                            rawPoints: null,
                            withBonus: null,
                            inXI: null,
                            role: 'History unavailable'
                        });
                    }
                }
                continue;
            }

            const startTime = new Date(weekData.startTime);
            const endTime = new Date(weekData.endTime);

            // Find all match IDs in this week's window
            const weekMatchIds = schedule
                .filter(m => {
                    const start = parseISTDate(m.MatchDate, m.MatchTime);
                    return start >= startTime && start <= endTime;
                })
                .map(m => Number(m.MatchID));

            const capId = weekHistory.captain?.toString();
            const vcId = weekHistory.viceCaptain?.toString();
            const playingIds = new Set((weekHistory.players || []).map(p => p.toString()));

            for (const player of squadPlayers) {
                const pid = player._id.toString();
                if (!breakdown[pid]) continue;

                const pmp = player.perMatchPoints || [];

                // Sum raw (no-multiplier) points for this week's matches
                const weekRaw = Number(
                    pmp
                        .filter(m => weekMatchIds.includes(Number(m.matchId)))
                        .reduce((s, m) => s + (m.total || 0), 0)
                        .toFixed(1)
                );

                const inXI = playingIds.has(pid);
                let role = 'Benched';
                let multiplier = 1;

                if (inXI) {
                    if (pid === capId)      { role = 'Captain';      multiplier = 2;   }
                    else if (pid === vcId)  { role = 'Vice Captain'; multiplier = 1.5; }
                    else                    { role = 'Player';        multiplier = 1;   }
                }

                const withBonus = inXI ? Number((weekRaw * multiplier).toFixed(1)) : 0;

                breakdown[pid].weekBreakdown.push({
                    week: weekNum,
                    rawPoints: weekRaw,
                    withBonus,
                    inXI,
                    role
                });

                if (inXI) {
                    breakdown[pid].contributed += withBonus;
                } else {
                    breakdown[pid].benched += weekRaw;
                }
            }
        }

        // --- Round final totals ---
        for (const pid of Object.keys(breakdown)) {
            breakdown[pid].contributed = Number(breakdown[pid].contributed.toFixed(1));
            breakdown[pid].benched = Number(breakdown[pid].benched.toFixed(1));
        }

        return breakdown;
    } catch (err) {
        console.error('[PlayerBreakdown] Failed to build player breakdown:', err.message);
        return {};
    }
}


// --- REUSABLE SCORING LOGIC ---
export const getTeamScoringSummary = async (team, tournament) => {
    // 1. Finalized total from past weeks (already includes Week 1 from migration)
    let totalFinalized = team.totalPoints || 0;
    let currentWeekLivePoints = 0;
    let playerWeekPoints = {};

    // 2. Identify Current Week context
    const currentWeekNum = tournament?.currentWeek || 1;
    const weekStartTime = tournament?.weekStartTime;

    // 3. Add live points only for Week 2+ (or if Week 1 snapshot somehow existed)
    if (weekStartTime) {
        const snapshot = team.playing11History.find(h => h.week === currentWeekNum);
        
        let actualStartTime = weekStartTime;
        const prevWeek = tournament?.weekData?.find(w => w.week === currentWeekNum - 1);
        if (prevWeek && prevWeek.endTime) {
            actualStartTime = prevWeek.endTime;
        }

        if (snapshot) {
            const result = await calculatePointsForWindow(
                team, 
                actualStartTime, 
                new Date(), // Current live window
                snapshot
            );
            currentWeekLivePoints = result.total;
            playerWeekPoints = result.playerPoints;
        }
    }

    // 4. Points breakdown for frontend
    const pastWeeksMap = {};
    (team.weeklyPoints || []).forEach(wp => {
        pastWeeksMap[`week${wp.week}`] = wp.points;
    });

    // 5. Per-player full historical breakdown
    //    Only compute if playersBought is populated (has full Player objects with perMatchPoints)
    let playerBreakdown = {};
    const firstPlayer = team.playersBought?.[0];
    const isPopulated = firstPlayer && typeof firstPlayer === 'object' && firstPlayer.perMatchPoints !== undefined;
    if (isPopulated) {
        playerBreakdown = await buildPlayerBreakdown(team, tournament, team.playersBought, playerWeekPoints);
    }

    return {
        id: team.code,
        name: team.name,
        logo: team.logo,
        totalPoints: Number((totalFinalized + currentWeekLivePoints).toFixed(2)),
        finalizedTotal: totalFinalized,
        livePoints: currentWeekLivePoints,
        playerWeekPoints, // Map of { playerId: { total, batting, bowling, fielding } }
        weeklyBreakdown: pastWeeksMap, // e.g. { week1: 846.5 }
        playing11Count: team.playing11.length,
        playerBreakdown  // NEW: Full per-player historical breakdown
    };
};

export const getPointsTable = async (req, res) => {
    try {
        const tournamentId = req.params.id;
        const query = tournamentId ? { _id: tournamentId } : {};
        const tournament = await Tournament.findOne(query).sort({ createdAt: -1 });
        const teams = await Team.find({}).populate('playing11');

        const pointsTable = await Promise.all(teams.map(async team => {
            return await getTeamScoringSummary(team, tournament);
        }));

        // Sort by Grand Total (Descending)
        pointsTable.sort((a, b) => b.totalPoints - a.totalPoints);

        res.json({
            success: true,
            currentWeek: tournament?.currentWeek || 1,
            isWeekActive: !!tournament?.weekStartTime,
            pointsTable
        });

    } catch (error) {
        console.error("Get Points Table Error:", error);
        res.status(500).json({ message: 'Failed to fetch points table' });
    }
};
