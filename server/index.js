import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import connectDB from './config/db.js';
import Team from './models/Team.js';
import Player from './models/Player.js';
// activeSessions removed in favor of strict DB session management
import { TEAMS } from './data/teams.js';
import { setupSocket, startAuctionCheckLoop, updateAuctionTimer } from './socketHandler.js';
import * as auctionController from './controllers/auctionController.js';
import AuctionState from './models/AuctionState.js';
import User from './models/User.js';

// --- FIX: Restore Timer on Startup ---
const restoreAuctionTimer = async () => {
  try {
    const state = await AuctionState.findOne({ status: 'ACTIVE' });
    if (state && state.timerEndsAt) {
      const now = new Date();
      if (state.timerEndsAt > now) {
        console.log(`[Startup] Restoring Auction Timer. Ends at: ${state.timerEndsAt}`);
        updateAuctionTimer(state.timerEndsAt);
      } else {
        console.log('[Startup] Found ACTIVE auction with expired timer. Triggering immediate resolution check.');
        updateAuctionTimer(state.timerEndsAt);
      }
    }
  } catch (e) {
    console.error("Failed to restore auction timer:", e);
  }
};
// -------------------------------------
import firebaseAdmin from './config/firebaseAdmin.js';
import authRoutes from './routes/authRoutes.js';
import Tournament from './models/Tournament.js';
import TournamentUser from './models/TournamentUser.js';
import tradeRoutes from './routes/tradeRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import { connectDream11DB } from './config/dream11Db.js';
import { bootstrapDream11Data } from './services/dream11Bootstrap.js';
import fantasyRoutes from './routes/fantasyRoutes.js';
import { startLivePointsSync } from './services/livePointsSync.js';
import { protect, adminOnly } from './middleware/auth.js';
import { startNewWeek, finalizeWeek } from './utils/weekManager.js';
dotenv.config();

// Connect to Database
connectDB();
connectDream11DB().then(bootstrapDream11Data).catch(console.error);

// Start live fantasy points sync (polls external API every 5 min during today's match)
startLivePointsSync().catch(err => console.error('[LiveSync] Startup error:', err.message));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Setup Socket
setupSocket(io);
// Start Timer Loop
startAuctionCheckLoop();

app.use(cors());
app.use(express.json());

// Attach IO to request for Routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Auth Middleware - now imported from ./middleware/auth.js

