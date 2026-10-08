import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Users, Wallet, Trophy, Gavel, ArrowRight, Clock, AlertCircle, LogOut, Plane, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TEAM_COLORS } from '../constants/teamColors';
import { getTeams } from '../services/api';
import { toCr } from '../utils/formatCurrency';

const DashboardPage = () => {
    const { socket } = useSocket();
    const { user, logout } = useAuth();
    const [stats, setStats] = useState({
        budget: 120, // 120 Cr
        squadCount: 0,
        overseasCount: 0,
        totalSpent: 0
    });
    const [auctionStatus, setAuctionStatus] = useState({
        currentPlayer: null,
        currentBid: 0,
        highestBidder: null,
        timer: 20,
        isSold: false
    });

    // Get static team info for ID/Name
    const teamId = user?.id || user?.code;
    const teamColor = TEAM_COLORS[teamId?.toLowerCase()] || '#2563eb';

    useEffect(() => {
        if (!socket) return;

        // Fetch initial state via API for reliability
        const fetchTeamData = async () => {
            if (teamId) {
                try {
                    const teams = await getTeams();
                    const myData = teams.find(t => t.id?.toLowerCase() === teamId?.toLowerCase());
                    if (myData) {
                        setStats({
                            budget: myData.remainingPurse,
                            squadCount: myData.squadSize,
                            overseasCount: myData.overseasCount,
                            totalSpent: 120 - myData.remainingPurse
                        });
                    }
                } catch (err) {
                    console.error("Failed to fetch team data via API", err);
                }
            }
        };
        fetchTeamData();

        // Request latest state immediately on mount (fixes navigation desync)
        socket.emit('auction:request_sync');

        const handleUpdate = (state) => {
            // 1. Update Global Auction Status
            setAuctionStatus({
                currentPlayer: state.currentPlayer,
                currentBid: state.currentBid,
                highestBidder: state.highestBidder,
                timer: state.timer,
                isSold: state.isSold
            });

            // 2. Find MY updated team stats from the array
            // Socket sync is still real-time source of truth
            if (state.teams && teamId) {
                const myData = state.teams.find(t => t.id?.toLowerCase() === teamId?.toLowerCase());
                if (myData) {
                    setStats({
                        budget: myData.budget || myData.remainingPurse, // Handle both structures if mixed
                        squadCount: myData.squadCount || myData.squadSize || 0,
                        overseasCount: myData.overseasCount || 0,
                        totalSpent: 120 - (myData.budget || myData.remainingPurse)
                    });
                }
            }
        };

        // Listen for sync and state events
        socket.on('auction:sync', handleUpdate);
        socket.on('auction:state', handleUpdate);

        // Listen for team-specific updates (e.g., after player sold)
        const handleTeamUpdate = (update) => {
            if (update.teamCode?.toLowerCase() === teamId?.toLowerCase()) {
                setStats(prev => ({
                    ...prev,
                    budget: update.remainingPurse,
                    squadCount: update.squadSize,
                    overseasCount: update.overseasCount
                }));
            }
        };
        socket.on('team:update', handleTeamUpdate);

        // Also listen for detailed events for immediate feedback
        const handleAuctionStart = (data) => {
            setAuctionStatus(prev => ({ ...prev, currentPlayer: data.currentPlayer, currentBid: data.currentBid, isSold: false }));
        };
        socket.on('auctionStart', handleAuctionStart);

        const handleBidPlaced = ({ amount, team }) => {
            // Optional: visual flair
        };
        socket.on('bidPlaced', handleBidPlaced);

        return () => {
            socket.off('auction:sync', handleUpdate);
            socket.off('auction:state', handleUpdate);
            socket.off('team:update', handleTeamUpdate);
            socket.off('auctionStart', handleAuctionStart);
            socket.off('bidPlaced', handleBidPlaced);
        };
    }, [socket, teamId]);

    // Calculate progress
    const pursePercentage = (stats.budget / 120) * 100;
    const squadPercentage = (stats.squadCount / 25) * 100;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Team Dashboard</h1>
                    <p className="text-sm text-gray-500">Real-time overview of your auction status.</p>
                </div>

                {/* Admin Quick Link */}
                {user?.role === 'admin' && (
                    <Link to="/admin" className="self-start sm:self-auto px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-500/30 hover:bg-red-700 transition flex items-center gap-2">
                        <Gavel size={16} />
                        Admin Controls
                    </Link>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* STATS CARDS ROW OR SPECTATOR WELCOME */}
                {user?.role === 'spectator' ? (
                    <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
                        <div>
                            <h2 className="text-3xl font-black mb-2 flex items-center gap-3">
                                Welcome to the Arena <Trophy className="text-yellow-400" />
                            </h2>
                            <p className="text-blue-100 max-w-lg leading-relaxed">
                                You are currently in <strong>Spectator Mode</strong>. Watch the drama unfold live, track highest bids, and see which players go to which teams.
                            </p>
                        </div>
                        <Link to="/auction" className="shrink-0 px-8 py-4 bg-white text-blue-700 font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2">
                            Enter Live Auction <ArrowRight size={20} />
                        </Link>
                    </div>
                ) : (
                    <div className="col-span-1 md:col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* PURSE CARD (Requested "Proper Card") */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Wallet size={80} className="text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Remaining Purse</p>
                                <h3 className="text-4xl font-black text-gray-900 tracking-tight">
                                    ₹{toCr(stats.budget)} <span className="text-lg text-gray-400 font-bold">Cr</span>
                                </h3>
                            </div>
                            <div className="mt-4">
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-1000 ease-out"
                                        style={{ width: `${pursePercentage}%` }}
                                    ></div>
                                </div>
                                <p className="text-xs font-bold text-gray-400 mt-2 text-right">
                                    {pursePercentage.toFixed(0)}% Budget Left
                                </p>
                            </div>
                        </div>

                        {/* SQUAD CARD */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Users size={80} className="text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Squad Size</p>
                                <h3 className="text-4xl font-black text-gray-900 tracking-tight">
                                    {stats.squadCount}<span className="text-lg text-gray-400 font-bold">/25</span>
                                </h3>
                            </div>
                            <div className="mt-4">
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 transition-all duration-1000 ease-out"
                                        style={{ width: `${(stats.squadCount / 25) * 100}%` }}
                                    ></div>
                                </div>
                                <p className="text-xs font-bold text-gray-400 mt-2 text-right">
                                    Min 18 to Qualify
                                </p>
                            </div>
                        </div>

                        {/* OVERSEAS CARD */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Trophy size={80} className="text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Overseas Slots</p>
                                <h3 className="text-4xl font-black text-gray-900 tracking-tight">
                                    {stats.overseasCount}<span className="text-lg text-gray-400 font-bold">/8</span>
                                </h3>
                            </div>
                            <div className="mt-4">
                                <div className="flex gap-1">
                                    {[...Array(8)].map((_, i) => (
                                        <div
                                            key={i}
                                            className={`h-2 flex-1 rounded-full ${i < stats.overseasCount ? 'bg-purple-500' : 'bg-gray-100'}`}
                                        ></div>
                                    ))}
                                </div>
                                <p className="text-xs font-bold text-gray-400 mt-2 text-right">
                                    {8 - stats.overseasCount} Slots Left
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* LIVE STATUS CARD */}
                <div className="col-span-1 md:col-span-2 bg-gray-900 text-white p-5 md:p-8 rounded-3xl shadow-xl relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                    <div className="relative z-10 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Live Auction</span>
                            </div>
                            <h3 className="text-xl md:text-2xl font-bold break-words">
                                {auctionStatus.currentPlayer ? (
                                    <>
                                        Current: <span className="text-blue-400 flex items-center gap-2 flex-wrap">
                                            {auctionStatus.currentPlayer.name}
                                            {auctionStatus.currentPlayer.isOverseas && <Plane size={18} className="text-blue-300" />}
                                        </span>
                                    </>
                                ) : (
                                    "Waiting for next player..."
                                )}
                            </h3>
                        </div>
                        {auctionStatus.currentPlayer && (
                            <div className="sm:text-right shrink-0">
                                <p className="text-xs font-bold text-gray-400 uppercase mb-1">Current Bid</p>
                                <p className="text-2xl md:text-3xl font-black">₹{auctionStatus.currentBid.toFixed(2)} Cr</p>
                            </div>
                        )}
                    </div>

                    <div className="relative z-10 mt-5 flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            {auctionStatus.highestBidder && (
                                <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/10">
                                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                    <span className="text-xs font-bold">Bid: {auctionStatus.highestBidder.name}</span>
                                </div>
                            )}
                        </div>

                        <Link to="/auction" className="px-5 py-2.5 bg-white text-gray-900 rounded-xl font-bold text-sm hover:bg-gray-100 transition-colors flex items-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transform duration-200">
                            Join Auction <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Quick Navigation Links */}
            <div className="grid grid-cols-2 gap-4">
                <Link to="/select-playing-xi" className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col items-center justify-center text-center gap-3 group">
                    <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Check size={28} />
                    </div>
                    <span className="font-bold text-gray-900">Playing XI</span>
                </Link>
                <Link to="/points-table" className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col items-center justify-center text-center gap-3 group">
                    <div className="w-14 h-14 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Trophy size={28} />
                    </div>
                    <span className="font-bold text-gray-900">Points Table</span>
                </Link>
            </div>

            {/* Quick Actions / Tips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-3xl border border-indigo-100/50">
                    <h3 className="font-bold text-indigo-900 mb-2">Auction Strategy</h3>
                    <p className="text-sm text-indigo-700/80">Keep at least ₹20 Cr for the final round of accelerated bidding.</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-5 rounded-3xl border border-orange-100/50">
                    <h3 className="font-bold text-orange-900 mb-2">Squad Balance</h3>
                    <p className="text-sm text-orange-700/80">Don't forget to fill your minimum 18 player quota early.</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 p-5 rounded-3xl border border-cyan-100/50">
                    <h3 className="font-bold text-cyan-900 mb-2">Upcoming</h3>
                    <p className="text-sm text-cyan-700/80">Next set: Marquee All-Rounders. Be prepared.</p>
                </div>
            </div>

            {/* Rules / Extra Section */}
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-6 flex items-start gap-4">
                <AlertCircle className="text-orange-500 shrink-0" size={24} />
                <div>
                    <h3 className="font-bold text-orange-900 mb-1">Remember the Rules</h3>
                    <p className="text-orange-700 text-sm leading-relaxed">
                        Minimum scheduled squad size is 18. Maximum overseas players allowed is 8. Ensure you maintain the minimum purse spend.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
