import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import IplSchedule from '../models/IplSchedule.js';
import { getFantasyMatchModel } from '../models/FantasyMatch.js';
import { computeMatchStatus } from '../utils/fantasyUtils.js';

/**
 * Script to sync match statuses in both databases:
 * 1. auction_v2 (iplschedule collection)
 * 2. dream11 (matches collection)
 * 
 * Logic:
 * - Upcoming : Before match start
 * - Live     : From start until start + 4h 30min
 * - Completed: After start + 4h 30min
 */

async function syncStatuses() {
    try {
        console.log('--- Starting Match Status Sync ---');
        console.log('Current Time:', new Date().toLocaleString());

        // 1. Connect to Auction v2 (primary DB)
        const primaryUri = process.env.MONGO_URI;
        if (!primaryUri) throw new Error('MONGO_URI is not defined in .env');
        await mongoose.connect(primaryUri);
        console.log('Connected to auction_v2 database');

        // 2. Refresh ipl_schedule in auction_v2
        const iplMatches = await IplSchedule.find({});
        let iplUpdatedCount = 0;

        for (const match of iplMatches) {
            // MATCH_COMMENCE_START_DATE is often used as the full timestamp string
            const dateStr = match.MATCH_COMMENCE_START_DATE || match.MatchDate;
            const timeStr = match.MatchTime;
            const newStatus = computeMatchStatus(dateStr, timeStr);

            if (match.MatchStatus !== newStatus) {
                console.log(`[Auction] Match ${match.MatchID} status update: ${match.MatchStatus || 'None'} -> ${newStatus}`);
                match.MatchStatus = newStatus;
                await match.save();
                iplUpdatedCount++;
            }
        }
        console.log(`Auction Status Sync Finished. Updated: ${iplUpdatedCount}`);

        // 3. Refresh matches in dream11 DB
        const FantasyMatch = await getFantasyMatchModel();
        const dreamMatches = await FantasyMatch.find({});
        let dreamUpdatedCount = 0;

        for (const match of dreamMatches) {
            const dateStr = match.date;
            const timeStr = match.time;
            const newStatus = computeMatchStatus(dateStr, timeStr);

            if (match.status !== newStatus) {
                console.log(`[Dream11] Match "${match.matchName}" status update: ${match.status || 'None'} -> ${newStatus}`);
                match.status = newStatus;
                await match.save();
                dreamUpdatedCount++;
            }
        }
        console.log(`Dream11 Status Sync Finished. Updated: ${dreamUpdatedCount}`);

        console.log('--- Sync Completed Successfully ---');
        process.exit(0);
    } catch (error) {
        console.error('Error during sync:', error);
        process.exit(1);
    }
}

syncStatuses();
