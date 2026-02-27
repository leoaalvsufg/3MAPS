import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Auth secret management
// ---------------------------------------------------------------------------

const SECRET_FILE = path.resolve('data', '.auth_secret');

let _secret = null;

async function getSecret() {
  if (_secret) return _secret;

  // Try env var first
  if (process.env.AUTH_SECRET) {
    _secret = process.env.AUTH_SECRET;
    return _secret;
  }

  // Try reading from file
  try {
    _secret = (await fs.readFile(SECRET_FILE, 'utf8')).trim();
    if (_secret) return _secret;
  } catch {
    // File doesn't exist yet — generate one
  }

  // Generate a new secret
  _secret = crypto.randomBytes(48).toString('hex');
  try {
    await fs.mkdir(path.dirname(SECRET_FILE), { recursive: true });
    await fs.writeFile(SECRET_FILE, _secret, 'utf8');
    // eslint-disable-next-line no-console
    console.log('[3Maps auth] Generated new AUTH_SECRET and saved to data/.auth_secret');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[3Maps auth] Could not persist AUTH_SECRET:', err?.message ?? err);
  }

  return _secret;
}

// ---------------------------------------------------------------------------
// Base64url helpers (no padding)
// ---------------------------------------------------------------------------

function base64urlEncode(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(input) {
  // Restore padding
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// ---------------------------------------------------------------------------
// JWT implementation (HMAC-SHA256)
// ---------------------------------------------------------------------------

const JWT_HEADER = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Generate a JWT token for the given payload.
 * @param {{ userId: string, username: string, isAdmin?: boolean }} payload
 * @returns {Promise<string>}
 */
export async function generateToken(payload) {
  const secret = await getSecret();
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const encodedPayload = base64urlEncode(JSON.stringify(claims));
  const signingInput = `${JWT_HEADER}.${encodedPayload}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `${signingInput}.${sig}`;
}

/**
 * Verify a JWT token and return its payload, or null if invalid/expired.
 * @param {string} token
 * @returns {Promise<{ userId: string, username: string } | null>}
 */
export async function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;

  try {
    const secret = await getSecret();
    const signingInput = `${header}.${payload}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(signingInput)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSig.length) return null;
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    const claims = JSON.parse(base64urlDecode(payload).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp === 'number' && claims.exp < now) return null;

    if (!claims.userId || !claims.username) return null;
    return { userId: claims.userId, username: claims.username, isAdmin: claims.isAdmin === true };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt)
// ---------------------------------------------------------------------------

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 64 };

/**
 * Hash a password using scrypt with a random salt.
 * Returns a string in the format `salt:hash` (both hex-encoded).
 * @param {string} password
 * @returns {Promise<string>}
 */
export function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, SCRYPT_PARAMS.dkLen, { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify an API token and return the associated user, or null if invalid.
 * Updates last_used_at on success.
 * @param {string} rawToken — the raw token (e.g. sk-3maps-xxxx)
 * @param {import('better-sqlite3').Database} db
 * @returns {{ userId: string, username: string } | null}
 */
export function verifyApiToken(rawToken, db) {
  if (typeof rawToken !== 'string' || !rawToken.trim()) return null;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const row = db.prepare(`
    SELECT at.username, u.id as user_id
    FROM api_tokens at
    JOIN users u ON u.username = at.username AND u.is_active = 1
    WHERE at.token_hash = ? AND at.is_active = 1
      AND (at.expires_at IS NULL OR at.expires_at > datetime('now'))
  `).get(tokenHash);
  if (!row) return null;
  db.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE token_hash = ?").run(tokenHash);
  return { userId: row.user_id, username: row.username };
}

/**
 * Verify a password against a stored `salt:hash` string.
 * @param {string} password
 * @param {string} stored  — format: `salt:hash`
 * @returns {Promise<boolean>}
 */
export function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const colonIdx = stored.indexOf(':');
    if (colonIdx === -1) return resolve(false);
    const salt = stored.slice(0, colonIdx);
    const storedHash = stored.slice(colonIdx + 1);
    crypto.scrypt(password, salt, SCRYPT_PARAMS.dkLen, { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p }, (err, derivedKey) => {
      if (err) return reject(err);
      try {
        const derivedBuf = derivedKey;
        const storedBuf = Buffer.from(storedHash, 'hex');
        if (derivedBuf.length !== storedBuf.length) return resolve(false);
        resolve(crypto.timingSafeEqual(derivedBuf, storedBuf));
      } catch {
        resolve(false);
      }
    });
  });
}
