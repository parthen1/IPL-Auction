import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import rateLimit from 'express-rate-limit';

// Rate limiter: max 100 requests per 15 minutes per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
import Tournament from '../models/Tournament.js';
import TournamentUser from '../models/TournamentUser.js';
import Player from '../models/Player.js';
import Team from '../models/Team.js'; // Singleton Team Model
import { TEAMS } from '../data/teams.js'; // Static configs
import { firebaseAuth } from '../middleware/firebaseAuth.js';
import { protect } from '../middleware/auth.js';
import { getTeamScoringSummary } from '../controllers/teamController.js';
import * as teamController from '../controllers/teamController.js';
import AuctionState from '../models/AuctionState.js';

const router = express.Router();

// Local Admin Middleware for routes in this file
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Admin access required' });
    }
};

// 1. Firebase Login / Exchange Token
// Client sends Firebase Token in Header via middleware
// Returns Mongo User details
router.post('/login', firebaseAuth, (req, res) => {
    // Generate token equivalent to /login-local so frontend has a unified token schema
    const token = jwt.sign({
        userId: req.user._id,
        role: req.user.role,
        teamCode: req.user.teamCode || null,
        tournamentId: null,
        sessionId: null
    }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
        success: true,
        user: {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            username: req.user.username,
            role: req.user.role,
            firebaseUid: req.user.firebaseUid
        },
        token
    });
});

// 1.5 Set Username
router.post('/set-username', protect, async (req, res) => {
    const { username } = req.body;
    if (!username || username.length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }

    try {
        // Check uniqueness
        const existing = await User.findOne({ username: username.toLowerCase() });
        if (existing) {
            return res.status(409).json({ message: 'Username already taken' });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.username = username.toLowerCase();
        await user.save();

        res.json({ success: true, username: user.username });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: 'Username already taken' });
        }
        res.status(500).json({ message: 'Failed to set username' });
    }
});

// 1.6 Set Password (also handles change password — verifies currentPassword if user already has one)
router.post('/set-password', authLimiter, protect, async (req, res) => {
    const { password, currentPassword } = req.body;
    if (!password || password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    try {
        const userId = req.user.userId;
        const dbUser = await User.findById(userId).select('+password');
        if (!dbUser) return res.status(404).json({ message: 'User not found' });

        // If user already has a password, require currentPassword to verify identity
        if (dbUser.password) {
            if (!currentPassword) {
                return res.status(400).json({ message: 'Current password is required to change your password.' });
            }
            const isValid = await bcrypt.compare(currentPassword, dbUser.password);
            if (!isValid) {
                return res.status(401).json({ message: 'Current password is incorrect.' });
            }
        }

        const salt = await bcrypt.genSalt(10);
        dbUser.password = await bcrypt.hash(password, salt);
        await dbUser.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error('Set Password Error:', err);
        res.status(500).json({ message: 'Failed to set password' });
    }
});

// 1.65 Profile Status — tells the client whether the user has a password set
router.get('/profile-status', protect, async (req, res) => {
    try {
        const userId = req.user.userId;
        const dbUser = await User.findById(userId).select('+password');
        if (!dbUser) return res.status(404).json({ message: 'User not found' });

        res.json({
            _id: dbUser._id,
            hasPassword: !!dbUser.password,
            username: dbUser.username || null,
            email: dbUser.email || null,
            name: dbUser.name || null,
            role: dbUser.role || 'user'
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch profile status' });
    }
});

// 1.7 Local Login (Username/Password)
router.post('/login-local', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        // Keep generic to avoid hinting which field is missing
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        const user = await User.findOne({
            $or: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }]
        }).select('+password');

        if (!user || !user.password) {
            // Generic message to avoid revealing account state
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({
            userId: user._id,
            role: user.role,
            teamCode: user.teamCode || null,
            tournamentId: null,
            sessionId: null
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                username: user.username,
                role: user.role,
                firebaseUid: user.firebaseUid
            },
            token
        });
    } catch (err) {
        console.error('Local Login Error:', err);
        res.status(500).json({ message: 'Server error during local login' });
    }
});

