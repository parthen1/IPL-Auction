import jwt from 'jsonwebtoken';
import Team from '../models/Team.js';

export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // --- Admin and Spectator: bypass session validation ---
      if (decoded.role === 'admin' || decoded.role === 'spectator') {
        req.user = {
          userId: decoded.userId || null,
          role: decoded.role,
          teamCode: decoded.teamCode || null,
          tournamentId: decoded.tournamentId || null,
          sessionId: decoded.sessionId || null,
          firebaseUid: decoded.firebaseUid || null
        };
        console.log('[Protect] REQ.USER (admin/spectator):', req.user);
        return next();
      }

      // --- teamCode check ---
      const teamCode = decoded.teamCode || null;

      // No teamCode yet (pre-team-selection state)
      if (!teamCode) {
        req.user = {
          userId: decoded.userId || null,
          role: decoded.role,
          teamCode: null,
          tournamentId: decoded.tournamentId || null,
          sessionId: decoded.sessionId || null,
          firebaseUid: decoded.firebaseUid || null
        };
        console.log('[Protect] REQ.USER (no team):', req.user);
        return next();
      }

      const normalizedCode = teamCode.toUpperCase();
      const team = await Team.findOne({ code: normalizedCode });

      if (!team) {
        console.error(`[Protect] Team not found for code: ${normalizedCode}`);
        return res.status(401).json({ message: 'Team not found', forceLogout: true });
      }

      // Multi-Tournament flow: tournamentId in JWT means session is scoped — skip legacy sessionId check
      if (decoded.tournamentId) {
        req.user = {
          userId: decoded.userId || null,
          role: decoded.role,
          teamCode: normalizedCode,
          tournamentId: decoded.tournamentId,
          sessionId: decoded.sessionId || null,
          firebaseUid: decoded.firebaseUid || null
        };
        console.log('[Protect] REQ.USER (tournament):', req.user);
        return next();
      }

      // Legacy: validate sessionId against DB
      if (team.activeSessionId !== decoded.sessionId) {
        return res.status(401).json({
          message: 'Session invalid. You have been logged out from another location.',
          forceLogout: true
        });
      }

      req.user = {
        userId: decoded.userId || null,
        role: decoded.role,
        teamCode: normalizedCode,
        tournamentId: decoded.tournamentId || null,
        sessionId: decoded.sessionId || null,
        firebaseUid: decoded.firebaseUid || null
      };
      console.log('[Protect] REQ.USER (legacy):', req.user);
      next();
    } catch (error) {
      console.error('Token Failed:', error.message);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Admin access required' });
  }
};