// --- AUTH API ---
app.post('/api/auth/login', async (req, res) => {
  const { teamCode, password } = req.body;

  // Normalize ID (lowercase for config lookup, but check DB carefully)
  const id = teamCode ? teamCode.toLowerCase() : req.body.teamId?.toLowerCase();

  // --- FIREBASE VERIFICATION START ---
  // Bypass for admin username to preserve existing admin login behavior perfectly
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';

  if (id !== adminUsername.toLowerCase()) {
    const { firebaseToken } = req.body;
    if (!firebaseToken) {
      console.warn(`[Auth] Login blocked: Missing Firebase Token for team ${id}`);
      return res.status(401).json({ message: 'Email verification required. Please login via Email first.' });
    }
    try {
      await firebaseAdmin.auth().verifyIdToken(firebaseToken);
      // Token is valid, proceed
    } catch (fbError) {
      console.error(`[Auth] Firebase Token Verification Failed for team ${id}:`, fbError.message);
      return res.status(401).json({ message: 'Invalid or expired email session. Please login via Email again.' });
    }
  }
  // --- FIREBASE VERIFICATION END ---

  try {
    // Admin Login (no session restriction for admin)
    if (id === adminUsername.toLowerCase() && password === process.env.ADMIN_PASSWORD) {
      const sessionId = crypto.randomUUID();
      const token = jwt.sign({ teamCode: 'admin', role: 'admin', sessionId }, process.env.JWT_SECRET, { expiresIn: '12h' });
      return res.json({
        success: true,
        token,
        team: { code: 'admin', name: 'Administrator', role: 'admin' }
      });
    }

    // Team Login
    // 1. Check Config (Static Data)
    const teamConfig = TEAMS.find(t => t.id === id);
    if (!teamConfig) {
      return res.status(404).json({ message: 'Team not found in configuration' });
    }

    // 2. Check Password
    if (teamConfig.password !== password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // 3. Fetch DB State (Case Insensitive Query for Safety)
    const dbTeam = await Team.findOne({ code: id.toUpperCase() });

    if (!dbTeam) {
      return res.status(500).json({ message: 'Team data missing in database. Please contact admin.' });
    }

    // 4. Check if team is already logged in (DB is source of truth)
    if (dbTeam.isLoggedIn && dbTeam.activeSessionId) {
      return res.status(409).json({
        success: false,
        message: 'Team is already logged in on another tab or device. Please logout from the other session first.'
      });
    }

    // 5. Generate unique sessionId and update DB
    const sessionId = crypto.randomUUID();
    dbTeam.isLoggedIn = true;
    dbTeam.activeSessionId = sessionId;
    dbTeam.lastLoginAt = new Date();
    await dbTeam.save();

    // 6. Generate Token with sessionId
    // STRICT FIX: Payload contains ONLY teamCode and sessionId (plus role for middleware)
    const token = jwt.sign({
      teamCode: dbTeam.code, // Ensure we use DB code (should be uppercase)
      role: 'team',
      sessionId,
      userId: null,
      tournamentId: null
    }, process.env.JWT_SECRET, { expiresIn: '5d' });

    res.json({
      success: true,
      token,
      team: {
        ...teamConfig,
        remainingPurse: dbTeam.remainingPurse,
        squadSize: dbTeam.squadSize,
        overseasCount: dbTeam.overseasCount,
        role: 'team',
        logo: dbTeam.logo
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Legacy /api/login for backward compat during refactor (optional, but requested /api/auth/login)
app.post('/api/login', (req, res) => {
  res.redirect(307, '/api/auth/login');
});

app.post('/api/logout', protect, async (req, res) => {
  try {
    const requestedTeamId = req.body.teamId;
    const authTeamCode = req.user.teamCode;
    const authRole = req.user.role;

    // Determine target team to logout
    let targetTeamCode = authTeamCode;

    // If admin is requesting logout of a specific team
    if (authRole === 'admin' && requestedTeamId) {
      targetTeamCode = requestedTeamId;
    } else if (requestedTeamId && requestedTeamId.toUpperCase() !== authTeamCode.toUpperCase()) {
      // If regular user tries to logout someone else
      return res.status(403).json({ message: 'Unauthorized to logout this team' });
    }

    if (targetTeamCode) {
      // Clear DB session
      await Team.findOneAndUpdate(
        { code: targetTeamCode.toUpperCase() },
        {
          isLoggedIn: false,
          activeSessionId: null
        }
      );

      res.json({ success: true, message: 'Logged out successfully' });
    } else {
      res.status(400).json({ message: 'Team ID required' });
    }
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Logout failed' });
  }
});


// --- TEAMS API ---
// --- TEAMS API (Smart V2 Compatible) ---
app.get('/api/teams', protect, async (req, res) => {
  try {
    const teams = await Team.find({}).select('code name remainingPurse squadSize overseasCount totalSpent isActive playersBought logo').populate('playersBought');

    // Attempt to find a relevant Active/Open tournament to show "Owners"
    let ownerMap = new Map();
    try {
      const activeTournament = await Tournament.findOne({ status: { $in: ['ACTIVE', 'RUNNING', 'OPEN'] } }).sort({ createdAt: -1 });
      if (activeTournament) {
        const assignments = await TournamentUser.find({ tournament: activeTournament._id, teamCode: { $ne: null } }).populate('user', 'username');
        assignments.forEach(a => {
          if (a.teamCode && a.user) {
            ownerMap.set(a.teamCode.toUpperCase(), a.user.username);
          }
        });
      }
    } catch (e) {
      console.warn("Failed to fetch tournament owners for public view", e);
    }

    const response = teams.map(t => {
      // Find config for static data like colors
      const config = TEAMS.find(c => c.id === t.code) || {};
      const owner = ownerMap.get(t.code.toUpperCase());

      return {
        ...t.toObject(),
        ...config, // Merge config (colors etc)
        id: t.code, // Frontend compatibility
        budget: t.remainingPurse,
        ownerUsername: owner || null
      };
    });
    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// --- PLAYERS API ---
// Protected? User request: "Dashboard Page: Fetch team summary".
// Usually players list is public or team-visible.
// Let's protect it to ensure only logged in teams can see.
app.get('/api/players', protect, async (req, res) => {
  try {
    const { status, team } = req.query;
    let query = {};
    if (status) query.status = status;
    if (team) query.soldToTeam = team;

    const players = await Player.find(query);
    res.json(players);
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// --- AUCTION API ---
app.get('/api/auction/status', protect, auctionController.getAuctionStatus);
app.post('/api/auction/start', protect, adminOnly, auctionController.startAuction);
app.post('/api/auction/bid', protect, auctionController.placeBid);
app.post('/api/auction/end', protect, adminOnly, auctionController.endTurn);
app.post('/api/auction/next', protect, adminOnly, auctionController.nextPlayer);
app.post('/api/auction/timer', protect, adminOnly, auctionController.resetTimer);
app.post('/api/auction/requeue', protect, adminOnly, auctionController.requeueUnsoldPlayer);

// --- ADMIN WEEK MANAGEMENT ---
app.post('/api/admin/start-week', protect, adminOnly, async (req, res) => {
    try {
        const { tournamentId } = req.body;
        const result = await startNewWeek(tournamentId);
        res.json({ success: true, message: `Week ${result.week} started and Playing 11 locked.`, ...result });
    } catch (error) {
        console.error("Start Week Error:", error);
        res.status(500).json({ message: error.message || 'Failed to start week' });
    }
});

app.post('/api/admin/finalize-week', protect, adminOnly, async (req, res) => {
    try {
        const { tournamentId } = req.body;
        const result = await finalizeWeek(tournamentId);
        res.json({ success: true, message: `Week ${result.finalizedWeek} finalized successfully.`, ...result });
    } catch (error) {
        console.error("Finalize Week Error:", error);
        res.status(500).json({ message: error.message || 'Failed to finalize week' });
    }
});

// --- V2 AUTH ROUTES (Refactor) ---
app.use('/api/v2/auth', authRoutes);

// --- TRADE ROUTES ---
app.use('/api/trades', protect, tradeRoutes);

app.use('/api/schedule', scheduleRoutes);

// --- FANTASY MODULE ---
app.use('/api/fantasy', fantasyRoutes);

// Basic Route
app.get('/', (req, res) => {
  res.send('Auction Server is Running with DB & Auth');
});

const PORT = process.env.PORT || 5000;


// Run Timer Restoration
restoreAuctionTimer().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
