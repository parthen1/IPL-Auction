import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { API_BASE_URL } from '../config';
import MatchScoreCard from './MatchScoreCard';
import NextMatchCard from './NextMatchCard';
import { getTeams } from '../services/api';
import { buildFantasyTeamLogoMap } from '../utils/fantasyBranding';

const LiveScoreboardHub = () => {
    const [summaries, setSummaries] = useState([]);
    const [nextMatch, setNextMatch] = useState(null);
    const [teamLogoMap, setTeamLogoMap] = useState({});
    const { socket, isConnected } = useSocket();

    // 1. Initial Load from REST API
    useEffect(() => {
        const fetchInitialStatus = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/api/fantasy/live-status`);
                if (response.data) {
                    if (response.data.summaries) {
                        setSummaries(response.data.summaries);
                    }
                    if (response.data.nextMatch) {
                        setNextMatch(response.data.nextMatch);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch initial scores", err);
            }

            try {
                const teamsData = await getTeams();
                setTeamLogoMap(buildFantasyTeamLogoMap(teamsData));
            } catch (err) {
                console.error("Failed to fetch teams for logos", err);
            }
        };

        fetchInitialStatus();
    }, []);

    // 2. Real-time updates via Socket
    useEffect(() => {
        if (!socket) return;

        const handleUpdate = (newSummaries) => {
            console.log("Live score update received:", newSummaries);
            setSummaries(newSummaries);
        };

        socket.on('fantasy:match_summaries_update', handleUpdate);

        return () => {
            socket.off('fantasy:match_summaries_update', handleUpdate);
        };
    }, [socket]);

    if (summaries.length === 0 && !nextMatch) return null;

    return (
        <div className="live-scoreboard-hub">
            {summaries.length > 0 ? (
                summaries.map((s) => (
                    <MatchScoreCard key={s.matchId} summary={s} teamLogoMap={teamLogoMap} />
                ))
            ) : (
                <NextMatchCard match={nextMatch} teamLogoMap={teamLogoMap} />
            )}
        </div>
    );
};

export default LiveScoreboardHub;
