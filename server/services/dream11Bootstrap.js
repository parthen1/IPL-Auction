import getFantasyMatchModel from '../models/FantasyMatch.js';
import getFantasyPlayerModel from '../models/FantasyPlayer.js';
import getFantasyTeamModel from '../models/FantasyTeam.js';
import getFantasyUserModel from '../models/FantasyUser.js';
import Player from '../models/Player.js';
import IplSchedule from '../models/IplSchedule.js';
import {
    normalizeFantasyMatch,
    normalizeFantasyRole,
    normalizeTeamCode
} from '../utils/fantasyUtils.js';

const ignoreExistingCollectionError = (error) => {
    if (error?.codeName === 'NamespaceExists') {
        return;
    }
    throw error;
};

export const bootstrapDream11Data = async () => {
    const [FantasyUser, FantasyPlayer, FantasyMatch, FantasyTeam] = await Promise.all([
        getFantasyUserModel(),
        getFantasyPlayerModel(),
        getFantasyMatchModel(),
        getFantasyTeamModel()
    ]);

    await Promise.all([
        FantasyUser.createCollection().catch(ignoreExistingCollectionError),
        FantasyPlayer.createCollection().catch(ignoreExistingCollectionError),
        FantasyMatch.createCollection().catch(ignoreExistingCollectionError),
        FantasyTeam.createCollection().catch(ignoreExistingCollectionError)
    ]);

    try {
        const existingMatchIndexes = await FantasyMatch.collection.indexes();
        const legacyMatchIndex = existingMatchIndexes.find((index) => index.name === 'legacyMatchId_1');

        if (legacyMatchIndex && (!legacyMatchIndex.unique || !legacyMatchIndex.sparse)) {
            await FantasyMatch.collection.dropIndex('legacyMatchId_1');
        }
    } catch (error) {
        if (error?.codeName !== 'IndexNotFound') {
            throw error;
        }
    }

    await Promise.all([
        FantasyUser.syncIndexes(),
        FantasyPlayer.syncIndexes(),
        FantasyMatch.syncIndexes(),
        FantasyTeam.syncIndexes()
    ]);

    const [fantasyPlayerCount, fantasyMatchCount] = await Promise.all([
        FantasyPlayer.countDocuments(),
        FantasyMatch.countDocuments()
    ]);

    if (fantasyPlayerCount === 0) {
        const sourcePlayers = await Player.find({ orgIPLTeam26: { $ne: null } }).lean();

        if (sourcePlayers.length > 0) {
            await FantasyPlayer.insertMany(sourcePlayers.map((player) => ({
                sourcePlayerId: player._id,
                name: player.name,
                role: normalizeFantasyRole(player.role),
                orgIPLTeam26: normalizeTeamCode(player.orgIPLTeam26),
                basePrice: Number(player.basePrice || 0),
                value: Number(player.value ?? player.Value ?? 7.5),
                points: Number(player.points || 0),
                image: player.image || null
            })), { ordered: false });
        }
    }

    if (fantasyMatchCount === 0) {
        const sourceMatches = await IplSchedule.find({}).lean();

        if (sourceMatches.length > 0) {
            await FantasyMatch.insertMany(sourceMatches.map((match) => {
                const normalized = normalizeFantasyMatch(match);
                return {
                    sourceMatchId: match._id,
                    legacyMatchId: String(normalized.matchId),
                    matchName: normalized.matchName,
                    team1: normalized.team1,
                    team2: normalized.team2,
                    date: normalized.date,
                    time: normalized.time,
                    ground: normalized.ground,
                    city: normalized.city,
                    status: normalized.status
                };
            }), { ordered: false });
        }
    }
};
