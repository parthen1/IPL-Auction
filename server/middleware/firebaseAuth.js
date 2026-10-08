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

    console.log('[Firebase Auth] Incoming token (first 40 chars):', token.substring(0, 40) + '...');

    try {
        // 2. Verify with Firebase
        const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
        const { uid, email, name, picture } = decodedToken;
        console.log('[Firebase Auth] ✅ Token verified successfully for uid:', uid, '| email:', email);

        // 3. Find or Create User in Mongo
        let user = await User.findOne({ firebaseUid: uid });

        if (!user) {
            user = await User.create({
                firebaseUid: uid,
                email: email,
                name: name || 'User',
                role: email === 'dhruvpatel3768@gmail.com' ? 'admin' : 'user'
            });
        } else if (email === 'dhruvpatel3768@gmail.com' && user.role !== 'admin') {
            user.role = 'admin';
            await user.save();
        }

        // Attach to request
        req.user = user;
        req.firebaseUser = decodedToken;
        next();
    } catch (error) {
        console.error('[Firebase Auth] ❌ Firebase verify error detailed:', {
            errorCode: error.code,
            errorMessage: error.message,
            stack: error.stack,
            tokenPreview: token.substring(0, 40) + '...'
        });
        return res.status(401).json({
            message: 'Invalid Firebase token',
            errorDetails: error.message,
            errorCode: error.code || 'unknown'
        });
    }
};
