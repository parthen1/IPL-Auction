import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Sparkles, LogOut, ArrowRight, ShieldCheck, UserCircle } from 'lucide-react';
import { API_BASE_URL as API_URL } from '../config';

const MainMenuPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    
    // Auth and User State
    const [user, setUser] = useState(null);
    const [username, setUsername] = useState(null);
    const [showUsernameModal, setShowUsernameModal] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const initValues = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/email-login');
                return;
            }

            try {
                const userRes = await fetch(`${API_URL}/api/v2/auth/profile-status`, { 
                    method: 'GET', 
                    headers: { 'Authorization': `Bearer ${token}` } 
                });

                if (userRes.ok) {
                    const userData = await userRes.json();
                    setUser(userData);
                    if (userData.username) {
                        setUsername(userData.username);
                    } else {
                        // Automatically show modal if they don't have a username yet
                        setShowUsernameModal(true);
                    }
                } else {
                    // Token invalid/expired
                    navigate('/email-login');
                }
            } catch (err) {
                console.error("Failed to fetch initial user data", err);
            } finally {
                setLoading(false);
            }
        };
        initValues();
    }, [navigate]);

    const handleSaveUsername = async () => {
        if (!newUsername.trim()) return;
        setError('');
        const token = localStorage.getItem('token');
        
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/set-username`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: newUsername })
            });

            const data = await res.json();
            if (res.ok) {
                setUsername(data.username);
                setShowUsernameModal(false);
            } else {
                setError(data.message || 'Failed to set username. It may be taken.');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');

        localStorage.removeItem('user');
        navigate('/email-login');
    };

    // If still loading initially, show a spinner
    if (loading) {
         return (
             <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                 <div className="animate-pulse flex flex-col items-center">
                     <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                     <p className="mt-4 text-gray-500 font-bold">Loading Arena...</p>
                 </div>
             </div>
         );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 py-12 relative overflow-hidden">
            {/* Background Details */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-red-500/10 blur-[100px] pointer-events-none" />

            <div className="w-full max-w-4xl z-10">
                {/* Header Sequence */}
                <div className="text-center mb-12">
                    <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
                        <ShieldCheck size={14} className="text-emerald-500" /> Securely Authenticated
                    </p>
                    <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">Select Game Mode</h1>
                    <p className="mt-4 text-gray-500 font-medium text-lg">
                        Welcome back, <span className="text-blue-600 font-bold">{username || user?.email || 'Player'}</span>. Where are you heading today?
                    </p>
                </div>

                {/* Game Modes */}
                <div className="grid grid-cols-1 max-w-md mx-auto gap-6 md:gap-8">
                    
                    {/* Auction Box */}
                    <article 
                        onClick={() => navigate('/tournaments')} 
                        className="group relative cursor-pointer overflow-hidden rounded-[36px] bg-white border border-gray-200 shadow-xl hover:shadow-2xl hover:border-blue-400 hover:-translate-y-1 transition-all duration-300"
                    >
                        <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-blue-600 to-indigo-500" />
                        <div className="p-8 md:p-10">
                            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                                <Trophy size={32} />
                            </div>
                            <h2 className="text-3xl font-black text-gray-900 mb-3 tracking-tight">Auction Arena</h2>
                            <p className="text-gray-500 font-medium leading-relaxed mb-8">
                                Enter the auction room. Select a tournament, join your team, and battle against other franchises in real-time bidding wars.
                            </p>
                            <div className="flex items-center text-blue-600 font-black text-sm uppercase tracking-wide gap-2 group-hover:gap-3 transition-all">
                                Enter Auction <ArrowRight size={18} />
                            </div>
                        </div>
                    </article>

                </div>

                {/* Footer action */}
                <div className="mt-12 text-center">
                    <button 
                        onClick={handleLogout}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 hover:text-red-600 transition-colors shadow-sm"
                    >
                        <LogOut size={18} /> Disconnect
                    </button>
                </div>
            </div>

            {/* Username Modal overlay */}
            {showUsernameModal && (
                <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[32px] p-8 md:p-10 max-w-md w-full shadow-2xl animate-in zoom-in-95">
                        <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-6 mx-auto">
                            <UserCircle size={36} />
                        </div>
                        <h2 className="text-2xl font-black text-center text-gray-900 mb-2">Create Your ID</h2>
                        <p className="text-gray-500 text-center mb-8 font-medium">You need an exclusive username to join standard auctions and appear on fantasy leaderboards.</p>

                        {error && <div className="p-3 mb-6 bg-red-50 border border-red-100 text-red-600 font-bold text-sm text-center rounded-xl">{error}</div>}

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 bg-white px-2 relative top-2">Desired Username</label>
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    className="w-full px-5 py-4 bg-white border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-gray-900 text-lg transition-all"
                                    placeholder="e.g. MasterStrategist"
                                    autoFocus
                                />
                            </div>

                            <button
                                onClick={handleSaveUsername}
                                disabled={!newUsername.trim()}
                                className="w-full py-4 bg-blue-600 text-white font-black text-lg rounded-2xl hover:bg-blue-700 hover:-translate-y-0.5 shadow-xl shadow-blue-500/25 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
                            >
                                Secure Identity
                            </button>
                        </div>
                        
                        {!user?.username && (
                            <p className="mt-4 text-[11px] text-center font-bold text-gray-400 uppercase tracking-widest">
                                Required to continue
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MainMenuPage;
