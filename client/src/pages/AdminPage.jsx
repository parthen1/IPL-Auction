import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Shield, Play, RotateCcw, Lock, AlertTriangle, Users, Trophy, Edit2, Check, X as XIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { controlTimer, endTurn, nextPlayer, getPlayers, requeuePlayer, toggleTradingWindow, adminStartWeek, adminFinalizeWeek } from '../services/api';
import { toCr } from '../utils/formatCurrency';
import TeamSelector from '../components/TeamSelector';
import { cn } from '../lib/utils';

import { API_BASE_URL as API_URL } from '../config';

import { Navigate } from 'react-router-dom';

const AdminPage = () => {
    const { socket } = useSocket();
    const { logout, user } = useAuth();

    // Auction Control State
    const [teams, setTeams] = useState([]); // Global teams or specific tournament teams
    const [auctionState, setAuctionState] = useState(null);
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [currentBid, setCurrentBid] = useState(0);
    const [highestBidder, setHighestBidder] = useState(null);
    const [timer, setTimer] = useState(0);
    const [timerEndsAt, setTimerEndsAt] = useState(null);

    // Unsold Logic
    const [showUnsoldModal, setShowUnsoldModal] = useState(false);
    const [unsoldPlayers, setUnsoldPlayers] = useState([]);
    const [unsoldLoading, setUnsoldLoading] = useState(false);

    // Manual Sell FormState
    const [sellTeamId, setSellTeamId] = useState('');
    const [sellAmount, setSellAmount] = useState('');

    // --- NEW: TOURNAMENT MANAGEMENT STATE ---
    const [tournaments, setTournaments] = useState([]);
    const [selectedTournamentId, setSelectedTournamentId] = useState('');
    const [tournamentUsers, setTournamentUsers] = useState([]);
    const [isManagingTournament, setIsManagingTournament] = useState(false); // Toggle visibility

    // Create Tournament State
    const [newTournamentName, setNewTournamentName] = useState('');
    const [isCreatingTournament, setIsCreatingTournament] = useState(false);

    // Sync State
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null); // { success: bool, message: string }

    // Match Tools State
    const [fantasyMatches, setFantasyMatches] = useState([]);
    const [selectedManualMatchId, setSelectedManualMatchId] = useState('');
    const [isManualTargetSync, setIsManualTargetSync] = useState(false);
    const [isSummingPoints, setIsSummingPoints] = useState(false);

    const handleCreateTournament = async (e) => {
        e.preventDefault();
        if (!newTournamentName.trim()) return;

        setIsCreatingTournament(true);
        const firebaseToken = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/create`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: newTournamentName })
            });
            const data = await res.json();
            if (res.ok) {
                setNewTournamentName('');
                alert('Tournament created successfully!');
                fetchTournaments(); // Refresh list
            } else {
                alert(data.message || 'Failed to create tournament');
            }
        } catch (err) {
            console.error(err);
            alert('Network Error');
        } finally {
            setIsCreatingTournament(false);
        }
    };

    // Assignment Modal State
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [userToAssign, setUserToAssign] = useState(null); // { userId, username, currentTeam }
    const [teamsForAssignment, setTeamsForAssignment] = useState([]); // Teams specific to selected tournament with isTaken status
    const [selectedTeamForAssign, setSelectedTeamForAssign] = useState(null);
    const [assignLoading, setAssignLoading] = useState(false);

    // Keep context for backend compatibility
    useEffect(() => {
        fetchTournaments();
        fetchMatches();
    }, []);

    const fetchMatches = async () => {
        const firebaseToken = localStorage.getItem('token');
        if (!firebaseToken) return;
        try {
            const res = await fetch(`${API_URL}/api/fantasy/matches`, {
                headers: { 'Authorization': `Bearer ${firebaseToken}` }
            });
            const data = await res.json();
            setFantasyMatches(data);
            if (data && data.length > 0) {
                // Pre-select most recent/upcoming by finding first not completed or last
                const target = data.find(m => m.status !== 'Completed') || data[data.length - 1];
                if (target) setSelectedManualMatchId(target.matchId);
            }
        } catch (err) {
            console.error("Failed to fetch matches:", err);
        }
    };

    // Fetch Tournaments
    const fetchTournaments = async () => {
        const firebaseToken = localStorage.getItem('token');
        if (!firebaseToken) return;

        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments`, {
                headers: { 'Authorization': `Bearer ${firebaseToken}` }
            });
            const data = await res.json();
            setTournaments(data);
            if (data.length > 0) {
                // Auto-select first active or just first
                setSelectedTournamentId(data[0]._id);
            }
        } catch (err) {
            console.error("Failed to fetch tournaments:", err);
        }
    };

    // Fetch Tournament Details (Users & Teams) when selected
    useEffect(() => {
        if (!selectedTournamentId) return;

        const fetchDetails = async () => {
            const firebaseToken = localStorage.getItem('token');
            if (!firebaseToken) return;

            try {
                // We use the same endpoint as the selector: /tournaments/:id/teams
                // It returns { teams: [...], joinedUsers: [...] } if admin
                const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${selectedTournamentId}/teams`, {
                    headers: { 'Authorization': `Bearer ${firebaseToken}` }
                });
                const data = await res.json();

                if (data.isAdmin) {
                    setTournamentUsers(data.joinedUsers || []);
                    setTeamsForAssignment(data.teams || []);
                    setTeams(data.teams); // Also update global teams for "Force Sell" dropdown to be accurate
                }
            } catch (err) {
                console.error("Failed to fetch tournament details:", err);
            }
        };

        fetchDetails();
    }, [selectedTournamentId, assignModalOpen]);
    // Re-fetch when modal closes/updates to get fresh data

    // --- SOCKET SYNC ---
    useEffect(() => {
        if (!socket) return;
        const handleAuctionUpdate = (data) => {
            setAuctionState(data);
            setCurrentPlayer(data.currentPlayer || null);
            setCurrentBid(data.currentBid || 0);
            setHighestBidder(data.highestBidder || null);
            setTimerEndsAt(data.timerEndsAt);
        };
        socket.on('auction:state', handleAuctionUpdate);
        socket.on('auction:sync', handleAuctionUpdate);
        socket.emit('auction:request_sync');
        return () => {
            socket.off('auction:state', handleAuctionUpdate);
            socket.off('auction:sync', handleAuctionUpdate);
        };
    }, [socket]);

    // Timer Logic
    useEffect(() => {
        if (!timerEndsAt) return;
        const interval = setInterval(() => {
            const now = new Date();
            const end = new Date(timerEndsAt);
            const diff = Math.max(0, Math.ceil((end - now) / 1000));
            setTimer(diff);
            if (diff <= 0) clearInterval(interval);
        }, 100);
        return () => clearInterval(interval);
    }, [timerEndsAt]);

    // Action Handlers
    const handleStart = () => controlTimer('resume').catch(console.error);
    const handlePause = () => controlTimer('pause').catch(console.error);
    const handleResetTimer = () => controlTimer('reset').catch(console.error);
    const handleNextPlayer = () => nextPlayer().catch(console.error);

    const handleMarkSold = (teamId, amount) => {
        if (!teamId || !amount) return alert("Select Team and Amount");
        const amountInRupees = Math.round(parseFloat(amount) * 10000000);
        endTurn(teamId, amountInRupees).catch(console.error);
    };

    const handleMarkUnsold = () => {
        if (window.confirm("Mark current player UNSOLD?")) endTurn(null, 0).catch(console.error);
    };

    const handleBringBack = async (id) => {
        try {
            await requeuePlayer(id);
            setUnsoldPlayers(prev => prev.filter(p => p._id !== id));
            alert('Player added back to queue!');
        } catch (error) {
            alert('Failed to requeue: ' + (error.response?.data?.message || error.message));
        }
    };
    // Unsold Modal Loader
    useEffect(() => {
        if (showUnsoldModal) {
            setUnsoldLoading(true);
            getPlayers({ status: 'UNSOLD' })
                .then(data => setUnsoldPlayers(data))
                .catch(err => console.error(err))
                .finally(() => setUnsoldLoading(false));
        }
    }, [showUnsoldModal]);


    // --- ASSIGNMENT HANDLERS ---
    const openAssignModal = (user) => {
        setUserToAssign(user);
        setSelectedTeamForAssign(null);
        setAssignModalOpen(true);
    };

    const handleConfirmAssign = async () => {
        if (!userToAssign || !selectedTeamForAssign) return;
        setAssignLoading(true);

        const firebaseToken = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${selectedTournamentId}/assign-team`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId: userToAssign.userId, teamCode: selectedTeamForAssign.id })
            });

            if (res.ok) {
                // Close and Refresh
                setAssignModalOpen(false);
                setUserToAssign(null);
            } else {
                alert("Failed to assign team");
            }
        } catch (e) {
            console.error(e);
            alert("Network Error");
        } finally {
            setAssignLoading(false);
        }
    };

    const handleUnassignTeam = async (assignmentId, userId, username, teamCode) => {
        if (!window.confirm(`Are you sure you want to remove ${username} from Team ${teamCode}? This team will become available for others to claim.`)) return;

        const firebaseToken = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${selectedTournamentId}/unassign-team`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ assignmentId, userId })
            });

            if (res.ok) {
                // Trigger refresh by toggling off and on
                const currentId = selectedTournamentId;
                setSelectedTournamentId('');
                setTimeout(() => setSelectedTournamentId(currentId), 10);
            } else {
                console.error("Failed to unassign team");
            }
        } catch (e) {
            console.error("Network Error:", e);
        }
    };
    const handleTogglePlayingXILock = async () => {
        const activeTourney = tournaments.find(t => t._id === selectedTournamentId);
        if (!activeTourney) return;

        const newLockState = !activeTourney.isPlayingXILocked;
        if (!window.confirm(`Are you sure you want to ${newLockState ? 'LOCK' : 'UNLOCK'} Playing XI selections for this tournament?`)) return;

        const firebaseToken = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${selectedTournamentId}/lock-playing-xi`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isPlayingXILocked: newLockState })
            });

            if (res.ok) {
                // Update local state to reflect change without full reload
                setTournaments(prev => prev.map(t => 
                    t._id === selectedTournamentId ? { ...t, isPlayingXILocked: newLockState } : t
                ));
            } else {
                console.error("Failed to toggle lock");
                alert("Failed to toggle lock status");
            }
        } catch (e) {
            console.error("Network Error:", e);
        }
    };

    const handleToggleCaptaincyLock = async () => {
        const activeTourney = tournaments.find(t => t._id === selectedTournamentId);
        if (!activeTourney) return;

        const newLockState = !activeTourney.isCaptaincyLocked;
        if (!window.confirm(`Are you sure you want to ${newLockState ? 'LOCK' : 'UNLOCK'} Captain & Vice-Captain selections for this tournament?`)) return;

        const firebaseToken = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${selectedTournamentId}/lock-captaincy`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isCaptaincyLocked: newLockState })
            });

            if (res.ok) {
                setTournaments(prev => prev.map(t => 
                    t._id === selectedTournamentId ? { ...t, isCaptaincyLocked: newLockState } : t
                ));
            } else {
                console.error("Failed to toggle Captaincy lock");
                alert("Failed to toggle Captaincy lock status");
            }
        } catch (e) {
            console.error("Network Error:", e);
        }
    };
    const handleToggleTradingLock = async () => {
        const activeTourney = tournaments.find(t => t._id === selectedTournamentId);
        if (!activeTourney) return;

        const newLockState = !activeTourney.isTradingOpen;
        if (!window.confirm(`Are you sure you want to ${newLockState ? 'OPEN' : 'CLOSE'} the Trading window for this tournament?`)) return;

        try {
            const data = await toggleTradingWindow();
            
            if (data) {
                // To keep UI in sync, update the dummy property
                setTournaments(prev => prev.map(t => 
                    t._id === selectedTournamentId ? { ...t, isTradingOpen: data.isTradingOpen } : t
                ));
                alert(`Trading window is now ${data.isTradingOpen ? 'OPEN' : 'CLOSED'}`);
            }
        } catch (e) {
            console.error("Failed to toggle Trading lock:", e);
            alert("Failed to toggle Trading lock status: " + (e.response?.data?.message || e.message));
        }
    };

    const handleClearAllPlaying11 = async () => {
        if (!selectedTournamentId) return;
        if (!window.confirm(`Are you absolutely sure you want to CLEAR the Playing 11 for ALL teams in this tournament? This cannot be undone.`)) return;

        const firebaseToken = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${selectedTournamentId}/clear-all-playing11`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (res.ok) {
                alert('Playing 11 of all teams have been cleared successfully.');
            } else {
                const data = await res.json();
                console.error("Failed to clear Playing 11:", data);
                alert("Failed to clear Playing 11: " + (data.message || "Unknown error"));
            }
        } catch (e) {
            console.error("Network Error:", e);
            alert("Network Error");
        }
    };

    const handleManualSync = async () => {
        if (!window.confirm("Force start the fantasy points sync. This will scan today's schedule and begin fetching from the external API if a match is found. Proceed?")) return;
        
        setIsSyncing(true);
        setSyncStatus(null);
        
        const firebaseToken = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/fantasy/admin/sync/manual`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();
            if (res.ok) {
                setSyncStatus({ success: true, message: data.isLive ? `Sync started for ${data.matchName}` : "No active match found in today's schedule." });
            } else {
                setSyncStatus({ success: false, message: data.message || "Failed to trigger sync" });
            }
        } catch (err) {
            console.error(err);
            setSyncStatus({ success: false, message: "Network Error" });
        } finally {
            setIsSyncing(false);
            // Clear status after 5s
            setTimeout(() => setSyncStatus(null), 5000);
        }
    };

    const handleTargetedSync = async () => {
        if (!selectedManualMatchId) return alert("Select a Match ID first.");
        if (!window.confirm(`Run syncManualPoints script for match ID ${selectedManualMatchId}?`)) return;
        
        setIsManualTargetSync(true);
        setSyncStatus(null);
        
        const firebaseToken = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/fantasy/admin/sync-manual-match/${selectedManualMatchId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();
            if (res.ok) {
                setSyncStatus({ success: true, message: data.message });
            } else {
                setSyncStatus({ success: false, message: data.message || "Failed to trigger targeted sync" });
            }
        } catch (err) {
            console.error(err);
            setSyncStatus({ success: false, message: "Network Error" });
        } finally {
            setIsManualTargetSync(false);
            setTimeout(() => setSyncStatus(null), 5000);
        }
    };

    const handleSumPoints = async () => {
        if (!window.confirm(`Run sumPerMatchPoints to recalculate and overwrite all players' points from their perMatchPoints history?`)) return;
        
        setIsSummingPoints(true);
        setSyncStatus(null);
        
        const firebaseToken = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/api/fantasy/admin/sum-per-match-points`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${firebaseToken}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();
            if (res.ok) {
                setSyncStatus({ success: true, message: data.message });
            } else {
                setSyncStatus({ success: false, message: data.message || "Failed to trigger sum operation" });
            }
        } catch (err) {
            console.error(err);
            setSyncStatus({ success: false, message: "Network Error" });
        } finally {
            setIsSummingPoints(false);
            setTimeout(() => setSyncStatus(null), 5000);
        }
    };
    
    // --- WEEKLY MANAGEMENT HANDLERS ---
    const [isWeekLoading, setIsWeekLoading] = useState(false);

    const handleStartWeek = async () => {
        if (!selectedTournamentId) return alert("Please select a tournament first.");
        if (!window.confirm("Are you sure you want to START a new week? This will LOCK the current Playing 11 for all teams as the historical snapshot for this week!")) return;
        
        setIsWeekLoading(true);
        try {
            const data = await adminStartWeek(selectedTournamentId);
            alert(data.message || "Week started successfully");
        } catch (err) {
            console.error(err);
            alert("Failed to start week: " + (err.response?.data?.message || err.message));
        } finally {
            setIsWeekLoading(false);
        }
    };

    const handleFinalizeWeek = async () => {
        if (!selectedTournamentId) return alert("Please select a tournament first.");
        if (!window.confirm("Are you sure you want to FINALIZE the current week? This will FREEZE the live points into permanent history and move to the next week!")) return;
        
        setIsWeekLoading(true);
        try {
            const data = await adminFinalizeWeek(selectedTournamentId);
            alert(data.message || "Week finalized successfully");
        } catch (err) {
            console.error(err);
            alert("Failed to finalize week: " + (err.response?.data?.message || err.message));
        } finally {
            setIsWeekLoading(false);
        }
    };

    return (
        <div className="p-6 md:p-10 max-w-7xl mx-auto min-h-screen pb-40 bg-auction-bg text-white font-sans">
            {/* Top Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-auction-secondary/10 rounded-xl text-auction-secondary border border-auction-secondary/20">
                        <Shield size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">Auction Control</h1>
                        <p className="text-gray-400 font-medium">Master Command Center</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => window.location.href = '/dashboard'} className="px-5 py-2.5 bg-auction-surface border border-white/5 text-gray-300 rounded-xl font-bold hover:bg-white/5 hover:text-white transition-all">
                        Back to Dashboard
                    </button>
                    <button onClick={() => { logout(); }} className="text-sm font-bold text-red-500 hover:text-red-400 px-3">
                        Logout
                    </button>
                </div>
            </div>

            {/* Live Auction State Display - Kept Prominent */}
            {/* Live Auction State Display - Kept Prominent */}
            {currentPlayer && (
                <div className="mb-8 bg-auction-surface/50 backdrop-blur-sm p-8 rounded-3xl border border-auction-secondary/20 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-auction-secondary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

                    <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                        <div className="flex-1">
                            <p className="text-xs font-bold text-auction-secondary uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> Live Auction
                            </p>
                            <h2 className="text-4xl md:text-5xl font-black text-white mb-2 tracking-tight">
                                <span className="text-transparent bg-clip-text bg-gradient-to-br from-gray-400 to-gray-600 mr-2">#{currentPlayer.srNo}</span>
                                {currentPlayer.name}
                            </h2>
                            <div className="flex items-center gap-3 text-gray-400 font-medium text-lg">
                                <span className="px-3 py-1 bg-white/5 rounded-lg border border-white/5">{currentPlayer.role}</span>
                                <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                                <span>{currentPlayer.country}</span>
                            </div>
                        </div>

                        <div className="text-right bg-black/20 p-6 rounded-2xl border border-white/5 min-w-[240px]">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Current Bid</p>
                            <p className="text-4xl font-black text-white tabular-nums tracking-tight">₹{toCr(currentBid)} <span className="text-xl text-gray-500">Cr</span></p>
                            {highestBidder ? (
                                <p className="text-sm font-bold text-auction-secondary mt-2 flex items-center justify-end gap-2">
                                    <Trophy size={14} /> {highestBidder.name || highestBidder.id}
                                </p>
                            ) : (
                                <p className="text-sm font-bold text-gray-600 mt-2 italic">Waiting for bid...</p>
                            )}
                        </div>

                        <div className="text-center bg-black/20 p-6 rounded-2xl border border-white/5 min-w-[140px]">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Timer</p>
                            <p className="text-5xl font-black tabular-nums tracking-tight" style={{ color: timer <= 10 ? '#ef4444' : '#10b981' }}>{timer}<span className="text-2xl">s</span></p>
                        </div>
                    </div>
                </div>
            )}

            {/* GRID LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* COL 1 & 2: Main Controls & Setup */}
                <div className="lg:col-span-2 space-y-6">

                    {/* NEW: Create Tournament Card */}
                    <div className="bg-auction-surface rounded-3xl border border-white/5 overflow-hidden p-6 animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-green-500/10 text-green-400 rounded-xl"><Trophy size={20} /></div>
                            <div>
                                <h3 className="font-bold text-white text-lg">Create New Tournament</h3>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">Spawn a new event for players to join.</p>
                            </div>
                        </div>
                        <form onSubmit={handleCreateTournament} className="flex gap-4">
                            <input
                                type="text"
                                value={newTournamentName}
                                onChange={(e) => setNewTournamentName(e.target.value)}
                                placeholder="Enter Tournament Name (e.g. Winter League 2026)"
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all font-bold"
                            />
                            <button
                                type="submit"
                                disabled={isCreatingTournament || !newTournamentName.trim()}
                                className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg border border-white/10 transition-all active:scale-95"
                            >
                                {isCreatingTournament ? 'Creating...' : 'Create'}
                            </button>
                        </form>
                    </div>

                    {/* NEW: Weekly Scoring Management */}
                    <div className="bg-auction-surface rounded-3xl border border-white/5 overflow-hidden p-6 animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-red-500/10 text-red-500 rounded-xl"><RotateCcw size={20} /></div>
                            <div>
                                <h3 className="font-bold text-white text-lg">Weekly Scoring Management</h3>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">Control match weeks and point finalization.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={handleStartWeek}
                                disabled={isWeekLoading}
                                className="flex items-center justify-center gap-3 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg border border-white/10 transition-all active:scale-95"
                            >
                                <Lock size={20} />
                                Start New Week (Lock Snapshot)
                            </button>
                            <button
                                onClick={handleFinalizeWeek}
                                disabled={isWeekLoading}
                                className="flex items-center justify-center gap-3 py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg border border-white/10 transition-all active:scale-95"
                            >
                                <Check size={20} />
                                Finalize Week (Freeze Points)
                            </button>
                        </div>
                    </div>

                    {/* NEW: Tournament Participants & Assignment Card */}
                    <div className="bg-auction-surface rounded-3xl border border-white/5 overflow-hidden">
                        <div
                            className="p-6 border-b border-white/5 bg-white/2 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => setIsManagingTournament(!isManagingTournament)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl"><Users size={20} /></div>
                                <div>
                                    <h3 className="font-bold text-white text-lg">Tournament Participants</h3>
                                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                                        Managing:
                                        <select
                                            className="ml-2 bg-transparent border-none font-bold text-blue-400 focus:ring-0 p-0 cursor-pointer text-sm"
                                            value={selectedTournamentId}
                                            onClick={(e) => e.stopPropagation()} // Prevent accordion toggle
                                            onChange={(e) => setSelectedTournamentId(e.target.value)}
                                        >
                                            {tournaments.map(t => <option key={t._id} value={t._id} className="bg-gray-900">{t.name}</option>)}
                                        </select>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {selectedTournamentId && (
                                    <>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleTogglePlayingXILock(); }}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border",
                                                tournaments.find(t => t._id === selectedTournamentId)?.isPlayingXILocked 
                                                    ? "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20"
                                                    : "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
                                            )}
                                        >
                                            <Lock size={14} />
                                            {tournaments.find(t => t._id === selectedTournamentId)?.isPlayingXILocked ? 'XI Locked' : 'XI Unlocked'}
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleCaptaincyLock(); }}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border",
                                                tournaments.find(t => t._id === selectedTournamentId)?.isCaptaincyLocked 
                                                    ? "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20"
                                                    : "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
                                            )}
                                        >
                                            <Lock size={14} />
                                            {tournaments.find(t => t._id === selectedTournamentId)?.isCaptaincyLocked ? 'C/VC Locked' : 'C/VC Unlocked'}
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleTradingLock(); }}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border",
                                                !tournaments.find(t => t._id === selectedTournamentId)?.isTradingOpen 
                                                    ? "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20"
                                                    : "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
                                            )}
                                        >
                                            <Lock size={14} />
                                            {tournaments.find(t => t._id === selectedTournamentId)?.isTradingOpen ? 'Trading Open' : 'Trading Closed'}
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleClearAllPlaying11(); }}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20"
                                        >
                                            <AlertTriangle size={14} />
                                            Clear All XI
                                        </button>
                                    </>
                                )}
                                {isManagingTournament ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
                            </div>
                        </div>

                        {/* Expanded Content */}
                        {isManagingTournament && (
                            <div className="p-6 bg-auction-surface/50 animate-in slide-in-from-top-2">
                                {tournamentUsers.length === 0 ? (
                                    <p className="text-center text-gray-500 py-8 italic border-2 border-dashed border-white/5 rounded-xl">No users have joined this tournament yet.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-white/5 text-gray-400 uppercase font-bold text-[10px] tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-3 rounded-l-lg">User</th>
                                                    <th className="px-4 py-3">Team Status</th>
                                                    <th className="px-4 py-3 rounded-r-lg text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {tournamentUsers.map(u => (
                                                    <tr key={u.userId} className="group hover:bg-white/2 transition-colors">
                                                        <td className="px-4 py-4 font-bold text-white flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[10px] text-white font-black shadow-lg">
                                                                {u.username.substring(0, 2).toUpperCase()}
                                                            </div>
                                                            {u.username}
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            {u.teamCode ? (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span> {u.teamCode}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleUnassignTeam(u.assignmentId, u.userId, u.username, u.teamCode)}
                                                                        title={`Unassign ${u.username} from Team ${u.teamCode}`}
                                                                        className="p-1 rounded-md text-red-500 hover:text-white hover:bg-red-500 transition-colors border border-transparent hover:border-red-500/50"
                                                                    >
                                                                        <XIcon size={14} strokeWidth={3} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Unassigned
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            <button
                                                                onClick={() => openAssignModal(u)}
                                                                className="px-3 py-1.5 bg-white/5 hover:bg-blue-600 hover:text-white text-gray-400 rounded-lg font-bold text-xs transition-all inline-flex items-center gap-1.5 border border-white/5 group-hover:border-transparent"
                                                            >
                                                                <Edit2 size={12} /> Assign
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Flow Control */}
                    <div className="bg-auction-surface p-8 rounded-3xl border border-white/5 space-y-6">
                        <h3 className="font-bold text-white border-b border-white/5 pb-4 flex items-center gap-3 text-lg"><Trophy size={20} className="text-auction-secondary" /> Auction Flow</h3>

                        <button onClick={handleNextPlayer} className="w-full py-5 rounded-2xl font-bold flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-500 hover:to-blue-600 shadow-xl shadow-blue-900/20 transition-all hover:scale-[1.02] active:scale-[0.98] text-lg border border-white/10">
                            <Play size={24} fill="currentColor" /> Start Next Round
                        </button>

                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={handleStart} className="py-4 bg-green-500/10 text-green-400 border border-green-500/20 rounded-2xl font-bold hover:bg-green-500/20 transition-all">RESUME Timer</button>
                            <button onClick={handlePause} className="py-4 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-2xl font-bold hover:bg-amber-500/20 transition-all">PAUSE Timer</button>
                        </div>

                        <button onClick={handleResetTimer} className="w-full py-3 bg-white/5 text-gray-400 rounded-xl font-medium hover:bg-white/10 hover:text-white text-xs flex items-center justify-center gap-2 transition-colors">
                            <RotateCcw size={14} /> Reset Timer to 30s
                        </button>
                    </div>

                </div>

                {/* COL 3: Sidebar Tools */}
                <div className="space-y-6">
                    {/* Manual Decisions */}
                    <div className="bg-auction-surface p-6 rounded-3xl border border-white/5 space-y-4">
                        <h3 className="font-bold text-white border-b border-white/5 pb-2 text-xs uppercase tracking-widest text-gray-500">Manual Override</h3>

                        <button onClick={handleMarkUnsold} className="w-full py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-bold hover:bg-red-500/20 mb-2 text-sm transition-all">
                            Mark UNSOLD
                        </button>

                        <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-2">Force Sell To:</label>
                            <select
                                className="w-full p-3 mb-2 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-auction-secondary/50"
                                value={sellTeamId}
                                onChange={e => setSellTeamId(e.target.value)}
                            >
                                <option value="" className="bg-gray-900">Select Team...</option>
                                {teams.map(t => <option key={t.id} value={t.id} className="bg-gray-900">{t.name}</option>)}
                            </select>
                            <input
                                type="number"
                                placeholder="Amount (Cr)"
                                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl mb-3 text-sm font-bold text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-auction-secondary/50"
                                value={sellAmount}
                                onChange={e => setSellAmount(e.target.value)}
                            />
                            <button onClick={() => handleMarkSold(sellTeamId, sellAmount)} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 text-sm shadow-lg shadow-purple-900/20 transition-all">
                                Confirm Sale
                            </button>
                        </div>
                    </div>

                    {/* Queue Management */}
                    <div className="bg-auction-surface p-6 rounded-3xl border border-white/5 space-y-4">
                        <h3 className="font-bold text-white border-b border-white/5 pb-2 text-xs uppercase tracking-widest text-gray-500">System Controls</h3>
                        
                        <div className="space-y-3">
                            <button 
                                onClick={handleManualSync} 
                                disabled={isSyncing}
                                className={cn(
                                    "w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-sm transition-all border",
                                    isSyncing ? "bg-white/5 text-gray-500 cursor-not-allowed border-white/5" : "bg-blue-600/10 text-blue-400 border-blue-500/20 hover:bg-blue-600/20"
                                )}
                            >
                                <RotateCcw size={16} className={isSyncing ? "animate-spin" : ""} />
                                {isSyncing ? 'Syncing...' : 'Force Start Points Sync'}
                            </button>
                            
                            {syncStatus && (
                                <div className={cn(
                                    "p-3 rounded-xl text-[10px] font-bold text-center animate-in fade-in zoom-in-95 mt-3",
                                    syncStatus.success ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                                )}>
                                    {syncStatus.message}
                                </div>
                            )}
                        </div>

                    </div>

                    {/* NEW: Points Data Tools */}
                    <div className="bg-auction-surface p-6 rounded-3xl border border-white/5 space-y-4">
                        <h3 className="font-bold text-white border-b border-white/5 pb-2 text-xs uppercase tracking-widest text-gray-500">Points & Sync Tools</h3>

                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Targeted Match Sync</label>
                            <select
                                className="w-full p-3 mb-2 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-auction-secondary/50"
                                value={selectedManualMatchId}
                                onChange={e => setSelectedManualMatchId(e.target.value)}
                            >
                                <option value="" className="bg-gray-900">Select Match ID...</option>
                                {fantasyMatches.map(m => (
                                    <option key={m._id} value={m.matchId} className="bg-gray-900">{m.matchId} - {m.matchName}</option>
                                ))}
                            </select>

                            <button 
                                onClick={handleTargetedSync} 
                                disabled={isManualTargetSync || !selectedManualMatchId}
                                className={cn(
                                    "w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-sm transition-all border",
                                    isManualTargetSync ? "bg-white/5 text-gray-500 cursor-not-allowed border-white/5" : "bg-purple-600/10 text-purple-400 border-purple-500/20 hover:bg-purple-600/20 hover:text-white"
                                )}
                            >
                                <RotateCcw size={16} className={isManualTargetSync ? "animate-spin" : ""} />
                                {isManualTargetSync ? 'Syncing...' : 'Sync Selected Match'}
                            </button>

                            <button 
                                onClick={handleSumPoints} 
                                disabled={isSummingPoints}
                                className={cn(
                                    "w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-sm transition-all border mt-4",
                                    isSummingPoints ? "bg-white/5 text-gray-500 cursor-not-allowed border-white/5" : "bg-teal-500/10 text-teal-400 border-teal-500/20 hover:bg-teal-500/20 hover:text-white"
                                )}
                            >
                                <Users size={16} className={isSummingPoints ? "animate-bounce" : ""} />
                                {isSummingPoints ? 'Aggregating...' : 'Overwrite All Points with Sum'}
                            </button>
                        </div>

                        <div className="pt-2 border-t border-white/5 mt-4">
                             <button onClick={() => setShowUnsoldModal(true)} className="w-full py-4 bg-white/5 text-gray-300 border-2 border-dashed border-white/10 rounded-xl font-bold hover:border-white/30 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-all">
                                <RotateCcw size={16} /> Manage Unsold ({unsoldPlayers.length})
                            </button>
                        </div>

                        <div className="mt-4 flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                            <span>Socket Status</span>
                            <span className={socket ? "text-green-500" : "text-red-500"}>{socket ? 'Connected' : 'Offline'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- MODALS --- */}

            {/* 1. UNSOLD MODAL */}
            {showUnsoldModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h2 className="text-xl font-bold text-gray-900">Unsold Players Queue</h2>
                            <button onClick={() => setShowUnsoldModal(false)} className="p-2 hover:bg-gray-200 rounded-full"><XIcon size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-3">
                            {unsoldLoading ? <p className="text-center text-gray-400">Loading...</p> : unsoldPlayers.length === 0 ? <p className="text-center py-10 text-gray-400 italic">Queue is empty.</p> : unsoldPlayers.map(p => (
                                <div key={p._id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-blue-200 transition-colors">
                                    <div>
                                        <p className="font-bold text-gray-900">#{p.srNo} {p.name}</p>
                                        <p className="text-xs text-gray-500">{p.role} • {toCr(p.basePrice)} Cr</p>
                                    </div>
                                    <button onClick={() => handleBringBack(p._id)} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-bold text-xs hover:bg-blue-100 border border-blue-100">
                                        Re-Auction
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 2. ASSIGN TEAM MODAL (NEW) */}
            {assignModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-6xl h-full max-h-[90vh] flex flex-col relative">
                        {/* Header */}
                        <div className="absolute top-4 left-0 right-0 z-50 flex justify-between items-center px-8 pointer-events-none">
                            <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 pointer-events-auto shadow-2xl">
                                <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mr-2">Assigning To</span>
                                <span className="text-white font-black text-xl">{userToAssign?.username}</span>
                            </div>
                            <button
                                onClick={() => setAssignModalOpen(false)}
                                className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-red-500/80 transition-colors pointer-events-auto border border-white/20"
                            >
                                <XIcon size={24} />
                            </button>
                        </div>

                        {/* Team Selector Content */}
                        <div className="flex-1 flex items-center justify-center">
                            <TeamSelector
                                teams={teamsForAssignment}
                                selectedTeam={selectedTeamForAssign}
                                onSelect={setSelectedTeamForAssign}
                            />
                        </div>

                        {/* Footer Controls */}
                        {selectedTeamForAssign && (
                            <div className="absolute bottom-8 left-0 right-0 flex justify-center z-50 pointer-events-none animate-in slide-in-from-bottom-6">
                                <div className="bg-white p-3 pr-4 rounded-full shadow-2xl flex items-center gap-4 pointer-events-auto">
                                    <div className="flex items-center gap-3 pl-2">
                                        <div className="w-10 h-10 rounded-full bg-gray-100 p-1">
                                            {selectedTeamForAssign.logo ? <img src={selectedTeamForAssign.logo} className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400">{selectedTeamForAssign.code}</div>}
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase font-bold text-gray-400">Selected</div>
                                            <div className="font-bold text-gray-900 leading-tight">{selectedTeamForAssign.name}</div>
                                        </div>
                                    </div>
                                    <div className="h-8 w-px bg-gray-200"></div>
                                    <button
                                        onClick={handleConfirmAssign}
                                        disabled={assignLoading}
                                        className="h-10 px-6 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold flex items-center gap-2 transition-transform hover:scale-105"
                                    >
                                        {assignLoading ? 'Assigning...' : 'Confirm'} <Check size={18} strokeWidth={3} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

export default AdminPage;
