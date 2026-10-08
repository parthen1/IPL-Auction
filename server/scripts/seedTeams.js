/**
 * Seed script — populates the Team collection from the static TEAMS config.
 * Run once: node server/scripts/seedTeams.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Team from '../models/Team.js';
import { TEAMS } from '../data/teams.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/auction_db';

async function seed() {
    console.log('Connecting to:', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    let created = 0, skipped = 0;

    for (const t of TEAMS) {
        const code = t.id.toUpperCase();
        const existing = await Team.findOne({ code });
        if (existing) {
            console.log(`  [SKIP] ${code} already exists`);
            skipped++;
            continue;
        }
        await Team.create({
            code,
            name: t.name,
            totalPurse: 120,
            remainingPurse: 120,
        });
        console.log(`  [OK]   ${code} created`);
        created++;
    }

    console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
