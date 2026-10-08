import mongoose from 'mongoose';
import { getDream11Connection } from '../config/dream11Db.js';

const fantasyMatchSchema = new mongoose.Schema({
    sourceMatchId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        index: true
    },
    legacyMatchId: {
        type: String,
        default: null
    },
    matchName: {
        type: String,
        required: true,
        trim: true
    },
    team1: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    team2: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    date: {
        type: String,
        required: true
    },
    time: {
        type: String,
        default: null
    },
    ground: {
        type: String,
        default: null
    },
    city: {
        type: String,
        default: null
    },
    status: {
        type: String,
        default: 'Upcoming'
    }
}, {
    collection: 'matches',
    timestamps: true
});

fantasyMatchSchema.index({ legacyMatchId: 1 }, { unique: true, sparse: true });

export const getFantasyMatchModel = async () => {
    const connection = await getDream11Connection();
    return connection.models.FantasyMatch || connection.model('FantasyMatch', fantasyMatchSchema);
};

export default getFantasyMatchModel;
