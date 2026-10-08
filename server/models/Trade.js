import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema({
    senderTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        required: true
    },
    receiverTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        required: true
    },
    offerPlayers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
    }],
    requestPlayers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
    }],
    status: {
        type: String,
        enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
        default: 'PENDING'
    }
}, {
    timestamps: true
});

const Trade = mongoose.model('Trade', tradeSchema);

export default Trade;
