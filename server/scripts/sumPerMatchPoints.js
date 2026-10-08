import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Player from '../models/Player.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/auction_db';

const sumPerMatchPoints = async () => {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected.');

        console.log('Iterating over players to sum points...');
        const players = await Player.find({});
        let updatedCount = 0;

        for (const player of players) {
            if (!player.perMatchPoints || player.perMatchPoints.length === 0) {
                // If they have no perMatchPoints, ensure points are 0
                player.points = {
                    total: 0,
                    batting: 0,
                    bowling: 0,
                    fielding: 0,
                    announcement: 0
                };
                await player.save();
                updatedCount++;
                continue;
            }

            let sumTotal = 0;
            let sumBatting = 0;
            let sumBowling = 0;
            let sumFielding = 0;

            for (const matchPt of player.perMatchPoints) {
                sumTotal += matchPt.total || 0;
                sumBatting += matchPt.batting || 0;
                sumBowling += matchPt.bowling || 0;
                sumFielding += matchPt.fielding || 0;
            }

            // Override current points object with exactly the sum (plus previous announcement if any, or default 0)
            player.points = {
                total: sumTotal,
                batting: sumBatting,
                bowling: sumBowling,
                fielding: sumFielding,
                announcement: player.points?.announcement || 0
            };

            await player.save();
            updatedCount++;
        }

        console.log(`✅ Success! Updated points for ${updatedCount} players.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during sum process:', err);
        process.exit(1);
    }
};

sumPerMatchPoints();
