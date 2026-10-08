import mongoose from 'mongoose';

const auctionStateSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['WAITING', 'ACTIVE', 'SOLD', 'UNSOLD', 'PAUSED'],
        default: 'WAITING'
    },
    currentPlayer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
        default: null
    },
    currentBid: {
        type: Number,
        default: 0
    },
    highestBidder: {
        type: String, // Team Code
        default: null
    },
    bidHistory: [{
        team: String, // Team Code
        amount: Number,
        timestamp: { type: Date, default: Date.now }
    }],
    timerEndsAt: {
        type: Date,
        default: null
    },
    bidDuration: {
        type: Number,
        default: 30 // seconds
    },
    remainingTime: {
        type: Number,
        default: null // Store milliseconds remaining when paused
    },
    isTradingOpen: {
        type: Boolean,
        default: false // Admin must explicitly turn this on
    },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Check if model exists before compiling to avoid OverwriteModelError in hot reload
const AuctionState = mongoose.models.AuctionState || mongoose.model('AuctionState', auctionStateSchema);

export default AuctionState;
