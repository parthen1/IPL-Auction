/**
 * livePointsSync.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Background service that polls the external fantasy points API and updates
 * the Player collection (auction_v2 DB) every 5 minutes during a live match.
 *
 * FLOW:
 *   1. On startup → GET /match from external API
 *   2. Check if today (IST) matches the match's start_time date
 *   3. Schedule a setTimeout to fire AT start_time
 *   4. Every 5 minutes: GET /points?match_id=X
 *   5. Normalize player names → match against Player collection
 *   6. Respect isInPlaying11, isCaptain, isViceCaptain flags
 *   7. $set Player.points (override, not accumulate)
 *   8. Auto-stop 4h 30min after start_time
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Player from '../models/Player.js';
import getFantasyPlayerModel from '../models/FantasyPlayer.js';
import getFantasyMatchModel from '../models/FantasyMatch.js';

const EXTERNAL_API_BASE = 'https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com';
const POLL_INTERVAL_MS  = 2 * 60 * 1000; // 2 minutes
const MATCH_DURATION_MS = (5 * 60) * 60 * 1000; // 5h (as requested)

// ── In-memory state (exported for /live-status endpoint) ─────────────────────
const state = {
    isLive:      false,
    matchId:     null,
    matchName:   null,
    startTime:   null,
    lastUpdatedAt: null,
    pollTimer:   null,
    stopTimer:   null
};

export const getSyncState = () => ({
    isLive:       state.isLive,
    matchId:      state.matchId,
    matchName:    state.matchName,
    startTime:    state.startTime,
    lastUpdatedAt: state.lastUpdatedAt
});


// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip role/status suffixes the API appends to player names */
function normalizeApiName(raw) {
    if (!raw) return '';
    return raw
        .replace(/\s*\((c|wk|ip|rp|impact\s*player)\)\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Fuzzy name match — same strategy as masterScript.js findDbPlayer()
 * exact → dbName contains apiName → apiName contains dbName
 */
/**
 * Fuzzy name match — strips spaces and non-alphanumeric for comparison
 */
function fuzzyMatch(dbName, apiName) {
    const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const db = clean(dbName || '');
    const api = clean(apiName || '');
    
    if (db === api)             return true;
    if (db.includes(api))       return true;
    if (api.includes(db))       return true;
    return false;
}


// ── Core poll tick ────────────────────────────────────────────────────────────

async function pollAndUpdate() {
    const tag = '[LiveSync]';
    try {
        // 1. Fetch points from external API
        const res = await fetch(
            `${EXTERNAL_API_BASE}/points?match_id=${state.matchId}`
        );
        if (!res.ok) {
            console.warn(`${tag} /points responded ${res.status} — skipping tick`);
            return;
        }
        const json = await res.json();
        const apiPlayers = json?.data;
        if (!Array.isArray(apiPlayers) || apiPlayers.length === 0) {
            console.warn(`${tag} No player data returned for match ${state.matchId}`);
            return;
        }

        // 2. Load all players from auction_v2 and dream11 once per tick
        const dbPlayers = await Player.find({}).lean();
        const FantasyPlayer = await getFantasyPlayerModel();
        const fantasyPlayers = await FantasyPlayer.find({}).lean();

        let updated  = 0;
        let skipped  = 0;
        let notFound = 0;

        // 3. Process each API player
        for (const apiPlayer of apiPlayers) {
            const normalizedName = normalizeApiName(apiPlayer.player);
            const basePoints = Number(apiPlayer.total) || 0;

            // --- 1. Update FANTASY module (dream11 DB) ---
            const dbFantasyPlayer = fantasyPlayers.find(p => fuzzyMatch(p.name, normalizedName));
            if (dbFantasyPlayer) {
                await FantasyPlayer.findByIdAndUpdate(dbFantasyPlayer._id, {
                    $set: { points: basePoints }
                });
            }

            // --- 2. Update AUCTION module (auction_v2 DB) ---
            // Find matching DB player (fuzzy)
            const dbPlayer = dbPlayers.find(p => fuzzyMatch(p.name, normalizedName));

            if (!dbPlayer) {
                notFound++;
                continue;
            }

            const updateData = {};

            // Extract raw points (NO MULTIPLIERS as per User rule)
            updateData.points = {
                total: Number(basePoints.toFixed(2)),
                batting: Number((apiPlayer.bat || 0).toFixed(2)),
                bowling: Number((apiPlayer.bowl || 0).toFixed(2)),
                fielding: Number((apiPlayer.field || 0).toFixed(2)),
                announcement: 0
            };
            
            // Check for playerId update if missing
            if (!dbPlayer.playerId && apiPlayer.player_id) {
                updateData.playerId = apiPlayer.player_id;
            }

            // Update perMatchPoints array (RAW points)
            const matchIdNum = Number(state.matchId);
            let updatedPerMatchPoints = [...(dbPlayer.perMatchPoints || [])];
            const matchIdx = updatedPerMatchPoints.findIndex(m => m.matchId === matchIdNum);
            
            const matchPointsEntry = {
                matchId: matchIdNum,
                total: updateData.points.total,
                batting: updateData.points.batting,
                bowling: updateData.points.bowling,
                fielding: updateData.points.fielding,
                announcement: 0
            };

            if (matchIdx !== -1) {
                updatedPerMatchPoints[matchIdx] = matchPointsEntry;
            } else {
                updatedPerMatchPoints.push(matchPointsEntry);
            }
            updateData.perMatchPoints = updatedPerMatchPoints;

            // Update DB with RAW points (Sets Player.points to current match scores)
            await Player.findByIdAndUpdate(dbPlayer._id, {
                $set: updateData
            });

            updated++;
        }

        state.lastUpdatedAt = new Date().toISOString();
        console.log(
            `${tag} Tick | Updated: ${updated} | Benched/Skipped: ${skipped} | Not found: ${notFound} | ${state.lastUpdatedAt}`
        );

    } catch (err) {
        console.error(`[LiveSync] Poll error:`, err.message);
    }
}


// ── Scheduler ─────────────────────────────────────────────────────────────────

async function startPolling() {
    console.log(`[LiveSync] ▶ Polling started for match ${state.matchId} every ${POLL_INTERVAL_MS / 60000} min`);
    state.isLive = true;

    try {
        const FantasyMatch = await getFantasyMatchModel();
        await FantasyMatch.findOneAndUpdate(
            { legacyMatchId: String(state.matchId) },
            { $set: { status: 'Live' } }
        );
    } catch (e) {
        console.warn('[LiveSync] Failed to mark match as Live in DB', e.message);
    }

    // Immediate first fetch
    pollAndUpdate();

    // Recurring interval
    state.pollTimer = setInterval(pollAndUpdate, POLL_INTERVAL_MS);

    // Auto-stop after match window
    state.stopTimer = setTimeout(() => {
        console.log('[LiveSync] ■ Match window ended — stopping sync');
        stopPolling();
    }, MATCH_DURATION_MS);
}

async function stopPolling() {
    state.isLive = false;
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    if (state.stopTimer) { clearTimeout(state.stopTimer);  state.stopTimer = null; }

    try {
        if (state.matchId) {
            const FantasyMatch = await getFantasyMatchModel();
            await FantasyMatch.findOneAndUpdate(
                { legacyMatchId: String(state.matchId) },
                { $set: { status: 'Completed' } }
            );
        }
    } catch (e) {
        console.warn('[LiveSync] Failed to mark match as Completed in DB', e.message);
    }
}


// ── Entry point ───────────────────────────────────────────────────────────────

function getTodayISTDateString() {
    const now = new Date();
    const istOptions = { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' };
    const formatted = now.toLocaleDateString('en-GB', istOptions); // "31 Mar 2026"
    
    // Convert "31 Mar 2026" to "31 Mar 2026" (matches JSON format "31 Mar 2026" or "1 Apr 2026")
    // Wait, let's just use a more robust comparison
    return formatted;
}

function parseISTDate(dateStr, timeStr) {
    // dateStr: "31 Mar 2026", timeStr: "19:30"
    // We want to create a Date object in IST
    const [day, monthStr, year] = dateStr.split(' ');
    const months = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    const month = months[monthStr];
    const [hours, minutes] = timeStr.split(':');

    // Create date as UTC then adjust for IST offset (+5:30)
    // Or more simply, construct an ISO string
    const isoMonth = (month + 1).toString().padStart(2, '0');
    const isoDay = day.padStart(2, '0');
    const isoString = `${year}-${isoMonth}-${isoDay}T${hours}:${minutes}:00+05:30`;
    return new Date(isoString);
}

export async function startLivePointsSync() {
    try {
        console.log('[LiveSync] Checking local schedule (ipl_schedule_export.json)...');

        // Path: b:\auction_git\v5\auctionSimulation\ipl_schedule_export.json
        // __dirname equivalent for ES modules
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const schedulePath = path.join(__dirname, '..', '..', 'ipl_schedule_export.json');

        if (!fs.existsSync(schedulePath)) {
            console.error(`[LiveSync] Schedule file not found at ${schedulePath}`);
            return;
        }

        const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
        const now = new Date();
        const todayIST = getTodayISTDateString();

        // 1. Find matches for today
        const todaysMatches = schedule.filter(m => m.MatchDate === todayIST);

        if (todaysMatches.length === 0) {
            console.log(`[LiveSync] No matches scheduled for today (${todayIST})`);
            return;
        }

        console.log(`[LiveSync] Found ${todaysMatches.length} match(es) for today`);

        for (const match of todaysMatches) {
            const matchStart = parseISTDate(match.MatchDate, match.MatchTime);
            const matchEnd   = new Date(matchStart.getTime() + MATCH_DURATION_MS);

            // If match is LIVE now
            if (now >= matchStart && now < matchEnd) {
                if (state.isLive && state.matchId === String(match.MatchID)) {
                    console.log(`[LiveSync] Match ${match.MatchName} is already being synced`);
                    continue;
                }
                console.log(`[LiveSync] Match ${match.MatchName} is LIVE — starting sync`);
                state.matchId = String(match.MatchID);
                state.matchName = match.MatchName;
                state.startTime = matchStart.toISOString();
                startPolling();
                return; // Assume one match at a time as requested ("no overlap")
            }

            // If match is in the future
            if (now < matchStart) {
                const msUntilStart = matchStart.getTime() - now.getTime();
                console.log(`[LiveSync] Scheduled ${match.MatchName} to start in ${Math.round(msUntilStart / 60000)} minutes`);
                
                setTimeout(() => {
                    console.log(`[LiveSync] ⏰ Match start time reached for ${match.MatchName} — beginning sync`);
                    state.matchId = String(match.MatchID);
                    state.matchName = match.MatchName;
                    state.startTime = matchStart.toISOString();
                    startPolling();
                }, msUntilStart);
                return; // Assume one match at a time
            }
        }

        console.log('[LiveSync] All matches for today have already concluded');

    } catch (err) {
        console.error('[LiveSync] Init failed:', err.message);
    }
}

/**
 * Manual override triggered by Admin
 */
export async function manualTriggerSync() {
    console.log('[LiveSync] Manual trigger received. Re-scanning schedule...');
    // Stop any existing polling first
    stopPolling();
    // Re-run the startup logic
    await startLivePointsSync();
    return { success: true, isLive: state.isLive, matchName: state.matchName };
}
