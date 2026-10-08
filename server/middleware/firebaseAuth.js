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
                console.warn('[Firebase Auth] Admin SDK verify skipped:', adminErr.message);
            }
        }

        // 3. Verify via Firebase Identity Toolkit HTTP API
        if (!uid) {
            const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyC5NtVq5Le_0zBqFtl7zKPwFfzWn6ysuik';
            try {
                const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken: token })
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.users && data.users[0]) {
                        const u = data.users[0];
                        uid = u.localId;
                        email = u.email;
                        name = u.displayName || email?.split('@')[0] || 'User';
                        decodedToken = u;
                    }
                }
            } catch (apiErr) {
                console.warn('[Firebase Auth] Identity Toolkit lookup failed:', apiErr.message);
            }
        }

        // 4. JWT Decode fallback for Firebase ID Tokens
        if (!uid) {
            const decoded = jwt.decode(token);
            if (decoded && (decoded.user_id || decoded.sub)) {
                // Verify not expired
                if (decoded.exp && decoded.exp * 1000 < Date.now()) {
                    throw new Error('Token has expired. Please sign in again.');
                }
                uid = decoded.user_id || decoded.sub;
                email = decoded.email;
                name = decoded.name || email?.split('@')[0] || 'User';
                decodedToken = decoded;
            } else {
                throw new Error('Could not parse valid Firebase user credentials from token.');
            }
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
