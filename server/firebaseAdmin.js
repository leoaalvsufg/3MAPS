/**
 * server/firebaseAdmin.js
 *
 * Firebase Admin SDK — verify ID tokens from Firebase Auth (client).
 * Configure via FIREBASE_SERVICE_ACCOUNT_PATH (path to JSON key file).
 * Default: server/firebase-service-account.json (relativo ao diretório deste arquivo).
 */

import admin from 'firebase-admin';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

let _app = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getServiceAccountPath() {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (env) {
    const resolved = path.resolve(env);
    if (fs.existsSync(resolved)) return resolved;
  }
  // 1) Relativo ao diretório deste arquivo (server/)
  const scriptDir = path.join(__dirname, 'firebase-service-account.json');
  if (fs.existsSync(scriptDir)) return scriptDir;
  // 2) process.cwd()/server/
  const cwdPath = path.join(process.cwd(), 'server', 'firebase-service-account.json');
  if (fs.existsSync(cwdPath)) return cwdPath;
  return null;
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
    try {
      _app = admin.initializeApp({ credential: admin.credential.cert(keyJson) }, 'mindmap');
    } catch (dup) {
      if (dup?.code === 'app/duplicate-app') {
        _app = admin.app('mindmap');
      } else {
        throw dup;
      }
    }
    return true;
  } catch (err) {
    console.error('[Firebase Admin] init failed', err);
    return false;
  }
}

/**
 * Get Firestore instance. Call initFirebaseAdmin first.
 * @returns {FirebaseFirestore.Firestore | null}
 */
export function getFirestore() {
  if (!_app) return null;
  return _app.firestore();
}

/**
 * Verify a Firebase ID token and return decoded claims.
 * Uses getUser(uid) to fetch display name when not in token (DecodedIdToken does not include name).
 * @param {string} idToken
 * @returns {Promise<{ uid: string, email?: string, name?: string } | null>}
 */
export async function verifyFirebaseIdToken(idToken) {
  if (!initFirebaseAdmin()) return null;
  try {
    const decoded = await admin.auth(_app).verifyIdToken(idToken);
    let name = decoded.name ?? decoded.email ?? null;
    let picture = decoded.picture ?? null;
    if (!name && decoded.uid) {
      try {
        const userRecord = await admin.auth(_app).getUser(decoded.uid);
        name = userRecord.displayName ?? userRecord.email ?? null;
        if (!picture && userRecord.photoURL) picture = userRecord.photoURL;
      } catch {
        // ignore; fallback to email/uid
      }
    }
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: name ?? decoded.email ?? decoded.uid,
      picture: picture ?? null,
    };
  } catch (err) {
    console.error('[Firebase Admin] verifyIdToken failed', err?.message ?? err);
    return null;
  }
}
