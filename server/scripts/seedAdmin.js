/**
 * Seed script — creates an admin user in the User collection for local login.
 * Run once: node server/scripts/seedAdmin.js
 * 
 * Login: username=admin, password=admin123
 * (The role is set to 'admin' so /api/v2/auth/login-local returns admin role)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import User from '../models/User.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/auction_db';

async function seed() {
    console.log('Connecting to:', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existing = await User.findOne({ username: 'admin' });
    if (existing) {
        console.log('[SKIP] Admin user already exists');
        console.log('  username:', existing.username);
        console.log('  role:', existing.role);
        await mongoose.disconnect();
        process.exit(0);
    }

    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await User.create({
        email: 'admin@auctionarena.local',
        firebaseUid: 'local-admin-uid-' + Date.now(),
        name: 'Admin',
        username: 'admin',
        password: hashedPassword,
        role: 'admin'
    });

    console.log('[OK] Admin user created');
    console.log('  username: admin');
    console.log('  password: admin123');
    console.log('  role: admin');
    console.log('\nYou can now log in at http://localhost:5174/email-login');
    
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
