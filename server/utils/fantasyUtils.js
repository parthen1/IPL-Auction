import mongoose from 'mongoose';
import getFantasyMatchModel from '../models/FantasyMatch.js';

const TEAM_NAME_TO_CODE = {
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

export const FANTASY_ROLE_ORDER = ['Wicket Keeper', 'Batsman', 'All-Rounder', 'Bowler'];

export const normalizeTeamCode = (team) => {
    if (!team) return '';

    const trimmed = String(team).trim();
    return TEAM_NAME_TO_CODE[trimmed] || trimmed.toUpperCase();
};

export const normalizeFantasyRole = (role) => {
    const normalized = String(role || '').trim().toLowerCase();

    switch (normalized) {
        case 'batter':
        case 'batsman':
            return 'Batsman';
        case 'wicket-keeper':
        case 'wicket keeper':
        case 'wicketkeeper':
            return 'Wicket Keeper';
        case 'all-rounder':
        case 'all rounder':
            return 'All-Rounder';
        case 'bowler':
            return 'Bowler';
        default:
            return String(role || '').trim() || 'Unknown';
    }
};

export const normalizeMatchDateTime = (match) => {
    if (match?.MATCH_COMMENCE_START_DATE) {
        return match.MATCH_COMMENCE_START_DATE;
    }

    if (match?.MatchDate && match?.MatchTime) {
        return `${match.MatchDate}T${match.MatchTime}`;
    }

    return match?.MatchDate || null;
};

/**
 * Dynamically computes match status from match date+time vs current time.
 * - Upcoming : before match start
 * - Live     : match start → match start + 4h 30min
 * - Completed: after match start + 4h 30min
 */
export const computeMatchStatus = (dateStr, timeStr) => {
    if (!dateStr) return 'Upcoming';

    try {
        // Parse date. If the string already has a time component (ISO), use it directly.
        // Otherwise combine dateStr + timeStr.
        let matchStart;
        if (timeStr) {
            // dateStr may be 'YYYY-MM-DD' or a full ISO; normalise to date-only part.
            const datePart = dateStr.split('T')[0].split(' ')[0];
            matchStart = new Date(`${datePart}T${timeStr}`);
        } else {
            matchStart = new Date(dateStr);
        }

        if (isNaN(matchStart.getTime())) return 'Upcoming';

        const now = new Date();
        const LIVE_DURATION_MS = (4 * 60 + 30) * 60 * 1000; // 4h 30min
        const matchEnd = new Date(matchStart.getTime() + LIVE_DURATION_MS);

        if (now < matchStart) return 'Upcoming';
        if (now <= matchEnd) return 'Live';
        return 'Completed';
    } catch {
        return 'Upcoming';
    }
};

export const normalizeFantasyMatch = (match) => {
    const dateStr = match.date || normalizeMatchDateTime(match);
    const timeStr = match.time || match.MatchTime || null;
    
    // Prefer the database status if it exists and is populated, otherwise fallback to local calculation
    const status = match.status || match.MatchStatus || computeMatchStatus(dateStr, timeStr);

    return {
        _id: match._id.toString(),
        matchId: match.legacyMatchId || match.MatchID || match._id.toString(),
        matchName: match.matchName || match.MatchName || `${normalizeTeamCode(match.HomeTeamName || match.team1)} vs ${normalizeTeamCode(match.AwayTeamName || match.team2)}`,
        team1: normalizeTeamCode(match.HomeTeamName || match.team1),
        team2: normalizeTeamCode(match.AwayTeamName || match.team2),
        date: dateStr,
        time: timeStr,
        ground: match.ground || match.GroundName || null,
        city: match.city || match.City || null,
        status
    };
};

export const findFantasyMatchByIdentifier = async (matchIdentifier) => {
    const FantasyMatch = await getFantasyMatchModel();

    if (!matchIdentifier) return null;

    if (mongoose.Types.ObjectId.isValid(matchIdentifier)) {
        const byId = await FantasyMatch.findById(matchIdentifier);
        if (byId) return byId;
    }

    const byLegacyMatchId = await FantasyMatch.findOne({ legacyMatchId: String(matchIdentifier) });
    if (byLegacyMatchId) {
        return byLegacyMatchId;
    }

    return null;
};

export const getFantasyPlayerValue = (player) => {
    const numericValue = Number(player?.value ?? player?.Value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
        return Number(numericValue.toFixed(1));
    }

    return 7.5;
};

export const serializeFantasyPlayer = (player) => ({
    _id: player._id.toString(),
    name: player.name,
    role: normalizeFantasyRole(player.role),
    orgIPLTeam26: normalizeTeamCode(player.orgIPLTeam26),
    basePrice: Number(player.basePrice || 0),
    value: getFantasyPlayerValue(player),
    credits: getFantasyPlayerValue(player),
    points: Number(player.points || 0),
    image: player.image || null
});

export const groupFantasyPlayers = (players) => {
    const groupedPlayers = {
        'Wicket Keeper': [],
        Batsman: [],
        'All-Rounder': [],
        Bowler: []
    };

    const allPlayers = players
        .map((player) => serializeFantasyPlayer(player))
        .sort((a, b) => {
            const roleDelta = FANTASY_ROLE_ORDER.indexOf(a.role) - FANTASY_ROLE_ORDER.indexOf(b.role);
            if (roleDelta !== 0) return roleDelta;

            if (b.value !== a.value) return b.value - a.value;
            return a.name.localeCompare(b.name);
        });

    allPlayers.forEach((player) => {
        if (!groupedPlayers[player.role]) {
            groupedPlayers[player.role] = [];
        }
        groupedPlayers[player.role].push(player);
    });

    return { groupedPlayers, allPlayers };
};

export const validateFantasyTeamSelection = ({ players, captain, viceCaptain, team1, team2 }) => {
    const errors = [];
    const playerIds = players.map((player) => player._id.toString());
    const uniquePlayerIds = new Set(playerIds);

    if (players.length !== 11) {
        errors.push('You must select exactly 11 players.');
    }

    if (uniquePlayerIds.size !== players.length) {
        errors.push('Duplicate players are not allowed.');
    }

    const validTeams = new Set([normalizeTeamCode(team1), normalizeTeamCode(team2)]);
    const teamCounts = {};
    const roleCounts = {
        'Wicket Keeper': 0,
        Batsman: 0,
        'All-Rounder': 0,
        Bowler: 0
    };

    let valueUsed = 0;

    for (const player of players) {
        const normalizedRole = normalizeFantasyRole(player.role);
        const normalizedTeam = normalizeTeamCode(player.orgIPLTeam26);

        if (!validTeams.has(normalizedTeam)) {
            errors.push(`${player.name} does not belong to the selected match teams.`);
        }

        teamCounts[normalizedTeam] = (teamCounts[normalizedTeam] || 0) + 1;
        roleCounts[normalizedRole] = (roleCounts[normalizedRole] || 0) + 1;
        valueUsed += getFantasyPlayerValue(player);
    }

    if (valueUsed > 100) {
        errors.push('Selected team exceeds the 100 value limit.');
    }

    if (Object.values(teamCounts).some((count) => count > 7)) {
        errors.push('You can select a maximum of 7 players from one team.');
    }

    if ((roleCounts['Wicket Keeper'] || 0) < 1) {
        errors.push('At least 1 Wicket Keeper is required.');
    }

    if ((roleCounts.Batsman || 0) < 3) {
        errors.push('At least 3 Batsmen are required.');
    }

    if ((roleCounts['All-Rounder'] || 0) < 1) {
        errors.push('At least 1 All-Rounder is required.');
    }

    if ((roleCounts.Bowler || 0) < 3) {
        errors.push('At least 3 Bowlers are required.');
    }

    if (!captain || !uniquePlayerIds.has(captain.toString())) {
        errors.push('Captain must be one of the selected players.');
    }

    if (!viceCaptain || !uniquePlayerIds.has(viceCaptain.toString())) {
        errors.push('Vice-Captain must be one of the selected players.');
    }

    if (captain && viceCaptain && captain.toString() === viceCaptain.toString()) {
        errors.push('Captain and Vice-Captain must be different players.');
    }

    return {
        isValid: errors.length === 0,
        errors,
        summary: {
            creditsUsed: Number(valueUsed.toFixed(1)),
            valueUsed: Number(valueUsed.toFixed(1)),
            playersSelected: players.length,
            teamCounts,
            roleCounts
        }
    };
};

/**
 * Safely extracts the string ID from either a raw ObjectId or a populated
 * Mongoose document object { _id, name, ... }.
 */
const extractId = (ref) => {
    if (!ref) return null;
    // Populated object has _id property
    if (typeof ref === 'object' && ref._id) return ref._id.toString();
    return ref.toString();
};

export const calculateFantasyTeamPoints = (fantasyTeam, playerMap) => {
    let totalPoints = 0;
    const captainId = extractId(fantasyTeam.captain);
    const viceCaptainId = extractId(fantasyTeam.viceCaptain);

    fantasyTeam.players.forEach((playerId) => {
        // Each entry in team.players could also be a populated object after .populate()
        const key = extractId(playerId);
        const player = playerMap.get(key);
        const basePoints = Number(player?.points || 0);

        if (key === captainId) {
            totalPoints += basePoints * 2;      // 2x for captain
            return;
        }

        if (key === viceCaptainId) {
            totalPoints += basePoints * 1.5;   // 1.5x for vice-captain
            return;
        }

        totalPoints += basePoints;
    });

    return Number(totalPoints.toFixed(2));
};

export const isMatchLocked = (match) => {
    if (!match || !match.date || !match.time) {
        return match?.status !== 'Upcoming'; 
    }
    try {
        const matchDate = new Date(match.date);
        const [hours, minutes] = match.time.split(':').map(Number);
        
        if (isNaN(hours) || isNaN(minutes)) {
            return match?.status !== 'Upcoming';
        }
        
        matchDate.setHours(hours, minutes, 0, 0);
        return new Date() > matchDate;
    } catch (err) {
        return match?.status !== 'Upcoming';
    }
};
