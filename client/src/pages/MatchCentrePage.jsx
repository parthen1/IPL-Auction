import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Trophy, X, Construction, Filter, ChevronDown, Loader2, Users, TableProperties, LineChart } from 'lucide-react';
import { getSchedule, getSquads, getTeams } from '../services/api';
import { getFantasyTeamBrand } from '../utils/fantasyBranding';

// --- HELPERS ---
const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTime = (timeStr) => {
    if(!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
};

const groupByDate = (matches) => {
    return matches.reduce((acc, match) => {
        const key = match.MatchDate;
        if (!acc[key]) acc[key] = [];
        acc[key].push(match);
        return acc;
    }, {});
};

// --- COMPONENTS ---
const StatusBadge = ({ status }) => {
    const styles = {
        Live: 'bg-red-100 text-red-700 border-red-200 animate-pulse',
        UpComing: 'bg-cyan-50 text-cyan-600 border-cyan-100',
        Completed: 'bg-green-50 text-green-700 border-green-100',
    };
    const labels = {
        Live: '🔴 Live',
        UpComing: 'Upcoming',
        Completed: 'Completed',
    };
    return (
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${styles[status] || styles.UpComing}`}>
            {labels[status] || status}
        </span>
    );
};

const TeamLogo = ({ src, code, hasError, onError }) => (
    <div className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full bg-gray-50 border-2 border-gray-100 flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
        {src && !hasError ? (
            <img src={src} alt={code} className="w-full h-full object-contain p-1" onError={onError} />
        ) : (
            <span className="text-xs sm:text-sm font-black text-gray-500">{code}</span>
        )}
    </div>
);

const MatchDetailPanel = ({ match, onClose, isModal = false, teamLogoMap = {} }) => {
    const [t1Err, setT1Err] = useState(false);
    const [t2Err, setT2Err] = useState(false);

    if (!match) {
        if (!isModal) {
            // Placeholder for right panel when nothing is selected
            return (
                <div className="bg-white rounded-3xl h-full min-h-[500px] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center p-8">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                        <Trophy size={32} className="text-gray-300" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">Select a Match</h3>
                    <p className="text-gray-400 max-w-xs leading-relaxed text-sm">Click any match from the schedule to view full match details, scorecards, and live stats.</p>
                </div>
            );
        }
        return null; // modal hides completely if no match
    }

    const brand1 = getFantasyTeamBrand(match.Team1Code);
    const brand2 = getFantasyTeamBrand(match.Team2Code);

    const content = (
        <div className="bg-white rounded-3xl w-full lg:max-w-none max-w-md shadow-2xl lg:shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 mx-auto border border-gray-100">
            {/* Half-and-half header */}
            <div className="relative overflow-hidden" style={{ minHeight: '70px' }}>
                <div className="absolute inset-y-0 left-0 w-1/2" style={{ background: `linear-gradient(135deg, ${brand1.primary}f0, ${brand1.primary}cc)` }} />
                <div className="absolute inset-y-0 right-0 w-1/2" style={{ background: `linear-gradient(225deg, ${brand2.primary}f0, ${brand2.primary}cc)` }} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/20" />
                <div className="relative z-10 p-5 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-white/80 uppercase tracking-widest mb-1">IPL 2026</p>
                        <StatusBadge status={match.MatchStatus} />
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors text-white">
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            {/* Teams */}
            <div className="px-6 py-6 flex items-center justify-between gap-4">
                <div className="flex flex-col items-center gap-2 flex-1">
                    <TeamLogo src={match.Team1Logo || teamLogoMap[match.Team1Code]} code={match.Team1Code} hasError={t1Err} onError={() => setT1Err(true)} />
                    <span className="font-black text-gray-900 text-center text-sm leading-snug">{match.Team1Code}</span>
                </div>
                <span className="text-2xl font-black text-gray-200">VS</span>
                <div className="flex flex-col items-center gap-2 flex-1">
                    <TeamLogo src={match.Team2Logo || teamLogoMap[match.Team2Code]} code={match.Team2Code} hasError={t2Err} onError={() => setT2Err(true)} />
                    <span className="font-black text-gray-900 text-center text-sm leading-snug">{match.Team2Code}</span>
                </div>
            </div>

            {/* Info */}
            <div className="px-6 pb-4 grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Date</p>
                    <p className="text-sm font-bold text-gray-800">{formatDate(match.MatchDate)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Time</p>
                    <p className="text-sm font-bold text-gray-800">{formatTime(match.MatchTime)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 col-span-2">
                    <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Venue</p>
                    <p className="text-sm font-bold text-gray-800">{match.Ground}, {match.City}</p>
                </div>
            </div>

            {/* Banner */}
            <div className="mx-6 mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Construction size={18} className="text-amber-600" />
                </div>
                <div>
                    <p className="text-sm font-black text-amber-900">Scorecard Pending</p>
                    <p className="text-xs text-amber-700 font-medium">Live scores & stats coming soon!</p>
                </div>
            </div>
        </div>
    );

    if (isModal) {
        return (
            <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 lg:hidden" onClick={onClose}>
                <div onClick={e => e.stopPropagation()} className="w-full max-w-md">
                    {content}
                </div>
            </div>
        );
    }
    
    return <div className="hidden lg:block sticky top-8 w-full h-full">{content}</div>;
};

const MatchCard = ({ match, isSelected, onClick, teamLogoMap = {} }) => {
    const [t1Err, setT1Err] = useState(false);
    const [t2Err, setT2Err] = useState(false);

    const brand1 = getFantasyTeamBrand(match.Team1Code);
    const brand2 = getFantasyTeamBrand(match.Team2Code);
    const logo1 = match.Team1Logo || teamLogoMap[match.Team1Code];
    const logo2 = match.Team2Logo || teamLogoMap[match.Team2Code];

    return (
        <div
            onClick={onClick}
            className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer active:scale-95 flex-shrink-0 ${
                isSelected 
                ? 'border-emerald-500 shadow-lg shadow-emerald-500/10 lg:translate-x-2' 
                : 'border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5'
            }`}
        >
            {/* Half-and-half header */}
            <div className="relative overflow-hidden" style={{ minHeight: '100px' }}>
                {/* Left – Team 1 color */}
                <div
                    className="absolute inset-y-0 left-0 w-1/2"
                    style={{ background: `linear-gradient(135deg, ${brand1.primary}f0, ${brand1.primary}cc)` }}
                />
                {/* Right – Team 2 color */}
                <div
                    className="absolute inset-y-0 right-0 w-1/2"
                    style={{ background: `linear-gradient(225deg, ${brand2.primary}f0, ${brand2.primary}cc)` }}
                />
                {/* Dark bottom fade for legibility */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/25" />

                {/* Content */}
                <div className="relative z-10 flex flex-col h-full px-3 py-2">
                    {/* Top: league label + status */}
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-white/80 uppercase tracking-widest">IPL 2026</span>
                        <StatusBadge status={match.MatchStatus} />
                    </div>

                    {/* Teams */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-1 flex-col items-center gap-1">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center overflow-hidden shadow backdrop-blur-sm">
                                {logo1 && !t1Err ? (
                                    <img src={logo1} alt={match.Team1Code} className="w-full h-full object-contain p-1" onError={() => setT1Err(true)} />
                                ) : (
                                    <span className="text-[10px] font-black text-white">{match.Team1Code}</span>
                                )}
                            </div>
                            <span className="text-xs font-black text-white drop-shadow-sm text-center leading-tight">{match.Team1Code}</span>
                        </div>

                        <div className="flex-shrink-0 rounded-full bg-white/20 border border-white/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white backdrop-blur-sm">
                            vs
                        </div>

                        <div className="flex flex-1 flex-col items-center gap-1">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center overflow-hidden shadow backdrop-blur-sm">
                                {logo2 && !t2Err ? (
                                    <img src={logo2} alt={match.Team2Code} className="w-full h-full object-contain p-1" onError={() => setT2Err(true)} />
                                ) : (
                                    <span className="text-[10px] font-black text-white">{match.Team2Code}</span>
                                )}
                            </div>
                            <span className="text-xs font-black text-white drop-shadow-sm text-center leading-tight">{match.Team2Code}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 bg-gray-50/60">
                <div className="flex items-center gap-1.5 text-gray-400">
                    <Clock size={11} />
                    <span className="text-[11px] font-bold">{formatTime(match.MatchTime)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-400">
                    <MapPin size={11} />
                    <span className="text-[11px] font-bold truncate max-w-[160px]" title={match.Ground}>{match.Ground}</span>
                </div>
            </div>
        </div>
    );
};

// --- VIEWS ---

const ScheduleView = ({ schedule, allTeams, allVenues, teamLogoMap = {} }) => {
    const [selectedMatch, setSelectedMatch] = useState(null);
    const [teamFilter, setTeamFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');
    const [venueFilter, setVenueFilter] = useState('All');

    const filteredSchedule = schedule.filter(match => {
        const teamMatch = teamFilter === 'All' || match.Team1Code === teamFilter || match.Team2Code === teamFilter;
        const statusMatch = statusFilter === 'All' || match.MatchStatus === statusFilter;
        const venueMatch = venueFilter === 'All' || match.City === venueFilter;
        return teamMatch && statusMatch && venueMatch;
    });

    const grouped = groupByDate(filteredSchedule);
    const sortedDates = Object.keys(grouped).sort();

    return (
        <div className="flex flex-col lg:flex-row gap-8 items-start w-full relative">
            {/* LEFT PANE */}
            <div className="w-full lg:w-1/2 xl:w-[45%] flex-shrink-0 flex flex-col gap-6">
                
                {/* Filters */}
                <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 items-center">
                    <div className="flex items-center justify-between w-full sm:w-auto">
                        <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400 mr-2 shrink-0">
                            <Filter className="w-4 h-4 sm:w-4 sm:h-4" />
                            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider">Filter</span>
                        </div>
                        {/* Mobile Clear Button */}
                        {(teamFilter !== 'All' || statusFilter !== 'All' || venueFilter !== 'All') && (
                            <button
                                onClick={() => { setTeamFilter('All'); setStatusFilter('All'); setVenueFilter('All'); }}
                                className="sm:hidden text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors ml-auto uppercase tracking-wider"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    <div className="w-full sm:flex-1 relative min-w-[120px]">
                        <select
                            value={teamFilter}
                            onChange={(e) => setTeamFilter(e.target.value)}
                            className="w-full appearance-none bg-gray-50 border border-gray-200 pl-3 sm:pl-4 pr-8 py-2 sm:py-2.5 rounded-xl font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-[11px] sm:text-xs transition-shadow hover:bg-gray-100 cursor-pointer"
                        >
                            <option value="All">All Teams</option>
                            {allTeams.map(team => <option key={team} value={team}>{team}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                    </div>

                    <div className="w-full sm:flex-1 relative min-w-[120px]">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full appearance-none bg-gray-50 border border-gray-200 pl-3 sm:pl-4 pr-8 py-2 sm:py-2.5 rounded-xl font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-[11px] sm:text-xs transition-shadow hover:bg-gray-100 cursor-pointer"
                        >
                            <option value="All">All Statuses</option>
                            <option value="UpComing">Upcoming</option>
                            <option value="Live">Live</option>
                            <option value="Completed">Completed</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                    </div>

                    {/* Desktop Clear Button */}
                    {(teamFilter !== 'All' || statusFilter !== 'All' || venueFilter !== 'All') && (
                        <button
                            onClick={() => { setTeamFilter('All'); setStatusFilter('All'); setVenueFilter('All'); }}
                            className="hidden sm:block text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors uppercase tracking-wider"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* List */}
                <div className="space-y-6 pb-20">
                    {sortedDates.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                            <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                            <h3 className="text-lg font-bold text-gray-900">No Matches Found</h3>
                        </div>
                    ) : (
                        sortedDates.map((date) => (
                            <div key={date}>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-1.5 shadow-sm">
                                        <Calendar size={12} className="text-emerald-600" />
                                        <span className="text-sm font-black text-gray-700">{formatDate(date)}</span>
                                    </div>
                                    <div className="flex-1 h-px bg-gray-200" />
                                </div>
                                {/* Stack Vertically on Desktop using col-cols-1 */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                                    {grouped[date].map((match) => (
                                        <MatchCard
                                            key={match.MatchID}
                                            match={match}
                                            isSelected={selectedMatch?.MatchID === match.MatchID}
                                            onClick={() => setSelectedMatch(match)}
                                            teamLogoMap={teamLogoMap}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* RIGHT PANE (Desktop Scorecard) */}
            <div className="hidden lg:block lg:w-1/2 xl:w-[55%] flex-shrink-0 sticky top-8 self-start pt-2">
                <MatchDetailPanel match={selectedMatch} teamLogoMap={teamLogoMap} />
            </div>

            {/* MOBILE MODAL (Small Screens) */}
            {selectedMatch && (
                <MatchDetailPanel match={selectedMatch} onClose={() => setSelectedMatch(null)} isModal={true} teamLogoMap={teamLogoMap} />
            )}
        </div>
    );
};

const SquadsView = ({ teamLogoMap = {} }) => {
    const [squads, setSquads] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedTeam, setSelectedTeam] = useState('All');

    useEffect(() => {
        const fetchSquads = async () => {
            try {
                const data = await getSquads();
                setSquads(data);
            } catch (err) {
                console.error("Failed to load squads:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchSquads();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[40vh]">
                <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
                <p className="text-gray-500 font-bold">Loading Franchise Squads...</p>
            </div>
        );
    }

    const teamKeys = Object.keys(squads).sort();

    return (
        <div className="w-full">
            {/* Team Picker */}
            <div className="flex overflow-x-auto gap-2 sm:gap-3 pb-3 mb-4 sm:mb-6 scrollbar-hide snap-x">
                <button
                    onClick={() => setSelectedTeam('All')}
                    className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition-all border snap-start ${
                        selectedTeam === 'All' 
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20' 
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    All Teams
                </button>
                {teamKeys.map(t => (
                    <button
                        key={t}
                        onClick={() => setSelectedTeam(t)}
                        className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition-all border snap-start ${
                            selectedTeam === t 
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20' 
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* Squad Grids */}
            <div className="space-y-12 pb-20">
                {teamKeys.filter(t => selectedTeam === 'All' || selectedTeam === t).map(teamCode => (
                    <div key={teamCode} className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 flex flex-col items-start">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-14 h-14 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-center font-black text-gray-400 text-xl shadow-inner overflow-hidden flex-shrink-0">
                                {teamLogoMap[teamCode] ? (
                                    <img src={teamLogoMap[teamCode]} alt={teamCode} className="w-full h-full object-contain p-2" />
                                ) : (
                                    teamCode
                                )}
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 leading-tight">{teamCode} Squad</h3>
                                <p className="text-gray-400 font-medium">{squads[teamCode].length} Players</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
                            {squads[teamCode].map(player => (
                                <div key={player._id} className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50/80 border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors group">
                                    <div className="w-12 h-12 rounded-full bg-white shadow-sm border border-gray-200 overflow-hidden flex-shrink-0 group-hover:shadow-md transition-shadow">
                                        {player.image ? (
                                            <img src={player.image} alt={player.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <Users className="w-full h-full p-2.5 text-gray-300" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-900 truncate text-sm">{player.name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] uppercase font-bold text-emerald-600 bg-emerald-100/50 border border-emerald-100 px-2 rounded tracking-wider">{player.role}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const PointsTableView = ({ teamLogoMap = {} }) => {
    // Zero-data state as requested
    const teams = ['CSK', 'DC', 'GT', 'KKR', 'LSG', 'MI', 'PBKS', 'RCB', 'RR', 'SRH'];
    
    return (
        <div className="w-full max-w-4xl pb-20">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden text-left">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 text-white">
                    <div>
                        <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                            <TableProperties size={24} className="text-emerald-200" />
                            IPL 2026 Points Table
                        </h2>
                        <p className="text-emerald-100 text-sm mt-1 font-medium">Official Tournament Standings</p>
                    </div>
                </div>

                <div className="p-0 overflow-x-auto scrollbar-hide">
                    <table className="w-full border-collapse min-w-[600px] text-left">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500 font-black">
                                <th className="p-5 text-center w-16">Pos</th>
                                <th className="p-5">Team</th>
                                <th className="p-5 text-center w-20">P</th>
                                <th className="p-5 text-center w-20">W</th>
                                <th className="p-5 text-center w-20">L</th>
                                <th className="p-5 text-center w-24">NRR</th>
                                <th className="p-5 text-center w-24 text-emerald-600">Pts</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {teams.map((team, index) => (
                                <tr key={team} className="hover:bg-gray-50/80 transition-colors">
                                    <td className="p-4 text-center font-bold text-gray-400">{index + 1}</td>
                                    <td className="p-4 font-black text-gray-800 flex items-center gap-3 text-base">
                                        <div className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-[10px] text-gray-500 shadow-sm overflow-hidden flex-shrink-0">
                                            {teamLogoMap[team] ? (
                                                <img src={teamLogoMap[team]} alt={team} className="w-full h-full object-contain p-1" />
                                            ) : (
                                                team
                                            )}
                                        </div>
                                        {team}
                                    </td>
                                    <td className="p-4 text-center font-bold text-gray-600">0</td>
                                    <td className="p-4 text-center font-bold text-gray-600">0</td>
                                    <td className="p-4 text-center font-bold text-gray-600">0</td>
                                    <td className="p-4 text-center font-bold text-gray-400">0.000</td>
                                    <td className="p-4 text-center font-black text-emerald-600 text-lg">0</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                <div className="p-5 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2 text-[11px] uppercase tracking-wider font-bold text-gray-400">
                    <p><span className="text-gray-600">P</span> = Played</p>
                    <p><span className="text-gray-600">W</span> = Won</p>
                    <p><span className="text-gray-600">L</span> = Lost</p>
                    <p><span className="text-gray-600">NRR</span> = Net Run Rate</p>
                    <p><span className="text-gray-600">Pts</span> = Points</p>
                </div>
            </div>
        </div>
    );
};

// --- MAIN PAGE ---

const MatchCentrePage = () => {
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('schedule');
    const [teamLogoMap, setTeamLogoMap] = useState({});

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [scheduleData, teamsData] = await Promise.all([
                    getSchedule(),
                    getTeams().catch(() => [])
                ]);
                
                setSchedule(scheduleData);
                
                const logoMap = {};
                if (teamsData && teamsData.length > 0) {
                    teamsData.forEach(team => {
                        if (team.logo) logoMap[team.code || team.id] = team.logo;
                    });
                }
                setTeamLogoMap(logoMap);
            } catch (error) {
                console.error("Failed to fetch match centre data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
                <p className="text-gray-500 font-bold">Loading portal...</p>
            </div>
        );
    }

    const allTeams = [...new Set(schedule.flatMap(m => [m.Team1Code, m.Team2Code]))].sort();
    const allVenues = [...new Set(schedule.map(m => m.City))].sort();

    return (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 animate-in fade-in duration-500 w-full min-h-screen">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 sm:gap-6 mb-6 sm:mb-10">
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight">Match Centre</h1>
                        <p className="text-[10px] sm:text-sm md:text-base text-emerald-600 font-bold tracking-wide uppercase mt-0.5 sm:mt-1">Tata IPL 2026 Portal</p>
                    </div>
                </div>

                {/* Navbar Tabs - Floating style */}
                <div className="flex p-1 bg-white border border-gray-200/80 rounded-2xl w-full md:w-auto shadow-sm">
                    {[
                        { id: 'schedule', label: 'Schedule', icon: Calendar },
                        { id: 'squads', label: 'Squads', icon: Users },
                        { id: 'table', label: 'Points Table', icon: LineChart }
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 md:w-32 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-2.5 rounded-xl font-bold text-[10px] sm:text-sm transition-all duration-200 ${
                                    isActive
                                    ? 'bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100/50'
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                            >
                                <Icon className={`w-4 h-4 sm:w-4 sm:h-4 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                                <span className="block sm:inline">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content Switch */}
            <div className="w-full">
                {activeTab === 'schedule' && <ScheduleView schedule={schedule} allTeams={allTeams} allVenues={allVenues} teamLogoMap={teamLogoMap} />}
                {activeTab === 'squads' && <SquadsView teamLogoMap={teamLogoMap} />}
                {activeTab === 'table' && <PointsTableView teamLogoMap={teamLogoMap} />}
            </div>
        </div>
    );
};

export default MatchCentrePage;
