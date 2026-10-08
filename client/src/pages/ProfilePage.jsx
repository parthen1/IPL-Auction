import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserCircle, KeyRound, ShieldCheck, Mail, Save, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';

const ProfilePage = () => {
    const { user, token } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [hasPassword, setHasPassword] = useState(false);
    const [profileEmail, setProfileEmail] = useState('');
    const [profileUsername, setProfileUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    // On mount, fetch profile info (email, username, hasPassword) from DB
    useEffect(() => {
        const fetchProfileStatus = async () => {
            if (!token) return;
            try {
                const res = await fetch(`${API_BASE_URL}/api/v2/auth/profile-status`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setHasPassword(data.hasPassword);
                    setProfileEmail(data.email || '');
                    setProfileUsername(data.username || '');
                }
            } catch (err) {
                console.error('Failed to fetch profile status', err);
            } finally {
                setCheckingStatus(false);
            }
        };
        fetchProfileStatus();
    }, [token]);

    const handleSetPassword = async (e) => {
        e.preventDefault();
        setMessage('');
        setError('');

        if (password.length < 6) {
            return setError('Password must be at least 6 characters long.');
        }
        if (password !== confirmPassword) {
            return setError('Passwords do not match.');
        }

        setLoading(true);
        try {
            const body = { password };
            // If already has a password, require current password for verification
            if (hasPassword && currentPassword) {
                body.currentPassword = currentPassword;
            }

            const res = await fetch(`${API_BASE_URL}/api/v2/auth/set-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            const data = await res.json();
            if (res.ok) {
                setMessage(hasPassword
                    ? 'Password changed successfully!'
                    : 'Password set! You can now log in with your username and password.');
                setPassword('');
                setConfirmPassword('');
                setCurrentPassword('');
                setHasPassword(true);
            } else {
                setError(data.message || 'Failed to update password.');
            }
        } catch (err) {
            console.error(err);
            setError('An error occurred while updating the password.');
        } finally {
            setLoading(false);
        }
    };

    // Determine display values from DB (fetched via profile-status)
    const displayEmail = profileEmail || 'Loading...';
    const displayUsername = profileUsername || null;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                <UserCircle className="text-blue-600" size={32} />
                Your Profile
            </h1>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 md:p-8 space-y-8">

                    {/* Account Info */}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">Account Details</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-gray-50 p-4 rounded-xl space-y-1 border border-gray-100">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <Mail size={12} /> Email Address
                                </span>
                                <p className="text-gray-900 font-semibold break-all">{displayEmail}</p>
                                <p className="text-[10px] text-gray-400">Linked from Google — cannot be changed</p>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-xl space-y-1 border border-gray-100">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <UserCircle size={12} /> Username
                                </span>
                                {displayUsername ? (
                                    <>
                                        <p className="text-gray-900 font-semibold">{displayUsername}</p>
                                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                            <Lock size={10} /> Username is locked and cannot be changed
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-amber-600 font-semibold text-sm">Not set — choose a username when joining a tournament</p>
                                )}
                            </div>
                        </div>

                        {/* Password status badge */}
                        {!checkingStatus && (
                            <div className={`mt-4 flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg w-fit ${hasPassword ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                {hasPassword
                                    ? <><CheckCircle size={16} /> Password Login Enabled</>
                                    : <><Lock size={16} /> No password set — Google login only</>
                                }
                            </div>
                        )}
                    </div>

                    {/* Password Section */}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-1 border-b border-gray-100 pb-2 flex items-center gap-2">
                            <KeyRound className="text-blue-500" size={20} />
                            {hasPassword ? 'Change Password' : 'Set a Password'}
                        </h2>
                        <p className="text-sm text-gray-400 mb-5">
                            {hasPassword
                                ? 'Update your password. You\'ll still be able to sign in with Google.'
                                : 'Set a password to log in using your username or email without Google.'}
                        </p>

                        <form onSubmit={handleSetPassword} className="max-w-md space-y-4">
                            {message && (
                                <div className="p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 text-sm font-medium flex items-center gap-2">
                                    <ShieldCheck size={18} /> {message}
                                </div>
                            )}
                            {error && (
                                <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-200 text-sm font-medium">
                                    {error}
                                </div>
                            )}

                            {hasPassword && (
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-600 uppercase">Current Password</label>
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                                        placeholder="Enter current password"
                                    />
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600 uppercase">New Password</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                                        placeholder="Minimum 6 characters"
                                        required
                                    />
                                    <button type="button" onClick={() => setShowPassword(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600 uppercase">Confirm Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                                    placeholder="Must match password"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !password || !confirmPassword}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Saving...' : (hasPassword ? 'Change Password' : 'Set Password')}
                                {!loading && <Save size={18} />}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
