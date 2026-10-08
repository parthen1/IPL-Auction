import mongoose from 'mongoose';

const tournamentUserSchema = new mongoose.Schema({
    tournament: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tournament',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    teamCode: {
        type: String,
        required: false,
        uppercase: true,
        default: null
    }
}, {
    timestamps: true
});

// Prevent user from joining multiple teams in same tournament (Optional, but good requirement)
// The user request said "Prevent multiple users selecting same team".
// So (tournament, teamCode) must be unique ONLY if teamCode is set.
tournamentUserSchema.index({ tournament: 1, teamCode: 1 }, {
    unique: true,
    partialFilterExpression: { teamCode: { $type: "string" } }
});

// Prevent user from joining multiple teams? Usually yes.
tournamentUserSchema.index({ tournament: 1, user: 1 }, { unique: true });

const TournamentUser = mongoose.model('TournamentUser', tournamentUserSchema);
export default TournamentUser;
