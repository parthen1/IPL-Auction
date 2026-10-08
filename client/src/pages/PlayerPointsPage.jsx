import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Zap, Activity, Trophy, User } from 'lucide-react';
import { fetchAllPastMatches, fetchLivePoints, fetchAllPlayersWithPoints, fetchCapStats } from '../services/fantasyApi';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (v) => (v == null ? '—' : v);

const ROLE_COLOR = {
    'Batsman':       { bg: '#eff6ff', color: '#1d4ed8' },
    'Bowler':        { bg: '#f0fdf4', color: '#15803d' },
    'All-Rounder':   { bg: '#fdf4ff', color: '#9333ea' },
    'All-rounder':   { bg: '#fdf4ff', color: '#9333ea' },
    'Wicket Keeper': { bg: '#fff7ed', color: '#ea580c' },
};
const roleStyle = (r) => ROLE_COLOR[r] || { bg: '#f3f4f6', color: '#374151' };

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

// ─── main ───────────────────────────────────────────────────────────────────
export default function PlayerPointsPage() {
    // match tab
    const [matches, setMatches]             = useState([]);
    const [selMatch, setSelMatch]           = useState('');
    const [matchPoints, setMatchPoints]     = useState([]);
    const [loadingMatch, setLoadingMatch]   = useState(false);
    const [matchError, setMatchError]       = useState('');
    const [updatedAt, setUpdatedAt]         = useState(null);

    // all-players tab
    const [allPlayers, setAllPlayers]       = useState([]);
    const [loadingPlayers, setLoadingPlayers] = useState(true);

    // ui
    const [tab, setTab]                     = useState('match');  // 'match' | 'total' | 'orange' | 'purple'
    const [expanded, setExpanded]           = useState({});
    const [matchSort, setMatchSort]         = useState('total');   // 'total'|'bat'|'bowl'|'field'
    const [totalSort, setTotalSort]         = useState('totalPoints');

    // caps tab
    const [capStats, setCapStats]           = useState(null);
    const [loadingCaps, setLoadingCaps]     = useState(false);

    // ── matchId → sequential number map ─────────────────────────────────────
    const matchNumMap = useMemo(() => {
        const m = {};
        // matches is newest-first in state; build from full sorted (oldest=1)
        [...matches].reverse().forEach(match => { m[match.match_id] = match.match_number; });
        return m;
    }, [matches]);

    // ── load dropdown ────────────────────────────────────────────────────────
    useEffect(() => {
        fetchAllPastMatches().then(data => {
            const sorted = [...data].reverse(); // newest first
            setMatches(sorted);
            if (sorted.length) setSelMatch(String(sorted[0].match_id));
        }).catch(() => {});
    }, []);

    // ── load match points ────────────────────────────────────────────────────
    const loadMatchPoints = useCallback(async (id) => {
        if (!id) return;
        setLoadingMatch(true); setMatchError('');
        try {
            const d = await fetchLivePoints(id);
            setMatchPoints(d?.data ?? []);
            setUpdatedAt(d?.updated_at ?? null);
        } catch { setMatchPoints([]); setMatchError('No points data for this match yet.'); }
        finally { setLoadingMatch(false); }
    }, []);

    useEffect(() => { if (selMatch) loadMatchPoints(selMatch); }, [selMatch, loadMatchPoints]);

    // ── load all players ─────────────────────────────────────────────────────
    useEffect(() => {
        fetchAllPlayersWithPoints().then(setAllPlayers).catch(() => {}).finally(() => setLoadingPlayers(false));
    }, []);

    useEffect(() => {
        if ((tab === 'orange' || tab === 'purple') && !capStats) {
            setLoadingCaps(true);
            fetchCapStats().then(data => {
                setCapStats(data);
                setLoadingCaps(false);
            }).catch(e => {
                console.error(e);
                setLoadingCaps(false);
            });
        }
    }, [tab, capStats]);

    // ── selected match meta ──────────────────────────────────────────────────
    const selMatchMeta = useMemo(() => matches.find(m => String(m.match_id) === String(selMatch)), [matches, selMatch]);

    // ── sorted match rows ────────────────────────────────────────────────────
    const sortedMatchRows = useMemo(() => {
        const rows = matchPoints.map((p, i) => ({ ...p, _rank: i + 1 }));
        if (matchSort === 'bat')   return [...rows].sort((a,b) => (b.bat??0)-(a.bat??0));
        if (matchSort === 'bowl')  return [...rows].sort((a,b) => (b.bowl??0)-(a.bowl??0));
        if (matchSort === 'field') return [...rows].sort((a,b) => (b.field??0)-(a.field??0));
        return rows; // default: total (already sorted from API)
    }, [matchPoints, matchSort]);

    // ── sorted all-player rows ───────────────────────────────────────────────
    const sortedPlayers = useMemo(() => {
        return [...allPlayers].sort((a,b) => (b[totalSort]??0)-(a[totalSort]??0));
    }, [allPlayers, totalSort]);

    const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

    // ── dropdown label ───────────────────────────────────────────────────────
    const matchLabel = (m) => {
        const t1 = TEAM_NAME_TO_CODE[m.teams?.home] || m.teams?.home?.split(' ').map(w => w[0]).join('') || '';
        const t2 = TEAM_NAME_TO_CODE[m.teams?.away] || m.teams?.away?.split(' ').map(w => w[0]).join('') || '';
        return `M${m.match_number} · ${t1} vs ${t2}`;
    };

    // ────────────────────────────────────────────────────────────────────────
    return (
        <div style={{ maxWidth: 920, margin: '0 auto', padding: 16, fontFamily: 'inherit' }}>
            <style>{`
                .ppg-hdr{background:linear-gradient(135deg,#0f172a,#1e1b4b,#312e81);border-radius:18px;padding:22px 24px;color:#fff;margin-bottom:18px;position:relative;overflow:hidden}
                .ppg-hdr::before{content:'';position:absolute;top:-30px;right:-30px;width:140px;height:140px;background:rgba(99,102,241,.18);border-radius:50%}
                .ppg-tabs{display:flex;gap:8px;margin-bottom:16px}
                .ppg-tab{flex:1;padding:10px;border:2px solid #e5e7eb;border-radius:12px;font-weight:800;font-size:.8rem;cursor:pointer;background:#fff;transition:all .15s}
                .ppg-tab.active{background:#6366f1;color:#fff;border-color:#6366f1}
                .ppg-controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
                .ppg-sel{flex:1;min-width:180px;padding:9px 14px;border:2px solid #e5e7eb;border-radius:12px;font-weight:700;font-size:.83rem;color:#111;background:#fff;outline:none}
                .ppg-sel:focus{border-color:#6366f1}
                .ppg-btn{display:inline-flex;align-items:center;gap:6px;background:#6366f1;color:#fff;border:none;border-radius:11px;padding:9px 14px;font-size:.78rem;font-weight:800;cursor:pointer}
                .ppg-btn:hover{background:#4f46e5}
                .ppg-sort-grp{display:flex;background:#f3f4f6;border-radius:10px;padding:3px}
                .ppg-sort-btn{padding:5px 12px;border-radius:8px;font-size:.72rem;font-weight:800;border:none;cursor:pointer;background:transparent;color:#6b7280}
                .ppg-sort-btn.active{background:#fff;color:#6366f1;box-shadow:0 1px 4px rgba(0,0,0,.1)}
                .ppg-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px}
                .ppg-stat{background:#fff;border-radius:14px;padding:14px;border:1px solid #f3f4f6}
                .ppg-stat-lbl{font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#9ca3af}
                .ppg-stat-val{font-size:1.5rem;font-weight:900;color:#111;margin-top:3px}
                .ppg-thead{display:grid;grid-template-columns:42px 1fr 90px 46px 46px 46px 46px 62px;gap:6px;background:#f8fafc;border-radius:12px;padding:8px 14px;font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:6px}
                .ppg-thead2{display:grid;grid-template-columns:42px 1fr 90px 60px 46px 46px 46px 70px;gap:6px;background:#f8fafc;border-radius:12px;padding:8px 14px;font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:6px}
                .ppg-row{background:#fff;border-radius:14px;border:1px solid #f1f5f9;margin-bottom:6px;overflow:hidden}
                .ppg-row-main{display:grid;grid-template-columns:42px 1fr 90px 46px 46px 46px 46px 62px;gap:6px;align-items:center;padding:12px 14px;cursor:pointer}
                .ppg-row-main2{display:grid;grid-template-columns:42px 1fr 90px 60px 46px 46px 46px 70px;gap:6px;align-items:center;padding:12px 14px;cursor:pointer}
                .ppg-thead3{display:grid;grid-template-columns:42px 1fr 60px 50px 50px 70px;gap:6px;background:#f8fafc;border-radius:12px;padding:8px 14px;font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:6px}
                .ppg-row-main3{display:grid;grid-template-columns:42px 1fr 60px 50px 50px 70px;gap:6px;align-items:center;padding:12px 14px}
                .ppg-rank{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;font-size:.62rem;font-weight:900;background:#f3f4f6;color:#6b7280}
                .ppg-chip{display:inline-block;border-radius:9px;padding:4px 10px;font-size:.72rem;font-weight:900;color:#fff;background:#1e293b}
                .ppg-chip.top{background:linear-gradient(135deg,#dc2626,#ef4444)}
                .ppg-cum{display:inline-block;border-radius:9px;padding:4px 10px;font-size:.72rem;font-weight:900;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
                .ppg-expand{display:inline-flex;align-items:center;gap:3px;font-size:.68rem;font-weight:800;color:#6366f1;background:none;border:none;cursor:pointer;margin-top:2px}
                .ppg-bd{padding:0 14px 12px;background:#fafbff;border-top:1px solid #e0e7ff}
                .ppg-bd-title{font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#818cf8;padding:8px 0 5px}
                .ppg-bd-grid{display:flex;flex-wrap:wrap;gap:6px}
                .ppg-bd-chip{background:#ede9fe;border-radius:9px;padding:5px 10px;font-size:.7rem}
                .ppg-bd-chip strong{font-weight:900;color:#4f46e5}
                .ppg-loading{display:flex;align-items:center;justify-content:center;min-height:180px;gap:10px;color:#94a3b8;font-weight:700}
                .ppg-spin{width:28px;height:28px;border:3px solid #e0e7ff;border-top-color:#6366f1;border-radius:50%;animation:spin .7s linear infinite}
                @keyframes spin{to{transform:rotate(360deg)}}
                .ppg-empty{text-align:center;padding:50px 20px;color:#94a3b8;font-weight:700}
                .ppg-err{background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px 18px;color:#dc2626;font-weight:700;margin-bottom:14px;font-size:.85rem}
                .ppg-upd{font-size:.68rem;color:#94a3b8;font-weight:600;text-align:right;margin-bottom:6px}
                .ppg-team-badge{display:inline-block;border-radius:7px;padding:2px 8px;font-size:.62rem;font-weight:900;background:#f3f4f6;color:#374151}
                .ppg-unsold{background:#fef3c7;color:#92400e}
                @media(max-width:600px){
                    .ppg-thead, .ppg-thead2 { display: none; }
                    .ppg-row-main, .ppg-row-main2 { 
                        display: flex; 
                        flex-direction: row; 
                        flex-wrap: wrap; 
                        align-items: center; 
                        gap: 12px; 
                        padding: 12px; 
                    }
                    .ppg-row-main > *:nth-child(1), .ppg-row-main2 > *:nth-child(1) { width: 30px; } /* Rank */
                    .ppg-row-main > *:nth-child(2), .ppg-row-main2 > *:nth-child(2) { flex: 1; min-width: 150px; } /* Player Info */
                    .ppg-row-main > *:nth-child(3), .ppg-row-main2 > *:nth-child(3) { width: 100%; order: 4; margin-top: 4px; padding-left: 42px; } /* Auction Team */
                    .ppg-row-main > *:nth-child(4), .ppg-row-main > *:nth-child(5), .ppg-row-main > *:nth-child(6), .ppg-row-main > *:nth-child(7) { display: none; } /* Hide breakdown columns on mobile main view */
                    .ppg-row-main2 > *:nth-child(4), .ppg-row-main2 > *:nth-child(5), .ppg-row-main2 > *:nth-child(6), .ppg-row-main2 > *:nth-child(7) { display: none; }
                    .ppg-row-main > *:last-child, .ppg-row-main2 > *:last-child { margin-left: auto; order: 3; } /* Total Pts */
                    
                    .ppg-thead3 { display: none; }
                    .ppg-row-main3 { 
                        display: flex; 
                        flex-direction: row; 
                        flex-wrap: wrap; 
                        align-items: center; 
                        gap: 12px; 
                        padding: 12px; 
                    }
                    .ppg-row-main3 > *:nth-child(1) { width: 30px; } /* Rank */
                    .ppg-row-main3 > *:nth-child(2) { flex: 1; min-width: 150px; } /* Player Info */
                    .ppg-row-main3 > *:nth-child(3) { width: auto; font-weight: 900; background: #f3f4f6; padding: 2px 8px; border-radius: 6px; order: 4; } /* Team */
                    .ppg-row-main3 > *:nth-child(4) { margin-left: auto; order: 3; } /* Runs/Wkts */
                    .ppg-row-main3 > *:nth-child(5), .ppg-row-main3 > *:nth-child(6) { display: none; } /* Hide Mat and SR/Econ on main row */
                }
            `}</style>

            {/* Header */}
            <div className="ppg-hdr">
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <span style={{ display:'inline-flex',alignItems:'center',gap:5,background:'rgba(255,255,255,.15)',borderRadius:999,padding:'3px 10px',fontSize:'.62rem',fontWeight:900,textTransform:'uppercase',letterSpacing:1,marginBottom:8 }}>
                            <span style={{ width:6,height:6,borderRadius:'50%',background:'#4ade80',animation:'spin .7s linear infinite' }} />
                            Fantasy Points
                        </span>
                        <h1 style={{ margin:0,fontSize:'1.4rem',fontWeight:900 }}>Player Points</h1>
                        <p style={{ margin:'4px 0 0',fontSize:'.73rem',opacity:.6 }}>Match-wise & cumulative fantasy points</p>
                    </div>
                    <Zap size={36} style={{ opacity:.12 }} />
                </div>
            </div>

            {/* Tabs */}
            <div className="ppg-tabs" style={{flexWrap:'wrap'}}>
                <button className={`ppg-tab${tab==='match'?' active':''}`} onClick={() => setTab('match')}>⚡ match vise report</button>
                <button className={`ppg-tab${tab==='total'?' active':''}`} onClick={() => setTab('total')}>🏆 whole ipl points stats</button>
                <button className={`ppg-tab${tab==='orange'?' active':''}`} onClick={() => setTab('orange')}>🟠 orange cap</button>
                <button className={`ppg-tab${tab==='purple'?' active':''}`} onClick={() => setTab('purple')}>🟣 purple cap</button>
            </div>

            {/* Disclaimer */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: '.75rem', color: '#92400e', display: 'flex', gap: 10, alignItems: 'center' }}>
                <Activity size={18} className="shrink-0" />
                <p style={{ margin: 0 }}><strong>Note:</strong> Due to first week data loss, our leaderboard and the official IPL fantasy leaderboard might show different points.</p>
            </div>

            {/* ── MATCH TAB ────────────────────────────────────────────── */}
            {tab === 'match' && (<>
                <div className="ppg-controls">
                    <select className="ppg-sel" value={selMatch} onChange={e => setSelMatch(e.target.value)}>
                        {matches.map(m => (
                            <option key={m.match_id} value={m.match_id}>{matchLabel(m)}</option>
                        ))}
                    </select>
                    <button className="ppg-btn" onClick={() => loadMatchPoints(selMatch)} disabled={loadingMatch}>
                        <RefreshCw size={13} style={{ animation: loadingMatch ? 'spin .7s linear infinite' : 'none' }} />
                        Refresh
                    </button>
                    <div className="ppg-sort-grp">
                        {[['total','Total'],['bat','Bat'],['bowl','Bowl'],['field','Field']].map(([k,l]) => (
                            <button key={k} className={`ppg-sort-btn${matchSort===k?' active':''}`} onClick={() => setMatchSort(k)}>{l}</button>
                        ))}
                    </div>
                </div>

                {selMatchMeta && (
                    <div style={{ background:'#fff',border:'1px solid #e0e7ff',borderRadius:14,padding:'10px 16px',marginBottom:14,fontSize:'.78rem',fontWeight:700,color:'#4338ca' }}>
                        Match {selMatchMeta.match_number} · {selMatchMeta.teams?.home} vs {selMatchMeta.teams?.away} · {selMatchMeta.venue}
                    </div>
                )}

                {matchError && <div className="ppg-err">{matchError}</div>}

                {!loadingMatch && sortedMatchRows.length > 0 && (
                    <div className="ppg-stats">
                        {[['Players', sortedMatchRows.length, '#6366f1'],['Top Score', Math.max(...sortedMatchRows.map(p=>p.total??0)), '#f59e0b']].map(([l,v,c]) => (
                            <div className="ppg-stat" key={l}><div className="ppg-stat-lbl" style={{color:c}}>{l}</div><div className="ppg-stat-val">{v}</div></div>
                        ))}
                    </div>
                )}

                {updatedAt && <div className="ppg-upd">Updated: {new Date(updatedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'})} IST</div>}

                {loadingMatch && <div className="ppg-loading"><div className="ppg-spin" /><span>Loading…</span></div>}

                {!loadingMatch && sortedMatchRows.length > 0 && (<>
                    <div className="ppg-thead">
                        <span>#</span><span>Player</span><span>Auction Team</span>
                        <span style={{textAlign:'center'}}>Bat</span>
                        <span style={{textAlign:'center'}}>Bowl</span>
                        <span style={{textAlign:'center'}}>Field</span>
                        <span style={{textAlign:'center'}}>Play</span>
                        <span style={{textAlign:'right'}}>Total</span>
                    </div>
                    {sortedMatchRows.map((p) => {
                        const key = `m-${p._rank}`;
                        return (
                            <div className="ppg-row" key={key}>
                                <div className="ppg-row-main" onClick={() => toggle(key)}>
                                    <div><span className="ppg-rank">{p._rank <= 3 ? ['🥇','🥈','🥉'][p._rank-1] : p._rank}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f1f5f9', overflow: 'hidden', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                            {p.image ? (
                                                <img src={p.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                                    <User size={16} style={{ color: '#94a3b8' }} />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div style={{fontWeight:900,fontSize:'.87rem',color:'#0f172a'}}>{p.player}</div>
                                            {p.team && <div style={{fontSize:'.65rem',color:'#94a3b8',marginTop:2}}>{p.team}</div>}
                                        </div>
                                    </div>
                                    <div>
                                        <span className={`ppg-team-badge${!p.auctionTeam?' ppg-unsold':''}`}>{p.auctionTeam ?? 'Unsold'}</span>
                                    </div>
                                    <div style={{textAlign:'center',fontWeight:700,color:'#374151'}}>{fmt(p.bat)}</div>
                                    <div style={{textAlign:'center',fontWeight:700,color:'#374151'}}>{fmt(p.bowl)}</div>
                                    <div style={{textAlign:'center',fontWeight:700,color:'#374151'}}>{fmt(p.field)}</div>
                                    <div style={{textAlign:'center',fontWeight:700,color:'#374151'}}>{fmt(p.play)}</div>
                                    <div style={{textAlign:'right'}}>
                                        <span className={`ppg-chip${p._rank<=3?' top':''}`}>{fmt(p.total)}</span>
                                    </div>
                                </div>
                                {expanded[key] && (
                                    <div className="ppg-bd">
                                        <div className="ppg-bd-title">Points Breakdown</div>
                                        <div className="ppg-bd-grid">
                                            <div className="ppg-bd-chip"><strong>Batting</strong> <span style={{color:'#1d4ed8'}}>{fmt(p.bat)}</span></div>
                                            <div className="ppg-bd-chip"><strong>Bowling</strong> <span style={{color:'#15803d'}}>{fmt(p.bowl)}</span></div>
                                            <div className="ppg-bd-chip"><strong>Fielding</strong> <span style={{color:'#ea580c'}}>{fmt(p.field)}</span></div>
                                            <div className="ppg-bd-chip"><strong>Play</strong> <span style={{color:'#6b7280'}}>{fmt(p.play)}</span></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>)}

                {!loadingMatch && sortedMatchRows.length === 0 && !matchError && (
                    <div className="ppg-empty"><Activity size={36} style={{opacity:.3,margin:'0 auto 10px',display:'block'}} /><p>No points data for this match yet.</p></div>
                )}
            </>)}

            {/* ── ALL PLAYERS TAB ──────────────────────────────────────── */}
            {tab === 'total' && (<>
                <div className="ppg-controls">
                    <div className="ppg-sort-grp">
                        {[['totalPoints','Total'],['batting','Batting'],['bowling','Bowling'],['fielding','Fielding']].map(([k,l]) => (
                            <button key={k} className={`ppg-sort-btn${totalSort===k?' active':''}`} onClick={() => setTotalSort(k)}>{l}</button>
                        ))}
                    </div>
                    <span style={{marginLeft:'auto',fontSize:'.75rem',color:'#94a3b8',fontWeight:700}}>{sortedPlayers.length} players</span>
                </div>

                {loadingPlayers && <div className="ppg-loading"><div className="ppg-spin" /><span>Loading players…</span></div>}

                {!loadingPlayers && (<>
                    <div className="ppg-thead2">
                        <span>#</span><span>Player</span><span>Auction Team</span><span>Role</span>
                        <span style={{textAlign:'center'}}>Bat</span>
                        <span style={{textAlign:'center'}}>Bowl</span>
                        <span style={{textAlign:'center'}}>Field</span>
                        <span style={{textAlign:'right'}}>Total Pts</span>
                    </div>
                    {sortedPlayers.map((p, idx) => {
                        const key = `t-${idx}`;
                        const hasBreakdown = p.perMatchPoints?.length > 0;
                        const rs = roleStyle(p.role);
                        return (
                            <div className="ppg-row" key={key}>
                                <div className="ppg-row-main2" onClick={() => hasBreakdown && toggle(key)}>
                                    <div><span className="ppg-rank">{idx+1 <= 3 ? ['🥇','🥈','🥉'][idx] : idx+1}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f1f5f9', overflow: 'hidden', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                            {p.image ? (
                                                <img src={p.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                                    <User size={16} style={{ color: '#94a3b8' }} />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div style={{fontWeight:900,fontSize:'.87rem',color:'#0f172a'}}>{p.name}</div>
                                            {hasBreakdown && (
                                                <button className="ppg-expand" onClick={e=>{e.stopPropagation();toggle(key);}}>
                                                    {expanded[key] ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                                                    {expanded[key] ? 'Hide' : `${p.perMatchPoints.filter(m=>m.total!==0).length} matches`}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {/* Auction team */}
                                    <div>
                                        <span className={`ppg-team-badge${!p.auctionTeam?' ppg-unsold':''}`}>
                                            {p.auctionTeam ?? 'Unsold'}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{background:rs.bg,color:rs.color,borderRadius:7,padding:'2px 7px',fontSize:'.62rem',fontWeight:900}}>
                                            {p.role?.split('-')[0] ?? p.role}
                                        </span>
                                    </div>
                                    <div style={{textAlign:'center',fontWeight:700,color:'#374151'}}>{p.batting || '—'}</div>
                                    <div style={{textAlign:'center',fontWeight:700,color:'#374151'}}>{p.bowling || '—'}</div>
                                    <div style={{textAlign:'center',fontWeight:700,color:'#374151'}}>{p.fielding || '—'}</div>
                                    <div style={{textAlign:'right'}}>
                                        <span className={`ppg-cum${p.totalPoints===0?' ':''}`}
                                            style={p.totalPoints===0?{background:'#f3f4f6',color:'#9ca3af'}:{}}
                                        >{p.totalPoints}</span>
                                    </div>
                                </div>

                                {expanded[key] && hasBreakdown && (
                                    <div className="ppg-bd">
                                        <div className="ppg-bd-title">Per-Match Breakdown</div>
                                        <div className="ppg-bd-grid">
                                            {p.perMatchPoints.filter(m=>m.total!==0).sort((a,b)=>a.matchId-b.matchId).map(m => (
                                                <div key={m.matchId} className="ppg-bd-chip">
                                                    <strong>M{matchNumMap[m.matchId] ?? m.matchId}</strong>
                                                    {' '}<span style={{color:'#6d28d9'}}>{m.total>0?'+':''}{m.total} pts</span>
                                                    {(m.batting||m.bowling||m.fielding||m.announcement) && (
                                                        <span style={{opacity:.7,fontSize:'.62rem',display:'block'}}>
                                                            Bat {m.batting??0} · Bowl {m.bowling??0} · Field {m.fielding??0} · Play {m.announcement??0}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>)}
            </>)}

            {/* ── ORANGE / PURPLE CAP TABS ────────────────────────────────── */}
            {(tab === 'orange' || tab === 'purple') && (<>
                {loadingCaps && <div className="ppg-loading"><div className="ppg-spin" /><span>Fetching live stats…</span></div>}
                {!loadingCaps && capStats && (<>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#1e293b' }}>
                            {tab === 'orange' ? 'Orange Cap Standings' : 'Purple Cap Standings'}
                        </h2>
                        {capStats.lastUpdated && (
                            <div style={{ fontSize: '.65rem', color: '#94a3b8', fontWeight: 600 }}>
                                IPL Feed Updated: {new Date(capStats.lastUpdated).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                            </div>
                        )}
                    </div>
                    
                    <div style={{
                        background: tab === 'orange' ? 'linear-gradient(135deg, #fff7ed, #ffedd5)' : 'linear-gradient(135deg, #faf5ff, #f3e8ff)',
                        border: tab === 'orange' ? '1px solid #ffedd5' : '1px solid #f3e8ff',
                        borderRadius: 16, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 15
                    }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: tab === 'orange' ? '#fff7ed' : '#faf5ff', overflow: 'hidden'
                        }}>
                            <img 
                                src={tab === 'orange' ? "https://png.pngtree.com/png-vector/20240123/ourmid/pngtree-baseball-cap-orange-color-template-mockup-hat-png-image_11471130.png" : "https://static.vecteezy.com/system/resources/thumbnails/027/941/762/small/purple-cap-sports-hat-baseball-caps-png.png"} 
                                style={{ width: '110%', height: '110%', objectFit: 'contain' }}
                                alt="Cap"
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: '.65rem', fontWeight: 900, textTransform: 'uppercase', color: tab === 'orange' ? '#ea580c' : '#9333ea', letterSpacing: 1.5 }}>
                                Current {tab === 'orange' ? 'Orange' : 'Purple'} Cap Holder
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#1e293b' }}>
                                {tab === 'orange' ? capStats.holders.orange?.name : capStats.holders.purple?.name}
                            </div>
                            <div style={{ fontSize: '.75rem', fontWeight: 700, opacity: .7, color: '#64748b' }}>
                                {tab === 'orange' ? `${capStats.holders.orange?.runs} Runs` : `${capStats.holders.purple?.wickets} Wickets`} in {tab === 'orange' ? capStats.holders.orange?.matches : capStats.holders.purple?.matches} matches
                            </div>
                        </div>
                    </div>

                    <div className="ppg-thead3">
                        <span>#</span><span>Player</span><span>Team</span>
                        <span style={{textAlign:'center'}}>{tab === 'orange' ? 'Runs' : 'Wkts'}</span>
                        <span style={{textAlign:'center'}}>Mat</span>
                        <span style={{textAlign:'right'}}>{tab === 'orange' ? 'SR' : 'Econ'}</span>
                    </div>

                    {(tab === 'orange' ? capStats.orangeCap : capStats.purpleCap).map((p, idx) => {
                        const key = `c-${idx}`;
                        return (
                            <div className="ppg-row" key={idx}>
                                <div className="ppg-row-main3" onClick={() => toggle(key)} style={{ cursor: 'pointer' }}>
                                    <div><span className="ppg-rank" style={idx===0?{background:tab==='orange'?'#f97316':'#a855f7',color:'#fff'}:{}}>{idx+1}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f1f5f9', overflow: 'hidden', border: '1px solid #e2e8f0', flexShrink: 0, position: 'relative' }}>
                                            {p.image ? (
                                                <img src={p.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                                    <User size={16} style={{ color: '#94a3b8' }} />
                                                </div>
                                            )}
                                            {idx === 0 && (
                                                <div style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
                                                    <img 
                                                        src={tab === 'orange' ? "https://png.pngtree.com/png-vector/20240123/ourmid/pngtree-baseball-cap-orange-color-template-mockup-hat-png-image_11471130.png" : "https://static.vecteezy.com/system/resources/thumbnails/027/941/762/small/purple-cap-sports-hat-baseball-caps-png.png"} 
                                                        style={{ width: '80%', height: '80%', objectFit: 'contain' }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div style={{fontWeight:900,fontSize:'.87rem',color:'#0f172a'}}>{p.name}</div>
                                            <div style={{display:'flex',gap:6,marginTop:2,alignItems:'center'}}>
                                                <span className={`ppg-team-badge${!p.auctionTeam?' ppg-unsold':''}`} style={{fontSize:'.58rem',padding:'1px 5px'}}>
                                                    Auction: {p.auctionTeam ?? 'Unsold'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{fontWeight:800,fontSize:'.75rem',color:'#64748b'}}>{p.team}</div>
                                    <div style={{textAlign:'center',fontWeight:900,color:tab==='orange'?'#ea580c':'#9333ea',fontSize:'.9rem'}}>
                                        {tab === 'orange' ? p.runs : p.wickets}
                                    </div>
                                    <div style={{textAlign:'center',fontWeight:700,color:'#475569'}}>{p.matches}</div>
                                    <div style={{textAlign:'right',fontWeight:700,color:'#94a3b8',fontSize:'.78rem'}}>
                                        {tab === 'orange' ? p.strikeRate : p.economy}
                                    </div>
                                </div>
                                {expanded[key] && (
                                    <div className="ppg-bd">
                                        <div className="ppg-bd-title">Full Stats</div>
                                        <div className="ppg-bd-grid">
                                            <div className="ppg-bd-chip"><strong>Matches</strong> {p.matches}</div>
                                            <div className="ppg-bd-chip"><strong>{tab === 'orange' ? 'Strike Rate' : 'Economy'}</strong> {tab === 'orange' ? p.strikeRate : p.economy}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>)}
            </>)}
        </div>
    );
}
