import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, Clock, Trophy, User, Play, AlertCircle, Plane, RefreshCw, Users, ArrowRight } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { TEAM_COLORS } from '../constants/teamColors';
import { cn } from '../lib/utils';
import { placeBid, getPlayers } from '../services/api';
import { toCr } from '../utils/formatCurrency';
import { PLAYER_SETS } from '../constants/playerSets';

const AuctionPage = () => {
    const { socket } = useSocket();
    const { user } = useAuth();
    const [auctionState, setAuctionState] = useState({
        currentPlayer: null,
        currentBid: 0,
        highestBidder: null,
        timer: 10,
        isSold: false,
        bidHistory: [],
        teams: []
    });
    const [myTeam, setMyTeam] = useState(user);
    const [toasts, setToasts] = useState([]);
    const [recentSales, setRecentSales] = useState([]);

    // Sold Popup State
    const [showSoldPopup, setShowSoldPopup] = useState(false);
    const [soldPopupData, setSoldPopupData] = useState(null);

    // Initial Fetch for Recent Deals
    useEffect(() => {
        const fetchRecent = async () => {
            try {
                const soldPlayers = await getPlayers({ status: 'SOLD' });
                // Sort by most recently updated (simplistic approx, or use updatedAt if available)
                // ideally backend sorts, but we can reverse logic here or rely on list order
                setRecentSales(soldPlayers.reverse());
            } catch (err) {
                console.error("Failed to fetch recent sales", err);
            }
        };
        fetchRecent();
    }, []);

    useEffect(() => {
        if (user) {
            setMyTeam(prev => prev || user);
        }
    }, [user]);

    // ... (Audio Context remains same)
    const audioContextRef = useRef(null);
    const playBeep = () => {
        // ... (Audio Logic)
        try {
            if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const ctx = audioContextRef.current;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            gain.gain.value = 0.1;
            osc.start();
            setTimeout(() => osc.stop(), 100);
        } catch (e) {
            console.error(e);
        }
    };

    // ...

    // Moved to useEffect to prevent null reference error

    const addToast = (msg, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };

    const [timerEndsAt, setTimerEndsAt] = useState(null);
    const [displayTimer, setDisplayTimer] = useState(10);

    useEffect(() => {
        if (!timerEndsAt) return;

        const interval = setInterval(() => {
            const now = new Date();
            const end = new Date(timerEndsAt);
            const diff = Math.max(0, Math.ceil((end - now) / 1000));
            setDisplayTimer(diff);

            if (diff <= 0) clearInterval(interval);
        }, 100); // Update freq high for responsiveness

        return () => clearInterval(interval);
    }, [timerEndsAt]);

    // Phase 4: Perfect Sync (Socket Listening)
    useEffect(() => {
        if (socket) {
            // CRITICAL: Request sync immediately on mount to handle navigation/re-entry
            console.log("Requesting Auction Sync...");
            socket.emit('auction:request_sync');

            const handleConnect = () => {
                socket.emit('auction:request_sync');
            };
            socket.on('connect', handleConnect);

            const handleStateUpdate = (newState) => {
                setAuctionState(prev => ({
                    ...prev,
                    ...newState,
                }));
                // Sync Timer
                if (newState.timerEndsAt) {
                    setTimerEndsAt(newState.timerEndsAt);
                }

                // Update My Team Stats from the 'teams' array in state
                if (user && newState.teams) {
                    const updatedMe = newState.teams.find(t => t.id === user.id || t.id === user.code);
                    if (updatedMe) setMyTeam(updatedMe);
                }
            };

            // 1. Initial Sync & State Updates (Unified)
            socket.on('auction:sync', handleStateUpdate);
            socket.on('auction:state', handleStateUpdate);

            // 2. New Player (Animation Trigger but use State for Data)
            const handleAuctionStart = (data) => {
                addToast(`New Player on Block: ${data.currentPlayer.name}`, 'info');
                // State update handled by auction:state
            };
            socket.on('auctionStart', handleAuctionStart);

            // 3. Bid Placed (Sound Only)
            const handleBidPlaced = () => {
                playBeep();
            };
            socket.on('bidPlaced', handleBidPlaced);

            // 4. Sold (Toast & Update Feed)
            const handlePlayerSold = ({ player, soldTo, price }) => {
                if (soldTo) {
                    addToast(`SOLD! ${player.name} to ${soldTo.name} for ₹${price} Cr`, 'success');

                    // Trigger Full-Screen 3s Popup
                    setSoldPopupData({ player, soldTo, price });
                    setShowSoldPopup(true);
                    setTimeout(() => {
                        setShowSoldPopup(false);
                    }, 3000);

                    // Add to recent sales feed
                    setRecentSales(prev => [{
                        ...player,
                        soldPrice: price,
                        soldToTeam: soldTo.id
                    }, ...prev]);
                } else {
                    addToast(`${player.name} remains UNSOLD`, 'error');
                }
                // State update handled by auction:state
            };
            socket.on('playerSold', handlePlayerSold);

            const handleError = (msg) => addToast(msg, 'error');
            socket.on('error', handleError);

            return () => {
                socket.off('connect', handleConnect);
                socket.off('auction:sync', handleStateUpdate);
                socket.off('auction:state', handleStateUpdate);
                socket.off('auctionStart', handleAuctionStart);
                socket.off('bidPlaced', handleBidPlaced);
                socket.off('playerSold', handlePlayerSold);
                socket.off('error', handleError);
            };
        }
    }, [socket, user]);

    const [isBidding, setIsBidding] = useState(false);

    // Derived Logic
    const { currentPlayer, currentBid, highestBidder, timer, bidHistory, status } = auctionState;
    const isSold = status === 'SOLD';
    const isUnsold = status === 'UNSOLD';

    // Bid Validation
    const isMyBid = highestBidder?.id === myTeam?.id;
    // Rule: Min Increment 0.2 Cr
    // Check if we can afford the NEXT minimum bid (current + 0.2)
    // Logic: If < 2 Cr, increment 0.10 Cr (1000000), else 0.25 Cr (2500000)
    const bidAmount = currentBid || currentPlayer?.basePrice || 0;

    // Logic Phase 1: Opening Bid
    let increment = 0;
    let nextBidValue = 0;

    if (!highestBidder) {
        // First bid is exactly the base price
        nextBidValue = currentPlayer?.basePrice || 0;
        increment = 0;
    } else {
        // Subsequent bids - Dynamic Increments in Crores
        if (bidAmount < 1) {
            increment = 0.05; // 5 Lakhs
        } else if (bidAmount < 2) {
            increment = 0.10; // 10 Lakhs
        } else if (bidAmount < 5) {
            increment = 0.20; // 20 Lakhs
        } else {
            increment = 0.25; // 25 Lakhs
        }

        // Fix floating point errors (e.g., 0.3 + 0.05 = 0.3500000000004)
        nextBidValue = Math.round((bidAmount + increment) * 100) / 100;
    }

    // Rule: Min Increment Dynamic
    const isSpectator = myTeam?.role === 'spectator';
    const canBid = !isSpectator && !isSold && !isUnsold && !isMyBid && currentPlayer && myTeam?.budget >= nextBidValue;
    const myColor = myTeam ? (TEAM_COLORS[myTeam.id?.toLowerCase()] || '#2563eb') : '#2563eb';

    const handleBid = async (amount) => {
        if (!canBid || isBidding) return;
        setIsBidding(true);
        try {
            // We pass the TOTAL amount, not just the increment
            await placeBid(amount);
            // Socket will update state
        } catch (err) {
            addToast(err.response?.data?.message || 'Bid failed', 'error');
        } finally {
            setIsBidding(false);
        }
    };

    const handleRefresh = () => {
        if (socket) {
            socket.emit('auction:request_sync');
            addToast('Refreshing auction state...', 'info');
        }
    };

    // Helper for specialized formatting (Lakhs vs Crores)
    const formatPrice = (price) => {
        if (!price && price !== 0) return '-';
        if (price < 1) {
            return `₹${Math.round(price * 100)} L`;
        }
        // Limit to max 2 decimal places for Crores
        const formattedCr = Number(price).toLocaleString('en-IN', { maximumFractionDigits: 2 });
        return `₹${formattedCr} Cr`;
    };

    const formatBidAmount = (amount) => {
        if (!amount && amount !== 0) return '-';
        if (amount < 1) {
            return { value: Math.round(amount * 100), unit: 'L' };
        }
        return { value: amount, unit: 'Cr' };
    };

    const nextBidDetails = formatBidAmount(nextBidValue);


    if (!currentPlayer) {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh] text-center space-y-6 animate-in fade-in zoom-in duration-500">
                <div className="p-10 bg-white rounded-3xl shadow-xl border border-gray-100 max-w-lg w-full flex flex-col items-center">
                    <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600 animate-pulse">
                        <Trophy size={40} strokeWidth={1.5} />
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 mb-3">Auction Completed</h2>
                    <p className="text-gray-500 text-lg mb-8">It's time to assemble your Playing 11 for the tournament!</p>
                    <Link to="/select-playing-xi" className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-2xl shadow-xl hover:shadow-blue-500/30 hover:scale-105 transition-all w-full sm:w-auto">
                        <Users size={24} /> 
                        <span className="text-lg">Make Playing 11</span>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] relative">

            {/* Sold Popup Overlay */}
            {showSoldPopup && soldPopupData && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md transition-opacity duration-300"
                    onClick={() => setShowSoldPopup(false)}
                >
                    <div
                        className={cn(
                            "bg-white rounded-3xl p-8 flex flex-col items-center justify-center max-w-md w-full mx-4 overflow-hidden relative animate-sold-popup",
                            soldPopupData.price >= 10 ? "shadow-[0_0_80px_rgba(234,179,8,0.4)] border-4 border-yellow-400" : "shadow-2xl"
                        )}
                    >
                        {/* Dramatic Team Color Background FX */}
                        <div
                            className="absolute inset-0 opacity-10"
                            style={{ backgroundColor: TEAM_COLORS[soldPopupData.soldTo?.id?.toLowerCase()] || '#2563eb' }}
                        />

                        {soldPopupData.price >= 10 && (
                            <div className="absolute inset-0 bg-gradient-to-tr from-yellow-300/10 via-transparent to-yellow-500/10 pointer-events-none mix-blend-overlay"></div>
                        )}

                        <div className="relative z-10 flex flex-col items-center text-center">
                            {soldPopupData.player.set === 0 && (
                                <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-950 font-black text-[10px] px-4 py-1.5 rounded-full uppercase tracking-[0.2em] shadow-lg mb-4 -mt-2 animate-pulse">
                                    ⭐ Marquee Signing ⭐
                                </div>
                            )}
                            {soldPopupData.player.set !== 0 && (
                                <Trophy className={cn("w-16 h-16 mb-4 animate-bounce drop-shadow-lg", soldPopupData.price >= 10 ? "text-yellow-400" : "text-yellow-500")} />
                            )}

                            <h2 className="text-5xl font-black text-gray-900 mb-2 uppercase tracking-wider">SOLD!</h2>

                            <div className={cn(
                                "w-32 h-32 rounded-2xl bg-gray-100 mt-4 mb-2 overflow-hidden border-4 shadow-lg",
                                soldPopupData.price >= 10 ? "border-yellow-400" : "border-white"
                            )}>
                                {soldPopupData.player.image ? (
                                    <img src={soldPopupData.player.image} alt={soldPopupData.player.name} className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-full h-full text-gray-400 p-4" />
                                )}
                            </div>

                            <h3 className="text-3xl font-black text-gray-800 mt-2">{soldPopupData.player.name}</h3>
                            <p className="text-gray-500 uppercase font-black tracking-widest text-sm mt-1 mb-6">{soldPopupData.player.role}</p>

                            <div
                                className="w-full bg-white rounded-2xl p-5 border-2 flex flex-col items-center shadow-inner"
                                style={{ borderColor: TEAM_COLORS[soldPopupData.soldTo?.id?.toLowerCase()] || '#2563eb' }}
                            >
                                <p className="text-xs text-gray-400 font-bold uppercase mb-1 tracking-widest">To Team</p>
                                <span
                                    className="text-2xl font-black mb-3"
                                    style={{ color: TEAM_COLORS[soldPopupData.soldTo?.id?.toLowerCase()] || '#2563eb' }}
                                >
                                    {soldPopupData.soldTo.name || soldPopupData.soldTo.id}
                                </span>

                                <div className="bg-green-50 border border-green-200 text-green-700 font-black text-4xl px-8 py-3 rounded-xl w-full text-center shadow-sm">
                                    {formatPrice(soldPopupData.price)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TOASTS */}
            <div className="fixed top-24 right-6 z-50 flex flex-col gap-3 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className={cn(
                        "pointer-events-auto px-6 py-3 rounded-xl shadow-2xl text-white font-bold text-sm tracking-wide animate-in slide-in-from-right-10 fade-in duration-300 flex items-center gap-3",
                        t.type === 'error' ? "bg-red-600" : t.type === 'success' ? "bg-green-600" : "bg-gray-900"
                    )}>
                        {t.type === 'error' && <AlertCircle size={18} />}
                        {t.msg}
                    </div>
                ))}
            </div>




            {/* LEFT: PLAYER & BIDDING (8 Cols) */}
            <div className="lg:col-span-8 flex flex-col gap-6 h-full overflow-y-auto pr-2 custom-scrollbar">

                {/* Main Card */}
                <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 relative overflow-hidden flex-shrink-0">
                    {/* Background Ambience */}
                    <div className="absolute top-0 right-0 w-96 h-96 bg-gray-50 rounded-full -translate-y-1/2 translate-x-1/2 -z-0"></div>

                    <div className="flex flex-col md:flex-row gap-8 items-center md:items-start relative z-10">
                        {/* Player Avatar */}
                        <div className="w-48 h-48 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border-8 border-white shadow-2xl flex items-center justify-center relative shrink-0 overflow-hidden">
                            {currentPlayer.image ? (
                                <img src={currentPlayer.image} alt={currentPlayer.name} className="w-full h-full object-cover" />
                            ) : (
                                <User size={80} className="text-slate-400" />
                            )}
                            <div className="absolute bottom-2 px-3 py-1 bg-black text-white text-[10px] font-bold rounded-full uppercase tracking-wider shadow-lg">
                                {currentPlayer.role}
                            </div>
                        </div>

                        {/* Player Info */}
                        <div className="flex-1 text-center md:text-left space-y-4">
                            <div>
                                <h1 className="text-5xl font-black text-gray-900 tracking-tight leading-none mb-2">
                                    <span className="text-gray-300 mr-3 text-3xl font-bold">#{currentPlayer.srNo}</span>
                                    {currentPlayer.name}
                                </h1>
                                <div className="flex items-center justify-center md:justify-start gap-3">
                                    <span className="text-xl font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        {currentPlayer.country}
                                        {currentPlayer.isOverseas && <Plane size={20} className="text-blue-500" />}
                                    </span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                    <span className="text-xl font-bold text-gray-500">Base: {formatPrice(currentPlayer.basePrice)}</span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                    <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-bold uppercase tracking-wide">
                                        {PLAYER_SETS[currentPlayer.set] || `Set ${currentPlayer.set}`}
                                    </span>
                                    {currentPlayer.battingPositionGroup != null && (
                                        <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-bold uppercase tracking-wide">
                                            {[null,'Opener','Middle Order','Lower Middle','Tail'][currentPlayer.battingPositionGroup] || `Grp ${currentPlayer.battingPositionGroup}`}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Current Bid Display */}
                            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Current Highest Bid</p>
                                    <p className="text-5xl font-black text-gray-900 tabular-nums tracking-tighter">
                                        {formatPrice(currentBid)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    {highestBidder ? (
                                        <>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Held By</p>
                                            <div className="flex items-center justify-end gap-2">
                                                {highestBidder.logo ? (
                                                    <img src={highestBidder.logo} alt={highestBidder.name} className="w-8 h-8 object-contain" />
                                                ) : (
                                                    <div
                                                        className="w-4 h-4 rounded-full shadow-sm"
                                                        style={{ backgroundColor: TEAM_COLORS[highestBidder.id?.toLowerCase()] || '#666' }}
                                                    ></div>
                                                )}
                                                <span
                                                    className="text-2xl font-black"
                                                    style={{ color: TEAM_COLORS[highestBidder.id?.toLowerCase()] || '#000' }}
                                                >
                                                    {highestBidder.name}
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-gray-400 font-bold text-xl px-4 py-2 bg-gray-200/50 rounded-lg">No Bids Yet</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sold Overlay */}
                    {isSold && (
                        <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                            <div className="transform -rotate-12 border-[8px] border-red-600 text-red-600 text-8xl font-black px-16 py-6 rounded-3xl opacity-90 shadow-2xl animate-in zoom-in duration-300">
                                SOLD
                            </div>
                        </div>
                    )}
                    {isUnsold && (
                        <div className="absolute inset-0 z-20 bg-gray-900/10 backdrop-blur-sm flex items-center justify-center">
                            <div className="transform rotate-12 border-[8px] border-gray-600 text-gray-600 text-8xl font-black px-16 py-6 rounded-3xl opacity-90 shadow-2xl bg-white/80 animate-in zoom-in duration-300">
                                UNSOLD
                            </div>
                        </div>
                    )}
                </div>

                {/* Controls & Timer */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-[200px]">
                    {/* Bidding Controls */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
                        {isSpectator ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
                                    <User size={32} />
                                </div>
                                <h3 className="text-xl font-black text-gray-800 mb-2">Spectator Mode</h3>
                                <p className="text-sm font-bold text-gray-500 max-w-xs mx-auto">
                                    You are watching the auction live. Bidding features are disabled for spectators.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-800">Place Your Bid</h3>

                                    {/* Middle Refresh Button */}
                                    <button
                                        onClick={handleRefresh}
                                        className="p-2 bg-gray-50 rounded-full hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors mx-2"
                                        title="Sync State"
                                    >
                                        <RefreshCw size={16} />
                                    </button>

                                    <div className="text-right flex flex-col items-end">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase">My Budget</span>
                                        <p className={cn("text-lg font-bold tabular-nums leading-none", myTeam?.budget < 5 ? 'text-red-500' : 'text-green-600')}>
                                            {formatPrice(myTeam?.budget || 0)}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col justify-end">
                                    <button
                                        onClick={() => handleBid(nextBidValue)}
                                        disabled={!canBid || isBidding}
                                        className={cn(
                                            "w-full relative overflow-hidden rounded-2xl flex flex-col items-center justify-center py-6 border-2 transition-all duration-150 group active:scale-95 shadow-md",
                                            (!canBid || isBidding)
                                                ? "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed"
                                                : "bg-gradient-to-b from-blue-50 to-white border-blue-200 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/20"
                                        )}
                                    >
                                        <span className={cn("text-sm font-bold uppercase mb-1 tracking-wider", (!canBid || isBidding) ? "text-gray-300" : "text-gray-500 group-hover:text-blue-600")}>
                                            Place Bid
                                        </span>
                                        <div className="flex items-baseline gap-2">
                                            <span className={cn("text-4xl font-black", (!canBid || isBidding) ? "text-gray-300" : "text-gray-900")}>
                                                ₹{nextBidDetails.value}
                                            </span>
                                            <span className={cn("text-lg font-bold", (!canBid || isBidding) ? "text-gray-300" : "text-gray-400")}>
                                                {nextBidDetails.unit}
                                            </span>
                                        </div>

                                        {!(!canBid || isBidding) && (
                                            <div
                                                className="absolute bottom-0 left-0 h-1.5 bg-blue-500 transition-all duration-300 w-0 group-hover:w-full"
                                                style={{ backgroundColor: myColor }}
                                            ></div>
                                        )}
                                    </button>
                                </div>
                                {isMyBid && !isSold && (
                                    <div className="mt-4 bg-green-50 text-green-700 text-center py-2 rounded-xl font-bold text-sm animate-pulse">
                                        You are the highest bidder!
                                    </div>
                                )}
                            </>
                        )}
                    </div>


                    {/* Timer */}
                    <div className={cn(
                        "rounded-3xl p-6 flex flex-col items-center justify-center transition-colors duration-500",
                        displayTimer <= 10 && !isSold ? "bg-red-50 border-2 border-red-100" : "bg-gray-900 text-white"
                    )}>
                        <h3 className={cn("text-sm font-bold uppercase tracking-widest mb-2", displayTimer <= 10 && !isSold ? "text-red-500" : "text-white/50")}>
                            Time Remaining
                        </h3>
                        <div className="relative">
                            <span className={cn(
                                "text-8xl font-black tabular-nums leading-none tracking-tighter",
                                displayTimer <= 10 && !isSold ? "text-red-500" : "text-white"
                            )}>
                                {isSold ? 0 : displayTimer}
                            </span>
                            <span className="text-2xl font-bold absolute top-2 -right-8 opacity-50">s</span>
                        </div>
                        {displayTimer <= 5 && !isSold && (
                            <div className="mt-4 px-4 py-1 bg-red-600 text-white text-xs font-bold rounded-full animate-bounce">
                                CLOSING SOON
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-6 h-full overflow-hidden">
                {/* 1. Bid History (Top Half) */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 flex flex-col overflow-hidden h-1/2">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Clock size={16} /> Bid History
                        </h3>
                        <span className="text-xs font-bold bg-white border border-gray-200 px-2 py-1 rounded-md text-gray-500">{bidHistory.length} Bids</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                        {bidHistory.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-300 space-y-2">
                                <Trophy size={40} />
                                <p className="font-medium">No bids placed yet</p>
                            </div>
                        ) : (
                            bidHistory.map((bid, i) => {
                                const isTop = i === 0;
                                const tColor = TEAM_COLORS[bid.team?.toLowerCase()] || '#666';
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300",
                                            isTop ? "bg-white border-blue-100 shadow-md scale-100 z-10" : "bg-gray-50/50 border-transparent opacity-80"
                                        )}
                                    >
                                        <div
                                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-[10px] shadow-sm shrink-0 bg-white overflow-hidden border border-gray-100 p-1"
                                        >
                                            {auctionState.teams.find(t => t.id === bid.team)?.logo ? (
                                                <img
                                                    src={auctionState.teams.find(t => t.id === bid.team)?.logo}
                                                    alt={bid.team}
                                                    className="w-full h-full object-contain"
                                                />
                                            ) : (
                                                <div style={{ backgroundColor: tColor, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {bid.team?.substring(0, 3).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <div className="flex items-center gap-1">
                                                    <span
                                                        className="font-bold text-xs"
                                                        style={{ color: tColor }}
                                                    >
                                                        {bid.teamName || bid.team}
                                                    </span>
                                                    {auctionState.teams.find(t => t.id === bid.team)?.ownerUsername && (
                                                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                                            @{auctionState.teams.find(t => t.id === bid.team)?.ownerUsername}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] font-medium text-gray-400">{bid.time}</span>
                                            </div>
                                            <p className="text-lg font-black text-gray-900 tabular-nums">{formatPrice(bid.amount)}</p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 2. Recent Deals (Bottom Half) - News Feed */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 flex flex-col overflow-hidden h-1/2">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Trophy size={16} /> Recent Deals
                        </h3>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                        {recentSales.filter(p => p.soldToTeam).length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-300 space-y-2">
                                <Users size={40} />
                                <p className="font-medium">No players sold yet</p>
                            </div>
                        ) : (
                            recentSales.filter(p => p.soldToTeam).map((player, i) => {
                                const teamColor = TEAM_COLORS[player.soldToTeam?.toLowerCase()] || '#666';
                                const teamName = auctionState.teams.find(t => t.id === player.soldToTeam)?.name || player.soldToTeam;

                                return (
                                    <div key={i} className="flex gap-3 items-center p-3 rounded-xl bg-gray-50 border border-gray-100">
                                        <div className="w-10 h-10 rounded-full bg-white border border-gray-200 overflow-hidden shrink-0">
                                            {player.image ? (
                                                <img src={player.image} alt={player.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={24} className="text-gray-300 m-auto mt-2" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-900 text-sm truncate">{player.name}</p>
                                            <p className="text-xs text-gray-500">
                                                Sold to <span style={{ color: teamColor, fontWeight: 'bold' }}>{teamName}</span>
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="inline-block bg-green-100 text-green-700 text-xs font-black px-2 py-1 rounded-md">
                                                {formatPrice(player.soldPrice)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
};

export default AuctionPage;
