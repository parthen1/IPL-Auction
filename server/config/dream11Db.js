import mongoose from 'mongoose';

let dream11Connection = null;
let dream11ConnectionPromise = null;

export const connectDream11DB = async () => {
    if (dream11Connection && dream11Connection.readyState === 1) {
        return dream11Connection;
    }

    if (dream11ConnectionPromise) {
        return dream11ConnectionPromise;
    }

    const mongoUri = process.env.DREAM11_MONGO_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error('DREAM11_MONGO_URI or MONGO_URI must be configured.');
    }

    dream11Connection = mongoose.createConnection(mongoUri, {
        dbName: process.env.DREAM11_DB_NAME || 'dream11'
    });

    dream11ConnectionPromise = dream11Connection.asPromise()
        .then((connection) => {
            console.log(`Dream11 MongoDB Connected: ${connection.host}/${connection.name}`);
            return connection;
        })
        .catch((error) => {
            dream11Connection = null;
            dream11ConnectionPromise = null;
            throw error;
        });

    return dream11ConnectionPromise;
};

export const getDream11Connection = async () => connectDream11DB();
