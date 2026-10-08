import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Trophy, ArrowRight, Lock, Shield } from 'lucide-react';
import TeamSelector from '../components/TeamSelector';
import { useAuth } from '../context/AuthContext';

import { API_BASE_URL as API_URL } from '../config';


const LoginPage = () => {
    const [teams, setTeams] = useState([]);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    // const [loading, setLoading] = useState(false); // AuthContext provides loading if needed, but for submit we can use local
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth(); // AuthContext

    useEffect(() => {
        // Teams list can be public
        fetch(`${API_URL}/api/teams`)
            .then(res => res.json())
            .then(data => setTeams(data))
            .catch(err => console.error('Failed to load teams', err));
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!selectedTeam || !password) return;

        setLoading(true);
        setError('');

        // selectedTeam.id corresponds to 'rcb', 'mi' etc.
        // Simple V1 Login
        const res = await login(selectedTeam.id, password);

        if (res.success) {
            navigate('/dashboard');
        } else {
            setError(res.message);
        }
        setLoading(false);
    };



    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center relative overflow-hidden text-white font-sans">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] bg-blue-600/20 blur-[150px] rounded-full"></div>
                <div className="absolute bottom-[-20%] right-[20%] w-[600px] h-[600px] bg-purple-600/20 blur-[150px] rounded-full"></div>
            </div>

            <div className="z-10 w-full max-w-6xl px-4 flex flex-col items-center">

                {/* Header */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-orange-600 mb-6 shadow-2xl shadow-orange-500/30 animate-pulse">
                        <Trophy className="text-white" size={40} />
                    </div>
                    <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4">
                        Auction <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Arena</span>
                    </h1>
                    <p className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-2">
                        The Battle for the Best XI
                    </p>
                    <p className="text-gray-400 text-lg max-w-md mx-auto">
                        Select your franchise to enter the bidding war.
                    </p>
                </div>

                {/* Team Selector Component */}
                <div className="w-full mb-12">
                    <TeamSelector
                        teams={teams}
                        selectedTeam={selectedTeam}
                        onSelect={(team) => {
                            setSelectedTeam(team);
                            setError('');
                            setPassword('');
                        }}
                    />
                </div>

                {/* Login Form Section - Appears when team is selected */}
                <div className={`
                    w-full max-w-md transition-all duration-700 ease-in-out
                    ${selectedTeam ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none h-0'}
                `}>
                    {selectedTeam && (
                        <form onSubmit={handleLogin} className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl">
                            <div className="text-center mb-6">
                                <p className="text-gray-400 text-sm mb-1">Authenticating as</p>
                                <h3 className="text-2xl font-bold text-white">{selectedTeam.name}</h3>
                            </div>

                            <div className="space-y-4">
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={20} />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-black/30 border border-white/10 rounded-xl px-12 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                        placeholder="Enter Team Password"
                                        autoFocus
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-200 text-sm text-center animate-shake">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={!password || loading}
                                    className={`
                                        w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all
                                        ${password && !loading
                                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/25 transform hover:-translate-y-1'
                                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                        }
                                    `}
                                >
                                    {loading ? 'Authenticating...' : 'Enter Auction'}
                                    {!loading && <ArrowRight size={20} />}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setSelectedTeam(null)}
                                    className="w-full py-2 text-sm text-gray-500 hover:text-white transition-colors"
                                >
                                    Cancel Selection
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
