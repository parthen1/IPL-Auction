import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    name: {
        type: String,
        required: true
    },
    logo: {
        type: String, // Stores URL
        default: null
    },
    totalPurse: {
        type: Number,
        default: 120 // 120 Cr
    },
    remainingPurse: {
        type: Number,
        required: true
    },
    playersBought: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
    }],
    playing11: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
    }],
    captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
        default: null
    },
    viceCaptain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
        default: null
    },
    squadSize: {
        type: Number,
        default: 0
    },
    overseasCount: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: false
    },
    isLoggedIn: {
        type: Boolean,
        default: false
    },
    activeSessionId: {
        type: String,
        default: null
    },
    lastLoginAt: {
        type: Date,
        default: null
    },
    // --- WEEKLY SCORING SYSTEM ---
    totalPoints: {
        type: Number,
        default: 0 // Past weeks finalized total
    },
    weeklyPoints: [{
        week: Number,
        points: Number
    }],
    playing11History: [{
        week: Number,
        players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
        captain: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
        viceCaptain: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
        isLocked: { type: Boolean, default: true }
    }]
}, {
    timestamps: true
});

const Team = mongoose.model('Team', teamSchema);

export default Team;
