import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const RequireAuth = () => {
    const location = useLocation();
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <div className="text-white text-center mt-20">Loading Auth...</div>;
    }

    if (!isAuthenticated) {
        // Redirect them to the /email-login page (Firebase First)
        return <Navigate to="/email-login" state={{ from: location }} replace />;
    }

    return <Outlet />;
};

export default RequireAuth;
