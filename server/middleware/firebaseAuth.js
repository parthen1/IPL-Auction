import jwt from 'jsonwebtoken';
import firebaseAdmin from '../config/firebaseAdmin.js';
import User from '../models/User.js';

export const firebaseAuth = async (req, res, next) => {
    // 1. Get Token from body or header
    let token = req.body?.firebaseToken;
    
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        console.error('[Firebase Auth] ❌ No firebaseToken provided in body or Authorization header');
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        let decodedToken = null;
        let uid = null;
        let email = null;
        let name = null;

        // 2. Try Firebase Admin first if initialized
        if (firebaseAdmin.apps && firebaseAdmin.apps.length > 0) {
            try {
                decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
                uid = decodedToken.uid;
                email = decodedToken.email;
                name = decodedToken.name;
            } catch (adminErr) {
                console.warn('[Firebase Auth] Admin SDK verify failed, falling back to Google TokenInfo:', adminErr.message);
            }
        }

        // 3. Direct Google Token verification fallback
        if (!uid) {
            const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`Google token validation failed: ${errText}`);
            }
            const info = await resp.json();
            uid = info.user_id || info.sub;
            email = info.email;
            name = info.name || email?.split('@')[0] || 'User';
            decodedToken = info;
        }

        console.log('[Firebase Auth] ✅ Token verified successfully for uid:', uid, '| email:', email);

        const adminEmails = [
            'parthendesai04@gmail.com',
            'dhruvpatel3768@gmail.com',
            (process.env.ADMIN_EMAIL || '').toLowerCase()
        ].filter(Boolean);

        const isUserAdmin = email && adminEmails.includes(email.toLowerCase());

        // 4. Find or Create User in Mongo
        let user = await User.findOne({ $or: [{ firebaseUid: uid }, { email: email }] });

        if (!user) {
            user = await User.create({
                firebaseUid: uid,
                email: email,
                name: name || 'User',
                role: isUserAdmin ? 'admin' : 'user'
            });
        } else {
            if (!user.firebaseUid) {
                user.firebaseUid = uid;
            }
            if (isUserAdmin && user.role !== 'admin') {
                user.role = 'admin';
            }
            await user.save();
        }

        // Attach to request
        req.user = user;
        req.firebaseUser = decodedToken;
        next();
    } catch (error) {
        console.error('[Firebase Auth] ❌ Firebase verify error detailed:', {
            errorMessage: error.message,
            stack: error.stack,
            tokenPreview: token.substring(0, 40) + '...'
        });
        return res.status(401).json({
            message: 'Invalid Firebase token',
            errorDetails: error.message
        });
    }
};
