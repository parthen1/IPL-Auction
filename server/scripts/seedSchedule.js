/**
 * Seed script — imports IPL schedule from ipl_schedule_export.json into MongoDB.
 * Run once: node server/scripts/seedSchedule.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import IplSchedule from '../models/IplSchedule.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/auction_db';

async function seed() {
    console.log('Connecting to:', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const jsonPath = path.resolve(__dirname, '../../ipl_schedule_export.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`Found ${data.length} matches in JSON`);

    const existing = await IplSchedule.countDocuments();
    if (existing > 0) {
        console.log(`iplschedule already has ${existing} docs — skipping insert`);
    } else {
        // Strip the _id so MongoDB generates a new one
        const cleaned = data.map(({ _id, ...rest }) => rest);
        await IplSchedule.insertMany(cleaned);
        console.log(`Inserted ${cleaned.length} schedule records`);
    }

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
