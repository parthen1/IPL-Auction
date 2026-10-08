import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { getTeams } from '../services/api'; // Legacy fallback
import { TEAM_COLORS } from '../constants/teamColors';
import { toCr, formatCurrency } from '../utils/formatCurrency';
import { Users, Trophy, Wallet, Plane, X, ChevronRight, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { PLAYER_SETS } from '../constants/playerSets'; // Optional if needed for categories

import { API_BASE_URL as API_URL } from '../config';


const TeamsPage = () => {
    const { socket } = useSocket();
    const { user } = useAuth();
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const scrollRef = useRef(null);

    // Fetch Logic
    useEffect(() => {
        const fetchTeams = async () => {
            try {
                let data = [];
                // V2: Check if user is in a tournament
                const tournamentId = user?.tournamentId;
                const token = localStorage.getItem('token');

                if (tournamentId && token) {
                    const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/teams`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const resData = await res.json();
                    data = resData.teams || [];
                } else {
                    // Legacy Fallback
                    data = await getTeams();
                }

                setTeams(data);

                // Default Selection: Logged In User's Team
                if (user?.code) {
                    const myTeam = data.find(t => t.id === user.code || t.code === user.code);
                    if (myTeam) setSelectedTeam(myTeam);
                    else if (data.length > 0) setSelectedTeam(data[0]);
                } else if (data.length > 0) {
                    setSelectedTeam(data[0]);
                }

                setLoading(false);
            } catch (err) {
                console.error("Failed to fetch teams", err);
                setLoading(false);
            }
        };
        fetchTeams();

        // Socket Logic (Keep consistent with previous implementation)
        if (socket) {
            const handleUpdate = (state) => {
                if (state.teams) {
                    setTeams(prev => {
                        return state.teams.map(t => {
                            const existing = prev.find(p => p.id === t.id) || {};
                            return {
                                ...existing,
                                ...t,
                                // Preserve squad data from initial fetch — socket payload doesn't include populated players
                                playersBought: existing.playersBought || t.playersBought,
                                playing11: existing.playing11 || t.playing11,
                                budget: t.remainingPurse || t.budget,
                                ownerUsername: t.ownerUsername || existing.ownerUsername
                            };
                        });
                    });

                    // Also update selectedTeam if it exists to reflect changes live
                    setSelectedTeam(prev => {
                        if (!prev) return null;
                        const updated = state.teams.find(t => t.id === prev.id || t.code === prev.code);
                        if (updated) {
                            return {
                                ...prev,
                                ...updated,
                                budget: updated.remainingPurse || updated.budget,
                                ownerUsername: updated.ownerUsername || prev.ownerUsername
                            };
                        }
                        return prev;
                    });
                }
            };

            const handleTeamUpdate = (update) => {
                setTeams(prev => prev.map(t => {
                    if (t.id === update.teamCode || t.code === update.teamCode) {
                        return {
                            ...t,
                            budget: update.remainingPurse,
                            squadSize: update.squadSize,
                            overseasCount: update.overseasCount,
                            totalSpent: update.totalSpent,
                            // playersBought needs to be updated too? 
                            // Ideally socket sends full updated team or we trigger refetch. 
                            // For complex detailed view, refetching players might be safer or ensuring update payload has them.
                            // Assuming update has minimal info, we might need to rely on 'auction:state' for players list.
                        };
                    }
                    return t;
                }));
            };

            socket.on('auction:state', handleUpdate);
            socket.on('auction:sync', handleUpdate);

            // New Listener for Real-time Ownership
            const handleTeamTaken = (data) => {
                setTeams(prev => prev.map(t => {
                    if (t.id === data.teamCode.toLowerCase() || t.code === data.teamCode.toUpperCase()) {
                        return { ...t, isTaken: true, ownerUsername: data.ownerUsername };
                    }
                    return t;
                }));
                // Also update selected if needed
                setSelectedTeam(prev => {
                    if (prev && (prev.id === data.teamCode.toLowerCase() || prev.code === data.teamCode.toUpperCase())) {
                        return { ...prev, isTaken: true, ownerUsername: data.ownerUsername };
                    }
                    return prev;
                });
            };
            socket.on('tournament:team_taken', handleTeamTaken);

            // socket.on('team:update', handleTeamUpdate); // 'auction:state' is often more complete for players

            socket.emit('auction:request_sync');

            return () => {
                socket.off('auction:state', handleUpdate);
                socket.off('auction:sync', handleUpdate);
                socket.off('tournament:team_taken', handleTeamTaken);
                // socket.off('team:update', handleTeamUpdate);
            };
        }
    }, [socket, user]);

    // Fetch squad (playersBought) whenever selected team changes
    // The /teams endpoint deliberately omits populated players for speed;
    // this separate fetch loads them on demand per selected team.
    useEffect(() => {
        if (!selectedTeam) return;
        const tournamentId = user?.tournamentId;
        const token = localStorage.getItem('token');
        if (!tournamentId || !token) return;

        const teamCode = selectedTeam.id || selectedTeam.code;
        if (!teamCode) return;

        // Only fetch if playersBought is not yet populated (avoid double-fetching)
        if (selectedTeam.playersBought && selectedTeam.playersBought.length > 0 && typeof selectedTeam.playersBought[0] === 'object') return;

        const fetchSquad = async () => {
            try {
                const res = await fetch(
                    `${API_URL}/api/v2/auth/tournaments/${tournamentId}/teams/${teamCode}/squad`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!res.ok) return;
                const data = await res.json();
                // Merge populated players into selectedTeam
                setSelectedTeam(prev => {
                    if (!prev) return prev;
                    const id = prev.id || prev.code;
                    if (id?.toLowerCase() !== teamCode?.toLowerCase()) return prev; // stale
                    return { ...prev, playersBought: data.players || [] };
                });
            } catch (e) {
                console.error('Failed to fetch squad for team:', teamCode, e);
            }
        };
        fetchSquad();
    }, [selectedTeam?.id, selectedTeam?.code, user?.tournamentId]);

    // Group Players Logic
    const getGroupedPlayers = (players) => {
        if (!players) return { Batsman: [], Bowler: [], 'All Rounder': [], 'Wicket Keeper': [] };

        const groups = {
            Batsman: [],
            Bowler: [],
            'All Rounder': [],
            'Wicket Keeper': []
        };

        players.forEach(p => {
            // Normalize role
            let role = p.role;
            if (role === 'Wicketkeeper') role = 'Wicket Keeper';
            if (role === 'All-Rounder') role = 'All Rounder';

            if (groups[role]) {
                groups[role].push(p);
            } else {
                // Fallback
                if (!groups['Others']) groups['Others'] = [];
                groups['Others'].push(p);
            }
        });
        return groups;
    };

    if (loading) return <div className="p-10 text-center text-gray-400 font-bold animate-pulse">Loading Teams...</div>;

    const groupedPlayers = selectedTeam ? getGroupedPlayers(selectedTeam.playersBought) : {};

    // Horizontal Scroll Helper
    const scroll = (direction) => {
        if (scrollRef.current) {
            const { current } = scrollRef;
            const scrollAmount = 200;
            if (direction === 'left') {
                current.scrollLeft -= scrollAmount;
            } else {
                current.scrollLeft += scrollAmount;
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50/50 pb-10 overflow-hidden">
            {/* Top: Horizontal Team List */}
            <div className="flex-none p-3 md:p-6 bg-white border-b border-gray-200 shadow-sm z-10 relative">
                <div className="flex items-center justify-between mb-3 px-2">
                    <h2 className="text-lg md:text-xl font-black text-gray-900">All Teams</h2>
                </div>

                <div className="relative group/nav">
                    {/* Arrows */}
                    <button onClick={() => scroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-8 h-8 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center text-gray-500 hover:text-blue-600 opacity-0 group-hover/nav:opacity-100 transition-opacity">
                        <ChevronRight size={18} className="rotate-180" />
                    </button>
                    <button onClick={() => scroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-8 h-8 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center text-gray-500 hover:text-blue-600 opacity-0 group-hover/nav:opacity-100 transition-opacity">
                        <ChevronRight size={18} />
                    </button>

                    <div ref={scrollRef} className="flex gap-4 overflow-x-auto scrollbar-hide snap-x p-2">
                        {teams.map(team => {
                            const isSelected = selectedTeam?.id === team.id;
                            return (
                                <button
                                    key={team.id}
                                    onClick={() => setSelectedTeam(team)}
                                    className={cn(
                                        "flex-shrink-0 flex flex-col items-center gap-3 w-28 p-3 rounded-2xl transition-all duration-300 snap-start border",
                                        isSelected
                                            ? "bg-blue-50 border-blue-200 scale-105 shadow-md"
                                            : "bg-gray-50 border-transparent hover:bg-gray-100 hover:scale-105"
                                    )}
                                >
                                    <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-gray-200 p-1 overflow-hidden">
                                        {team.logo ? (
                                            <img src={team.logo} alt={team.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 bg-gray-100 rounded-full">
                                                {team.code?.[0]}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <div className="font-bold text-xs text-gray-800 line-clamp-1">{team.name}</div>
                                        {team.ownerUsername && (
                                            <div className="text-[10px] text-gray-500 font-medium truncate w-full px-1">@{team.ownerUsername}</div>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Selected Team Detail */}
            {selectedTeam ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div className="max-w-5xl mx-auto">
                        {/* Premium Wide Card */}
                        <div className="bg-white rounded-3xl p-5 md:p-8 shadow-xl border border-gray-100 relative overflow-hidden flex flex-col md:flex-row items-center gap-5 md:gap-10">

                            {/* Decorative Ambience */}
                            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full translate-x-1/3 -translate-y-1/3 opacity-50 pointer-events-none"></div>

                            {/* Left: Logo */}
                            <div className="w-32 h-32 md:w-40 md:h-40 flex-shrink-0 bg-white rounded-2xl shadow-lg border border-gray-100 p-4 flex items-center justify-center relative z-10">
                                {selectedTeam.logo ? (
                                    <img src={selectedTeam.logo} alt={selectedTeam.name} className="w-full h-full object-contain" />
                                ) : (
                                    <div className="text-4xl font-black text-gray-200">{selectedTeam.code}</div>
                                )}
                            </div>

                            {/* Center: Info */}
                            <div className="flex-1 text-center md:text-left relative z-10">
                                <h1 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tight leading-tight mb-3">
                                    {selectedTeam.name}
                                </h1>

                                <div className="flex items-center justify-center md:justify-start gap-4 mb-6">
                                    {selectedTeam.ownerUsername ? (
                                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full font-bold text-sm shadow-lg">
                                            <User size={16} className="text-blue-400" />
                                            <span>@{selectedTeam.ownerUsername}</span>
                                        </div>
                                    ) : (
                                        <div className="px-4 py-2 bg-gray-100 text-gray-500 rounded-full font-bold text-xs uppercase tracking-wider">
                                            No Owner
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right: Stats Grid */}
                            <div className="grid grid-cols-2 gap-3 w-full md:w-auto relative z-10">
                                {/* Purse */}
                                <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                                    <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Purse Left</div>
                                    <div className="text-xl font-black text-gray-900">
                                        {formatCurrency(selectedTeam.budget)}
                                    </div>
                                </div>

                                {/* Squad */}
                                <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                                    <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Squad Size</div>
                                    <div className="text-xl font-black text-gray-900">
                                        {selectedTeam.squadSize}<span className="text-sm font-bold text-gray-300">/25</span>
                                    </div>
                                </div>

                                {/* Overseas */}
                                <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                                    <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Overseas</div>
                                    <div className="text-xl font-black text-gray-900">
                                        {selectedTeam.overseasCount}<span className="text-sm font-bold text-gray-300">/8</span>
                                    </div>
                                </div>

                                {/* Spent */}
                                <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                                    <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Spent</div>
                                    <div className="text-xl font-black text-gray-900">
                                        {formatCurrency(selectedTeam.totalSpent)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Player Categories Below */}
                        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                            {['Batsman', 'Wicket Keeper', 'All Rounder', 'Bowler'].map(category => {
                                const players = groupedPlayers[category] || [];
                                return (
                                    <div key={category} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex flex-col h-full">
                                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-50">
                                            <h3 className="font-bold text-gray-800">{category}</h3>
                                            <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2 py-1 rounded-full">{players.length}</span>
                                        </div>

                                        {players.length === 0 ? (
                                            <div className="flex-1 flex items-center justify-center p-6 text-gray-300 text-sm font-medium italic border-2 border-dashed border-gray-100 rounded-2xl">
                                                Empty Slot
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {players.map(p => (
                                                    <div key={p.id} className="flex items-center gap-3 group">
                                                        <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 overflow-hidden flex-shrink-0">
                                                            {p.image ? (
                                                                <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-gray-300"><User size={16} /></div>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-bold text-sm text-gray-900 truncate flex items-center gap-1">
                                                                {p.name}
                                                                {p.isOverseas && <Plane size={10} className="text-blue-500 fill-current" />}
                                                            </div>
                                                            <div className="text-xs font-mono font-medium text-gray-400">₹{toCr(p.soldPrice)} Cr</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                    <Trophy size={48} className="mb-4 opacity-20" />
                    <p className="font-bold text-lg">Select a team to view details</p>
                </div>
            )}
        </div>
    );
};

export default TeamsPage;