// 2. List Tournaments
router.get('/tournaments', protect, async (req, res) => {
    try {
        const tournaments = await Tournament.find({ status: { $in: ['OPEN', 'ACTIVE', 'RUNNING'] } }).lean();

        // Find user assignments
        const assignments = await TournamentUser.find({ user: req.user.userId }).lean();
        const assignedTournamentIds = new Map(assignments.map(a => [a.tournament.toString(), a.teamCode]));

        const enrichedTournaments = tournaments.map(t => {
            const teamCode = assignedTournamentIds.get(t._id.toString());
            return {
                ...t,
                isJoined: assignedTournamentIds.has(t._id.toString()) && teamCode !== null && teamCode !== undefined,
                assignedTeamCode: teamCode || null
            };
        });

        res.json(enrichedTournaments);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching tournaments' });
    }
});

// 2.2 Delete Tournament
// 2.2 Delete Tournament (AND RESET GAME DATA)
router.delete('/tournaments/:id', protect, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access Denied: Only admins can delete tournaments.' });
    }

    try {
        const tournamentId = req.params.id;
        const tournament = await Tournament.findById(tournamentId);

        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found' });
        }

        // 1. Delete the Tournament document
        await Tournament.findByIdAndDelete(tournamentId);

        // 2. Delete associated user assignments (Cascade)
        await TournamentUser.deleteMany({ tournament: tournamentId });

        // 3. HARD RESET: INIT DATABASE AGAIN
        // Reset Players
        await Player.updateMany({}, {
            $set: {
                status: 'AVAILABLE',
                soldPrice: null,
                soldToTeam: null,
                points: 0,
                isInPlaying11: false,
                isCaptain: false,
                isViceCaptain: false
            }
        });

        // Reset Teams
        await Team.updateMany({}, {
            $set: {
                remainingPurse: 120, // Default 120 Cr
                totalSpent: 0,
                squadSize: 0,
                overseasCount: 0,
                playersBought: [],
                playing11: [],
                isActive: false, // Reset active status
                isLoggedIn: false,
                activeSessionId: null
            }
        });

        // Reset Global Auction State
        await AuctionState.deleteMany({}); // Clear active auction state

        console.log(`[System] Tournament ${tournamentId} deleted. GLOBAL RESET performed.`);

        res.json({ success: true, message: 'Tournament deleted and System Reset successfully' });
    } catch (err) {
        console.error('Delete Tournament Error:', err);
        res.status(500).json({ message: 'Failed to delete tournament' });
    }
});

// 2.5 Create Tournament
router.post('/create-tournament', protect, async (req, res) => {
    const { name, accessCode, selectionMode } = req.body;

    if (!name || !accessCode) {
        return res.status(400).json({ message: 'Name and Access Code are required' });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access Denied: Only admins can create tournaments.' });
    }

    try {
        const tournament = await Tournament.create({
            name,
            accessCode,
            selectionMode: selectionMode || 'USER_CHOICE',
            createdBy: req.user.userId
        });
        res.json({ success: true, tournament });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to create tournament' });
    }
});

