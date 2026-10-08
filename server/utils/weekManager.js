import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Team from '../models/Team.js';
import Tournament from '../models/Tournament.js';
import Player from '../models/Player.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schedulePath = path.join(__dirname, '..', '..', 'ipl_schedule_export.json');

const EXTERNAL_API_BASE = 'https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com';

/** Normalize API name */
function normalizeApiName(raw) {
    if (!raw) return '';
    return raw
        .replace(/\s*\((c|wk|ip|rp|impact\s*player)\)\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 
 * Fuzzy name match — strips spaces and non-alphanumeric for comparison
 */
function fuzzyMatch(dbName, apiName) {
    const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const db = clean(dbName || '');
    const api = clean(apiName || '');
    
    if (db === api)             return true;
    if (db.includes(api) || api.includes(db))       return true;
    return false;
}

/**
 * Synchronizes points for a single match from the external API to the DB (Used during Audit)
 */
async function syncMatchPointsForAudit(matchId) {
    console.log(`[Audit] 🔍 Verifying points for match ${matchId}...`);
    try {
        const res = await fetch(`${EXTERNAL_API_BASE}/points?match_id=${matchId}`);
        if (!res.ok) {
            throw new Error(`Points API returned status ${res.status} for match ${matchId}`);
        }

        const json = await res.json();
        const apiPlayers = json?.data;
        if (!Array.isArray(apiPlayers) || apiPlayers.length === 0) {
            console.warn(`[Audit] ⚠️ No data found for match ${matchId}. Skipping.`);
            return;
        }

        // Fetch all players for matching
        const dbPlayers = await Player.find({});
        let updatedCount = 0;

        for (const apiP of apiPlayers) {
            const normalized = normalizeApiName(apiP.player);
            // Case-insensitive fuzzy match
            const dbPlayer = dbPlayers.find(p => fuzzyMatch(p.name, normalized));

            if (!dbPlayer) continue;

            const base = Number(apiP.total) || 0;
            const bat = Number(apiP.bat) || 0;
            const bowl = Number(apiP.bowl) || 0;
            const field = Number(apiP.field) || 0;

            // Prepare RAW points for history
            const rawMatchPoints = {
                matchId: Number(matchId),
                total: Number(base.toFixed(2)),
                batting: Number(bat.toFixed(2)),
                bowling: Number(bowl.toFixed(2)),
                fielding: Number(field.toFixed(2)),
                announcement: 0
            };

            const updateData = {};
            
            // 1. Update perMatchPoints history (ALWAYS store raw)
            let updatedPMP = [...(dbPlayer.perMatchPoints || [])];
            const idx = updatedPMP.findIndex(m => Number(m.matchId) === Number(matchId));
            if (idx !== -1) {
                updatedPMP[idx] = rawMatchPoints;
            } else {
                updatedPMP.push(rawMatchPoints);
            }
            updateData.perMatchPoints = updatedPMP;

            // 2. Update points field (Live display) with multipliers
            let finalPoints = { ...rawMatchPoints };
            if (dbPlayer.isInPlaying11) {
                let multiplier = 1;
                if (dbPlayer.isCaptain) multiplier = 2;
                else if (dbPlayer.isViceCaptain) multiplier = 1.5;

                finalPoints.total = Number((rawMatchPoints.total * multiplier).toFixed(2));
                finalPoints.batting = Number((rawMatchPoints.batting * multiplier).toFixed(2));
                finalPoints.bowling = Number((rawMatchPoints.bowling * multiplier).toFixed(2));
                finalPoints.fielding = Number((rawMatchPoints.fielding * multiplier).toFixed(2));
            }
            updateData.points = finalPoints;

            // Save to DB
            await Player.findByIdAndUpdate(dbPlayer._id, { $set: updateData });
            updatedCount++;
        }
        console.log(`[Audit] ✅ Sync Complete for match ${matchId}. Updated ${updatedCount} players.`);
    } catch (err) {
        console.error(`[Audit] ❌ Failed to sync match ${matchId}:`, err.message);
        throw err; // Stop finalization if sync fails (per User requirement)
    }
}

/**
 * Helper to parse IST date strings from schedule JSON
 */
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
    const isoString = `${year}-${isoMonth}-${isoDay}T${hours}:${minutes}:00+05:30`;
    return new Date(isoString);
}

/**
 * Calculates raw points for a team based on a snapshot and a time window.
 */
export const calculatePointsForWindow = async (team, startTime, endTime, snapshot) => {
    // Safety check: if snapshot is missing (e.g. for Week 1 transition)
    if (!snapshot) {
        console.warn(`[PointsCalc] Missing snapshot for team ${team.code}. Window: ${startTime} - ${endTime}`);
        return { total: 0, playerPoints: {} };
    }
    if (!startTime) return { total: 0, playerPoints: {} };
    
    // Load schedule to find match timings
    const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
    
    // Find MatchIDs that started within the window
    const windowMatchIds = schedule
        .filter(m => {
            const start = parseISTDate(m.MatchDate, m.MatchTime);
            return start >= new Date(startTime) && (!endTime || start <= new Date(endTime));
        })
        .map(m => Number(m.MatchID));

    if (windowMatchIds.length === 0) return { total: 0, playerPoints: {} };

    // Load all players in the snapshot to get their perMatchPoints
    const playerIds = snapshot.players.map(p => (p._id || p).toString());
    const players = await Player.find({ _id: { $in: playerIds } }).lean();

    let totalWeekPoints = 0;

    const capId = snapshot.captain ? (snapshot.captain._id || snapshot.captain).toString() : null;
    const vcId = snapshot.viceCaptain ? (snapshot.viceCaptain._id || snapshot.viceCaptain).toString() : null;

    const playerWeekPoints = {};

    for (const player of players) {
        // Find all match entries for this player that are in the current week's window
        const relevantMatchEntries = (player.perMatchPoints || [])
            .filter(mp => windowMatchIds.includes(Number(mp.matchId)));

        // Calculate raw sums (before multipliers)
        const rawPoints = {
            total: relevantMatchEntries.reduce((sum, mp) => sum + (mp.total || 0), 0),
            batting: relevantMatchEntries.reduce((sum, mp) => sum + (mp.batting || 0), 0),
            bowling: relevantMatchEntries.reduce((sum, mp) => sum + (mp.bowling || 0), 0),
            fielding: relevantMatchEntries.reduce((sum, mp) => sum + (mp.fielding || 0), 0)
        };

        // Determine multiplier
        let multiplier = 1;
        const pId = player._id.toString();
        if (pId === capId) multiplier = 2;
        else if (pId === vcId) multiplier = 1.5;

        // Add to team total (with multipliers)
        totalWeekPoints += (rawPoints.total * multiplier);

        // Store per-player breakdown with multipliers applied to the total
        playerWeekPoints[pId] = {
            total: Number((rawPoints.total * multiplier).toFixed(1)),
            batting: Number(rawPoints.batting.toFixed(1)),
            bowling: Number(rawPoints.bowling.toFixed(1)),
            fielding: Number(rawPoints.fielding.toFixed(1))
        };
    }

    return {
        total: Number(totalWeekPoints.toFixed(2)),
        playerPoints: playerWeekPoints
    };
};

/**
 * Starts a new week:
 * 1. Locks current Playing 11 for all teams into their history for the current week.
 * 2. Sets weekStartTime to now in Tournament.
 */
export const startNewWeek = async (tournamentId = null) => {
    const query = tournamentId ? { _id: tournamentId } : {};
    const tournament = await Tournament.findOne(query).sort({ createdAt: -1 });
    if (!tournament) throw new Error('Tournament not found');

    const teams = await Team.find({});
    const currentWeek = tournament.currentWeek;

    for (const team of teams) {
        // Create snapshot for the new week
        const snapshot = {
            week: currentWeek,
            players: team.playing11,
            captain: team.captain,
            viceCaptain: team.viceCaptain,
            isLocked: true
        };

        // If history for this week already exists (e.g. restart), replace it
        const historyIdx = team.playing11History.findIndex(h => h.week === currentWeek);
        if (historyIdx !== -1) {
            team.playing11History[historyIdx] = snapshot;
        } else {
            team.playing11History.push(snapshot);
        }
        await team.save();
    }

    tournament.weekStartTime = new Date();
    // Ensure weekData entry exists
    const weekIdx = tournament.weekData.findIndex(w => w.week === currentWeek);
    if (weekIdx !== -1) {
        tournament.weekData[weekIdx].startTime = tournament.weekStartTime;
        tournament.weekData[weekIdx].isFinalized = false;
    } else {
        tournament.weekData.push({
            week: currentWeek,
            startTime: tournament.weekStartTime,
            isFinalized: false
        });
    }

    await tournament.save();
    return { week: currentWeek, startTime: tournament.weekStartTime };
};

/**
 * Finalizes the current week:
 * 1. Calculates scores for the window [weekStartTime, now].
 * 2. Updates Team.totalPoints and Team.weeklyPoints.
 * 3. Increments Tournament.currentWeek.
 */
export const finalizeWeek = async (tournamentId = null) => {
    const query = tournamentId ? { _id: tournamentId } : {};
    const tournament = await Tournament.findOne(query).sort({ createdAt: -1 });
    if (!tournament || !tournament.weekStartTime) {
        throw new Error('Active week not found or not started.');
    }

    const endTime = new Date();
    const currentWeek = tournament.currentWeek;
    const teams = await Team.find({});

    let actualStartTime = tournament.weekStartTime;
    const prevWeek = tournament.weekData.find(w => w.week === currentWeek - 1);
    if (prevWeek && prevWeek.endTime) {
        actualStartTime = prevWeek.endTime;
    }

    // --- PHASE 1: Audit & Repair ---
    console.log(`[Finalize] 🚀 Starting Audit for Week ${currentWeek}...`);
    const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
    const windowMatchIds = schedule
        .filter(m => {
            const start = parseISTDate(m.MatchDate, m.MatchTime);
            return start >= new Date(actualStartTime) && start <= endTime;
        })
        .map(m => Number(m.MatchID));

    if (windowMatchIds.length > 0) {
        console.log(`[Finalize] Found ${windowMatchIds.length} matches to audit: ${windowMatchIds.join(', ')}`);
        for (const matchId of windowMatchIds) {
            await syncMatchPointsForAudit(matchId);
        }
    } else {
        console.log('[Finalize] No matches found in this week window. Skipping audit.');
    }

    for (const team of teams) {
        const snapshot = team.playing11History.find(h => h.week === currentWeek);
        if (!snapshot) {
            console.warn(`No snapshot found for Team ${team.code} in Week ${currentWeek}. Checking if already in weeklyPoints.`);
            
            // IF week is already in weeklyPoints (like our Week 1 backfill), skip recalculation
            const alreadyFinalized = team.weeklyPoints.some(wp => wp.week === currentWeek);
            if (alreadyFinalized) {
                console.log(`Team ${team.code} Week ${currentWeek} already finalized. Skipping.`);
                continue;
            }
            
            // Otherwise, we have a problem (missing mandatory snapshot for Week 2+)
            console.error(`FATAL: Missing snapshot for Team ${team.code} in mandatory Week ${currentWeek}. Points will be 0.`);
            team.weeklyPoints.push({ week: currentWeek, points: 0 });
            await team.save();
            continue;
        }

        const result = await calculatePointsForWindow(team, actualStartTime, endTime, snapshot);
        const weekPoints = result.total;
        
        // Persist weekly score
        team.weeklyPoints.push({ week: currentWeek, points: weekPoints });
        team.totalPoints += weekPoints;
        await team.save();
    }

    // Update Tournament history
    const weekIdx = tournament.weekData.findIndex(w => w.week === currentWeek);
    if (weekIdx !== -1) {
        tournament.weekData[weekIdx].endTime = endTime;
        tournament.weekData[weekIdx].isFinalized = true;
    }

    // Move to next week
    tournament.currentWeek += 1;
    tournament.weekStartTime = null; // Clear until next "Start Week"
    await tournament.save();

    // --- PHASE 3: Universal Summation ---
    // User requirement: Always run sumPerMatchPoints at the end to ensure 100% sync
    console.log('[Finalize] 🔄 Running final universal summation...');
    const allPlayers = await Player.find({});
    for (const player of allPlayers) {
        const sumPoints = (player.perMatchPoints || []).reduce((acc, mp) => {
            acc.total += (mp.total || 0);
            acc.batting += (mp.batting || 0);
            acc.bowling += (mp.bowling || 0);
            acc.fielding += (mp.fielding || 0);
            return acc;
        }, { total: 0, batting: 0, bowling: 0, fielding: 0, announcement: 0 });

        await Player.findByIdAndUpdate(player._id, { $set: { points: sumPoints } });
    }
    console.log('[Finalize] ✅ Universal Summation Complete.');

    return { finalizedWeek: currentWeek, endTime };
};
