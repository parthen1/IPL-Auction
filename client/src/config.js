
// Centralized Configuration
// This ensures we only change the URL in one place.

const getApiUrl = () => {
    // 1. Check if explicitly defined in Environment Variables (e.g. .env)
    if (import.meta.env.VITE_API_BASE_URL) {
        return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
    }

    // 2. Fallback to Active Render Backend
    return 'https://ipl-auction-backend-jj78.onrender.com';
};

export const API_BASE_URL = getApiUrl();
