import React, { useState, useEffect } from 'react';
import { API_BASE_URL as API_URL } from '../config';
import { Trophy, AlertCircle, ChevronDown, Star } from 'lucide-react';
import { cn } from '../lib/utils';
import LiveScoreboardHub from '../components/LiveScoreboardHub';

const POINT_FILTERS = [
    { key: 'total',    label: 'Total Points',    color: 'text-indigo-600',  bg: 'bg-indigo-50',  border: 'border-indigo-200' },
    { key: 'batting',  label: 'Batting Points',  color: 'text-green-600',   bg: 'bg-green-50',   border: 'border-green-200'  },
    { key: 'bowling',  label: 'Bowling Points',  color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200' },
    { key: 'fielding', label: 'Fielding Points', color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200' },
];

const getTeamPoints = (team, filterKey) => {
    switch (filterKey) {
        case 'batting':  return team.battingPoints  ?? 0;
        case 'bowling':  return team.bowlingPoints  ?? 0;
        case 'fielding': return team.fieldingPoints ?? 0;
        default:         return team.totalPoints    ?? 0;
    }
};

const PointsTablePage = () => {
    const [pointsTable, setPointsTable] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [pointsFilter, setPointsFilter] = useState('total');
    const [showDropdown, setShowDropdown] = useState(false);
    const [showAllWeeks, setShowAllWeeks] = useState(false);

    const activeFilter = POINT_FILTERS.find(f => f.key === pointsFilter);

    useEffect(() => {
        const fetchPoints = async () => {
            const localToken = localStorage.getItem('token');
            if (!localToken) return;

            try {
                const payload = JSON.parse(atob(localToken.split('.')[1]));
                const tournamentId = payload.tournamentId;
                const fbToken = localStorage.getItem('token');

                const res = await fetch(`${API_URL}/api/v2/auth/tournaments/${tournamentId}/points-table`, {
                    headers: { 'Authorization': `Bearer ${fbToken}` }
                });

                const data = await res.json();
                if (res.ok) {
                    setPointsTable(data.pointsTable || []);
                } else {
                    setError('Failed to load points table.');
                }
            } catch (err) {
                console.error(err);
                setError('Network error');
            } finally {
                setLoading(false);
            }
        };

        fetchPoints();
        const interval = setInterval(fetchPoints, 60000); // 1 min auto-refresh
        return () => clearInterval(interval);
    }, []);

    // Re-sort whenever filter changes
    const sortedTable = [...pointsTable].sort(
        (a, b) => getTeamPoints(b, pointsFilter) - getTeamPoints(a, pointsFilter)
    );

    if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading Points Table...</div>;
    if (error)   return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8">
            <LiveScoreboardHub />
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900 flex items-center gap-3">
                        <Trophy className="text-yellow-500" size={28} />
                        Points Table
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Standings based on Playing XI performance.</p>
                </div>

                {/* Points Filter Dropdown */}
                <div className="relative shrink-0">
                    <button
                        onClick={() => setShowDropdown(v => !v)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-colors',
                            activeFilter.bg, activeFilter.border, activeFilter.color
                        )}
                    >
                        <Star size={14} />
                        {activeFilter.label}
                        <ChevronDown size={14} className={cn('transition-transform', showDropdown && 'rotate-180')} />
                    </button>
                    {showDropdown && (
                        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            {POINT_FILTERS.map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => { setPointsFilter(f.key); setShowDropdown(false); }}
                                    className={cn(
                                        'w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors',
                                        pointsFilter === f.key ? `${f.bg} ${f.color}` : 'hover:bg-gray-50 text-gray-700'
                                    )}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            <div className="flex justify-end mb-4">
                <button
                    onClick={() => setShowAllWeeks(!showAllWeeks)}
                    className="text-sm font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
                >
                    {showAllWeeks ? 'Hide Previous Weeks' : 'Show All Weeks'}
                </button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-400 font-bold tracking-wider">
                                <th className="p-3 md:p-6">Pos</th>
                                <th className="p-3 md:p-6">Team</th>
                                
                                {/* Dynamic Week Columns */}
                                {(() => {
                                    const maxWeeks = Math.max(0, ...pointsTable.flatMap(t => 
                                        Object.keys(t.weeklyBreakdown || {}).map(k => parseInt(k.replace('week', '')))
                                    ));
                                    const displayWeeks = showAllWeeks ? Array.from({ length: maxWeeks }, (_, i) => i + 1) 
                                        : Array.from({ length: Math.min(2, maxWeeks) }, (_, i) => maxWeeks - 1 + i).filter(w => w > 0);
                                    
                                    return displayWeeks.map(w => (
                                        <th key={w} className="p-3 md:p-6 text-center">Wk {w}</th>
                                    ));
                                })()}

                                <th className="p-3 md:p-6 text-center text-blue-600 bg-blue-50/50">Live</th>
                                <th className={cn('p-3 md:p-6 text-right font-black', activeFilter.color)}>Total Pts</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {sortedTable.map((team, index) => {
                                const pts = getTeamPoints(team, pointsFilter);
                                const maxWeeks = Math.max(0, ...pointsTable.flatMap(t => 
                                    Object.keys(t.weeklyBreakdown || {}).map(k => parseInt(k.replace('week', '')))
                                ));

                                return (
                                    <tr key={team.id} className="hover:bg-blue-50/50 transition-colors group">
                                        <td className="p-3 md:p-6 font-bold text-gray-400 group-hover:text-blue-600 transition-colors">
                                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                                        </td>
                                        <td className="p-3 md:p-6">
                                            <div className="flex items-center gap-2 md:gap-4">
                                                <div className="w-9 h-9 md:w-12 md:h-12 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden p-1 shrink-0">
                                                    {team.logo ? <img src={team.logo} className="w-full h-full object-contain rounded-lg" alt={team.id} /> : <div className="w-full h-full bg-gray-200" />}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-900 text-sm md:text-lg group-hover:text-blue-700 transition-colors">{team.name}</div>
                                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">{team.id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        
                                        {/* Weekly Data Cells */}
                                        {(() => {
                                            const maxWeeks = Math.max(0, ...pointsTable.flatMap(t => 
                                                Object.keys(t.weeklyBreakdown || {}).map(k => parseInt(k.replace('week', '')))
                                            ));
                                            const displayWeeks = showAllWeeks ? Array.from({ length: maxWeeks }, (_, i) => i + 1) 
                                                : Array.from({ length: Math.min(2, maxWeeks) }, (_, i) => maxWeeks - 1 + i).filter(w => w > 0);
                                            
                                            return displayWeeks.map(w => (
                                                <td key={w} className="p-3 md:p-6 text-center font-bold text-gray-500">
                                                    {team.weeklyBreakdown?.[`week${w}`] || '-'}
                                                </td>
                                            ));
                                        })()}

                                        <td className="p-3 md:p-6 text-center bg-blue-50/20">
                                            <span className="font-black text-blue-600">
                                                +{team.livePoints || 0}
                                            </span>
                                        </td>

                                        <td className="p-3 md:p-6 text-right">
                                            <div className={cn('text-2xl md:text-3xl font-black group-hover:scale-110 transition-transform origin-right', activeFilter.color)}>
                                                {pts}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {pointsTable.length === 0 && (
                    <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                        <AlertCircle size={48} className="mb-4 opacity-50" />
                        <p>No teams found.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PointsTablePage;
