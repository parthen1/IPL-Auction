import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import { Mail, Lock, ArrowRight, LogIn } from 'lucide-react';
import api from '../services/api';
import { API_BASE_URL } from '../config';

const EmailLoginPage = () => {
    const [identifier, setIdentifier] = useState(''); // username or email
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Called after a successful Firebase Google popup
    const handleGoogleSuccess = async (user) => {
        const firebaseToken = await user.getIdToken(true); // force refresh to guarantee fresh Firebase ID token
        try {
            const response = await api.post('/api/v2/auth/login', { firebaseToken }, {
                headers: { 'Authorization': `Bearer ${firebaseToken}` }
            });
            const data = response.data;
            
            if (data.success) {
                // Unify session tokens: local and google both now securely rely on backend JWT token
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user)); // Store user for AuthContext
                
                // Hard redirect to force AuthContext to re-mount and pick up the new tokens and user
                window.location.href = '/main-menu';
            } else {
                setError(data.message || 'Google Authentication failed on server.');
            }
        } catch (err) {
            setError('Network error verifying Google login.');
        }
    };

    // Local username/email + password login
    const handleLocalLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await api.post('/api/v2/auth/login-local', { 
                username: identifier.trim(), 
                password 
            });
            const data = response.data;

            if (data.success) {
                // Ensure BOTH keys hold our native JWT token to prevent logout desyncs
                localStorage.setItem('token', data.token);

                localStorage.setItem('user', JSON.stringify(data.user)); // Store user for AuthContext
                
                // Hard redirect to force AuthContext to re-mount and pick up the new tokens and user
                window.location.href = '/main-menu';
            } else {
                setError(data.message || 'Invalid username or password.');
            }
        } catch (err) {
            setError('Network error. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Google Sign-In
    const handleGoogleLogin = async () => {
        setError('');
        setLoading(true);
        try {
            if (!auth) {
                setError('Google login is not configured for local development. Please use username/password login.');
                setLoading(false);
                return;
            }
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            await handleGoogleSuccess(result.user);
        } catch (err) {
            // user-cancel errors are benign
            if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
                setError(err.message || 'Google Sign-In failed.');
            }
            console.error('Google Login Error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100">

                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-500/30">
                        <LogIn size={28} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 mb-1">Welcome Back</h1>
                    <p className="text-gray-500 text-sm">Sign in to access Auction Arena.</p>
                </div>

                {/* Google Sign-In */}
                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full py-3 bg-white border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-700 rounded-xl font-bold text-base shadow-sm transition-all flex items-center justify-center gap-3 mb-5"
                >
                    {/* Google SVG */}
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                </button>

                {/* Divider */}
                <div className="relative flex items-center mb-5">
                    <div className="flex-grow border-t border-gray-200" />
                    <span className="flex-shrink mx-4 text-gray-400 text-xs font-bold uppercase tracking-widest">or</span>
                    <div className="flex-grow border-t border-gray-200" />
                </div>

                {/* Local Login Form */}
                <form onSubmit={handleLocalLogin} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">
                            Username or Email
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                            <input
                                type="text"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-gray-900 placeholder:text-gray-400"
                                placeholder="your_username or email@gmail.com"
                                autoComplete="username"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-gray-900"
                                placeholder="••••••••"
                                autoComplete="current-password"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl text-center border border-red-100">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-base shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 group disabled:opacity-60"
                    >
                        {loading ? 'Signing In...' : 'Sign In'}
                        {!loading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
                    </button>

                    <p className="text-xs text-gray-400 text-center mt-2">
                        First time? Use Google to sign in, then set a password from your profile.
                    </p>
                </form>
            </div>
        </div>
    );
};

export default EmailLoginPage;