// 3. Join Tournament (Check Code)
router.post('/tournaments/:id/join', protect, async (req, res) => {
    const { accessCode } = req.body;
    try {
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        const userId = req.user.userId;

        // Check if user is ALREADY assigned to this tournament/team
        const existingAssignment = await TournamentUser.findOne({
            tournament: req.params.id,
            user: userId
        });

        // Only enforce access code if the user hasn't joined before
        if (!existingAssignment) {
            if (tournament.accessCode !== accessCode) {
                return res.status(403).json({ message: 'Invalid Access Code' });
            }

            // Register user in tournament lobby
            await TournamentUser.create({
                tournament: req.params.id,
                user: userId,
                teamCode: null // Lobby
            });
        }

        if (existingAssignment && existingAssignment.teamCode) {
            // GENERATE TOKEN (Same as select-team logic)
            const teamCode = existingAssignment.teamCode;
            const dbTeam = await Team.findOne({ code: teamCode.toUpperCase() });

            if (dbTeam) {
                // Check if they already have an active session, otherwise we should create one.
                // However, since they are routing to dashboard, we must provide a matching sessionId.
                let sessionId = dbTeam.activeSessionId;
                if (!sessionId) {
                    sessionId = crypto.randomUUID();
                    dbTeam.activeSessionId = sessionId;
                    dbTeam.isLoggedIn = true;
                    dbTeam.lastLoginAt = new Date();
                    await dbTeam.save();
                }

                const userRole = req.user.role === 'admin' ? 'admin' : 'team';
                const token = jwt.sign({
                    teamCode: dbTeam.code,
                    role: userRole,
                    tournamentId: tournament._id,
                    userId: userId,
                    sessionId: sessionId
                }, process.env.JWT_SECRET, { expiresIn: '24h' });

                const teamConfig = TEAMS.find(t => t.id === dbTeam.code.toLowerCase()) || {};

                // Fetch username since it's not in the token payload anymore
                const userDoc = await User.findById(userId);

                return res.json({
                    success: true,
                    message: 'Access Granted (Auto-Login)',
                    autoLogin: true,
                    token,
                    team: {
                        ...teamConfig,
                        remainingPurse: dbTeam.remainingPurse,
                        squadSize: dbTeam.squadSize,
                        overseasCount: dbTeam.overseasCount,
                        role: userRole,
                        code: dbTeam.code,
                        logo: dbTeam.logo,
                        username: userDoc ? userDoc.username : null
                    }
                });
            }
        }

        res.json({ success: true, message: 'Access Granted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error joining tournament' });
    }
});

// 3.5 Admin Assign Team
router.post('/tournaments/:id/assign-team', protect, async (req, res) => {
    const { userId, teamCode } = req.body;
    const tournamentId = req.params.id;

    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can assign teams' });
    }

    try {
        const tournament = await Tournament.findById(tournamentId);
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        // Update or Create assignment with specific team
        // We use findOneAndUpdate with upsert to handle both "lobby -> team" and "new -> team"
        await TournamentUser.findOneAndUpdate(
            { tournament: tournamentId, user: userId },
            { teamCode: teamCode.toUpperCase() },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({ success: true, message: 'Team Assigned Successfully' });
    } catch (err) {
        console.error(err);
        if (err.code === 11000) {
            return res.status(409).json({ message: 'Team is already taken' });
        }
        res.status(500).json({ message: 'Failed to assign team' });
    }
});

// 3.8 Admin Create Tournament
router.post('/tournaments/create', protect, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can create tournaments' });
    }

    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Tournament name is required' });

    try {
        const generatedAccessCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newTournament = new Tournament({
            name,
            accessCode: generatedAccessCode,
            createdBy: req.user.userId,
            status: 'OPEN'
        });
        await newTournament.save();
        res.status(201).json({ success: true, message: 'Tournament created successfully', tournament: newTournament });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to create tournament' });
    }
});

// 3.9 Admin Toggle Playing XI Lock
router.put('/tournaments/:id/lock-playing-xi', protect, async (req, res) => {
    const tournamentId = req.params.id;
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can toggle the Playing XI lock' });
    }

    const { isPlayingXILocked } = req.body;

    try {
        const tournament = await Tournament.findByIdAndUpdate(
            tournamentId,
            { isPlayingXILocked },
            { new: true }
        );
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        res.json({ success: true, message: `Playing XI is now ${isPlayingXILocked ? 'Locked' : 'Unlocked'}`, isPlayingXILocked: tournament.isPlayingXILocked });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to toggle lock status' });
    }
});

// 3.10 Admin Toggle Captaincy Lock
router.put('/tournaments/:id/lock-captaincy', protect, async (req, res) => {
    const tournamentId = req.params.id;
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can toggle the Captaincy lock' });
    }

    const { isCaptaincyLocked } = req.body;

    try {
        const tournament = await Tournament.findByIdAndUpdate(
            tournamentId,
            { isCaptaincyLocked },
            { new: true }
        );
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        res.json({ success: true, message: `Captaincy Selection is now ${isCaptaincyLocked ? 'Locked' : 'Unlocked'}`, isCaptaincyLocked: tournament.isCaptaincyLocked });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to toggle captaincy lock status' });
    }
});

