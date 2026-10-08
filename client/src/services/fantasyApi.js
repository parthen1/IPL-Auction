import api from './api';

// ── Live Points (proxied via backend) ─────────────────────────────────────────

/** Fetch the most recent match info from the schedule */
export const fetchLiveMatch = async () => {
    const response = await api.get('/api/fantasy/external/match');
    return response.data;
};

/** Fetch all past matches (for match dropdown) */
export const fetchAllPastMatches = async () => {
    const response = await api.get('/api/fantasy/matches/all');
    return response.data;
};

/** Fetch all auction players with total & per-match fantasy points */
export const fetchAllPlayersWithPoints = async () => {
    const response = await api.get('/api/fantasy/players/all-points');
    return response.data;
};

/** Fetch the points leaderboard for a specific match_id */
export const fetchLivePoints = async (matchId) => {
    const response = await api.get(`/api/fantasy/external/points/${matchId}`);
    return response.data;
};

/** Ask the backend if a live sync is running */
export const getLiveStatus = async () => {
    const response = await api.get('/api/fantasy/live-status');
    return response.data;
};

/** Fetch Orange and Purple cap stats from backend */
export const fetchCapStats = async () => {
    const response = await api.get('/api/fantasy/stats/caps');
    return response.data;
};
