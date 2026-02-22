/**
 * Firebase client SDK — Auth (email/password + Google).
 * Config via env: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
 * VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'maps-dc9df';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

let app: ReturnType<typeof initializeApp> | null = null;
let auth: ReturnType<typeof getAuth> | null = null;

export function getFirebaseApp() {
  if (!app) {
    if (!firebaseConfig.apiKey || !firebaseConfig.appId) {
      throw new Error('Firebase config missing: set VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID in .env');
    }
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth() {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

export function isFirebaseConfigured(): boolean {
  return !!(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_APP_ID);
}

export { GoogleAuthProvider };
