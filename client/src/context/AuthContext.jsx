import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../services/api';

// Only persist essential auth fields — avoids bloating localStorage with
// large nested arrays (playersBought, squad data, etc.)
const slimUser = (userData) => {
    if (!userData) return null;
    const { playersBought, squad, players, ...slim } = userData;
    return slim;
};

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState('Loading Auth...');

    // Reads token + user from localStorage, decodes the JWT to extract teamCode/tournamentId/sessionId,
    // and merges them into the user object so components always have the latest team context.
    const refreshUser = () => {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        if (storedToken && storedUser) {
            try {
                const payload = JSON.parse(atob(storedToken.split('.')[1]));
                const parsedUser = JSON.parse(storedUser);
                const enrichedUser = {
                    ...parsedUser,
                    teamCode: payload.teamCode || parsedUser.teamCode || null,
                    tournamentId: payload.tournamentId || parsedUser.tournamentId || null,
                    sessionId: payload.sessionId || parsedUser.sessionId || null,
                    role: payload.role || parsedUser.role || 'user',
                    firebaseUid: payload.firebaseUid || parsedUser.firebaseUid || null
                };
                setUser(enrichedUser);
                setToken(storedToken);
            } catch (e) {
                console.error('Failed to refresh user context:', e);
            }
        }
    };

    useEffect(() => {
        const validateSession = () => {
            const storedToken = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');

            if (storedToken && storedUser) {
                try {
                    // Decode the JWT client-side to check expiry — NO server round-trip needed.
                    // The Axios global interceptor already handles server-side 401s (forceLogout).
                    const payload = JSON.parse(atob(storedToken.split('.')[1]));
                    const isExpired = payload.exp && Date.now() / 1000 > payload.exp;

                    if (isExpired) {
                        // Token is expired — clear session and let user log in again
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                    } else {
                        // Merge JWT fields (teamCode, tournamentId, sessionId) into the stored user
                        // so components reading user.tournamentId always have the correct value
                        // after team selection saves an enriched token.
                        const parsedUser = JSON.parse(storedUser);
                        const enrichedUser = {
                            ...parsedUser,
                            teamCode: payload.teamCode || parsedUser.teamCode || null,
                            tournamentId: payload.tournamentId || parsedUser.tournamentId || null,
                            sessionId: payload.sessionId || parsedUser.sessionId || null,
                            role: payload.role || parsedUser.role || 'user',
                            firebaseUid: payload.firebaseUid || parsedUser.firebaseUid || null
                        };
                        setUser(enrichedUser);
                    }
                } catch (e) {
                    // Malformed token — clear it
                    console.error('Failed to parse token:', e);
                    localStorage.removeItem('token');
                    localStorage.removeItem('firebase_token');
                    localStorage.removeItem('user');
                }
            }
            setLoading(false);
        };

        validateSession();
    }, []);


    const login = async (teamCode, password, firebaseToken) => {
        try {
            const data = await api.login(teamCode, password, firebaseToken);
            if (data.success) {
                const userData = data.team;
                setUser(userData);
                setToken(data.token);
                localStorage.setItem('token', data.token);
                // Store only essential fields — strips large nested arrays
                localStorage.setItem('user', JSON.stringify(slimUser(userData)));
                // Never persist the Firebase token — it's short-lived and should stay in memory
                return { success: true };
            }
            return { success: false, message: data.message };
        } catch (error) {
            return { success: false, message: error.response?.data?.message || 'Login failed' };
        }
    };

    const logout = async () => {
        try {
            // Optional: Call backend to clear session explicitly
            if (user) await api.logout(user.code);
        } catch (e) {
            console.error("Logout error", e);
        }
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('firebase_token');
        localStorage.removeItem('user');
        // socket disconnect handled by SocketContext reacting to token change or unmounting
    };

    const value = {
        user,
        token,
        login,
        logout,
        refreshUser,
        loading,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent flex items-center justify-center rounded-full animate-spin mb-4"></div>
                    <div className="text-gray-400 font-medium animate-pulse">{loadingMessage}</div>
                </div>
            ) : children}
        </AuthContext.Provider>
    );
};
