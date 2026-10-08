import React from 'react';
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

const MatchScoreCard = ({ summary, teamLogoMap = {} }) => {
    const [t1Err, setT1Err] = React.useState(false);
    const [t2Err, setT2Err] = React.useState(false);

    if (!summary) return null;

    const {
        battingTeam,
        bowlingTeam,
        totalScore,
        crr,
        batters = [],
        bowler = null,
        inningsNo
    } = summary;

    const t1Code = TEAM_NAME_TO_CODE[battingTeam] || battingTeam?.substring(0,3).toUpperCase() || 'T1';
    const t2Code = TEAM_NAME_TO_CODE[bowlingTeam] || bowlingTeam?.substring(0,3).toUpperCase() || 'T2';

    const brand1 = getFantasyTeamBrand(t1Code);
    const brand2 = getFantasyTeamBrand(t2Code);

    return (
        <div className="bg-white rounded-3xl w-full shadow-xl border border-gray-100 overflow-hidden mb-6 animate-in fade-in zoom-in-95 duration-500">
            {/* Header / Live Banner Section */}
            <div className="relative overflow-hidden" style={{ minHeight: '80px' }}>
                <div className="absolute inset-y-0 left-0 w-1/2" style={{ background: `linear-gradient(135deg, ${brand1.primary}f0, ${brand1.primary}cc)` }} />
                <div className="absolute inset-y-0 right-0 w-1/2" style={{ background: `linear-gradient(225deg, ${brand2.primary}f0, ${brand2.primary}cc)` }} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/30" />
                
                <div className="relative z-10 p-4 flex flex-col items-center justify-center h-full">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest mb-1.5 bg-red-600/90 px-3 py-1 rounded-full border border-red-500/50 backdrop-blur-md shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-pulse flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-white rounded-full"></span> LIVE
                    </span>
                    <div className="flex items-center gap-2 text-white font-black text-xl md:text-3xl tracking-tight drop-shadow-md">
                        {totalScore || '0/0'}
                    </div>
                </div>
            </div>

            {/* Teams Section */}
            <div className="px-4 py-6 flex items-center justify-between gap-4 bg-white relative">
                {/* VS Badge */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 w-10 h-10 md:w-12 md:h-12 bg-gray-50 rounded-full border-4 border-white flex items-center justify-center shadow-inner">
                    <span className="text-xs md:text-sm font-black text-gray-300 italic">VS</span>
                </div>

                <div className="flex flex-col items-center gap-3 flex-1 z-10">
                    <TeamLogo src={teamLogoMap[t1Code]} code={t1Code} hasError={t1Err} onError={() => setT1Err(true)} />
                    <span className="font-black text-gray-900 text-center text-sm md:text-base leading-snug px-2">{battingTeam}</span>
                    <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Batting</span>
                </div>
                
                <div className="flex flex-col items-center gap-3 flex-1 z-10">
                    <TeamLogo src={teamLogoMap[t2Code]} code={t2Code} hasError={t2Err} onError={() => setT2Err(true)} />
                    <span className="font-black text-gray-900 text-center text-sm md:text-base leading-snug px-2">{bowlingTeam}</span>
                    <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Bowling</span>
                </div>
            </div>

            {/* Match Details */}
            <div className="px-4 pb-4 pt-0">
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                        <span className="text-sm font-bold text-gray-800">Innings {inningsNo}</span>
                        <span className="text-sm font-bold text-blue-600">CRR: {crr || '0.00'}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Batters</span>
                            {batters.length > 0 ? batters.map((b, i) => (
                                <div key={i} className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-gray-800 flex items-center gap-1">{b.name} <span className="text-blue-500">*</span></span>
                                    <span className="font-bold text-gray-900">{b.runs} <span className="text-gray-400 text-xs font-normal">({b.balls})</span></span>
                                </div>
                            )) : (
                                <div className="text-xs text-gray-400 italic">Waiting for batters...</div>
                            )}
                        </div>

                        <div className="space-y-2 md:pl-4 md:border-l border-gray-200">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bowler</span>
                            {bowler ? (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-gray-800">{bowler.name}</span>
                                    <span className="font-bold text-gray-900">{bowler.wickets}/{bowler.runs} <span className="text-gray-400 text-xs font-normal">({bowler.overs})</span></span>
                                </div>
                            ) : (
                                <div className="text-xs text-gray-400 italic">Waiting for bowler...</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MatchScoreCard;