// 3.11 Admin Clear All Playing 11
router.post('/tournaments/:id/clear-all-playing11', protect, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can clear all playing 11' });
    }

    try {
        // Clear Playing 11 for all teams
        await Team.updateMany({}, { $set: { playing11: [], captain: null, viceCaptain: null } });

        // Update all players
        await Player.updateMany(
            {},
            { $set: { isInPlaying11: false, isCaptain: false, isViceCaptain: false } }
        );

        res.json({ success: true, message: 'Cleared Playing XI for all teams successfully' });
    } catch (err) {
        console.error("Clear All Playing XI Error:", err);
        res.status(500).json({ message: 'Failed to clear playing XI for all teams' });
    }
});

// 4. Get Teams Availability for a Tournament
router.get('/tournaments/:id/teams', protect, async (req, res) => {
    console.log(`[API] Fetching teams for tournament: ${req.params.id}`);
    try {
        const tournamentId = req.params.id;

        // PARALLELIZE 4 Queries to eliminate sequential blocking delay and remove massive population overhead
        const [tournament, takenAssignments, dbTeams, userAssignment] = await Promise.all([
            Tournament.findById(tournamentId).lean(),
            TournamentUser.find({
                tournament: tournamentId,
                teamCode: { $ne: null }
            }).populate('user', 'username').lean(),
            Team.find({}).lean(), // Optimized: Removed heavy .populate('playersBought') as it delays initial page load 
            TournamentUser.findOne({
                tournament: tournamentId,
                user: req.user.userId
            }).lean()
        ]);

        const takenTeamMap = new Map(takenAssignments.map(a => [a.teamCode, a.user?.username]));
        const takenTeamCodes = new Set(takenAssignments.map(a => a.teamCode));
        const dbTeamsMap = new Map(dbTeams.map(t => [t.code, t]));

        const teamsWithStatus = TEAMS.map(team => {
            const dbTeam = dbTeamsMap.get(team.id.toUpperCase());
            return {
                ...team,
                isTaken: takenTeamCodes.has(team.id.toUpperCase()),
                ownerUsername: takenTeamMap.get(team.id.toUpperCase()) || null,
                isMyTeam: userAssignment?.teamCode === team.id.toUpperCase(),
                logo: dbTeam?.logo || null,
                // Live DB values — override static config defaults
                budget: dbTeam?.remainingPurse ?? team.budget,
                remainingPurse: dbTeam?.remainingPurse ?? null,
                squadSize: dbTeam?.squadSize ?? 0,
                overseasCount: dbTeam?.overseasCount ?? 0,
                totalSpent: dbTeam?.totalSpent ?? 0
            };
        });

        // If Admin, also return list of all joined users (for management)
        let joinedUsers = [];
        if (req.user.role === 'admin') {
            const allParticipants = await TournamentUser.find({ tournament: tournamentId }).populate('user', 'username');
            joinedUsers = allParticipants
                .filter(p => p.user) // Prevent 500 crash if user was deleted
                .map(p => ({
                    assignmentId: p._id,
                    userId: p.user._id,
                    username: p.user.username,
                    teamCode: p.teamCode
                }));
        }

        res.json({
            teams: teamsWithStatus,
            selectionMode: tournament?.selectionMode || 'USER_CHOICE',
            joinedUsers,
            startDashboard: !!(userAssignment && userAssignment.teamCode), // Only auto-start if team is selected
            myTeamCode: userAssignment?.teamCode,
            isAdmin: req.user.role === 'admin'
        });
    } catch (err) {
        console.error("[API] Error fetching tournament teams:", err);
        res.status(500).json({ message: 'Error fetching tournament teams' });
    }
});

