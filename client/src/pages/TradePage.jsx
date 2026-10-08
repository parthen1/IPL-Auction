import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTeams, createTradeProposal, getTradeProposals, respondTradeProposal, getAuctionStatus } from '../services/api';
import { toCr } from '../utils/formatCurrency';
import { ArrowLeftRight, Check, X, Clock, AlertTriangle, Send, User, Plane, Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'react-hot-toast';
import { getCompletedTrades } from '../services/api';

const TradePage = () => {
    const { user } = useAuth();
    const [teams, setTeams] = useState([]);
    const [myTeam, setMyTeam] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isTradingOpen, setIsTradingOpen] = useState(false);
    
    // Trade Creation State (Arrays for Multi-Player)
    const [targetTeam, setTargetTeam] = useState(null);
    const [offerPlayers, setOfferPlayers] = useState([]);
    const [requestPlayers, setRequestPlayers] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    
    // Proposals State
    const [activeTab, setActiveTab] = useState('CREATE'); // CREATE, SENT, RECEIVED, COMPLETED
    const [proposals, setProposals] = useState({ sent: [], received: [], completed: [] });

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                // Fetch whether trading is currently open from AuctionState or socket
                const stateData = await getAuctionStatus();
                setIsTradingOpen(stateData.isTradingOpen || false);

                const teamsData = await getTeams();
                setTeams(teamsData);
                
                if (user?.code) {
                    const currentTeam = teamsData.find(t => t.id === user.code || t.code === user.code);
                    setMyTeam(currentTeam);
                    
                    if (currentTeam) {
                        fetchProposals(currentTeam.id);
                    }
                }
            } catch (error) {
                console.error("Error loading trade data:", error);
                toast.error("Failed to load trade data");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [user]);

    const fetchProposals = async (teamId) => {
        try {
            const data = await getTradeProposals(teamId);
            const completed = await getCompletedTrades();
            setProposals({ ...data, completed });
        } catch (error) {
            console.error("Error fetching proposals:", error);
        }
    };

    const handlePlayerSelect = (player, listRef, setListRef) => {
        const exists = listRef.some(p => p._id === player._id);
        if (exists) {
            setListRef(listRef.filter(p => p._id !== player._id));
        } else {
            setListRef([...listRef, player]);
        }
    };

    const getTotalValue = (players) => players.reduce((sum, p) => sum + (p.soldPrice || 0), 0);

    const handleCreateTrade = async () => {
        if (!targetTeam || (offerPlayers.length === 0 && requestPlayers.length === 0)) {
            toast.error("Please select a target team and at least one player in total to trade.");
            return;
        }

        try {
            setSubmitting(true);
            await createTradeProposal({
                receiverTeamId: targetTeam._id,
                offerPlayerIds: offerPlayers.map(p => p._id),
                requestPlayerIds: requestPlayers.map(p => p._id)
            });
            toast.success("Trade proposal sent successfully!");
            
            // Reset form
            setTargetTeam(null);
            setOfferPlayers([]);
            setRequestPlayers([]);
            
            // Refresh proposals
            fetchProposals(myTeam.id);
            setActiveTab('SENT');
        } catch (error) {
            const errorMessage = error.response?.data?.message || "Failed to create trade proposal";
            toast.error(
                <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-900">Trade Proposal Failed</span>
                    <span className="text-sm text-gray-600 leading-tight">{errorMessage}</span>
                </div>,
                { duration: 5000, style: { minWidth: '350px' } }
            );
        } finally {
            setSubmitting(false);
        }
    };

    const handleRespond = async (proposalId, status) => {
        try {
            await respondTradeProposal(proposalId, status);
            toast.success(`Trade ${status.toLowerCase()} successfully!`);
            fetchProposals(myTeam.id);
            
            if (status === 'ACCEPTED') {
                const teamsData = await getTeams();
                setTeams(teamsData);
                const currentTeam = teamsData.find(t => t.id === user.code || t.code === user.code);
                setMyTeam(currentTeam);
            }
        } catch (error) {
            const errorMessage = error.response?.data?.message || `Failed to ${status.toLowerCase()} trade`;
            toast.error(
                <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-900">Trade Action Failed</span>
                    <span className="text-sm text-gray-600 leading-tight">{errorMessage}</span>
                </div>,
                { duration: 5000, style: { minWidth: '350px' } }
            );
        }
    };

    if (loading) return <div className="p-10 text-center text-gray-400 font-bold animate-pulse">Loading Trade System...</div>;

    if (!myTeam || user?.role === 'admin') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 h-full p-10">
                <AlertTriangle size={48} className="mb-4 opacity-50 text-yellow-500" />
                <h2 className="text-2xl font-bold text-gray-700">Not Available</h2>
                <p className="mt-2 text-center max-w-md">Only logged-in team owners can access the trading system. Admins or spectators do not have trading privileges.</p>
            </div>
        );
    }

    if (!isTradingOpen && activeTab === 'CREATE') {
         return (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-400 h-full p-10 bg-gray-50">
                 <Lock size={64} className="mb-6 opacity-30 text-gray-600" />
                 <h2 className="text-3xl font-black text-gray-800">Trading Window Closed</h2>
                 <p className="mt-4 text-center max-w-lg text-lg">The administrator has currently locked the trading window. You cannot propose new trades right now.</p>
                 <button 
                    onClick={() => setActiveTab('RECEIVED')} 
                    className="mt-8 px-6 py-3 bg-white border border-gray-200 shadow-sm rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                    View Existing Proposals
                 </button>
             </div>
         );
    }

    const otherTeams = teams.filter(t => t.id !== myTeam.id);
    const myPlayers = myTeam.playersBought || [];
    const targetPlayers = targetTeam ? (targetTeam.playersBought || []) : [];

    const offerValue = getTotalValue(offerPlayers);
    const requestValue = getTotalValue(requestPlayers);
    const netChange = offerValue - requestValue;

    return (
        <div className="flex flex-col h-full bg-gray-50/50">
            {/* Header & Tabs */}
            <div className="bg-white border-b border-gray-200 shadow-sm p-4 md:px-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-6xl mx-auto">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-gray-900 flex items-center gap-3">
                            <ArrowLeftRight className="text-blue-600" />
                            Trade Hub
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">Swap players with other teams to balance your squad and purse.</p>
                    </div>
                    
                    <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto whitespace-nowrap custom-scrollbar">
                        {['CREATE', 'RECEIVED', 'SENT', 'COMPLETED'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                                    activeTab === tab 
                                        ? "bg-white text-gray-900 shadow-sm" 
                                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                                )}
                            >
                                {tab === 'CREATE' && <ArrowLeftRight size={16} />}
                                {tab === 'RECEIVED' && (
                                    <div className="flex items-center gap-1">
                                        <Clock size={16} />
                                        Received
                                        {proposals.received.filter(p => p.status === 'PENDING').length > 0 && (
                                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                                                {proposals.received.filter(p => p.status === 'PENDING').length}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {tab === 'SENT' && <Send size={16} />}
                                {tab === 'COMPLETED' && <Check size={16} />}
                                {tab === 'CREATE' ? 'Create' : tab === 'SENT' ? 'Sent' : tab === 'COMPLETED' ? 'Completed' : ''}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-6xl mx-auto">
                    
                    {/* CREATE TAB */}
                    {activeTab === 'CREATE' && isTradingOpen && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            
                            {/* Step 1: My Players */}
                            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-200">
                                <div className="mb-6 flex justify-between items-end">
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Step 1</div>
                                        <h3 className="text-xl font-bold text-gray-900">Offer Players</h3>
                                    </div>
                                    <div className="text-sm font-bold text-gray-500">{offerPlayers.length} Selected</div>
                                </div>
                                <div className="space-y-3 max-h-[300px] lg:max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                                    {myPlayers.length === 0 ? (
                                        <div className="text-center p-6 text-gray-400 font-medium">You don't have any players to trade.</div>
                                    ) : (
                                        myPlayers.map(p => {
                                            const isSelected = offerPlayers.some(op => op._id === p._id);
                                            return (
                                                <div 
                                                    key={p._id}
                                                    onClick={() => handlePlayerSelect(p, offerPlayers, setOfferPlayers)}
                                                    className={cn(
                                                        "p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3",
                                                        isSelected ? "border-blue-500 bg-blue-50" : "border-gray-100 hover:border-gray-300"
                                                    )}
                                                >
                                                    <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 relative">
                                                        {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-gray-400" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-sm truncate">{p.name}</div>
                                                        <div className="text-xs text-gray-500 flex justify-between items-center mt-1">
                                                            <span className="flex items-center gap-1">{p.role} {p.isOverseas && <Plane size={10} className="text-blue-500" />}</span>
                                                            <span className="font-mono font-bold text-gray-700">{toCr(p.soldPrice) === 'Traded' ? 'Traded' : `₹${toCr(p.soldPrice)}`}</span>
                                                        </div>
                                                    </div>
                                                    {isSelected && <div className="text-blue-500"><Check size={20} className="stroke-[3]" /></div>}
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Trade Direction Icon & Summary */}
                            <div className="hidden lg:flex flex-col items-center justify-center">
                                <div className="p-4 bg-gray-100 rounded-full text-gray-400">
                                    <ArrowLeftRight size={48} strokeWidth={1} />
                                </div>
                                
                                { (offerPlayers.length > 0 || requestPlayers.length > 0) && (
                                    <div className="mt-8 w-full animate-in fade-in zoom-in duration-300">
                                        <div className="bg-gray-900 text-white rounded-2xl p-6 text-center shadow-xl">
                                            <h4 className="font-bold mb-4 text-gray-100">Trade Ready</h4>
                                            
                                            <button 
                                                onClick={handleCreateTrade}
                                                disabled={submitting}
                                                className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
                                            >
                                                {submitting ? 'Sending...' : 'Propose Swap'}
                                                <Send size={18} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Step 2 & 3: Target Team & Players */}
                            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-200">
                                <div className="mb-6">
                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Step 2</div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-4">Target Team</h3>
                                    <select 
                                        className="w-full p-4 rounded-xl border-gray-200 bg-gray-50 focus:ring-2 focus:ring-blue-500 font-bold"
                                        onChange={(e) => {
                                            const teamId = e.target.value;
                                            setTargetTeam(otherTeams.find(t => t.id === teamId));
                                            setRequestPlayers([]); // Reset player selections
                                        }}
                                        value={targetTeam?.id || ''}
                                    >
                                        <option value="">-- Select Team --</option>
                                        {otherTeams.map(t => (
                                            <option key={t.id} value={t.id}>{t.name} (Budget: ₹{toCr(t.remainingPurse)})</option>
                                        ))}
                                    </select>
                                </div>
                                
                                {targetTeam && (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                                        <div className="mb-4 mt-8 flex justify-between items-end">
                                            <div>
                                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Step 3</div>
                                                <h3 className="text-xl font-bold text-gray-900">Request Players</h3>
                                            </div>
                                            <div className="text-sm font-bold text-gray-500">{requestPlayers.length} Selected</div>
                                        </div>
                                        <div className="space-y-3 max-h-[300px] lg:max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
                                            {targetPlayers.length === 0 ? (
                                                <div className="text-center p-6 text-gray-400 font-medium">This team has no players.</div>
                                            ) : (
                                                targetPlayers.map(p => {
                                                    const isSelected = requestPlayers.some(rp => rp._id === p._id);
                                                    return (
                                                        <div 
                                                            key={p._id}
                                                            onClick={() => handlePlayerSelect(p, requestPlayers, setRequestPlayers)}
                                                            className={cn(
                                                                "p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3",
                                                                isSelected ? "border-blue-500 bg-blue-50" : "border-gray-100 hover:border-gray-300"
                                                            )}
                                                        >
                                                            <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                                                                {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-gray-400" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-bold text-sm truncate">{p.name}</div>
                                                                <div className="text-xs text-gray-500 flex justify-between items-center mt-1">
                                                                    <span className="flex items-center gap-1">{p.role} {p.isOverseas && <Plane size={10} className="text-blue-500" />}</span>
                                                                    <span className="font-mono font-bold text-gray-700">{toCr(p.soldPrice) === 'Traded' ? 'Traded' : `₹${toCr(p.soldPrice)}`}</span>
                                                                </div>
                                                            </div>
                                                            {isSelected && <div className="text-blue-500"><Check size={20} className="stroke-[3]" /></div>}
                                                        </div>
                                                    )
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Mobile confirmation button */}
                            <div className="lg:hidden sticky bottom-4 z-20">
                                {(offerPlayers.length > 0 || requestPlayers.length > 0) && (
                                    <button 
                                        onClick={handleCreateTrade}
                                        disabled={submitting}
                                        className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-2xl flex items-center justify-center gap-2 border-2 border-transparent focus:border-white/50"
                                    >
                                        Propose Trade <Send size={18} />
                                    </button>
                                )}
                            </div>

                        </div>
                    )}


                    {/* LIST TABS (SENT, RECEIVED, COMPLETED) */}
                    {(activeTab === 'SENT' || activeTab === 'RECEIVED' || activeTab === 'COMPLETED') && (
                        <div className="space-y-4">
                            {proposals[activeTab.toLowerCase()].length === 0 ? (
                                <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm">
                                    {activeTab === 'COMPLETED' ? <Check size={48} className="mx-auto text-green-300 mb-4" /> : <ArrowLeftRight size={48} className="mx-auto text-gray-300 mb-4" />}
                                    <h3 className="text-xl font-bold text-gray-500">No {activeTab.toLowerCase()} trades</h3>
                                </div>
                            ) : (
                                proposals[activeTab.toLowerCase()].map(proposal => (
                                    <div key={proposal._id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-start gap-8 relative overflow-hidden">
                                        
                                        {/* Status Badge Top Right */}
                                        <div className="absolute top-4 right-4 z-10">
                                            {proposal.status === 'PENDING' ? (
                                                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm">
                                                    <Clock size={12} /> Pending
                                                </span>
                                            ) : (
                                                <span className={cn(
                                                    "px-3 py-1 rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5",
                                                    proposal.status === 'ACCEPTED' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                                                )}>
                                                    {proposal.status === 'ACCEPTED' ? <Check size={12} /> : <X size={12} />}
                                                    {proposal.status}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex flex-col md:flex-row items-center gap-6 flex-1 w-full mt-6 md:mt-0">
                                            {/* Left side: Sender's Offer */}
                                            <div className="flex-1 w-full text-center md:text-right bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
                                                <div className="text-sm font-black text-blue-600 mb-4 uppercase tracking-wider">
                                                    {activeTab === 'SENT' ? 'You Offer' : activeTab === 'COMPLETED' ? `${proposal.senderTeam?.name || 'Sender'} Traded` : `${proposal.senderTeam.name} Offers`}
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {proposal.offerPlayers.map(p => (
                                                        <div key={p._id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center text-left">
                                                            <div>
                                                                <div className="font-bold text-sm text-gray-900">{p.name}</div>
                                                                <div className="text-[10px] text-gray-500 font-medium uppercase mt-0.5">{p.role} {p.isOverseas && '(OS)'}</div>
                                                            </div>
                                                            <div className="font-mono font-bold text-sm text-gray-700 bg-gray-50 px-2 py-1 rounded-md">{toCr(p.soldPrice) === 'Traded' ? 'Traded' : `₹${toCr(p.soldPrice)}`}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Center icon */}
                                            <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 text-gray-400 rotate-90 md:rotate-0 shadow-inner">
                                                <ArrowLeftRight size={20} strokeWidth={2.5} />
                                            </div>

                                            {/* Right side: Receiver's Request */}
                                            <div className="flex-1 w-full text-center md:text-left bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50">
                                                <div className="text-sm font-black text-indigo-600 mb-4 uppercase tracking-wider">
                                                    {activeTab === 'SENT' ? `${proposal.receiverTeam?.name || 'Receiver'}'s Players` : activeTab === 'COMPLETED' ? `${proposal.receiverTeam?.name || 'Receiver'} Traded` : 'Your Players'}
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {proposal.requestPlayers.map(p => (
                                                        <div key={p._id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center text-left">
                                                            <div>
                                                                <div className="font-bold text-sm text-gray-900">{p.name}</div>
                                                                <div className="text-[10px] text-gray-500 font-medium uppercase mt-0.5">{p.role} {p.isOverseas && '(OS)'}</div>
                                                            </div>
                                                            <div className="font-mono font-bold text-sm text-gray-700 bg-gray-50 px-2 py-1 rounded-md">{toCr(p.soldPrice) === 'Traded' ? 'Traded' : `₹${toCr(p.soldPrice)}`}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions ONLY IF IT'S PENDING RECEIVED */}
                                        {proposal.status === 'PENDING' && activeTab === 'RECEIVED' && (
                                            <div className="flex md:flex-col gap-3 w-full md:w-32 border-t md:border-t-0 md:border-l border-gray-100 pt-6 md:pt-0 md:pl-6 justify-center">
                                                <button 
                                                    onClick={() => handleRespond(proposal._id, 'ACCEPTED')}
                                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 p-3.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 hover:border-green-300 rounded-xl font-bold transition-all"
                                                >
                                                    <Check size={18} strokeWidth={3} />
                                                    <span className="md:hidden">Accept</span>
                                                </button>
                                                <button 
                                                    onClick={() => handleRespond(proposal._id, 'REJECTED')}
                                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 p-3.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 hover:border-red-300 rounded-xl font-bold transition-all"
                                                >
                                                    <X size={18} strokeWidth={3} />
                                                    <span className="md:hidden">Reject</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TradePage;
