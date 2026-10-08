import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';

const RequireAdmin = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    // Prevent redirecting before AuthContext has finished checking localStorage
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 text-white">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-red-500 mb-4"></div>
                <h2 className="text-xl font-bold">Verifying Admin Access...</h2>
            </div>
        );
    }

    // Only allow roles explicitly set to 'admin'
    if (!user || user.role !== 'admin') {
        return <Navigate to="/email-login" state={{ from: location }} replace />;
    }

    // Verified Admin - Render Children
    return children;
};

export default RequireAdmin;
