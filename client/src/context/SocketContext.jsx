import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';

import { API_BASE_URL } from '../config';

const SocketContext = createContext({ socket: null });

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (context === undefined) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const { token, user } = useAuth();

    useEffect(() => {
        // Phase 4: Re-enable Socket connection
        if (token) {
            const newSocket = io(API_BASE_URL, {
                auth: { token },
                transports: ['websocket']
            });

            newSocket.on('connect_error', (err) => {
                console.error("Socket Connection Error:", err.message);
                if (err.message.includes("Authentication error")) {
                    console.warn("Socket auth failed, logging out...");
                    // We can't easily call logout() from here because it's in AuthContext
                    // But we can manually clear storage and reload, OR better:
                    // Use a custom event or callback if possible. 
                    // However, since we are inside SocketProvider which uses useAuth...
                    // We can't access 'logout' directly if it causes circular deps or closure issues?
                    // actually 'logout' is not destructured from useAuth() above.
                    // Let's rely on a global event or just reload for now to be safe,
                    // OR simple: clear storage and window.location.href = '/';

                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/';
                }
            });

            setSocket(newSocket);
            console.log('Socket connecting...');

            // Cleanup
            return () => {
                newSocket.disconnect();
                console.log('Socket disconnected via cleanup');
            };
        }
        setSocket(null);
    }, [token]);

    return (
        <SocketContext.Provider value={{ socket, isConnected: !!socket }}>
            {children}
        </SocketContext.Provider>
    );
};
