
// Centralized Configuration
// This ensures we only change the URL in one place.

const getApiUrl = () => {
    // 1. Check if explicitly defined in Environment Variables (e.g. .env)
    if (import.meta.env.VITE_API_BASE_URL) {
        return import.meta.env.VITE_API_BASE_URL;
    }

    // 2. Fallback to Production (Default behavior for users)
    return 'https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com';
};

export const API_BASE_URL = getApiUrl();
