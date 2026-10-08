import mongoose from 'mongoose';
import { getDream11Connection } from '../config/dream11Db.js';

const fantasyTeamSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FantasyUser',
        required: true,
        index: true
    },
    matchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FantasyMatch',
        required: true,
        index: true
    },
    players: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FantasyPlayer',
        required: true
    }],
    captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FantasyPlayer',
        required: true
    },
    viceCaptain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FantasyPlayer',
        required: true
    },
    totalPoints: {
        type: Number,
        default: 0
    }
}, {
    collection: 'fantasyteams',
    timestamps: true
});

fantasyTeamSchema.index({ userId: 1, matchId: 1 }, { unique: true });

export const getFantasyTeamModel = async () => {
    const connection = await getDream11Connection();
    return connection.models.FantasyTeam || connection.model('FantasyTeam', fantasyTeamSchema);
};

export default getFantasyTeamModel;
