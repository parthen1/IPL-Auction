import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, ArrowRight, Trophy, User, Check, X as XIcon, Edit2 } from 'lucide-react';
import TeamSelector from '../components/TeamSelector';

import { API_BASE_URL as API_URL } from '../config';


const TournamentTeamSelector = () => {
    const { id: tournamentId } = useParams();
    const navigate = useNavigate();
    const bottomRef = React.useRef(null);
    const [teams, setTeams] = useState([]);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // New State for Selection Mode
    const [selectionMode, setSelectionMode] = useState('USER_CHOICE');
    const [assignmentPending, setAssignmentPending] = useState(false);
    const [myAssignedTeam, setMyAssignedTeam] = useState(null);

    // Admin State
    const [isAdmin, setIsAdmin] = useState(false);
    const [joinedUsers, setJoinedUsers] = useState([]);
    const [assignLoading, setAssignLoading] = useState(false);
    const [adminSelectingForUser, setAdminSelectingForUser] = useState(null); // userId being assigned

    // Polling for assignment updates (if waiting) or Admin updates
    useEffect(() => {
        let interval;
        if (assignmentPending || (isAdmin && selectionMode === 'ADMIN_ASSIGN')) {
            interval = setInterval(() => {
                // Silent fetch to refresh data
                const fetchUpdate = async () => {
                    const firebaseToken = localStorage.getItem('token');
                    try {
                        const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/teams`, {
                            headers: { 'Authorization': `Bearer ${firebaseToken}` }
                        });
                        if (res.ok) {
                            const data = await res.json();

                            // Check if I got assigned
                            if (data.startDashboard && data.myTeamCode && assignmentPending) {
                                setMyAssignedTeam(data.teams.find(t => t.id.toLowerCase() === data.myTeamCode.toLowerCase()));
                                setAssignmentPending(false);
                            }

                            // Update Admin List
                            if (data.isAdmin) {
                                setJoinedUsers(data.joinedUsers || []);
                                setTeams(data.teams); // Updates taken status
                            }
                        }
                    } catch (e) { /* ignore silent failure */ }
                };
                fetchUpdate();
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [assignmentPending, isAdmin, selectionMode, tournamentId]);

    useEffect(() => {
        const fetchTeams = async () => {
            const firebaseToken = localStorage.getItem('token');
            if (!firebaseToken) {
                navigate('/email-login');
                return;
            }

            try {
                // Fetch teams specific to this tournament with "isTaken" status
                const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/teams`, {
                    headers: { 'Authorization': `Bearer ${firebaseToken}` }
                });
                const data = await res.json();

                if (data.startDashboard && data.myTeamCode) {
                    // Auto-redirect if they already have a team and it's their turn (or just auto-login)
                    setMyAssignedTeam(data.teams.find(t => t.id.toLowerCase() === data.myTeamCode.toLowerCase()));
                }

                setTeams(data.teams);
                setSelectionMode(data.selectionMode || 'USER_CHOICE');
                setIsAdmin(!!data.isAdmin);
                setJoinedUsers(data.joinedUsers || []);

                // If Admin Assign mode and I don't have a team, show pending
                if (data.selectionMode === 'ADMIN_ASSIGN' && !data.myTeamCode && !data.isAdmin) {
                    setAssignmentPending(true);
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load team availability');
            }
        };
        fetchTeams();
    }, [tournamentId, navigate]);

    // Standard User Selection
    const handleTeamSelect = async (manualTeamId = null, isAuto = false) => {
        let teamIdToUse = selectedTeam?.id;
        if (typeof manualTeamId === 'string') {
            teamIdToUse = manualTeamId;
        }

        if (!teamIdToUse) return;

        if (!isAuto) setLoading(true);
        setError('');

        const firebaseToken = localStorage.getItem('token');
        if (!firebaseToken) {
            navigate('/email-login');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/select-team`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ teamCode: teamIdToUse })
            });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.team));
                window.location.href = '/points-table';
            } else {
                setError(data.message || 'Team Selection Failed');
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'Network Error - Backend likely unreachable');
            setLoading(false);
        }
    };

    // Spectator Mode
    const handleWatchAuction = async () => {
        setLoading(true);
        setError('');
        const firebaseToken = localStorage.getItem('token');
        if (!firebaseToken) {
            navigate('/email-login');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/watch`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${firebaseToken}` }
            });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.team));
                window.location.href = '/points-table';
            } else {
                setError(data.message || 'Failed to enter watch mode');
                setLoading(false);
            }
        } catch (err) {
            setError('Network Error');
            setLoading(false);
        }
    };

    // Admin Direct Proceed
    const handleAdminProceed = async () => {
        setLoading(true);
        setError('');
        const firebaseToken = localStorage.getItem('token');
        if (!firebaseToken) {
            navigate('/email-login');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/v2/auth/admin/login`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${firebaseToken}` }
            });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = '/admin';
            } else {
                setError(data.message || 'Failed to authenticate as admin');
                setLoading(false);
            }
        } catch (err) {
            setError('Network Error');
            setLoading(false);
        }
    };

    // Admin Action: confirm Assign Team
    const confirmAdminAssign = async () => {
        if (!adminSelectingForUser || !selectedTeam) return;

        setAssignLoading(true);
        const firebaseToken = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/assign-team`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId: adminSelectingForUser, teamCode: selectedTeam.id })
            });

            if (res.ok) {
                // Optimistic Update
                setJoinedUsers(prev => prev.map(u =>
                    u.userId === adminSelectingForUser ? { ...u, teamCode: selectedTeam.id.toUpperCase() } : u
                ));
                setTeams(prev => prev.map(t => {
                    if (t.id === selectedTeam.id) return { ...t, isTaken: true };
                    return t;
                }));
                // Reset
                setAdminSelectingForUser(null);
                setSelectedTeam(null);
            } else {
                setError('Failed to assign team');
            }
        } catch (err) {
            console.error(err);
            setError('Network error');
        } finally {
            setAssignLoading(false);
        }
    };

    const startAdminSelection = (userId) => {
        setAdminSelectingForUser(userId);
        setSelectedTeam(null);
        setError('');
        // Scroll to team selector
        setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const cancelAdminSelection = () => {
        setAdminSelectingForUser(null);
        setSelectedTeam(null);
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center relative overflow-hidden text-white font-sans pb-20">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] bg-blue-600/20 blur-[150px] rounded-full"></div>
                <div className="absolute bottom-[-20%] right-[20%] w-[600px] h-[600px] bg-purple-600/20 blur-[150px] rounded-full"></div>
            </div>

            <div className="z-10 w-full max-w-7xl px-4 flex flex-col items-center pt-10">

                {/* Header */}
                <div className="text-center mb-8 relative">
                    {myAssignedTeam && (
                        <Link
                            to="/points-table"
                            className="absolute top-0 right-0 hidden md:flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-full shadow-lg shadow-green-600/20 transition-all animate-in fade-in"
                        >
                            Go to Points Table <ArrowRight size={18} />
                        </Link>
                    )}
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 mb-6 shadow-2xl shadow-blue-500/30">
                        <Trophy className="text-white" size={32} />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
                        Select Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Franchise</span>
                    </h1>
                    <p className="text-gray-400 text-lg max-w-md mx-auto">
                        {adminSelectingForUser
                            ? "Select a team below to assign to user."
                            : "Choose the team you will lead in this tournament."}
                    </p>

                    {/* Mobile Dashboard Button */}
                    {myAssignedTeam && (
                        <div className="md:hidden mt-4">
                            <Link
                                to="/points-table"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-full shadow-lg shadow-green-600/20 transition-all"
                            >
                                Go to Points Table <ArrowRight size={18} />
                            </Link>
                        </div>
                    )}
                </div>

                {/* Global Error Display */}
                {error && (
                    <div className="w-full max-w-2xl mb-8 p-4 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-200 animate-in fade-in slide-in-from-top-4">
                        <Shield className="shrink-0" size={24} />
                        <span className="font-bold">{error}</span>
                    </div>
                )}

                {/* --- SELECTION MODE LOGIC --- */}

                {/* CASE 1: WAITING FOR ADMIN ASSIGNMENT */}
                {assignmentPending && !isAdmin && (
                    <div className="text-center py-20 animate-pulse">
                        <Shield className="w-24 h-24 text-gray-700 mx-auto mb-6" />
                        <h2 className="text-3xl font-bold text-gray-500 mb-2">Waiting for Team Assignment</h2>
                        <p className="text-gray-600">The Tournament Admin will assign your team shortly.</p>
                    </div>
                )}

                {/* CASE 2: ASSIGNED TEAM (You got assigned) */}
                {myAssignedTeam && selectionMode === 'ADMIN_ASSIGN' && !isAdmin && (
                    <div className="flex flex-col items-center justify-center animate-in zoom-in-50 duration-500">
                        <div className="w-64 h-64 relative mb-8">
                            {myAssignedTeam.logo ? (
                                <img src={myAssignedTeam.logo} alt={myAssignedTeam.name} className="w-full h-full object-contain drop-shadow-2xl" />
                            ) : (
                                <div className="w-full h-full bg-blue-600 rounded-full flex items-center justify-center text-6xl font-black">
                                    {myAssignedTeam.id}
                                </div>
                            )}
                        </div>
                        <h2 className="text-4xl font-bold mb-2">You are leading</h2>
                        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-8">
                            {myAssignedTeam.name}
                        </h1>
                        <button
                            onClick={() => handleTeamSelect(myAssignedTeam.id)}
                            className="px-10 py-4 bg-white text-black font-bold text-xl rounded-full hover:scale-105 transition-transform shadow-xl shadow-white/10"
                        >
                            Enter Tournament Board
                        </button>
                    </div>
                )}


                {/* CASE 3: STANDARD SELECTION (User Choice OR Admin View) */}
                {/* Admin Panel */}
                {isAdmin && (
                    <div className="w-full max-w-5xl mb-8 p-6 bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-700">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <Shield className="text-red-500" /> Admin Assignment Panel
                        </h3>
                        {joinedUsers.length === 0 ? (
                            <p className="text-gray-400">No users joined yet.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {joinedUsers.map(user => {
                                    const isBeingEdited = adminSelectingForUser === user.userId;
                                    return (
                                        <div
                                            key={user.userId}
                                            className={`
                                                relative p-4 rounded-xl flex items-center justify-between border transition-all
                                                ${isBeingEdited
                                                    ? 'bg-amber-900/30 border-amber-500 shadow-lg shadow-amber-500/20'
                                                    : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-sm">
                                                    {user.username.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm text-white">{user.username}</p>
                                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${user.teamCode ? 'text-green-400' : 'text-gray-500'}`}>
                                                        {user.teamCode ? user.teamCode : 'Unassigned'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Action Button */}
                                            {!isBeingEdited ? (
                                                <button
                                                    onClick={() => startAdminSelection(user.userId)}
                                                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-400 hover:text-white transition-colors"
                                                    title="Assign Team"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                            ) : (
                                                <div className="px-3 py-1 bg-amber-500/20 text-amber-500 text-xs font-bold rounded-full animate-pulse">
                                                    Selecting...
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Team Selector Grid */}
                {(!assignmentPending && (!myAssignedTeam || selectionMode === 'USER_CHOICE' || isAdmin)) && (
                    <div className={`w-full mb-8 transition-opacity ${adminSelectingForUser ? 'opacity-100' : isAdmin ? 'opacity-50 hover:opacity-100' : 'opacity-100'}`}>
                        {/* If Admin is selecting, show header */}
                        {adminSelectingForUser && (
                            <div className="text-center mb-4">
                                <span className="px-4 py-2 rounded-full bg-amber-500/20 text-amber-400 font-bold text-sm border border-amber-500/30">
                                    Step 2: Select a Team from below
                                </span>
                            </div>
                        )}

                        <TeamSelector
                            teams={teams}
                            selectedTeam={selectedTeam}
                            onSelect={(team) => {
                                // If admin, only allow selecting available teams (or current team?) 
                                // Assuming re-assign allowed.
                                if (team.isTaken && team.id !== teams.find(t => t.ownerUsername === joinedUsers.find(u => u.userId === adminSelectingForUser)?.username)?.id) {
                                    // ideally check if taken by someone else
                                    // but let's just create raw selection for now
                                }
                                setSelectedTeam(team);
                                setError('');
                                // Don't auto scroll if admin
                            }}
                            isAdminMode={!!adminSelectingForUser}
                        />
                    </div>
                )}

                {/* Confirmation Footer (Floating) */}
                {/* 1. User Confirmation */}
                {selectedTeam && !isAdmin && (
                    <div className="fixed bottom-0 left-0 w-full p-6 bg-gray-900/90 backdrop-blur-xl border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4 z-50 animate-in slide-in-from-bottom-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl p-1">
                                {selectedTeam.logo && <img src={selectedTeam.logo} className="w-full h-full object-contain" />}
                            </div>
                            <div className="text-left">
                                <div className="text-gray-400 text-xs uppercase font-bold">Joining As</div>
                                <div className="text-xl font-bold text-white">{selectedTeam.name}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <button
                                onClick={() => setSelectedTeam(null)}
                                className="px-6 py-3 rounded-xl font-bold text-gray-400 hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleTeamSelect}
                                disabled={loading}
                                className="flex-1 md:flex-none px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                            >
                                {loading ? 'Joining...' : 'Confirm Selection'} <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {/* 2. Admin Confirmation (Right/Cross Buttons) */}
                {adminSelectingForUser && (
                    <div className="fixed bottom-0 left-0 w-full p-6 bg-slate-900/95 backdrop-blur-xl border-t border-amber-500/30 z-50 flex items-center justify-between animate-in slide-in-from-bottom-4 shadow-2xl shadow-black/50">
                        <div className="flex items-center gap-4">
                            <div className="text-left">
                                <div className="text-amber-500 text-xs uppercase font-bold tracking-wider mb-1">Assigning To User</div>
                                <div className="text-xl font-bold text-white">
                                    {joinedUsers.find(u => u.userId === adminSelectingForUser)?.username}
                                </div>
                            </div>
                            <ArrowRight className="text-gray-600" />
                            <div className="text-left">
                                <div className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-1">Selected Team</div>
                                <div className={`text-xl font-bold ${selectedTeam ? 'text-white' : 'text-gray-600 italic'}`}>
                                    {selectedTeam ? selectedTeam.name : 'None Selected'}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Cancel (Cross) */}
                            <button
                                onClick={cancelAdminSelection}
                                className="w-14 h-14 rounded-full bg-gray-800 hover:bg-red-500/20 hover:text-red-500 text-gray-400 border border-gray-700 hover:border-red-500 flex items-center justify-center transition-all bg-opacity-50 backdrop-blur"
                                title="Cancel Assignment"
                            >
                                <XIcon size={24} strokeWidth={3} />
                            </button>

                            {/* Confirm (Tick) */}
                            <button
                                onClick={confirmAdminAssign}
                                disabled={!selectedTeam || assignLoading}
                                className={`
                                    w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg
                                    ${!selectedTeam
                                        ? 'bg-gray-800 text-gray-600 border border-gray-700 cursor-not-allowed'
                                        : 'bg-green-500 hover:bg-green-400 text-white shadow-green-500/40 hover:scale-110'
                                    }
                                `}
                                title="Confirm Assignment"
                            >
                                <Check size={28} strokeWidth={4} />
                            </button>
                        </div>
                    </div>
                )}

                <div ref={bottomRef} className="pb-8"></div>
            </div>
            {/* Alternative Access Options */}
            {!selectedTeam && !adminSelectingForUser && (
                <div className="flex flex-col items-center gap-4 mt-8 pb-12 z-20">
                    {isAdmin ? (
                        <button
                            onClick={handleAdminProceed}
                            className="px-6 py-3 bg-red-600 hover:bg-red-500 font-bold text-white rounded-full shadow-lg shadow-red-600/30 transition-all flex items-center gap-2"
                        >
                            Proceed to Admin Dashboard <ArrowRight size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={handleWatchAuction}
                            disabled={loading}
                            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 font-bold text-gray-300 hover:text-white rounded-full border border-slate-700 hover:border-slate-500 shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Joining...' : 'Watch Auction (Spectator Mode)'} <ArrowRight size={18} />
                        </button>
                    )}

                    <Link to="/tournaments" className="text-xs font-bold text-white/30 hover:text-white transition-colors flex items-center gap-1 uppercase tracking-widest mt-4">
                        &larr; Back to Tournaments
                    </Link>
                </div>
            )}
        </div >
    );
};

export default TournamentTeamSelector;
