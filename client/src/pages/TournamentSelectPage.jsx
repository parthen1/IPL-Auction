
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Lock, ArrowRight, Activity, Plus, Trash2, ArrowLeft } from 'lucide-react';

import { API_BASE_URL as API_URL } from '../config';


const TournamentSelectPage = () => {
    const navigate = useNavigate();
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTournament, setSelectedTournament] = useState(null);
    const [accessCode, setAccessCode] = useState('');
    const [error, setError] = useState('');
    const [userRole, setUserRole] = useState(null);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createCode, setCreateCode] = useState('');
    const [createMode, setCreateMode] = useState('USER_CHOICE');
    const [creating, setCreating] = useState(false);



    useEffect(() => {
        const initValues = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/email-login');
                return;
            }

            try {
                // Parallel fetch: Tournaments and User Info
                const [tourRes, userRes] = await Promise.all([
                    fetch(`${API_URL}/api/v2/auth/tournaments`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${API_URL}/api/v2/auth/profile-status`, { headers: { 'Authorization': `Bearer ${token}` } })
                ]);

                if (tourRes.ok) {
                    const data = await tourRes.json();
                    setTournaments(data);
                }

                if (userRes.ok) {
                    const userData = await userRes.json();
                    setUserRole(userData.role || 'user'); // profile-status returns role directly
                }

            } catch (err) {
                console.error("Failed to fetch initial data", err);
            } finally {
                setLoading(false);
            }
        };
        initValues();
    }, [navigate]);

    const handleJoin = async (e, bypassCode = false, targetTournament = null) => {
        if (e) e.preventDefault();
        setError('');

        const tourney = targetTournament || selectedTournament;
        if (!tourney) return;

        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tourney._id}/join`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ accessCode: bypassCode ? '' : accessCode })
            });
            const data = await res.json();

            if (res.ok) {
                if (data.autoLogin && data.token) {
                    // Direct to Points Table instead of Dashboard
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.team));
                    window.location.href = '/points-table';
                } else {
                    // Go to Team Selector
                    navigate(`/tournaments/${tourney._id}/teams`);
                }
            } else {
                setError(data.message || 'Invalid Access Code');
            }
        } catch (err) {
            setError('Failed to join tournament');
        }
    };

    const handleTournamentClick = (t) => {
        if (t.isJoined) {
            handleJoin(null, true, t);
        } else {
            setSelectedTournament(t);
        }
    };

    const handleCreateTournament = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError('');

        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/create-tournament`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: createName,
                    accessCode: createCode,
                    selectionMode: createMode
                })
            });

            const data = await res.json();
            if (res.ok) {
                setTournaments(prev => [...prev, data.tournament]);
                setShowCreateModal(false);
                setCreateName('');
                setCreateCode('');
                setCreateMode('USER_CHOICE');
            } else {
                setError(data.message || 'Failed to create tournament');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteTournament = async (e, tournamentId) => {
        e.stopPropagation(); // Prevent card click
        if (!window.confirm('Are you sure you want to delete this tournament? This action cannot be undone.')) {
            return;
        }

        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                setTournaments(prev => prev.filter(t => t._id !== tournamentId));
            } else {
                alert('Failed to delete tournament');
            }
        } catch (err) {
            alert('Error deleting tournament');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-2xl border border-gray-100">
                <div className="text-center mb-8">
                    {selectedTournament ? (
                        <div className="flex flex-col items-center">
                            <button
                                onClick={() => setSelectedTournament(null)}
                                className="text-sm text-gray-400 hover:text-gray-600 mb-4"
                            >
                                &larr; Back to Tournaments
                            </button>
                            <h1 className="text-2xl font-black text-gray-900 mb-2">{selectedTournament.name}</h1>
                            <p className="text-gray-500">Enter Access Code to Enter</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between mb-2">
                                <button 
                                    onClick={() => navigate('/main-menu')}
                                    className="flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-gray-600 transition"
                                >
                                    <ArrowLeft size={14} /> Main Menu
                                </button>
                                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded">Auction Mode</span>
                            </div>
                            <h1 className="text-2xl font-black text-gray-900 mb-2">Active Tournaments</h1>
                            <p className="text-gray-500">Select a tournament to participate in.</p>
                        </>
                    )}
                </div>

                {selectedTournament ? (
                    <form onSubmit={handleJoin} className="max-w-md mx-auto space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Access Code</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    value={accessCode}
                                    onChange={(e) => setAccessCode(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-black"
                                    placeholder="Enter Code"
                                    required
                                />
                            </div>
                        </div>
                        {error && <div className="p-3 bg-red-50 text-red-600 font-bold text-center rounded-lg">{error}</div>}
                        <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition">
                            Verify & Enter
                        </button>
                    </form>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {loading ? <p className="text-center">Loading...</p> : tournaments.map(t => (
                            <div
                                key={t._id}
                                onClick={() => handleTournamentClick(t)}
                                className="p-6 border border-gray-200 rounded-2xl hover:border-blue-500 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                                        <Trophy size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">{t.name}</h3>
                                        <div className="flex gap-2 mt-1">
                                            <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">{t.status}</span>
                                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">{t.selectionMode === 'ADMIN_ASSIGN' ? 'Admin Assign' : 'User Choice'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {userRole === 'admin' && (
                                        <button
                                            onClick={(e) => handleDeleteTournament(e, t._id)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition"
                                            title="Delete Tournament"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    )}
                                    <ArrowRight className="text-gray-300 group-hover:text-blue-500 transition" />
                                </div>
                            </div>
                        ))}

                        {userRole === 'admin' && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="p-6 border-2 border-dashed border-gray-300 rounded-2xl hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all flex items-center justify-center group gap-2 text-gray-500 hover:text-blue-600 font-bold"
                            >
                                <Plus size={24} /> Create New Tournament
                            </button>
                        )}
                    </div>
                )}
            </div>
            {
                showCreateModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95">
                            <h2 className="text-2xl font-black text-gray-900 mb-2">New Tournament</h2>
                            <p className="text-gray-500 mb-6">Setup a new tournament instance.</p>

                            <form onSubmit={handleCreateTournament} className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Tournament Name</label>
                                    <input
                                        type="text"
                                        value={createName}
                                        onChange={(e) => setCreateName(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-black"
                                        placeholder="e.g. IPL 2024"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Access Code</label>
                                    <input
                                        type="text"
                                        value={createCode}
                                        onChange={(e) => setCreateCode(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-black"
                                        placeholder="e.g. PLAY123"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Team Selection Mode</label>
                                    <select
                                        value={createMode}
                                        onChange={(e) => setCreateMode(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-black"
                                    >
                                        <option value="USER_CHOICE">User Choice (Classic)</option>
                                        <option value="ADMIN_ASSIGN">Admin Assignment (Locked)</option>
                                    </select>
                                    <p className="text-xs text-gray-400 mt-1 ml-1 leading-snug">
                                        {createMode === 'USER_CHOICE'
                                            ? "Users can pick any available team."
                                            : "Users must wait for Admin to assign them a team."}
                                    </p>
                                </div>

                                {error && <div className="p-3 bg-red-50 text-red-600 font-bold text-sm rounded-lg">{error}</div>}

                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateModal(false)}
                                        className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={creating}
                                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition disabled:bg-gray-400"
                                    >
                                        {creating ? 'Creating...' : 'Create Tournament'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default TournamentSelectPage;
