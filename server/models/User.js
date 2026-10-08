import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    firebaseUid: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        default: 'User'
    },
    username: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        select: false // Exclude from normal queries for security
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    }
}, {
    timestamps: true
});

const User = mongoose.model('User', userSchema);
export default User;
