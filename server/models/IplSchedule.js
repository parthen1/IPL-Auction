import mongoose from 'mongoose';

const iplScheduleSchema = new mongoose.Schema({
    MatchID: Number,
    MatchName: String,
    MatchStatus: String,
    MATCH_COMMENCE_START_DATE: String,
    MatchDate: String,
    MatchTime: String,
    GroundName: String,
    city: String,
    HomeTeamID: String,
    HomeTeamName: String,
    HomeTeamLogo: String,
    AwayTeamID: String,
    AwayTeamName: String,
    AwayTeamLogo: String
}, { collection: 'iplschedule', timestamps: false });

const IplSchedule = mongoose.model('IplSchedule', iplScheduleSchema);

export default IplSchedule;
