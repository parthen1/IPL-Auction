import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const ProtectedAdminRoute = () => {
    const isAdmin = sessionStorage.getItem('admin_auth') === 'true';

    if (!isAdmin) {
        return <Navigate to="/admin" replace />;
        // Logic: AdminPage handles its own Login view if not authenticated.
        // So actually, we just render the component? 
        // If we want strict routing where /admin/dashboard is protected and /admin/login is public:

        // But current AdminPage.jsx has internal state for Login vs Dashboard.
        // So this wrapper might be redundant unless we split pages.
        // Let's implement it for future scalability if we split, OR
        // If we keep single page, we don't strictly need this yet.

        // However, per plan, let's make it standard.
        // If we treat "/admin" as the main entry:
        //   - If NOT logged in -> Show Login Component (inside AdminPage or separate)
        //   - If logged in -> Show Dashboard

        // Let's just create it to be safe, but maybe we don't use it if AdminPage handles it internally.
        // Actually the user asked for "ProtectedAdminRoute".

        // Let's assume we might split later.
        // For now, let's simply return Outlet if auth, else Login?
        // But since AdminPage handles login form itself, we can just render Outlet or the Page directly.
        // Let's keep it simple: AdminPage self-manages for now as per current code.
    }
    return <Outlet />;
};

export default ProtectedAdminRoute;
