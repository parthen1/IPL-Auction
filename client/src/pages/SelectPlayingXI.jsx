import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL as API_URL } from '../config';
import { Shield, Check, AlertCircle, X, User, Plane, AlertTriangle, Lock, Edit2, ChevronDown, Users, Star, Info, Activity, Trophy } from 'lucide-react';
import { cn } from '../lib/utils';
import LiveScoreboardHub from '../components/LiveScoreboardHub';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';

const POINT_FILTERS = [
    { key: 'total', label: 'Total Points', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    { key: 'batting', label: 'Batting Points', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { key: 'bowling', label: 'Bowling Points', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { key: 'fielding', label: 'Fielding Points', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
];

const getPlayerPoints = (player, filterKey, scoring) => {
    if (!player) return 0;

    // Check if we have a server-side week-specific breakdown for this player
    if (scoring && scoring.playerWeekPoints && scoring.playerWeekPoints[player._id]) {
        const weekPts = scoring.playerWeekPoints[player._id];
        switch (filterKey) {
            case 'batting': return weekPts.batting ?? 0;
            case 'bowling': return weekPts.bowling ?? 0;
            case 'fielding': return weekPts.fielding ?? 0;
            default: return weekPts.total ?? 0;
        }
    }

    // Fallback to legacy/overall player.points if no week-specific data (unlikely in Auction)
    const pts = player.points || {};
    switch (filterKey) {
        case 'batting': return pts.batting ?? 0;
        case 'bowling': return pts.bowling ?? 0;
        case 'fielding': return pts.fielding ?? 0;
        default: return (typeof pts === 'number') ? pts : (pts.total ?? 0);
    }
};

const getBattingGroupLabel = (groups) => {
    if (!Array.isArray(groups)) return "Any";
    // Exact match for Tail-only
    if (groups.length === 1 && groups[0] === 4) return "Tail";
    // Exact match for Opener-only
    if (groups.length === 1 && groups[0] === 1) return "Opener";
    // Complex combinations
    if (groups.includes(1) && groups.includes(2)) return "Any";
    if (groups.includes(2) && groups.includes(4)) return "Middle/Lower Order";
    if (groups.includes(3) && groups.includes(4)) return "Lower Order/Tail";
    return "Any";
};

const getRequiredGroupForPos = (pos) => {
    if (pos <= 2) return [1];
    if (pos <= 8) return [2, 3, 4];
    if (pos <= 11) return [4];
    return [];
};

const decodeJwtPayload = (token) => {
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;

        let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

        // Add required padding
        while (base64.length % 4) {
            base64 += '=';
        }

        return JSON.parse(atob(base64));
    } catch (err) {
        console.error('Invalid token', err);
        return null;
    }
};

const SelectPlayingXI = () => {
    const { user, token } = useAuth(); // User object might contain username, not tournament-team info directly
    const [myTeamCode, setMyTeamCode] = useState(null);
    const [selectedTeam, setSelectedTeam] = useState(null); // The team code we are viewing
    const [allTeams, setAllTeams] = useState([]); // For Dropdown
    const [pointsFilter, setPointsFilter] = useState('total'); // 'total' | 'batting' | 'bowling' | 'fielding'
    const [showPointsDropdown, setShowPointsDropdown] = useState(false);
    const activeFilter = POINT_FILTERS.find(f => f.key === pointsFilter);

    const { socket } = useSocket();
    const [activeLiveTeams, setActiveLiveTeams] = useState([]);

    // Data State
    const [squad, setSquad] = useState([]);
    const [playing11, setPlaying11] = useState([]); // Read-only Array
    const [captain, setCaptain] = useState(null); // ID of captain
    const [viceCaptain, setViceCaptain] = useState(null); // ID of vice-captain
    const [scoring, setScoring] = useState(null); // NEW: Official server-side totals
    const [expandedPlayerId, setExpandedPlayerId] = useState(null); // Which player's breakdown is open

    const [capHolders, setCapHolders] = useState({ orange: null, purple: null });

    useEffect(() => {
        const fetchCaps = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/fantasy/stats/caps`);
                setCapHolders(res.data.holders);
            } catch (err) {
                console.error('Failed to fetch cap holders:', err);
            }
        };
        fetchCaps();
    }, []);

    // Edit Mode State
    const [isEditMode, setIsEditMode] = useState(false);
    const [showCaptainModal, setShowCaptainModal] = useState(false);
    const [tempCaptain, setTempCaptain] = useState(null);
    const [tempViceCaptain, setTempViceCaptain] = useState(null);
    const [slots, setSlots] = useState(
        Array.from({ length: 11 }, (_, i) => i + 1).reduce((acc, pos) => ({ ...acc, [pos]: null }), {})
    );

    // Feature Lock & Drag-and-Drop State
    const [isLocked, setIsLocked] = useState(false);
    const [isCaptaincyLocked, setIsCaptaincyLocked] = useState(false);
    const [draggedPlayer, setDraggedPlayer] = useState(null);
    const [dragSourcePos, setDragSourcePos] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    // 1. Initial Load: Get My Team Code & All Teams List
    useEffect(() => {
        const init = async () => {
            const localToken = localStorage.getItem('token');
            if (!localToken) return;

            try {
                const payload = decodeJwtPayload(localToken);
                if (!payload) {
                    window.location.href = '/email-login';
                    return;
                }
                const tournamentId = payload.tournamentId;
                if (!tournamentId) {
                    setError("No active tournament session.");
                    setLoading(false);
                    return;
                }
                const fbToken = localStorage.getItem('token');

                // Get All Teams
                const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/teams`, {
                    headers: { 'Authorization': `Bearer ${fbToken || localToken}` }
                });
                const data = await res.json();

                if (res.ok) {
                    setAllTeams(data.teams);
                    // Determine My Team
                    if (data.myTeamCode) {
                        const myTeam = data.myTeamCode.toLowerCase();
                        setMyTeamCode(myTeam);
                        setSelectedTeam(myTeam); // Default to viewing my team
                    } else if (data.teams.length > 0) {
                        setSelectedTeam(data.teams[0].id.toLowerCase()); // Default to first if I have no team
                    }
                }
            } catch (e) {
                console.error("Init Error", e);
                setError("Failed to load tournament data");
            }
        };
        init();
    }, []);

    // 1.5 Fetch Live Status for Badges
    const fetchLiveStatus = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/fantasy/live-status`);
            if (res.data && res.data.isLive && res.data.summaries?.length > 0) {
                // Collect all active teams from live summaries
                const teams = [];
                res.data.summaries.forEach(s => {
                    const t1 = s.battingTeam?.substring(0,3).toUpperCase();
                    const t2 = s.bowlingTeam?.substring(0,3).toUpperCase();
                    if (t1) teams.push(t1);
                    if (t2) teams.push(t2);
                });
                setActiveLiveTeams(teams);
            } else {
                setActiveLiveTeams([]);
            }
        } catch (e) {
            console.error("Failed to fetch live status for badges", e);
        }
    };

    useEffect(() => {
        fetchLiveStatus();
    }, []);

    // 2. Fetch Squad Data when Selected Team Changes
    useEffect(() => {
        const fetchSquad = async (isAutoRefresh = false) => {
            if (!selectedTeam) return;
            setLoading(true);
            setError('');
            const localToken = localStorage.getItem('token');
            if (!localToken) return;

            try {
                const payload = decodeJwtPayload(localToken);
                if (!payload) {
                    window.location.href = '/email-login';
                    return;
                }
                const tournamentId = payload.tournamentId;
                if (!tournamentId) return;
                const fbToken = localStorage.getItem('token');

                // Use the Public Endpoint for consistency
                const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/teams/${selectedTeam}/squad`, {
                    headers: { 'Authorization': `Bearer ${fbToken || localToken}` }
                });

                const data = await res.json();
                if (res.ok) {
                    setSquad(data.players || []);
                    setPlaying11(data.playing11 || []);
                    setCaptain(data.captain || null);
                    setViceCaptain(data.viceCaptain || null);
                    setIsLocked(data.isPlayingXILocked || false);
                    setIsCaptaincyLocked(data.isCaptaincyLocked || false);
                    setScoring(data.scoring || null); // NEW: Official totals

                    // If switching to My Team and I have saved data, View Mode.
                    // If no saved data, maybe Auto-Edit? No, stick to View -> Edit.

                    // Sync Slots for Edit Mode if it's my team (only on initial load or manual switch, NOT auto-refresh)
                    if (!isAutoRefresh) {
                        if (selectedTeam === myTeamCode && data.playing11 && data.playing11.length > 0) {
                            const newSlots = Array.from({ length: 11 }, (_, i) => i + 1).reduce((acc, pos) => ({ ...acc, [pos]: null }), {});
                            data.playing11.forEach((p, idx) => {
                                if (idx < 11) newSlots[idx + 1] = p;
                            });
                            setSlots(newSlots);
                        } else if (selectedTeam === myTeamCode) {
                            // Reset if empty
                            setSlots(Array.from({ length: 11 }, (_, i) => i + 1).reduce((acc, pos) => ({ ...acc, [pos]: null }), {}));
                        }

                        setIsEditMode(false); // Always reset to View Mode on manual switch
                    }
                } else {
                    setError('Failed to load team data.');
                }
            } catch (e) {
                console.error(e);
                setError('Error loading squad.');
            } finally {
                setLoading(false);
            }
        };

        fetchSquad(false); // Initial load or manual switch
        
        // Setup Socket Listener for Real-Time Points Refresh
        if (socket) {
            const handleMatchUpdate = () => {
                fetchSquad(true);
                fetchLiveStatus();
            };
            socket.on('fantasy:match_summaries_update', handleMatchUpdate);
            return () => socket.off('fantasy:match_summaries_update', handleMatchUpdate);
        } else {
            // Fallback to 60s poll if socket is down
            const interval = setInterval(() => fetchSquad(true), 60000);
            return () => clearInterval(interval);
        }
    }, [selectedTeam, myTeamCode, socket]);


    // --- EDIT MODE LOGIC ---
    const getSquadStats = () => {
        const assigned = Object.values(slots).filter(p => p !== null);
        const overseas = assigned.filter(p => p.isOverseas).length;
        const wks = assigned.filter(p => p.role === 'Wicket Keeper').length;
        const bowlers = assigned.filter(p => p.role === 'Bowler' || p.role === 'All-Rounder').length;

        return {
            count: assigned.length,
            overseas,
            wks,
            bowlers,
            isValid: assigned.length === 11 && overseas <= 4 && wks >= 1 && bowlers >= 5
        };
    };
    const stats = isEditMode ? getSquadStats() : null; // Only calculate if in edit mode

    const handleAssign = (player) => {
        const emptyPos = Object.keys(slots).find(pos => slots[pos] === null);
        if (!emptyPos) { setError("All slots full!"); setTimeout(() => setError(''), 2000); return; }
        assignToSlot(player, parseInt(emptyPos));
    };

    const assignToSlot = (player, pos) => {
        const reqGroups = getRequiredGroupForPos(pos);
        if (player.battingPositionGroup && reqGroups.length > 0 && !reqGroups.includes(player.battingPositionGroup)) {
            setError(`Invalid Position: Requires ${getBattingGroupLabel(reqGroups)}`);
            setTimeout(() => setError(''), 2000);
            return;
        }
        setSlots(prev => ({ ...prev, [pos]: player }));
        setError('');
    };

    const handleRemove = (pos) => setSlots(prev => ({ ...prev, [pos]: null }));

    // --- DRAG AND DROP HANDLERS ---
    const handleDragStart = (e, player, sourcePos = null) => {
        setDraggedPlayer(player);
        setDragSourcePos(sourcePos);
        // Required for Firefox
        if (e.dataTransfer) {
            e.dataTransfer.setData('text/plain', player._id);
            e.dataTransfer.effectAllowed = 'move';
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // allow drop
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, targetPos) => {
        e.preventDefault();
        if (!draggedPlayer) return;

        // Perform validation against the new slot
        const reqGroups = getRequiredGroupForPos(targetPos);
        if (draggedPlayer.battingPositionGroup && reqGroups.length > 0 && !reqGroups.includes(draggedPlayer.battingPositionGroup)) {
            setError(`Invalid Position: Requires ${getBattingGroupLabel(reqGroups)}`);
            setTimeout(() => setError(''), 2000);
            setDraggedPlayer(null);
            setDragSourcePos(null);
            return;
        }

        const existingPlayerAtTarget = slots[targetPos];

        // 🚫 NEW: Prevent dropping overwrites onto locked executives
        if (isCaptaincyLocked && existingPlayerAtTarget && (existingPlayerAtTarget._id === captain || existingPlayerAtTarget._id === viceCaptain)) {
            setError(`Cannot replace locked Captain/Vice-Captain`);
            setTimeout(() => setError(''), 2000);
            setDraggedPlayer(null);
            setDragSourcePos(null);
            return;
        }

        setSlots(prev => {
            const newSlots = { ...prev };
            const existingPlayerAtTarget = newSlots[targetPos];

            // If dragging from another slot and dropping here
            if (dragSourcePos !== null) {
                // If there was someone already here, swap them if valid
                if (existingPlayerAtTarget) {
                    const sourceReqGroups = getRequiredGroupForPos(dragSourcePos);
                    // Check if existing player is allowed in the original slot
                    if (existingPlayerAtTarget.battingPositionGroup && sourceReqGroups.length > 0 && !sourceReqGroups.includes(existingPlayerAtTarget.battingPositionGroup)) {
                        setError(`Cannot swap: ${existingPlayerAtTarget.name} cannot bat at position ${dragSourcePos}`);
                        setTimeout(() => setError(''), 2000);
                        return prev; // abort
                    }
                    newSlots[dragSourcePos] = existingPlayerAtTarget;
                } else {
                    newSlots[dragSourcePos] = null; // Blank the old slot
                }
            }

            // Assign dragged player to target slot
            newSlots[targetPos] = draggedPlayer;
            return newSlots;
        });

        setError('');
        setDraggedPlayer(null);
        setDragSourcePos(null);
    };

    const handleProceedToCaptainModal = () => {
        if (!stats.isValid) {
            setError("Cannot save: Squad rules validation failed.");
            setTimeout(() => setError(''), 3000);
            return;
        }

        // 🚫 NEW: If Captaincy is locked, bypass the popup entirely and just save existing C and VC.
        if (isCaptaincyLocked) {
            setTempCaptain(captain);
            setTempViceCaptain(viceCaptain);
            // Must delay slightly as state might not reflect immediately for handleSaveFinal
            setTimeout(() => {
                handleSaveFinalOverwrite(captain, viceCaptain);
            }, 0);
            return;
        }

        // pre-fill with existing if re-editing and they are in the current slots
        const assignedIds = Object.values(slots).map(p => p?._id);
        setTempCaptain(assignedIds.includes(captain) ? captain : null);
        setTempViceCaptain(assignedIds.includes(viceCaptain) ? viceCaptain : null);
        setShowCaptainModal(true);
    };

    const handleSaveFinalOverwrite = async (forcedC, forcedVC) => {
        setSaving(true);
        const fbToken = localStorage.getItem('token');
        const localToken = localStorage.getItem('token');
        try {
            const payload = decodeJwtPayload(localToken);
            if (!payload) {
                window.location.href = '/email-login';
                return;
            }
            const tournamentId = payload.tournamentId;
            if (!tournamentId) throw new Error("Missing Tournament ID");
            const payloadData = {
                players: Object.keys(slots).map(pos => ({ playerId: slots[pos]._id, battingPosition: parseInt(pos) })),
                captainId: forcedC,
                viceCaptainId: forcedVC
            };

            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/playing11`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${fbToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadData)
            });

            if (res.ok) {
                setMsg('Saved Successfully!');
                // Refresh Data to View Mode
                const data = await res.json();
                // Reconstruct full player objects from local slots instead of using API provided string IDs
                const updatedPlayingXI = Object.values(slots).filter(p => p !== null);
                setPlaying11(updatedPlayingXI);
                setCaptain(data.captain);
                setViceCaptain(data.viceCaptain);
                setIsEditMode(false);
                setShowCaptainModal(false);
                setTimeout(() => setMsg(''), 3000);
            } else {
                const data = await res.json();
                setError(data.message || 'Save failed');
                setTimeout(() => setError(''), 3000);
            }
        } catch (e) {
            setError('Network error');
            setTimeout(() => setError(''), 3000);
        }
        finally { setSaving(false); }
    };

    const handleSaveFinal = async () => {
        if (!tempCaptain || !tempViceCaptain) {
            setError("Must select both Captain and Vice-Captain.");
            setTimeout(() => setError(''), 3000);
            return;
        }
        if (tempCaptain === tempViceCaptain) {
            setError("Captain and Vice-Captain cannot be the same player.");
            setTimeout(() => setError(''), 3000);
            return;
        }
        setSaving(true);
        const fbToken = localStorage.getItem('token');
        const localToken = localStorage.getItem('token');
        try {
            const payload = decodeJwtPayload(localToken);
            if (!payload) {
                window.location.href = '/email-login';
                return;
            }
            const tournamentId = payload.tournamentId;
            if (!tournamentId) throw new Error("Missing Tournament ID");
            const payloadData = {
                players: Object.keys(slots).map(pos => ({ playerId: slots[pos]._id, battingPosition: parseInt(pos) })),
                captainId: tempCaptain,
                viceCaptainId: tempViceCaptain
            };

            const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/playing11`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${fbToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadData)
            });

            if (res.ok) {
                setMsg('Saved Successfully!');
                // Refresh Data to View Mode
                const data = await res.json();
                // Reconstruct full player objects from local slots instead of using API provided string IDs
                const updatedPlayingXI = Object.values(slots).filter(p => p !== null);
                setPlaying11(updatedPlayingXI);
                setCaptain(data.captain);
                setViceCaptain(data.viceCaptain);
                setIsEditMode(false);
                setShowCaptainModal(false);
                setTimeout(() => setMsg(''), 3000);
            } else {
                const data = await res.json();
                setError(data.message || 'Save failed');
                setTimeout(() => setError(''), 3000);
            }
        } catch (e) {
            setError('Network error');
            setTimeout(() => setError(''), 3000);
        }
        finally { setSaving(false); }
    };

    // --- RENDER HELPERS ---
    const isMyTeam = selectedTeam === myTeamCode;

    if (loading && !squad.length && !allTeams.length) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;


    // View Mode Data
    const benchPlayers = squad.filter(p => !playing11.find(xi => xi._id === p._id));

    // Edit Mode Data
    const assignedIds = Object.values(slots).filter(p => p).map(p => p._id);
    const availableForEdit = squad.filter(p => !assignedIds.includes(p._id));

    // Group players for sidebar visibly by category
    const groupedAvailable = {
        'Opener': [],
        'Middle Order': [],
        'Lower Middle': [],
        'Tail': [],
        'Other': []
    };

    availableForEdit.forEach(p => {
        if (p.battingPositionGroup === 1) groupedAvailable['Opener'].push(p);
        else if (p.battingPositionGroup === 2) groupedAvailable['Middle Order'].push(p);
        else if (p.battingPositionGroup === 3) groupedAvailable['Lower Middle'].push(p);
        else if (p.battingPositionGroup === 4) groupedAvailable['Tail'].push(p);
        else groupedAvailable['Other'].push(p);
    });

    // Sort alphabetically within each group
    Object.keys(groupedAvailable).forEach(key => {
        groupedAvailable[key].sort((a, b) => a.name.localeCompare(b.name));
    });

    // Pre-compute drawer data (avoids IIFE inside JSX which Babel cannot parse)
    const allSquadPlayers = [...playing11, ...benchPlayers];
    const drawerPlayer = expandedPlayerId ? allSquadPlayers.find(p => p._id === expandedPlayerId) : null;
    const drawerBd = expandedPlayerId ? scoring?.playerBreakdown?.[expandedPlayerId] : null;

    return (
        <>
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <LiveScoreboardHub />
                {/* Header & Controls */}
                <header className="mb-6 flex flex-col gap-3">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-gray-900 flex items-center gap-3">
                            <User className="text-blue-600" size={28} />
                            Playing XI
                        </h1>
                        <p className="text-sm text-gray-500">View and manage squad lineups.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Team Selector */}
                        <div className="relative flex-1 min-w-[160px]">
                            <select
                                value={selectedTeam || ''}
                                onChange={(e) => setSelectedTeam(e.target.value)}
                                className="w-full appearance-none bg-white border border-gray-200 pl-4 pr-10 py-2 rounded-xl font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            >
                                {allTeams.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} {t.id === myTeamCode ? '(You)' : ''}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                        </div>

                        <div className="flex gap-2 shrink-0">
                            {isLocked && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-200">
                                    <Lock size={14} /> Locked
                                </div>
                            )}
                            {isMyTeam && !isEditMode && !isLocked && (
                                <button
                                    onClick={() => setIsEditMode(true)}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold transition-colors text-sm"
                                >
                                    <Edit2 size={16} /> Edit XI
                                </button>
                            )}
                        </div>

                        {isEditMode && (
                            <button
                                onClick={() => {
                                    setIsEditMode(false);
                                    setShowCaptainModal(false);
                                }}
                                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-xl font-bold transition-colors text-sm shrink-0"
                            >
                                <X size={16} /> Cancel
                            </button>
                        )}
                    </div>
                </header>

                {error && <div className="fixed top-24 right-8 z-50 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-lg animate-in fade-in slide-in-from-right">{error}</div>}
                {msg && <div className="fixed top-24 right-8 z-50 bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded shadow-lg animate-in fade-in slide-in-from-right">{msg}</div>}

                {/* --- VIEW MODE --- */}
                {!isEditMode && (
                    <div className="space-y-8 animate-in fade-in">

                        {/* — Official Team Points Summary Bar — */}
                        {scoring && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap gap-6 items-center animate-in fade-in slide-in-from-top-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Score</span>
                                    <div className="text-3xl font-black text-blue-600 tracking-tight leading-none mt-1">
                                        {scoring.totalPoints}
                                    </div>
                                </div>

                                <div className="h-10 w-px bg-gray-100 hidden md:block" />

                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Finalized (till last week)</span>
                                    <div className="text-lg font-bold text-gray-900 mt-0.5">
                                        {scoring.finalizedTotal}
                                    </div>
                                </div>

                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Live (Current)</span>
                                    <div className="text-lg font-bold text-green-600 mt-0.5">
                                        +{scoring.livePoints}
                                    </div>
                                </div>

                                {/* Optional: Simple filter buttons for scouting player raw stats */}
                                <div className="ml-auto flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
                                    {POINT_FILTERS.map(f => (
                                        <button
                                            key={f.key}
                                            onClick={() => setPointsFilter(f.key)}
                                            className={cn(
                                                "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                                                pointsFilter === f.key ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-gray-400 hover:text-gray-600"
                                            )}
                                        >
                                            {f.label.replace(' Points', '')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {playing11.length === 0 ? (
                            loading ? (
                                <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-200 flex flex-col items-center justify-center animate-in fade-in">
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-6 shadow-sm"></div>
                                    <h3 className="text-xl font-bold text-gray-500 tracking-tight">Fetching Lineup...</h3>
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-300">
                                    <Shield size={48} className="mx-auto text-gray-300 mb-4" />
                                    <h3 className="text-xl font-bold text-gray-900">No Playing XI Selected</h3>
                                    <p className="text-gray-500 mb-6">{isMyTeam ? "You haven't finalized your team yet." : "This team hasn't announced their Playing XI."}</p>
                                    {isMyTeam && !isLocked && (
                                        <button onClick={() => setIsEditMode(true)} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-colors">
                                            Create Playing XI
                                        </button>
                                    )}
                                </div>
                            )
                        ) : (
                            <div>
                                {/* Playing XI Header with Points Dropdown */}
                                <div className="flex items-center justify-between gap-2 mb-4">
                                    <div className="flex items-center gap-2">
                                        <Shield className="text-green-600" />
                                        <h2 className="text-xl font-bold text-gray-800">Final 11</h2>
                                    </div>

                                    {/* Points Filter Dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowPointsDropdown(v => !v)}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-bold transition-colors",
                                                activeFilter.bg, activeFilter.border, activeFilter.color
                                            )}
                                        >
                                            <Star size={13} />
                                            {activeFilter.label}
                                            <ChevronDown size={13} className={cn("transition-transform", showPointsDropdown && "rotate-180")} />
                                        </button>
                                        {showPointsDropdown && (
                                            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                                {POINT_FILTERS.map(f => (
                                                    <button
                                                        key={f.key}
                                                        onClick={() => { setPointsFilter(f.key); setShowPointsDropdown(false); }}
                                                        className={cn(
                                                            "w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors",
                                                            pointsFilter === f.key ? `${f.bg} ${f.color}` : "hover:bg-gray-50 text-gray-700"
                                                        )}
                                                    >
                                                        {f.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {playing11.map((p, i) => (
                                        <div key={p._id} className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                                            <div className="absolute top-0 left-0 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-br-lg">
                                                #{i + 1}
                                            </div>
                                            {/* Points badge — unchanged: still shows This Week */}
                                            <div className={cn("absolute top-0 right-0 text-xs font-black px-3 py-1 rounded-bl-lg", activeFilter.bg, activeFilter.color)}>
                                                {getPlayerPoints(p, pointsFilter, scoring)} pts
                                            </div>
                                            <div className="flex items-center gap-4 mt-2">
                                                <div className="w-12 h-12 rounded-full bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
                                                    {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-gray-300" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1 justify-between">
                                                        <div className="flex items-center gap-1 flex-wrap">
                                                            <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                                                                {p.name}
                                                                {p.isOverseas && <Plane size={13} className="text-blue-500 fill-blue-500" />}
                                                                {activeLiveTeams.includes(p.orgIPLTeam26) && (
                                                                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.6)]" title="Playing Today" />
                                                                )}
                                                            </div>
                                                            {(capHolders.orange?.dbName === p.name || capHolders.orange?.name === p.name) && (
                                                                <span className="bg-orange-50 text-orange-600 text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 leading-none shrink-0 border border-orange-100" title="Orange Cap Holder">
                                                                    <img src="https://png.pngtree.com/png-vector/20240123/ourmid/pngtree-baseball-cap-orange-color-template-mockup-hat-png-image_11471130.png" className="w-3 h-3 object-contain" />
                                                                    ORANGE
                                                                </span>
                                                            )}
                                                            {(capHolders.purple?.dbName === p.name || capHolders.purple?.name === p.name) && (
                                                                <span className="bg-purple-50 text-purple-600 text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 leading-none shrink-0 border border-purple-100" title="Purple Cap Holder">
                                                                    <img src="https://static.vecteezy.com/system/resources/thumbnails/027/941/762/small/purple-cap-sports-hat-baseball-caps-png.png" className="w-3 h-3 object-contain" />
                                                                    PURPLE
                                                                </span>
                                                            )}
                                                            {p._id === captain && <span className="bg-orange-100 text-orange-700 text-[10px] font-black px-1.5 py-0.5 rounded">C</span>}
                                                            {p._id === viceCaptain && <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-1.5 py-0.5 rounded">VC</span>}
                                                        </div>
                                                        {/* ⓘ Info — opens side drawer */}
                                                        {scoring?.playerBreakdown && (
                                                            <button
                                                                onClick={() => setExpandedPlayerId(prev => prev === p._id ? null : p._id)}
                                                                title="View full points breakdown"
                                                                className="p-1 rounded-full text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors shrink-0"
                                                            >
                                                                <Info size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-bold text-gray-500 uppercase">{p.role}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Bench Section */}
                        {benchPlayers.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-4 mt-8">
                                    <Users className="text-gray-400" />
                                    <h2 className="text-xl font-bold text-gray-800">Bench ({benchPlayers.length})</h2>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {benchPlayers.map(p => (
                                        <div key={p._id} className="bg-gray-50 p-3 rounded-xl border border-gray-200 opacity-75 hover:opacity-100 transition-all">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-white border border-gray-200 overflow-hidden shrink-0">
                                                    {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-gray-300" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-sm text-gray-700 truncate">{p.name}</h4>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{p.role}</p>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <span className={cn("text-xs font-black px-2 py-0.5 rounded-lg", activeFilter.bg, activeFilter.color)}>
                                                        {getPlayerPoints(p, pointsFilter, scoring)} pts
                                                    </span>
                                                    {scoring?.playerBreakdown && (
                                                        <button
                                                            onClick={() => setExpandedPlayerId(prev => prev === p._id ? null : p._id)}
                                                            title="View full points breakdown"
                                                            className="p-1 rounded-full text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                                        >
                                                            <Info size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}


                {/* --- EDIT MODE --- */}
                {isEditMode && (
                    <div className="animate-in slide-in-from-bottom-4">
                        {/* Stats Panel */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className={cn("p-3 rounded-xl border flex items-center justify-between", stats.count === 11 ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200")}>
                                <div><span className="text-xs font-bold uppercase text-gray-400 block">Players</span><span className={cn("font-bold text-lg", stats.count === 11 ? "text-green-700" : "text-gray-900")}>{stats.count}/11</span></div>
                                {stats.count === 11 ? <Check size={20} className="text-green-600" /> : <Shield size={20} className="text-gray-300" />}
                            </div>
                            <div className={cn("p-3 rounded-xl border flex items-center justify-between", stats.overseas <= 4 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200")}>
                                <div><span className="text-xs font-bold uppercase text-gray-400 block">Overseas</span><span className={cn("font-bold text-lg", stats.overseas > 4 ? "text-red-600" : "text-gray-900")}>{stats.overseas}/4</span></div>
                                {stats.overseas <= 4 ? <Check size={20} className="text-green-600" /> : <AlertTriangle size={20} className="text-red-600" />}
                            </div>
                            <div className={cn("p-3 rounded-xl border flex items-center justify-between", stats.wks >= 1 ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200")}>
                                <div><span className="text-xs font-bold uppercase text-gray-400 block">Keepers</span><span className={cn("font-bold text-lg", stats.wks >= 1 ? "text-green-700" : "text-gray-900")}>{stats.wks}/1 (Min)</span></div>
                                {stats.wks >= 1 ? <Check size={20} className="text-green-600" /> : <AlertCircle size={20} className="text-orange-500" />}
                            </div>
                            <div className={cn("p-3 rounded-xl border flex items-center justify-between", stats.bowlers >= 5 ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200")}>
                                <div><span className="text-xs font-bold uppercase text-gray-400 block">Bowling</span><span className={cn("font-bold text-lg", stats.bowlers >= 5 ? "text-green-700" : "text-gray-900")}>{stats.bowlers}/5 (Min)</span></div>
                                {stats.bowlers >= 5 ? <Check size={20} className="text-green-600" /> : <AlertCircle size={20} className="text-orange-500" />}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Sidebar - shows below on mobile, left on desktop */}
                            <div className="lg:col-span-4 order-2 lg:order-1">
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 lg:sticky lg:top-24 max-h-64 lg:max-h-[calc(100vh-8rem)] overflow-y-auto">
                                    <h2 className="font-bold text-gray-800 mb-4">Available Squad ({availableForEdit.length})</h2>
                                    <div className="space-y-4">
                                        {Object.entries(groupedAvailable).map(([groupName, players]) => {
                                            if (players.length === 0) return null;
                                            return (
                                                <div key={groupName} className="space-y-2">
                                                    <h3 className="text-xs font-bold uppercase text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm">{groupName} ({players.length})</h3>
                                                    {players.map(p => (
                                                        <div
                                                            key={p._id}
                                                            onClick={() => handleAssign(p)}
                                                            draggable
                                                            onDragStart={(e) => handleDragStart(e, p, null)}
                                                            className={cn(
                                                                "p-3 border rounded-xl flex items-center gap-3 transition-all",
                                                                draggedPlayer?._id === p._id ? "opacity-50 ring-2 ring-blue-500 cursor-grabbing bg-blue-50" : "hover:bg-blue-50 bg-white border-gray-100 cursor-grab hover:shadow-md"
                                                            )}
                                                        >
                                                            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0 pointer-events-none">
                                                                {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-gray-300" />}
                                                            </div>
                                                            <div className="pointer-events-none">
                                                                <div className="text-sm font-bold flex items-center gap-1">
                                                                    {p.name} 
                                                                    {p.isOverseas && <Plane size={13} className="text-blue-500 fill-blue-500" />}
                                                                    {activeLiveTeams.includes(p.orgIPLTeam26) && (
                                                                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.6)]" title="Playing Today" />
                                                                    )}
                                                                </div>
                                                                <div className="text-xs text-gray-500">{p.role}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Slots */}
                            <div className="lg:col-span-8 order-1 lg:order-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[...Array(11)].map((_, i) => {
                                        const pos = i + 1;
                                        const p = slots[pos];
                                        const isExecutivesLocked = isCaptaincyLocked && p && (p._id === captain || p._id === viceCaptain);

                                        return (
                                            <div
                                                key={pos}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => handleDrop(e, pos)}
                                                className={cn(
                                                    "relative p-4 rounded-2xl border-2 min-h-[90px] flex items-center transition-all",
                                                    p ? "bg-white border-blue-500 shadow-sm" : "bg-gray-50 border-dashed",
                                                    draggedPlayer && !p ? "border-blue-400 bg-blue-50/50" : ""
                                                )}
                                            >
                                                <span className="absolute top-0 left-0 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-br">{pos}</span>
                                                {p ? (
                                                    <div
                                                        className={cn("w-full pl-6 flex justify-between items-center", draggedPlayer?._id === p._id ? "opacity-30 cursor-grabbing" : isExecutivesLocked ? "cursor-not-allowed" : "cursor-grab")}
                                                        draggable={!isExecutivesLocked}
                                                        onDragStart={!isExecutivesLocked ? ((e) => handleDragStart(e, p, pos)) : undefined}
                                                    >
                                                        <div className="flex items-center gap-3 pointer-events-none">
                                                            <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden">
                                                                {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-gray-300" />}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold flex items-center gap-1">
                                                                    {p.name} 
                                                                    {p.isOverseas && <Plane size={13} className="text-blue-500 fill-blue-500" />}
                                                                    {activeLiveTeams.includes(p.orgIPLTeam26) && (
                                                                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.6)]" title="Playing Today" />
                                                                    )}
                                                                </div>
                                                                <div className="text-xs text-gray-500">{p.role}</div>
                                                            </div>
                                                        </div>
                                                        {isExecutivesLocked ? (
                                                            <div className="p-2 text-gray-400">
                                                                <Lock size={14} />
                                                            </div>
                                                        ) : (
                                                            <button onClick={(e) => { e.stopPropagation(); handleRemove(pos); }} className="p-2 hover:bg-red-50 text-red-500 rounded-full"><X size={16} /></button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="w-full text-center text-xs text-gray-400 font-bold uppercase tracking-wider pl-6 pointer-events-none">
                                                        Required: {getBattingGroupLabel(getRequiredGroupForPos(pos))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-8 flex justify-end">
                                    <button
                                        onClick={handleProceedToCaptainModal}
                                        disabled={!stats.isValid || saving}
                                        className="bg-blue-600 hover:bg-blue-700 transition-colors text-white px-8 py-3 rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Select Captain & Vice-Captain
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Captaincy Selection Modal */}
                {isEditMode && showCaptainModal && (
                    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900">Select Leadership</h2>
                                    <p className="text-gray-500 text-sm mt-1">Choose your Captain (C) and Vice-Captain (VC) from your selected 11.</p>
                                </div>
                                <button onClick={() => setShowCaptainModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 object-top">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {Object.values(slots).filter(p => p !== null).map(p => (
                                        <div key={p._id} className={cn(
                                            "p-3 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-colors",
                                            tempCaptain === p._id ? "border-orange-500 bg-orange-50" : tempViceCaptain === p._id ? "border-blue-500 bg-blue-50" : "border-gray-100 hover:border-gray-300"
                                        )}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 shrink-0">
                                                    {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-gray-300" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-sm truncate flex items-center gap-1">{p.name} {p.isOverseas && <Plane size={13} className="text-blue-500 fill-blue-500 shrink-0" />}</div>
                                                    <div className="text-xs text-gray-500">{p.role}</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        if (tempViceCaptain === p._id) setTempViceCaptain(null);
                                                        setTempCaptain(tempCaptain === p._id ? null : p._id);
                                                    }}
                                                    className={cn("w-8 h-8 rounded-full font-black text-xs flex items-center justify-center transition-colors", tempCaptain === p._id ? "bg-orange-500 text-white shadow-md shadow-orange-500/30" : "bg-gray-100 text-gray-400 hover:bg-orange-100 hover:text-orange-600")}
                                                >
                                                    C
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (tempCaptain === p._id) setTempCaptain(null);
                                                        setTempViceCaptain(tempViceCaptain === p._id ? null : p._id);
                                                    }}
                                                    className={cn("w-8 h-8 rounded-full font-black text-xs flex items-center justify-center transition-colors", tempViceCaptain === p._id ? "bg-blue-600 text-white shadow-md shadow-blue-600/30" : "bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600")}
                                                >
                                                    VC
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-4">
                                <button
                                    onClick={() => setShowCaptainModal(false)}
                                    className="px-6 py-2.5 font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleSaveFinal}
                                    disabled={!tempCaptain || !tempViceCaptain || saving}
                                    className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg border border-blue-500 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {saving ? 'Saving...' : 'Confirm & Save'} <Check size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* â”€â”€ PLAYER BREAKDOWN SIDE DRAWER â”€â”€ */}
            {drawerPlayer && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-200"
                        onClick={() => setExpandedPlayerId(null)}
                    />

                    {/* Side Drawer */}
                    <div className="fixed top-0 right-0 h-full w-full max-w-sm z-50 bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">

                        {/* Drawer Header */}
                        <div className="flex items-center gap-3 p-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shrink-0">
                            <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/40 overflow-hidden shrink-0">
                                {drawerPlayer.image
                                    ? <img src={drawerPlayer.image} className="w-full h-full object-cover" />
                                    : <User className="w-full h-full p-3 text-white/50" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <h3 className="font-black text-lg leading-tight truncate">{drawerPlayer.name}</h3>
                                    {drawerPlayer._id === captain && <span className="bg-orange-400 text-white text-[10px] font-black px-2 py-0.5 rounded-full">C</span>}
                                    {drawerPlayer._id === viceCaptain && <span className="bg-white/30 text-white text-[10px] font-black px-2 py-0.5 rounded-full">VC</span>}
                                    {drawerPlayer.isOverseas && <Plane size={13} className="fill-white text-white" />}
                                </div>
                                <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mt-0.5">{drawerPlayer.role}</p>
                            </div>
                            <button
                                onClick={() => setExpandedPlayerId(null)}
                                className="shrink-0 p-2 hover:bg-white/20 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {!drawerBd ? (
                                <div className="text-center py-12 text-gray-400">
                                    <Info size={32} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">Detailed history not available yet.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Summary Cards Grid */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl p-4 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200">
                                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">🏆 IPL Season</p>
                                            <p className="text-3xl font-black text-slate-800 leading-none">{drawerBd.seasonTotal}</p>
                                            <p className="text-xs text-slate-500 mt-1">Total Points</p>
                                        </div>
                                        <div className="rounded-2xl p-4 bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200">
                                            <p className="text-[10px] font-black uppercase text-green-500 tracking-widest mb-1">✅ Contributed</p>
                                            <p className="text-3xl font-black text-green-700 leading-none">{drawerBd.contributed}</p>
                                            <p className="text-xs text-green-600 mt-1">To Your Team</p>
                                        </div>
                                        {drawerBd.benched > 0 && (
                                            <div className="rounded-2xl p-4 bg-gradient-to-br from-red-50 to-rose-100 border border-red-200">
                                                <p className="text-[10px] font-black uppercase text-red-400 tracking-widest mb-1">🚫 Not Counted</p>
                                                <p className="text-3xl font-black text-red-500 leading-none">{drawerBd.benched}</p>
                                                <p className="text-xs text-red-400 mt-1">While Benched</p>
                                            </div>
                                        )}
                                        {drawerBd.livePoints > 0 && (
                                            <div className="rounded-2xl p-4 bg-gradient-to-br from-orange-50 to-amber-100 border border-orange-200">
                                                <p className="text-[10px] font-black uppercase text-orange-500 tracking-widest mb-1">🔴 This Week</p>
                                                <p className="text-3xl font-black text-orange-600 leading-none">+{drawerBd.livePoints}</p>
                                                <p className="text-xs text-orange-500 mt-1">Live Points</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Week-by-Week Timeline */}
                                    {drawerBd.weekBreakdown?.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-black uppercase text-gray-400 tracking-widest mb-3">📅 Week by Week</h4>
                                            <div className="space-y-2">
                                                {drawerBd.weekBreakdown.map(w => (
                                                    <div key={w.week} className={cn(
                                                        "flex items-center gap-3 p-3 rounded-xl border",
                                                        w.inXI === null
                                                            ? "bg-gray-50 border-gray-100"
                                                            : w.inXI
                                                                ? "bg-green-50 border-green-100"
                                                                : "bg-red-50 border-red-100"
                                                    )}>
                                                        {/* Week Badge */}
                                                        <div className={cn(
                                                            "w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0",
                                                            w.inXI === null ? "bg-gray-200 text-gray-500" :
                                                                w.inXI ? "bg-green-500 text-white" : "bg-red-300 text-white"
                                                        )}>
                                                            W{w.week}
                                                        </div>

                                                        {/* Status */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className={cn(
                                                                "font-bold text-sm",
                                                                w.inXI === null ? "text-gray-400" :
                                                                    w.inXI ? "text-green-700" : "text-red-500"
                                                            )}>
                                                                {w.inXI === null ? 'No History Data'
                                                                    : w.inXI ? `Playing · ${w.role}`
                                                                        : 'Benched'}
                                                            </div>
                                                            {w.inXI && w.role !== 'Player' && (
                                                                <div className="text-[11px] text-green-600 font-semibold">
                                                                    {w.role === 'Captain' ? '2× Captain Bonus Applied' : '1.5× VC Bonus Applied'}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Points */}
                                                        <div className="text-right shrink-0">
                                                            {w.inXI === null ? (
                                                                <span className="text-gray-300 text-sm font-bold">—</span>
                                                            ) : w.inXI ? (
                                                                <div>
                                                                    <div className="font-black text-green-700 text-base">{w.withBonus} pts</div>
                                                                    {w.withBonus !== w.rawPoints && (
                                                                        <div className="text-[10px] text-gray-400">{w.rawPoints} raw</div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <div className="font-bold text-red-400 text-base">{w.rawPoints} pts</div>
                                                                    <div className="text-[10px] text-red-300">not counted</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    );
};

export default SelectPlayingXI;
