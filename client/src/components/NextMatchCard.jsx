import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Clock } from 'lucide-react';
import { getFantasyTeamBrand } from '../utils/fantasyBranding';

const TEAM_NAME_TO_CODE = {
    'Mumbai Indians': 'MI',
    'Chennai Super Kings': 'CSK',
    'Royal Challengers Bengaluru': 'RCB',
    'Kolkata Knight Riders': 'KKR',
    'Sunrisers Hyderabad': 'SRH',
    'Delhi Capitals': 'DC',
    'Rajasthan Royals': 'RR',
    'Punjab Kings': 'PBKS',
    'Lucknow Super Giants': 'LSG',
    'Gujarat Titans': 'GT'
};

const TeamLogo = ({ src, code, hasError, onError }) => (
    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center overflow-hidden shadow-md flex-shrink-0 z-10 relative">
        {src && !hasError ? (
            <img src={src} alt={code} className="w-full h-full object-contain p-1.5" onError={onError} />
        ) : (
            <span className="text-sm font-black text-gray-500">{code}</span>
        )}
    </div>
);

const NextMatchCard = ({ match, teamLogoMap = {} }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [t1Err, setT1Err] = useState(false);
    const [t2Err, setT2Err] = useState(false);

    useEffect(() => {
        if (!match?.startTime) return;

        const timer = setInterval(() => {
            const now = new Date();
            const start = new Date(match.startTime);
            const diff = start - now;

            if (diff <= 0) {
                setTimeLeft('Starting soon...');
                clearInterval(timer);
                return;
            }

            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);

            setTimeLeft(`${h}h ${m}m ${s}s`);
        }, 1000);

        return () => clearInterval(timer);
    }, [match]);

    if (!match) return null;

    const t1Code = TEAM_NAME_TO_CODE[match.team1] || match.team1.substring(0,3).toUpperCase();
    const t2Code = TEAM_NAME_TO_CODE[match.team2] || match.team2.substring(0,3).toUpperCase();

    const brand1 = getFantasyTeamBrand(t1Code);
    const brand2 = getFantasyTeamBrand(t2Code);

    return (
        <div className="bg-white rounded-3xl w-full shadow-xl border border-gray-100 overflow-hidden mb-6 animate-in fade-in zoom-in-95 duration-500">
            {/* Header / Timer Section */}
            <div className="relative overflow-hidden" style={{ minHeight: '80px' }}>
                <div className="absolute inset-y-0 left-0 w-1/2" style={{ background: `linear-gradient(135deg, ${brand1.primary}f0, ${brand1.primary}cc)` }} />
                <div className="absolute inset-y-0 right-0 w-1/2" style={{ background: `linear-gradient(225deg, ${brand2.primary}f0, ${brand2.primary}cc)` }} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/30" />
                
                <div className="relative z-10 p-4 flex flex-col items-center justify-center h-full">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest mb-1.5 bg-black/30 px-3 py-1 rounded-full border border-white/20 backdrop-blur-md shadow-sm">Next Match</span>
                    <div className="flex items-center gap-2 text-white font-black text-xl md:text-2xl tabular-nums tracking-tight drop-shadow-md">
                        <Clock size={20} className="text-white/80" /> {timeLeft}
                    </div>
                </div>
            </div>

            {/* Teams Section */}
            <div className="px-4 py-8 flex items-center justify-between gap-4 bg-white relative">
                {/* VS Badge */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 w-10 h-10 md:w-12 md:h-12 bg-gray-50 rounded-full border-4 border-white flex items-center justify-center shadow-inner">
                    <span className="text-xs md:text-sm font-black text-gray-300 italic">VS</span>
                </div>

                <div className="flex flex-col items-center gap-3 flex-1 z-10">
                    <TeamLogo src={teamLogoMap[t1Code]} code={t1Code} hasError={t1Err} onError={() => setT1Err(true)} />
                    <span className="font-black text-gray-900 text-center text-sm md:text-base leading-snug px-2">{match.team1}</span>
                </div>
                
                <div className="flex flex-col items-center gap-3 flex-1 z-10">
                    <TeamLogo src={teamLogoMap[t2Code]} code={t2Code} hasError={t2Err} onError={() => setT2Err(true)} />
                    <span className="font-black text-gray-900 text-center text-sm md:text-base leading-snug px-2">{match.team2}</span>
                </div>
            </div>

            {/* Match Details */}
            <div className="px-4 pb-4 pt-0 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-gray-50 hover:bg-gray-100 transition-colors rounded-2xl p-3 border border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <Calendar size={16} className="text-blue-600" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-400 mb-0.5">Date & Time</p>
                        <p className="text-xs font-bold text-gray-800">{new Date(match.startTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} IST</p>
                    </div>
                </div>
                <div className="bg-gray-50 hover:bg-gray-100 transition-colors rounded-2xl p-3 border border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                        <MapPin size={16} className="text-purple-600" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-400 mb-0.5">Venue</p>
                        <p className="text-xs font-bold text-gray-800 line-clamp-1">{match.venue || 'TBA'}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NextMatchCard;
