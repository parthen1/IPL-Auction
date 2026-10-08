import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const clean = (val, fallback) => {
    const v = val || fallback;
    return v ? String(v).trim().replace(/^["']|["']$/g, '') : undefined;
};

const firebaseConfig = {
    apiKey: clean(import.meta.env.VITE_FIREBASE_API_KEY, "AIzaSyC5NtVq5Le_0zBqFtl7zKPwFfzWn6ysuik"),
    authDomain: clean(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, "ipl-auction-36b5d.firebaseapp.com"),
    projectId: clean(import.meta.env.VITE_FIREBASE_PROJECT_ID, "ipl-auction-36b5d"),
    storageBucket: clean(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, "ipl-auction-36b5d.firebasestorage.app"),
    messagingSenderId: clean(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, "376372755354"),
    appId: clean(import.meta.env.VITE_FIREBASE_APP_ID, "1:376372755354:web:551174512dc721dd59d823")
};

// Only initialise Firebase when all required keys are present.
// Without this guard, calling initializeApp() with undefined values crashes
// the entire React app on startup (blank screen) when running locally.
const hasFirebaseConfig =
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId;

let auth = null;
if (hasFirebaseConfig) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
} else {
    console.warn('[Firebase] Config missing — Google login disabled. Set VITE_FIREBASE_* env vars to enable it.');
}

export { auth };
