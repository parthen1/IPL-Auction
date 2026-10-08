import express from 'express';
import IplSchedule from '../models/IplSchedule.js';
import Player from '../models/Player.js';

const router = express.Router();

const getShortCode = (name) => {
    const map = {
        'Royal Challengers Bengaluru': 'RCB',
        'Chennai Super Kings': 'CSK',
        'Mumbai Indians': 'MI',
        'Kolkata Knight Riders': 'KKR',
        'Sunrisers Hyderabad': 'SRH',
        'Delhi Capitals': 'DC',
        'Rajasthan Royals': 'RR',
        'Punjab Kings': 'PBKS',
        'Lucknow Super Giants': 'LSG',
        'Gujarat Titans': 'GT'
    };
    return map[name] || name;
};

// GET /api/schedule
router.get('/', async (req, res) => {
    try {
        const schedules = await IplSchedule.find({}).sort({ MatchID: 1 });
        
        // Transform the data to match the frontend expectations
        const formatted = schedules.map(s => {
            const formattedDate = s.MATCH_COMMENCE_START_DATE 
                ? s.MATCH_COMMENCE_START_DATE.substring(0, 10) 
                : s.MatchDate;

            return {
                MatchID: s.MatchID,
                MatchDate: formattedDate,
                MatchTime: s.MatchTime,
                MatchName: s.MatchName,
                Team1Code: getShortCode(s.HomeTeamName),
                Team2Code: getShortCode(s.AwayTeamName),
                Team1Logo: s.HomeTeamLogo,
                Team2Logo: s.AwayTeamLogo,
                Ground: s.GroundName,
                City: s.city,
                MatchStatus: s.MatchStatus
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).json({ message: 'Failed to fetch schedule from DB' });
    }
});

// GET /api/schedule/squads
router.get('/squads', async (req, res) => {
    try {
        // Fetch players that have an orgIPLTeam26
        const players = await Player.find({ orgIPLTeam26: { $ne: null } }).sort({ basePrice: -1 });
        
        // Group players by orgIPLTeam26
        const grouped = players.reduce((acc, player) => {
            const team = player.orgIPLTeam26;
            if (!acc[team]) acc[team] = [];
            acc[team].push(player);
            return acc;
        }, {});

        res.json(grouped);
    } catch (error) {
        console.error('Error fetching real IPL squads:', error);
        res.status(500).json({ message: 'Failed to fetch squads from DB' });
    }
});

export default router;
