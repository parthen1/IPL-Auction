import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const clean = (val) => (val ? String(val).trim().replace(/^["']|["']$/g, '') : undefined);

const firebaseConfig = {
    apiKey: clean(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: clean(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: clean(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: clean(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: clean(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: clean(import.meta.env.VITE_FIREBASE_APP_ID)
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
