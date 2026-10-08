import mongoose from 'mongoose';
import { getDream11Connection } from '../config/dream11Db.js';

const fantasyUserSchema = new mongoose.Schema({
    authUserId: {
        type: String,
        default: null,
        unique: true,
        sparse: true,
        index: true
    },
    firebaseUid: {
        type: String,
        default: null,
        index: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        default: 'User'
    },
    username: {
        type: String,
        default: null,
        trim: true,
        lowercase: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    }
}, {
    collection: 'users',
    timestamps: true
});

export const getFantasyUserModel = async () => {
    const connection = await getDream11Connection();
    return connection.models.FantasyUser || connection.model('FantasyUser', fantasyUserSchema);
};

export default getFantasyUserModel;