// 5. Select Team (The Core Logic)
router.post('/tournaments/:id/select-team', protect, async (req, res) => {
    const { teamCode } = req.body;
    const tournamentId = req.params.id;
    const userId = req.user.userId;

    if (!teamCode) return res.status(400).json({ message: 'Team Code Required' });

    try {
        const tournament = await Tournament.findById(tournamentId);
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        // Check Selection Mode
        if (tournament.selectionMode === 'ADMIN_ASSIGN' && req.user.role !== 'admin') {
            // If User Choice is disabled, user can only "login" if already assigned
            const myAssignment = await TournamentUser.findOne({ tournament: tournamentId, user: userId });
            if (!myAssignment || !myAssignment.teamCode) {
                return res.status(403).json({ message: 'Team selection is locked. Please wait for Admin assignment.' });
            }
            if (myAssignment.teamCode !== teamCode.toUpperCase()) {
                return res.status(403).json({ message: 'You are assigned to a different team.' });
            }
            // If matches, allow flow to proceed (it will fall through to logic below which handles re-login)
        }

        // A. Check if Team is Taken in this Tournament
        const existingAssignment = await TournamentUser.findOne({
            tournament: tournamentId,
            teamCode: teamCode.toUpperCase()
        });

        if (existingAssignment) {
            // Check if it's the SAME user (Re-login)
            if (existingAssignment.user.toString() === userId.toString()) {
                // Same user returning to same team -> Allow login
            } else {
                return res.status(409).json({ message: `Team ${teamCode} is already taken by another user.` });
            }
        } else {
            // B. Check if User already has a team in this tournament
            const userAssignment = await TournamentUser.findOne({
                tournament: tournamentId,
                user: userId
            });

            if (userAssignment && userAssignment.teamCode !== null) {
                // If user tries to pick a differnt team
                return res.status(400).json({ message: 'You have already selected a team in this tournament.' });
            }

            // C. Create Assignment
            await TournamentUser.findOneAndUpdate(
                { tournament: tournamentId, user: userId },
                { teamCode: teamCode.toUpperCase() },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }

        // --- STATELESS LOGIN (Multi-Tournament) ---

        // 1. Fetch Singleton Team
        const dbTeam = await Team.findOne({ code: teamCode.toUpperCase() });
        if (!dbTeam) return res.status(500).json({ message: 'System Error: Team config missing.' });

        // --- NEW SESSION LOGIC ---
        const sessionId = crypto.randomUUID();
        dbTeam.activeSessionId = sessionId;
        dbTeam.isLoggedIn = true;
        dbTeam.lastLoginAt = new Date();
        await dbTeam.save();
        // -------------------------

        // 2. Issue Token with Tournament Scope
        // If the user has 'admin' role in DB, preserve it in the JWT
        const userRole = req.user.role === 'admin' ? 'admin' : 'team';

        // Fetch user for username + firebaseUid
        const userDoc = await User.findById(userId);

        const token = jwt.sign({
            teamCode: dbTeam.code,
            role: userRole,
            tournamentId: tournament._id, // Scope token to tournament
            userId: userId,
            sessionId: sessionId, // EMBED SESSION ID
            firebaseUid: userDoc?.firebaseUid || null // Include for downstream context
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        // 4. Return Data expected by Frontend
        // We find static config for colors etc.
        const teamConfig = TEAMS.find(t => t.id === dbTeam.code.toLowerCase()) || {};

        // userDoc already fetched above

        // 5. Emit Real-time Event
        if (req.io) {
            req.io.emit('tournament:team_taken', {
                tournamentId,
                teamCode: dbTeam.code,
                ownerUsername: userDoc ? userDoc.username : null,
                userId: userId
            });
        }

        res.json({
            success: true,
            token, // The Critical Piece
            team: {
                ...teamConfig,
                remainingPurse: dbTeam.remainingPurse,
                squadSize: dbTeam.squadSize,
                overseasCount: dbTeam.overseasCount,
                role: userRole,
                code: dbTeam.code,
                logo: dbTeam.logo,
                username: userDoc ? userDoc.username : null
            }
        });

    } catch (err) {
        console.error("Select Team Error:", err);
        res.status(500).json({
            message: 'Failed to select team',
            error: err.message, // expose msg
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// 5.5 Unassign Team (Admin Only)
router.post('/tournaments/:id/unassign-team', firebaseAuth, adminOnly, async (req, res) => {
    const tournamentId = req.params.id;
    const { assignmentId, userId } = req.body;

    if (!userId && !assignmentId) return res.status(400).json({ message: 'User ID or Assignment ID is required' });

    try {
        console.log(`[API] Unassigning team. Tournament: ${tournamentId}, AssignmentId: ${assignmentId}, UserId: ${userId}`);

        const query = assignmentId
            ? { _id: assignmentId }
            : { tournament: tournamentId, user: userId };

        const assignment = await TournamentUser.findOneAndUpdate(
            query,
            { $set: { teamCode: null } },
            { new: true }
        );

        if (!assignment) {
            console.error(`[API] Unassign Failed: Document not found for query`, query);
            return res.status(404).json({ message: 'User assignment not found in this tournament.' });
        }

        // Emit Socket event so active clients drop the user from the team slot
        if (req.io) {
            req.io.emit('tournament:team_freed', {
                tournamentId,
                userId: userId
            });
        }

        res.json({ success: true, message: 'User unassigned successfully' });
    } catch (err) {
        console.error("[API] Error unassigning team:", err);
        res.status(500).json({ message: 'Failed to unassign team' });
    }
});

// 5.5 Watch Auction (Spectator Mode)
router.post('/tournaments/:id/watch', protect, async (req, res) => {
    const tournamentId = req.params.id;
    const userId = req.user.userId;

    try {
        const tournament = await Tournament.findById(tournamentId);
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        // Issue Spectator Token
        const sessionId = crypto.randomUUID();
        const token = jwt.sign({
            teamCode: 'spectator',
            role: 'spectator',
            tournamentId: tournament._id,
            userId: userId,
            sessionId: sessionId
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        const spectatorUserDoc = await User.findById(userId);

        res.json({
            success: true,
            token,
            team: {
                name: 'Spectator',
                role: 'spectator',
                code: 'spectator',
                remainingPurse: 0,
                squadSize: 0,
                overseasCount: 0,
                username: spectatorUserDoc ? spectatorUserDoc.username : null
            }
        });

    } catch (err) {
        console.error("Watch Auction Error:", err);
        res.status(500).json({ message: 'Failed to enter spectator mode' });
    }
});

// 6. Admin Login (Exchange Token for Admin Scope JWT)
router.post('/admin/login', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access Denied: Admin role required.' });
        }

        const sessionId = crypto.randomUUID();
        const token = jwt.sign({
            teamCode: 'admin',
            role: 'admin',
            tournamentId: null,
            sessionId,
            userId: req.user.userId,
            firebaseUid: req.user.firebaseUid || null
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        const dbUser = await User.findById(req.user.userId);
        
        res.json({
            success: true,
            token,
            user: { ...(dbUser ? dbUser.toObject() : req.user), role: 'admin' }
        });
    } catch (err) {
        console.error("Admin Login Error:", err);
        res.status(500).json({ message: 'Admin login failed' });
    }
});

// 7. Save Playing XI
// Helper: Validate Batting Position
const validateBattingPositionRules = (player, position) => {
    // If group is null, allow (per requirements)
    if (!player.battingPositionGroup) return { valid: true };

    const group = player.battingPositionGroup;
    let validGroups = [];
    let reqName = "";

    if (position >= 1 && position <= 2) {
        validGroups = [1];
        reqName = "Opener";
    } else if (position >= 3 && position <= 8) {
        validGroups = [2, 3, 4];
        reqName = "Middle Order, Lower Middle, or Tail";
    } else if (position >= 9 && position <= 11) {
        validGroups = [4];
        reqName = "Tail";
    }

    if (validGroups.length > 0 && !validGroups.includes(group)) {
        const groupName = group === 1 ? "Opener" : group === 2 ? "Middle Order" : group === 3 ? "Lower Middle" : "Tail";
        return {
            valid: false,
            message: `Player ${player.name} (${groupName}) cannot bat at position ${position} (${reqName} required)`
        };
    }
    return { valid: true };
};

// 7. Save Playing XI
router.post('/tournaments/:id/playing11', protect, async (req, res) => {
    const { playerIds, captainId, viceCaptainId } = req.body; // updated payload structure: either Array from legacy or Object { players, captainId, viceCaptainId }
    let itemsToProcess = [];
    let selectedCaptain = null;
    let selectedViceCaptain = null;

    const tournamentId = req.params.id;
    const userId = req.user.userId;

    try {
        const tournament = await Tournament.findById(tournamentId);
        if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });
        if (tournament.isPlayingXILocked) {
            return res.status(403).json({ message: 'Playing XI submissions are locked by the Admin.' });
        }

        // 1. Get User's Team in this Tournament
        const userAssignment = await TournamentUser.findOne({ tournament: tournamentId, user: userId });
        if (!userAssignment || !userAssignment.teamCode) {
            return res.status(403).json({ message: 'You do not have a team in this tournament.' });
        }

        // 2. Fetch Team PRIOR to validation (Needed for Ownership Check)
        const team = await Team.findOne({ code: userAssignment.teamCode });
        if (!team) return res.status(404).json({ message: 'Team not found.' });

        // 3. Normalize Input
        if (req.body.players && Array.isArray(req.body.players)) {
            // V2 Payload: { players: [ { playerId, battingPosition } ], captainId, viceCaptainId }
            itemsToProcess = req.body.players;
            selectedCaptain = req.body.captainId;
            selectedViceCaptain = req.body.viceCaptainId;
        } else if (Array.isArray(req.body)) {
            // V1 Payload: [ { playerId, battingPosition } ]
            itemsToProcess = req.body;
        } else if (Array.isArray(playerIds)) {
            // LEGACY Payload: [ id1, id2... ] - Infer Position from Index (1-based)
            itemsToProcess = playerIds.map((pid, index) => ({
                playerId: pid,
                battingPosition: index + 1
            }));
        } else {
            return res.status(400).json({ message: 'Invalid payload format.' });
        }

        if (itemsToProcess.length !== 11) {
            return res.status(400).json({ message: 'You must select exactly 11 players.' });
        }

        // 4. Resolve Players and Validate
        const inputIds = itemsToProcess.map(p => p.playerId);

        // Strict Integrity Check: All players must be UNIQUE in the request
        const uniqueParams = new Set(inputIds);
        if (uniqueParams.size !== 11) {
            return res.status(400).json({ message: 'Duplicate players in selection.' });
        }

        const players = await Player.find({ _id: { $in: inputIds } });
        if (players.length !== 11) {
            return res.status(400).json({ message: 'One or more invalid player IDs.' });
        }

        let overseasCount = 0;
        let wkCount = 0;
        let bowlerCount = 0;

        for (const player of players) {
            if (player.country !== 'India' && player.country !== 'IND') overseasCount++;
            if (player.role === 'Wicket Keeper') wkCount++;
            if (player.role === 'Bowler' || player.role === 'All-Rounder') bowlerCount++;
        }

        if (overseasCount > 4 || wkCount < 1 || bowlerCount < 5) {
            return res.status(400).json({ message: 'Playing XI does not meet squad formation rules' });
        }

        const playerMap = new Map(players.map(p => [p._id.toString(), p]));
        const ownedPlayerIds = new Set(team.playersBought.map(id => id.toString()));

        for (const item of itemsToProcess) {
            const player = playerMap.get(item.playerId);

            // A. OWNERSHIP CHECK (CRITICAL FIX)
            if (!ownedPlayerIds.has(item.playerId)) {
                return res.status(403).json({ message: `Security violation: You do not own player ${player.name}` });
            }

            // B. Batting Position Rule Validation
            const result = validateBattingPositionRules(player, item.battingPosition);
            if (!result.valid) {
                return res.status(400).json({ message: result.message });
            }
        }
        // 5. Check Captain and Vice-Captain if provided

        // Captaincy Lock Logic: If Captaincy is locked, Force Overwrite payload values with Team DB values
        if (tournament.isCaptaincyLocked) {
            selectedCaptain = team.captain;
            selectedViceCaptain = team.viceCaptain;
        }

        if (selectedCaptain && !uniqueParams.has(selectedCaptain.toString())) {
            return res.status(400).json({ message: 'Captain must be part of the Playing XI.' });
        }
        if (selectedViceCaptain && !uniqueParams.has(selectedViceCaptain.toString())) {
            return res.status(400).json({ message: 'Vice-Captain must be part of the Playing XI.' });
        }
        if (selectedCaptain && selectedViceCaptain && selectedCaptain.toString() === selectedViceCaptain.toString()) {
            return res.status(400).json({ message: 'Captain and Vice-Captain cannot be the same player.' });
        }

        // 6. Save if all valid
        team.playing11 = inputIds;
        team.captain = selectedCaptain || null;
        team.viceCaptain = selectedViceCaptain || null;
        await team.save();

        // ── Sync Player fields automatically ──────────────────────────────────
        // Step A: Clear flags for all players in this team's squad first
        await Player.updateMany(
            { _id: { $in: team.playersBought } },
            { $set: { isInPlaying11: false, isCaptain: false, isViceCaptain: false } }
        );

        // Step B: Mark Playing XI players
        if (inputIds.length > 0) {
            await Player.updateMany(
                { _id: { $in: inputIds } },
                { $set: { isInPlaying11: true } }
            );
        }

        // Step C: Mark Captain
        if (team.captain) {
            await Player.findByIdAndUpdate(team.captain, { $set: { isCaptain: true } });
        }

        // Step D: Mark Vice-Captain
        if (team.viceCaptain) {
            await Player.findByIdAndUpdate(team.viceCaptain, { $set: { isViceCaptain: true } });
        }
        // ─────────────────────────────────────────────────────────────────────

        res.json({ success: true, message: 'Playing XI saved successfully', playing11: team.playing11, captain: team.captain, viceCaptain: team.viceCaptain });


    } catch (err) {
        console.error("Save Playing XI Error:", err);
        res.status(500).json({ message: 'Failed to save Playing XI' });
    }
});

// 8. Get Playing XI (or Squad with status)
router.get('/tournaments/:id/my-squad', protect, async (req, res) => {
    const tournamentId = req.params.id;
    const userId = req.user.userId;

    try {
        const userAssignment = await TournamentUser.findOne({ tournament: tournamentId, user: userId });
        if (!userAssignment || !userAssignment.teamCode) {
            return res.status(403).json({ message: 'No team assigned.' });
        }

        const team = await Team.findOne({ code: userAssignment.teamCode }).populate('playersBought').populate('playing11');
        if (!team) return res.status(404).json({ message: 'Team not found.' });

        // NEW: Get Official Scoring Summary
        const tournament = await Tournament.findById(tournamentId).lean();
        const scoringSummary = await getTeamScoringSummary(team, tournament);

        res.json({
            success: true,
            players: team.playersBought,
            playing11: team.playing11, // Array of objects
            captain: team.captain,
            viceCaptain: team.viceCaptain,
            teamCode: team.code,
            scoring: scoringSummary // Pass the full summary
        });

    } catch (err) {
        console.error("Get My Squad Error:", err);
        res.status(500).json({ message: 'Failed to fetch squad' });
    }
});

// 9. Public Squad View (For "View Other Team")
router.get('/tournaments/:id/teams/:teamCode/squad', protect, async (req, res) => {
    const { teamCode, id: tournamentId } = req.params;

    try {
        const team = await Team.findOne({ code: teamCode.toUpperCase() })
            .populate('playersBought')
            .populate('playing11');

        if (!team) return res.status(404).json({ message: 'Team not found.' });

        const tournament = await Tournament.findById(tournamentId).select('currentWeek weekStartTime weekData isPlayingXILocked isCaptaincyLocked').lean();

        // NEW: Get Official Scoring Summary
        const scoringSummary = await getTeamScoringSummary(team, tournament);

        res.json({
            success: true,
            players: team.playersBought,
            playing11: team.playing11,
            captain: team.captain,
            viceCaptain: team.viceCaptain,
            teamCode: team.code,
            isPlayingXILocked: tournament?.isPlayingXILocked || false,
            isCaptaincyLocked: tournament?.isCaptaincyLocked || false,
            scoring: scoringSummary // Pass the full summary
        });
    } catch (err) {
        console.error("Get Team Squad Error:", err);
        res.status(500).json({ message: 'Failed to fetch team squad' });
    }
});

// 10. Points Table
router.get('/tournaments/:id/points-table', protect, teamController.getPointsTable);

export default router;
