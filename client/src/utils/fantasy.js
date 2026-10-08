export const FANTASY_LIMITS = {
    maxPlayers: 11,
    maxCredits: 100,
    maxFromSingleTeam: 7,
    maxOverseas: 4
};

export const ROLE_TABS = [
    { key: 'Wicket Keeper', label: 'WK', min: 1, max: 4 },
    { key: 'Batsman',       label: 'BAT', min: 3, max: 6 },
    { key: 'All-Rounder',  label: 'AR',  min: 1, max: 4 },
    { key: 'Bowler',       label: 'BOWL', min: 3, max: 6 }
];

const ROLE_ORDER = ROLE_TABS.map((role) => role.key);

export const getPlayerValue = (player = {}) => Number(player.value ?? player.Value ?? player.credits ?? 0);

export const sortFantasyPlayers = (players = []) => {
    return [...players].sort((a, b) => {
        const roleDelta = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
        if (roleDelta !== 0) return roleDelta;

        if (getPlayerValue(b) !== getPlayerValue(a)) return getPlayerValue(b) - getPlayerValue(a);
        return a.name.localeCompare(b.name);
    });
};

export const buildFantasySummary = (players = []) => {
    const summary = {
        selectedCount: players.length,
        valueUsed: 0,
        valueLeft: FANTASY_LIMITS.maxCredits,
        creditsUsed: 0,
        creditsLeft: FANTASY_LIMITS.maxCredits,
        overseasCount: 0,
        roleCounts: {
            'Wicket Keeper': 0,
            Batsman: 0,
            'All-Rounder': 0,
            Bowler: 0
        },
        teamCounts: {}
    };

    players.forEach((player) => {
        summary.valueUsed += getPlayerValue(player);
        summary.roleCounts[player.role] = (summary.roleCounts[player.role] || 0) + 1;
        summary.teamCounts[player.orgIPLTeam26] = (summary.teamCounts[player.orgIPLTeam26] || 0) + 1;
        if (player.isOverseas) summary.overseasCount += 1;
    });

    summary.valueUsed = Number(summary.valueUsed.toFixed(1));
    summary.valueLeft = Number((FANTASY_LIMITS.maxCredits - summary.valueUsed).toFixed(1));
    summary.creditsUsed = summary.valueUsed;
    summary.creditsLeft = summary.valueLeft;

    return summary;
};

export const getPlayerSelectionState = (player, selectedPlayers = []) => {
    const isSelected = selectedPlayers.some((selectedPlayer) => selectedPlayer._id === player._id);
    if (isSelected) {
        return { allowed: true, reason: '' };
    }

    const summary = buildFantasySummary(selectedPlayers);

    if (summary.selectedCount >= FANTASY_LIMITS.maxPlayers) {
        return { allowed: false, reason: 'You can only select 11 players.' };
    }

    if ((summary.valueUsed + getPlayerValue(player)) > FANTASY_LIMITS.maxCredits) {
        return { allowed: false, reason: 'This pick would exceed the 100 value cap.' };
    }

    if ((summary.teamCounts[player.orgIPLTeam26] || 0) >= FANTASY_LIMITS.maxFromSingleTeam) {
        return { allowed: false, reason: `You can pick only 7 players from ${player.orgIPLTeam26}.` };
    }

    // Overseas cap
    if (player.isOverseas && summary.overseasCount >= FANTASY_LIMITS.maxOverseas) {
        return { allowed: false, reason: 'You can pick at most 4 overseas players.' };
    }

    // Role max cap
    const roleConfig = ROLE_TABS.find((r) => r.key === player.role);
    if (roleConfig && (summary.roleCounts[player.role] || 0) >= roleConfig.max) {
        return { allowed: false, reason: `You can pick at most ${roleConfig.max} ${roleConfig.label}s.` };
    }

    return { allowed: true, reason: '' };
};

export const validateFantasyTeam = (players = [], captainId, viceCaptainId) => {
    const summary = buildFantasySummary(players);
    const selectedIds = new Set(players.map((player) => player._id));
    const errors = [];

    if (summary.selectedCount !== FANTASY_LIMITS.maxPlayers) {
        errors.push('Select exactly 11 players before saving.');
    }

    if (summary.valueUsed > FANTASY_LIMITS.maxCredits) {
        errors.push('Your team is over the 100 value limit.');
    }

    if (Object.values(summary.teamCounts).some((count) => count > FANTASY_LIMITS.maxFromSingleTeam)) {
        errors.push('You can select at most 7 players from one team.');
    }

    if (summary.overseasCount > FANTASY_LIMITS.maxOverseas) {
        errors.push(`You can pick at most ${FANTASY_LIMITS.maxOverseas} overseas players.`);
    }

    ROLE_TABS.forEach((role) => {
        const count = summary.roleCounts[role.key] || 0;
        if (count < role.min) {
            errors.push(`Pick at least ${role.min} ${role.label}${role.min > 1 ? 's' : ''}.`);
        }
        if (count > role.max) {
            errors.push(`Pick at most ${role.max} ${role.label}s.`);
        }
    });

    if (!captainId || !selectedIds.has(captainId)) {
        errors.push('Select a captain from your chosen players.');
    }

    if (!viceCaptainId || !selectedIds.has(viceCaptainId)) {
        errors.push('Select a vice-captain from your chosen players.');
    }

    if (captainId && viceCaptainId && captainId === viceCaptainId) {
        errors.push('Captain and vice-captain must be different players.');
    }

    return {
        isValid: errors.length === 0,
        errors,
        summary
    };
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
