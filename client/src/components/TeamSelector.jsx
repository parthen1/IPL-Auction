import React, { useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { TEAM_COLORS } from '../constants/teamColors';

const TeamSelector = ({ teams, selectedTeam, onSelect }) => {
    const scrollRef = useRef(null);

    // Duplicate teams for infinite scroll
    const displayTeams = [...teams, ...teams, ...teams, ...teams];

    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            const cardWidth = 280;
            const startOffset = teams.length * cardWidth;
            el.scrollLeft = startOffset;

            const handleWheel = (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    el.scrollLeft += e.deltaY;
                }
            };

            el.addEventListener('wheel', handleWheel, { passive: false });
            return () => el.removeEventListener('wheel', handleWheel);
        }
    }, [teams]);

    return (
        <div className="relative w-full max-w-7xl mx-auto h-[450px] flex items-center group/container">

            {/* Fade masks */}
            <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-gray-900 to-transparent z-20 pointer-events-none"></div>
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-gray-900 to-transparent z-20 pointer-events-none"></div>

            {/* Scroll Container */}
            <div
                ref={scrollRef}
                className="flex gap-8 overflow-x-auto snap-x snap-mandatory px-[calc(50%-140px)] py-10 scrollbar-hide no-scrollbar items-center w-full h-full"
                style={{ scrollBehavior: 'smooth' }}
            >
                {displayTeams.map((team, index) => {
                    const isSelected = selectedTeam?.id === team.id;
                    const isTaken = team.isTaken;
                    const uniqueKey = `${team.id}-${index}`;
                    const teamColor = TEAM_COLORS[team.id?.toLowerCase()] || '#FFFFFF';

                    return (
                        <button
                            key={uniqueKey}
                            disabled={isTaken && !team.isMyTeam}
                            onClick={() => onSelect(team)}
                            // Define CSS variable for the specific team color
                            style={{
                                '--team-color': teamColor,
                                ...(isSelected ? { borderColor: teamColor, boxShadow: `0 0 30px ${teamColor}40` } : {})
                            }}
                            className={cn(
                                "flex-shrink-0 relative w-[280px] h-[360px] rounded-3xl overflow-hidden transition-all duration-300 ease-out snap-center outline-none bg-slate-900 group/card",
                                "border-2 border-slate-800", // Default neutral border
                                // Hover Effects using CSS variable
                                !isTaken && "hover:scale-105 hover:border-[var(--team-color)] hover:shadow-[0_0_25px_var(--team-color)]",
                                // Selection State
                                isSelected ? "scale-105 z-10" : "scale-90 opacity-70 hover:opacity-100 hover:scale-100",
                                // Taken State
                                isTaken && "opacity-30 grayscale cursor-not-allowed"
                            )}
                        >
                            {/* Inner Glow / Content Wrapper */}
                            <div className="absolute inset-0 flex flex-col items-center justify-between p-6">

                                {/* Background Watermark */}
                                <div className="absolute inset-0 overflow-hidden rounded-3xl opacity-0 group-hover/card:opacity-10 transition-opacity">
                                    <h1 className="text-[150px] font-black text-[var(--team-color)] -rotate-45 translate-y-10 translate-x-4 select-none">
                                        {team.id}
                                    </h1>
                                </div>

                                {/* Top: Team Abbreviation or Logo */}
                                <div className="mt-8 z-10 relative flex items-center justify-center w-full">
                                    {team.logo ? (
                                        <img
                                            src={team.logo}
                                            alt={team.id}
                                            className="w-40 h-40 object-contain drop-shadow-2xl transition-transform duration-300 group-hover/card:scale-110"
                                        />
                                    ) : (
                                        <h2
                                            className="text-7xl font-black tracking-tighter uppercase drop-shadow-xl transition-colors duration-300"
                                            style={{ color: isSelected || !isTaken ? 'var(--team-color)' : '#64748b' }}
                                        >
                                            {team.id}
                                        </h2>
                                    )}
                                </div>

                                {/* Bottom: Info & Status */}
                                <div className="text-center w-full mb-6 z-10">
                                    {/* Bottom: Info & Status */}
                                    <div className="text-center w-full mb-6 z-10">
                                        {team.isMyTeam ? (
                                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                                <span className="text-xs font-bold text-green-500 uppercase tracking-widest">Your Team</span>
                                            </div>
                                        ) : isTaken ? (
                                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
                                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Taken</span>
                                            </div>
                                        ) : (
                                            <>
                                                <h3 className="text-gray-400 font-medium text-sm uppercase tracking-widest mb-3 line-clamp-1 group-hover/card:text-white transition-colors">
                                                    {team.name}
                                                </h3>
                                                {/* Animated Underline */}
                                                <div className="h-1 w-8 mx-auto rounded-full bg-slate-700 group-hover/card:w-16 group-hover/card:bg-[var(--team-color)] transition-all duration-300"></div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default TeamSelector;
