
import axios from 'axios';

import { API_BASE_URL } from '../config';

console.log('[API] Connecting to:', API_BASE_URL);

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add a request interceptor to attach token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add a response interceptor to handle forced logout
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Check if server sent forceLogout flag (session invalid)
        if (error.response?.data?.forceLogout) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/email-login?reason=session_expired';
        }
        return Promise.reject(error);
    }
);

export const login = async (teamCode, password, firebaseToken) => {
    // Explicitly send teamCode to match strict backend requirement
    const response = await api.post('/api/auth/login', { teamCode, password, firebaseToken });
    return response.data;
};

export const logout = async (teamId) => {
    const response = await api.post('/api/logout', { teamId });
    return response.data;
};

export const getTeams = async () => {
    try {
        const response = await api.get('/api/teams');
        return response.data;
      } catch (error) {
        console.error("Error fetching teams:", error);
        throw error;
    }
};

export const getPlayers = async (filters = {}) => {
    try {
        // Construct query string
        const params = new URLSearchParams(filters);
        const response = await api.get(`/api/players?${params.toString()}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching players:", error);
        throw error;
    }
};

export const startAuction = async () => {
    const response = await api.post('/api/auction/start');
    return response.data;
};

export const nextPlayer = async () => {
    const response = await api.post('/api/auction/next');
    return response.data;
};

export const placeBid = async (amount) => {
    // Rely on Authorization header for team identification
    const response = await api.post('/api/auction/bid', { amount });
    return response.data;
};

export const endTurn = async (winner = null, amount = 0) => {
    const response = await api.post('/api/auction/end', { winner, amount });
    return response.data;
};

export const controlTimer = async (action) => {
    // action: 'pause', 'resume', 'reset'
    const response = await api.post(`/api/auction/timer?action=${action}`);
    return response.data;
};

export const requeuePlayer = async (playerId) => {
    try {
        const response = await api.post('/api/auction/requeue', { playerId });
        return response.data;
    } catch (error) {
        console.error("Error requeueing player:", error);
        throw error;
    }
};

export const getAuctionStatus = async () => {
    const response = await api.get('/api/auction/status');
    return response.data;
};

// --- ADMIN API ---
export const toggleTradingWindow = async () => {
    const response = await api.post('/api/trades/toggle');
    return response.data;
};

// --- TRADE API ---
export const createTradeProposal = async (tradeData) => {
    const response = await api.post('/api/trades/proposal', tradeData);
    return response.data;
};

export const getTradeProposals = async (teamId) => {
    const response = await api.get(`/api/trades/proposals/${teamId}`);
    return response.data;
};

export const getCompletedTrades = async () => {
    const response = await api.get('/api/trades/completed');
    return response.data;
};

export const respondTradeProposal = async (proposalId, status) => {
    const response = await api.put(`/api/trades/proposal/${proposalId}`, { status });
    return response.data;
};

export const getProfileStatus = async () => {
    const response = await api.get('/api/v2/auth/profile-status');
    return response.data;
};

// --- SCHEDULE API ---
export const getSchedule = async () => {
    const response = await api.get('/api/schedule');
    return response.data;
};

export const getSquads = async () => {
    const response = await api.get('/api/schedule/squads');
    return response.data;
};

// --- ADMIN WEEK MANAGEMENT ---
export const adminStartWeek = async (tournamentId) => {
    const response = await api.post('/api/admin/start-week', { tournamentId });
    return response.data;
};

export const adminFinalizeWeek = async (tournamentId) => {
    const response = await api.post('/api/admin/finalize-week', { tournamentId });
    return response.data;
};

export default api;
