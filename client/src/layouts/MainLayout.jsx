import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Gavel, Users, UserCircle, Menu, X, BookOpen, LogOut, Wallet, Shield, Trophy, Check, ArrowLeftRight, ArrowLeft, Zap, Activity, ListOrdered } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getTeams } from '../services/api';

const MainLayout = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { user: team, logout } = useAuth(); // Map user to team for compatibility
    const { socket } = useSocket();
    const [teamDetails, setTeamDetails] = useState(team);
    const [budget, setBudget] = useState(team?.remainingPurse || team?.budget || 0);
    const [activeUsers, setActiveUsers] = useState([]);

    // Sync Budget & Fetch Team Details
    useEffect(() => {
        if (team) {
            setBudget(team.remainingPurse || team.budget || 0);

            // Fetch fresh team details (including logo)
            const fetchTeamDetails = async () => {
                try {
                    const teams = await getTeams();
                    const myData = teams.find(t =>
                        (t.id && team.id && t.id.toLowerCase() === team.id.toLowerCase()) ||
                        (t.code && team.code && t.code.toLowerCase() === team.code.toLowerCase()) ||
                        (t.name && team.name && t.name.toLowerCase() === team.name.toLowerCase())
                    );

                    if (myData) {
                        console.log("Found Team Data:", myData);
                        setTeamDetails(prev => ({ ...prev, ...myData }));
                        setBudget(myData.remainingPurse || myData.budget || 0);
                    } else {
                        console.warn("Could not find matching team in API response", { team, teamsMatch: teams.map(t => t.id) });
                    }
                } catch (error) {
                    console.error("Failed to fetch fresh team details:", error);
                }
            };
            fetchTeamDetails();
        }
    }, [team]);

    useEffect(() => {
        if (socket && team) {
            const handleUpdate = (data) => {
                if (data.teams) {
                    const myData = data.teams.find(t => t.id === team.id || t.code === team.code);
                    if (myData) {
                        setBudget(myData.remainingPurse || myData.budget || 0);
                    }
                }
            };

            const handleUserList = (list) => {
                setActiveUsers(list);
            };

            const handleTeamUpdate = (update) => {
                if (update.teamCode === team.id || update.teamCode === team.code) {
                    setBudget(update.remainingPurse);
                }
            };

            socket.on('auction:state', handleUpdate);
            socket.on('auction:sync', handleUpdate);
            socket.on('team:update', handleTeamUpdate);
            socket.on('users:active_list', handleUserList);
            // Also Request sync on mount to ensure freshness
            socket.emit('auction:request_sync');

            return () => {
                socket.off('auction:state', handleUpdate);
                socket.off('auction:sync', handleUpdate);
                socket.off('team:update', handleTeamUpdate);
                socket.off('users:active_list', handleUserList);
            };
        }
    }, [socket, team]);

    // Navigation Items
    const navItems = [
        { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Auction', path: '/auction', icon: Gavel },
        { name: 'Players', path: '/players', icon: Users },
        { name: 'Teams', path: '/teams', icon: Users },
        { name: 'Trade', path: '/trade', icon: ArrowLeftRight },
        { name: 'Match Centre', path: '/match-centre', icon: Activity },
        { name: 'Rules', path: '/rules', icon: BookOpen },
        { name: 'Playing XI', path: '/select-playing-xi', icon: Check },
        { name: 'Points Table', path: '/points-table', icon: ListOrdered },
        { name: 'Player Points', path: '/player-points', icon: Zap },
        { name: 'Main Menu', path: '/main-menu', icon: ArrowLeft },
    ];

    // Logic for NEW badges - target expiration: 24hrs from 2026-03-14T21:06:03+05:30
    const checkIsNew = (itemName) => {
        if (!['Rules', 'Players', 'Match Centre'].includes(itemName)) return false;

        const expirationDate = new Date('2026-03-15T21:06:03+05:30');
        const now = new Date();
        return now < expirationDate;
    };

    // Add Switch Tournament as a utility item
    navItems.push({ name: 'Switch Tournament', path: '/tournaments', icon: Trophy, hidden: true });

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row font-sans text-gray-900">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-64 bg-white shadow-xl h-screen fixed left-0 top-0 z-30 border-r border-gray-100">
                <div className="p-6 border-b border-gray-100 flex items-center justify-center">
                    <h1 className="text-2xl font-black text-auction-primary tracking-tighter">Auction <span className="text-auction-secondary">Arena</span></h1>
                </div>
                <nav className="flex-1 overflow-y-auto py-6">
                    <ul className="space-y-2 px-4">
                        {navItems.filter(item => !item.hidden).map((item) => (
                            <li key={item.path}>
                                <NavLink
                                    to={item.path}
                                    className={({ isActive }) =>
                                        cn(
                                            "flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 font-bold text-sm",
                                            isActive
                                                ? "bg-auction-primary text-white shadow-lg shadow-blue-500/30 translate-x-1"
                                                : "text-gray-500 hover:bg-gray-50 hover:text-auction-primary hover:pl-6"
                                        )
                                    }
                                >
                                    <div className="flex items-center gap-3">
                                        <item.icon size={20} strokeWidth={2.5} />
                                        <span>{item.name}</span>
                                    </div>
                                    {checkIsNew(item.name) && (
                                        <span className="ml-auto bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm animate-pulse uppercase tracking-wider">New</span>
                                    )}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>
                <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    <button
                        onClick={logout}
                        className="w-full py-3 px-4 rounded-xl border border-red-100 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
                {/* Top Header */}
                <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
                    <div className="md:hidden">
                        <h1 className="text-xl font-black text-auction-primary">Auction <span className="text-auction-secondary">Arena</span></h1>
                    </div>
                    <div className="hidden md:block flex-1 ml-8">
                        <div className="group relative flex items-center gap-2 cursor-help">
                            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                            <div className="bg-green-50 border border-green-100 px-3 py-1 rounded-full flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-tighter text-green-600">Active</span>
                                <span className="text-sm font-black text-gray-900">{activeUsers.length}</span>
                            </div>

                            <div className="absolute top-full left-0 mt-2 bg-white border border-gray-100 shadow-xl rounded-xl p-3 min-w-max opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 pb-1 border-b border-gray-50">Online Teams</p>
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    {activeUsers.length > 0 ? activeUsers.map(code => (
                                        <span key={code} className="px-2 py-0.5 bg-gray-50 text-gray-700 rounded text-[10px] font-bold border border-gray-100 uppercase">
                                            {code}
                                        </span>
                                    )) : (
                                        <span className="text-[10px] text-gray-400">No teams active</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* User Menu / Right Side */}
                    <div className="flex items-center gap-4">
                        {team ? (
                            <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-bold text-gray-900 leading-none">{teamDetails?.name || team.name}</p>
                                    <p className="text-[10px] uppercase font-bold text-gray-400 mt-1 tracking-wider">{teamDetails?.username || team.username || team.code || 'Team Account'}</p>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-auction-primary/10 border border-auction-primary/20 flex items-center justify-center overflow-hidden p-0.5">
                                    {(teamDetails?.logo || team.logo) ? (
                                        <img src={teamDetails?.logo || team.logo} alt={teamDetails?.name || team.name} className="w-full h-full object-cover rounded-full" />
                                    ) : (
                                        <div className="w-full h-full bg-auction-primary flex items-center justify-center rounded-full">
                                            <span className="text-white font-bold text-lg leading-none">
                                                {team.code?.[0] || team.name?.[0] || 'U'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-gray-400">
                                <span className="text-sm font-bold">Guest Mode</span>
                            </div>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24">
                    <Outlet />
                </div>
            </main>

            {/* Mobile Bottom Navigation */}
            {(() => {
                const primaryPaths = ['/dashboard', '/select-playing-xi', '/match-centre', '/points-table', '/player-points'];
                const primaryItems = navItems.filter(item => !item.hidden && primaryPaths.includes(item.path)).sort((a,b) => primaryPaths.indexOf(a.path) - primaryPaths.indexOf(b.path));
                const moreItems = navItems.filter(item => !item.hidden && !primaryPaths.includes(item.path));
                return (
                    <>
                        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.07)] z-30 border-t border-gray-100 flex items-stretch"
                            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                            {primaryItems.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) =>
                                        cn(
                                            "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors relative",
                                            isActive ? "text-auction-primary" : "text-gray-400"
                                        )
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            {isActive && (
                                                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-auction-primary" />
                                            )}
                                            <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                                            <span className="text-[10px] font-semibold tracking-tight">{item.name}</span>
                                            {checkIsNew(item.name) && (
                                                <span className="absolute top-1.5 right-1/4 bg-red-500 text-white text-[7px] font-black px-1 py-0.5 rounded-full shadow-sm animate-pulse uppercase">New</span>
                                            )}
                                        </>
                                    )}
                                </NavLink>
                            ))}

                            {/* More Button */}
                            <button
                                onClick={() => setIsMobileMenuOpen(prev => !prev)}
                                className={cn(
                                    "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors relative",
                                    isMobileMenuOpen ? "text-auction-primary" : "text-gray-400"
                                )}
                            >
                                {isMobileMenuOpen && (
                                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-auction-primary" />
                                )}
                                <div className="flex flex-col gap-[3px] items-center">
                                    <span className={cn("block w-4 h-0.5 rounded-full transition-all", isMobileMenuOpen ? "bg-auction-primary" : "bg-gray-400")} />
                                    <span className={cn("block w-4 h-0.5 rounded-full transition-all", isMobileMenuOpen ? "bg-auction-primary" : "bg-gray-400")} />
                                    <span className={cn("block w-4 h-0.5 rounded-full transition-all", isMobileMenuOpen ? "bg-auction-primary" : "bg-gray-400")} />
                                </div>
                                <span className="text-[10px] font-semibold tracking-tight">More</span>
                            </button>
                        </nav>

                        {/* More Drawer Backdrop */}
                        {isMobileMenuOpen && (
                            <div
                                className="md:hidden fixed inset-0 bg-black/30 z-40"
                                onClick={() => setIsMobileMenuOpen(false)}
                            />
                        )}

                        {/* More Drawer */}
                        <div className={cn(
                            "md:hidden fixed left-0 right-0 bottom-[57px] bg-white z-50 rounded-t-3xl shadow-2xl border-t border-gray-100 transition-all duration-300",
                            isMobileMenuOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
                        )}>
                            <div className="flex justify-center pt-3 pb-1">
                                <div className="w-10 h-1 rounded-full bg-gray-200" />
                            </div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-5 pb-2">Navigation</p>
                            <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                                {moreItems.map((item) => (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={({ isActive }) =>
                                            cn(
                                                "flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all",
                                                isActive
                                                    ? "bg-auction-primary text-white shadow-md"
                                                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                                            )
                                        }
                                    >
                                        <item.icon size={18} strokeWidth={2} />
                                        <span>{item.name}</span>
                                    </NavLink>
                                ))}
                            </div>
                            <div className="px-4 pb-5 border-t border-gray-50 pt-3">
                                <button
                                    onClick={() => { logout(); setIsMobileMenuOpen(false); }}
                                    className="w-full py-3 px-4 rounded-xl border border-red-100 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    <LogOut size={16} /> Logout
                                </button>
                            </div>
                        </div>
                    </>
                );
            })()}
        </div >
    );
};

export default MainLayout;
