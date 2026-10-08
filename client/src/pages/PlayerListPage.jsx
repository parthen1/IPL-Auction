import React, { useState, useEffect } from 'react';
import { getPlayers } from '../services/api';
import { Search, User, Plane, ChevronDown, ChevronRight, Gavel, Award } from 'lucide-react';
import { PLAYER_SETS, SET_ORDER } from '../constants/playerSets';
import { toCr } from '../utils/formatCurrency';

const PlayerListPage = () => {
    const [players, setPlayers] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedRole, setSelectedRole] = useState('All');
    const [selectedStatus, setSelectedStatus] = useState('All');
    const [expandedSets, setExpandedSets] = useState({}); // { 0: true, 1: true ... }

    useEffect(() => {
        fetchPlayers();
        // Poll for updates (reduced frequency and visibility check for performance)
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchPlayers();
            }
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // Set all open initially when players load
    useEffect(() => {
        if (players.length > 0 && Object.keys(expandedSets).length === 0) {
            const initial = {};
            SET_ORDER.forEach(s => initial[s] = true);
            initial['uncategorized'] = true;
            setExpandedSets(initial);
        }
    }, [players]);

    const fetchPlayers = async () => {
        try {
            const data = await getPlayers();
            setPlayers(data);
        } catch (error) {
            console.error('Failed to fetch players', error);
        }
    };

    const toggleSet = (setId) => {
        setExpandedSets(prev => ({ ...prev, [setId]: !prev[setId] }));
    };

    // Filter Logic
    const filteredPlayers = players.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
        const matchesRole = selectedRole === 'All' || p.role.toLowerCase() === selectedRole.toLowerCase();
        
        let matchesStatus = true;
        const pStatus = p.status ? p.status.toUpperCase() : '';
        if (selectedStatus === 'Sold') matchesStatus = pStatus === 'SOLD';
        if (selectedStatus === 'Unsold') matchesStatus = pStatus === 'UNSOLD';
        if (selectedStatus === 'Available') matchesStatus = ['AVAILABLE', 'LIVE'].includes(pStatus);

        return matchesSearch && matchesRole && matchesStatus;
    });

    // Group By Set
    const groupedPlayers = {};
    filteredPlayers.forEach(p => {
        const setKey = p.set !== undefined ? p.set : 'uncategorized';
        if (!groupedPlayers[setKey]) groupedPlayers[setKey] = [];
        groupedPlayers[setKey].push(p);
    });

    const getStatusColor = (status) => {
        switch (status) {
            case 'Sold': return 'bg-green-100 text-green-800 border-green-200';
            case 'Unsold': return 'bg-red-100 text-red-800 border-red-200';
            case 'LIVE': return 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse';
            case 'AVAILABLE': return 'bg-gray-100 text-gray-800 border-gray-200';
            default: return 'bg-gray-50 text-gray-500 border-gray-100';
        }
    };

    const formatPrice = (price) => {
        if (!price) return '-';
        if (price < 1) return `₹${Math.round(price * 100)} L`;
        return `₹${price} Cr`;
    };

    const setsToRender = [...SET_ORDER];
    if (groupedPlayers['uncategorized']) setsToRender.push('uncategorized');

    const getPositionGroupLabel = (groupNum) => {
        switch (groupNum) {
            case 1: return 'Opener';
            case 2: return 'Middle Order';
            case 3: return 'Lower Middle Order';
            case 4: return 'Lower Order';
            default: return '';
        }
    };

    return (
        <div className="space-y-6 h-full flex flex-col pb-10">
            {/* Header & Search */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between sticky top-0 z-20">
                <div className="flex items-center gap-2">
                    <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                        <Award size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 leading-none">Players Directory</h1>
                        <p className="text-xs text-gray-400 font-medium mt-1">Grouped by Auction Sets</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto mt-4 md:mt-0">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm transition-all shadow-sm focus:bg-white"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="py-2.5 px-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm text-gray-700 shadow-sm w-full sm:w-auto"
                    >
                        <option value="All">All Roles</option>
                        <option value="Batsman">Batsman</option>
                        <option value="Bowler">Bowler</option>
                        <option value="All-Rounder">All-Rounder</option>
                        <option value="Wicket Keeper">WK</option>
                    </select>
                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="py-2.5 px-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm text-gray-700 shadow-sm w-full sm:w-auto"
                    >
                        <option value="All">All Statuses</option>
                        <option value="Available">Available / Live</option>
                        <option value="Sold">Sold</option>
                        <option value="Unsold">Unsold</option>
                    </select>
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 px-1">
                {setsToRender.map(setId => {
                    const setPlayers = groupedPlayers[setId];
                    if (!setPlayers || setPlayers.length === 0) return null;

                    const setName = PLAYER_SETS[setId] || (setId === 'uncategorized' ? 'Uncategorized' : `Set ${setId}`);
                    const isExpanded = expandedSets[setId];

                    return (
                        <div key={setId} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300">
                            {/* Set Header */}
                            <button
                                onClick={() => toggleSet(setId)}
                                className="w-full flex items-center justify-between p-4 bg-gray-50/50 hover:bg-gray-50 transition-colors border-b border-gray-100 group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded-lg transition-transform duration-300 ${isExpanded ? 'bg-blue-100 text-blue-600 rotate-90' : 'bg-gray-200 text-gray-500'}`}>
                                        <ChevronRight size={16} strokeWidth={3} />
                                    </div>
                                    <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                        {setName}
                                        <span className="bg-gray-200 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-extrabold">{setPlayers.length}</span>
                                    </h2>
                                </div>
                                <div className="flex items-center gap-4 text-sm font-medium text-gray-400">
                                    <span className="hidden sm:inline">Set {setId}</span>
                                </div>
                            </button>

                            {/* Set Content */}
                            {isExpanded && (
                                <div className="animate-in slide-in-from-top-2 duration-300">
                                    {/* Desktop Table */}
                                    <div className="hidden md:block overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-gray-50/30 text-gray-400 uppercase text-[10px] font-bold tracking-wider border-b border-gray-100">
                                                <tr>
                                                    <th className="px-6 py-3">#</th>
                                                    <th className="px-6 py-3">Player</th>
                                                    <th className="px-6 py-3">Role</th>
                                                    <th className="px-6 py-3">Base Price</th>
                                                    <th className="px-6 py-3">Status</th>
                                                    <th className="px-6 py-3 text-right">Sold For</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {setPlayers.map((p, idx) => (
                                                    <tr key={p.id} className="hover:bg-blue-50/20 transition-colors group">
                                                        <td className="px-6 py-3 text-gray-300 font-mono text-xs">{p.srNo}</td>
                                                        <td className="px-6 py-3 font-bold text-gray-900">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                                                                    {p.image ? (
                                                                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-gray-300"><User size={16} /></div>
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="leading-snug">{p.name}</span>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        {p.isOverseas && <span className="text-[10px] text-blue-500 font-bold flex items-center gap-1"><Plane size={10} /> Overseas</span>}
                                                                        {p.battingPositionGroup && (
                                                                            <span className="text-[10px] text-purple-600 font-bold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 uppercase tracking-wide">
                                                                                {getPositionGroupLabel(p.battingPositionGroup)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-gray-500 text-sm font-medium">{p.role}</td>
                                                        <td className="px-6 py-3 text-gray-500 font-mono text-sm">{formatPrice(p.basePrice)}</td>
                                                        <td className="px-6 py-3">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${getStatusColor(p.status)}`}>
                                                                {p.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-right font-mono font-bold text-gray-900">
                                                            {p.soldPrice ? (
                                                                <span className="text-green-600">₹{toCr(p.soldPrice)} Cr <span className="text-gray-400 text-[10px]">to {p.soldToTeam}</span></span>
                                                            ) : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Cards */}
                                    <div className="md:hidden grid grid-cols-1 divide-y divide-gray-100">
                                        {setPlayers.map(p => (
                                            <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                                                        {p.image ? (
                                                            <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-300"><User size={18} /></div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2 flex-wrap">
                                                            {p.name}
                                                            {p.isOverseas && <Plane size={12} className="text-blue-500" />}
                                                            {p.battingPositionGroup && (
                                                                <span className="text-[9px] text-purple-600 font-bold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 uppercase tracking-wide">
                                                                    {getPositionGroupLabel(p.battingPositionGroup)}
                                                                </span>
                                                            )}
                                                        </h3>
                                                        <p className="text-xs text-gray-400 mt-0.5">{p.role} • {formatPrice(p.basePrice)}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${getStatusColor(p.status)}`}>
                                                        {p.status}
                                                    </span>
                                                    {p.soldPrice && <span className="text-xs font-bold text-green-600">₹{toCr(p.soldPrice)} Cr</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PlayerListPage;
