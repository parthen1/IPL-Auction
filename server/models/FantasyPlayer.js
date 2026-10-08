import mongoose from 'mongoose';
import { getDream11Connection } from '../config/dream11Db.js';

const fantasyPlayerSchema = new mongoose.Schema({
    sourcePlayerId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        required: true,
        enum: ['Batsman', 'Bowler', 'All-Rounder', 'Wicket Keeper']
    },
    orgIPLTeam26: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    basePrice: {
        type: Number,
        required: true,
        default: 0
    },
    value: {
        type: Number,
        default: 7.5
    },
    points: {
        type: Number,
        default: 0
    },
    image: {
        type: String,
        default: null
    }
}, {
    collection: 'players',
    timestamps: true
});

fantasyPlayerSchema.index({ name: 1, orgIPLTeam26: 1 });

export const getFantasyPlayerModel = async () => {
    const connection = await getDream11Connection();
    return connection.models.FantasyPlayer || connection.model('FantasyPlayer', fantasyPlayerSchema);
};

export default getFantasyPlayerModel;
