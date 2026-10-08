
import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext'; // Ensure this path is correct


const TeamSummary = ({ teamId }) => {
    const { socket } = useSocket();
    const [teamData, setTeamData] = useState(null);

    // Initial load from TEAMS constant or prop, then hydrating from socket
    useEffect(() => {
        // Listen for initial sync
        const handleSync = (state) => {
            const team = state.teams.find(t => t.id === teamId);
            if (team) {
                setTeamData(prev => ({ ...prev, ...team }));
            }
        };

        // Listen for specific team updates
        const handleTeamUpdate = (update) => {
            if (update.teamCode === teamId) {
                setTeamData(prev => ({
                    ...prev,
                    remainingPurse: update.remainingPurse,
                    squadSize: update.squadSize,
                    overseasCount: update.overseasCount,
                    // If we need to show the last player bought:
                    // newPlayer: update.newPlayer 
                }));
            }
        };

        if (socket) {
            socket.on('auction:sync', handleSync);
            socket.on('team:update', handleTeamUpdate);

            // Request sync on mount to ensure fresh data
            socket.emit('auction:request_sync');
        }

        return () => {
            if (socket) {
                socket.off('auction:sync', handleSync);
                socket.off('team:update', handleTeamUpdate);
            }
        };
    }, [socket, teamId]);

    if (!teamData) return <div className="p-4 text-white">Loading Team Data...</div>;

    // Format currency (e.g. 120 Cr or 12,00,00,000)
    // Assuming remainingPurse is in full number (1200000000)
    const formatPurse = (amount) => {
        if (amount === undefined || amount === null) return '0';
        // Convert to Crores for display if large enough, or Lakhs
        const cr = amount / 10000000;
        return `₹${cr.toFixed(2)} Cr`;
    };

    return (
        <div className="bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-700 text-white w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4 border-b border-slate-600 pb-2">
                {teamData.name} ({teamData.code || teamData.id?.toUpperCase()})
            </h3>

            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Remaining Purse</span>
                    <span className="text-xl font-mono text-green-400 font-bold">
                        {formatPurse(teamData.remainingPurse || teamData.budget)}
                    </span>
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Squad Size</span>
                    <span className="text-lg font-semibold">
                        {teamData.squadSize || teamData.squadCount}/{25}
                    </span>
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Overseas Players</span>
                    <span className="text-lg font-semibold">
                        {teamData.overseasCount}/{8}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default TeamSummary;
