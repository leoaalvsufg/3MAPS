/**
 * server/firebaseAdmin.js
 *
 * Firebase Admin SDK — verify ID tokens from Firebase Auth (client).
 * Configure via FIREBASE_SERVICE_ACCOUNT_PATH (path to JSON key file).
 */

import admin from 'firebase-admin';
import path from 'node:path';
import fs from 'node:fs';

let _app = null;

function getServiceAccountPath() {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (env) return path.resolve(env);
  const relative = path.join(process.cwd(), 'server', 'firebase-service-account.json');
  if (fs.existsSync(relative)) return relative;
  return null;
}

/**
 * Check if Firebase Admin can be initialized (credentials available).
 * @returns {boolean}
 */
export function isFirebaseAdminConfigured() {
  if (_app) return true;
  return getServiceAccountPath() !== null;
}

/**
 * Initialize Firebase Admin (idempotent). Call before verifyIdToken.
 * @returns {boolean} true if initialized, false if no credentials
 */
export function initFirebaseAdmin() {
  if (_app) return true;
  const keyPath = getServiceAccountPath();
  if (!keyPath) return false;
  try {
    const keyContent = fs.readFileSync(keyPath, 'utf8');
    const keyJson = JSON.parse(keyContent);
    _app = admin.initializeApp({ credential: admin.credential.cert(keyJson) }, 'mindmap');
    return true;
  } catch (err) {
    console.error('[Firebase Admin] init failed', err);
    return false;
  }
}

/**
 * Verify a Firebase ID token and return decoded claims.
 * @param {string} idToken
 * @returns {Promise<{ uid: string, email?: string, name?: string, picture?: string } | null>}
 */
export async function verifyFirebaseIdToken(idToken) {
  if (!initFirebaseAdmin()) return null;
  try {
    const decoded = await admin.auth(_app).verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? decoded.email ?? null,
      picture: decoded.picture ?? null,
    };
  } catch {
    return null;
  }
}
