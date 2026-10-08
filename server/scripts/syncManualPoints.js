// manualPointsSync.js

import mongoose from 'mongoose';
import Player from '../models/Player.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI;

const EXTERNAL_API_BASE = 'https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com';

/** Normalize API name */
function normalizeApiName(raw) {
    if (!raw) return '';
    return raw
        .replace(/\s*\((c|wk|ip|rp|impact\s*player)\)\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Fuzzy match - strips spaces and non-alphanumeric */
function fuzzyMatch(dbName, apiName) {
    const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const db = clean(dbName || '');
    const api = clean(apiName || '');

    return db === api || db.includes(api) || api.includes(db);
}

async function syncPoints(matchId) {
    console.log(`[ManualSync] 🔥 Starting for match ${matchId}`);

    try {
        // 1. Fetch API
        const res = await fetch(`${EXTERNAL_API_BASE}/points?match_id=${matchId}`);

        if (!res.ok) {
            console.error(`[ManualSync] API Error: ${res.status}`);
            return;
        }

        const json = await res.json();
        const apiPlayers = json?.data;

        if (!Array.isArray(apiPlayers) || apiPlayers.length === 0) {
            console.warn('[ManualSync] No data found');
            return;
        }

        // 2. Load DB players
        const dbPlayers = await Player.find({}).lean();

        let updated = 0, skipped = 0, notFound = 0;

        for (const apiPlayer of apiPlayers) {
            const name = normalizeApiName(apiPlayer.player);

            const dbPlayer = dbPlayers.find(p => fuzzyMatch(p.name, name));

            if (!dbPlayer) {
                console.log(`❌ Player Not Found in DB: ${name}`);
                notFound++;
                continue;
            }

            // Extract base points from API
            const base = Number(apiPlayer.total) || 0;
            const bat = Number(apiPlayer.bat) || 0;
            const bowl = Number(apiPlayer.bowl) || 0;
            const field = Number(apiPlayer.field) || 0;

            const updateData = {};

            // Check for playerId update if missing
            if (!dbPlayer.playerId && apiPlayer.player_id) {
                updateData.playerId = apiPlayer.player_id;
            }

            // Prepare RAW points data
            const rawPoints = {
                total: Number(base.toFixed(2)),
                batting: Number(bat.toFixed(2)),
                bowling: Number(bowl.toFixed(2)),
                fielding: Number(field.toFixed(2)),
                announcement: 0
            };

            // Apply multipliers ONLY for the live display (points field) if in Playing 11
            let finalPoints = { ...rawPoints };
            if (dbPlayer.isInPlaying11) {
                let multiplier = 1;
                if (dbPlayer.isCaptain) multiplier = 2;
                else if (dbPlayer.isViceCaptain) multiplier = 1.5;

                finalPoints.total = Number((rawPoints.total * multiplier).toFixed(2));
                finalPoints.batting = Number((rawPoints.batting * multiplier).toFixed(2));
                finalPoints.bowling = Number((rawPoints.bowling * multiplier).toFixed(2));
                finalPoints.fielding = Number((rawPoints.fielding * multiplier).toFixed(2));
            }

            updateData.points = finalPoints;

            const matchIdNum = Number(matchId);
            let updatedPerMatchPoints = [...(dbPlayer.perMatchPoints || [])];
            const matchIdx = updatedPerMatchPoints.findIndex(m => m.matchId === matchIdNum);

            // ALWAYS store RAW points in history to prevent double-multiplier in weekly calculations
            const matchPointsEntry = {
                matchId: matchIdNum,
                ...rawPoints
            };

            if (matchIdx !== -1) {
                updatedPerMatchPoints[matchIdx] = matchPointsEntry;
            } else {
                updatedPerMatchPoints.push(matchPointsEntry);
            }
            updateData.perMatchPoints = updatedPerMatchPoints;

            await Player.findByIdAndUpdate(dbPlayer._id, { $set: updateData });

            updated++;
        }

        console.log(`✅ Updated: ${updated}`);
        console.log(`⏭ Skipped: ${skipped}`);
        console.log(`❌ Not Found: ${notFound}`);

    } catch (err) {
        console.error('[ManualSync] Error:', err.message);
    }
}

// 🔥 MAIN EXECUTION
(async () => {
    const matchId = process.argv[2];

    if (!matchId) {
        console.error('❌ Please provide matchId');
        console.log('👉 Usage: node manualPointsSync.js <matchId>');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('🟢 DB Connected');

        await syncPoints(matchId);

        await mongoose.disconnect();
        console.log('🔴 DB Disconnected');
        process.exit(0);

    } catch (err) {
        console.error('❌ Fatal Error:', err.message);
        process.exit(1);
    }
})();