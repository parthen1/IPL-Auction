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

    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Check if admin already exists
    const existing = await User.findOne({ username: 'admin' });
    if (existing) {
        existing.password = hashedPassword;
        existing.role = 'admin';
        await existing.save();
        console.log('[OK] Admin user updated');
        console.log('  username: admin');
        console.log('  password:', adminPassword);
        console.log('  role: admin');
        await mongoose.disconnect();
        process.exit(0);
    }
    
    await User.create({
        email: process.env.ADMIN_EMAIL || 'admin@auctionarena.local',
        firebaseUid: 'local-admin-uid-' + Date.now(),
        name: 'Admin',
        username: 'admin',
        password: hashedPassword,
        role: 'admin'
    });

    console.log('[OK] Admin user created');
    console.log('  username: admin');
    console.log('  password:', adminPassword);
    console.log('  role: admin');
    console.log('\nYou can now log in at /email-login');
    
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
