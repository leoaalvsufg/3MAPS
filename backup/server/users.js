import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from './auth.js';
import { getDataDir } from './storage.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// Alphanumeric, hyphens, underscores; 3–30 chars
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;

/**
 * @param {string} username
 * @throws {Error} if invalid
 */
export function validateAuthUsername(username) {
  if (typeof username !== 'string') throw new Error('Username must be a string');
  if (!USERNAME_RE.test(username)) {
    throw new Error('Username must be 3–30 characters and contain only letters, numbers, hyphens, or underscores');
  }
  return username;
}

/**
 * @param {string} password
 * @throws {Error} if invalid
 */
export function validatePassword(password) {
  if (typeof password !== 'string') throw new Error('Password must be a string');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  return password;
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

function userProfilePath(username) {
  return path.join(getDataDir(), 'users', username, 'profile.json');
}

// ---------------------------------------------------------------------------
// User CRUD
// ---------------------------------------------------------------------------

/**
 * @typedef {{ userId: string, username: string, passwordHash: string, createdAt: string, plan: 'free' | 'premium' }} UserProfile
 */

/**
 * Create a new user with a hashed password.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ userId: string, username: string }>}
 */
export async function createUser(username, password) {
  validateAuthUsername(username);
  validatePassword(password);

  // Check if user already exists
  const existing = await getUser(username);
  if (existing) throw new Error('Username already taken');

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  /** @type {UserProfile} */
  const profile = {
    userId,
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
    plan: 'free',
  };

  const filePath = userProfilePath(username);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(profile, null, 2), 'utf8');

  return { userId, username };
}

/**
 * Read a user profile by username.
 * @param {string} username
 * @returns {Promise<UserProfile | null>}
 */
export async function getUser(username) {
  try {
    validateAuthUsername(username);
  } catch {
    return null;
  }
  const filePath = userProfilePath(username);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return null;
    if (err && typeof err === 'object' && 'name' in err && err.name === 'SyntaxError') return null;
    throw err;
  }
}

/**
 * Validate username + password and return the user identity if correct.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ userId: string, username: string } | null>}
 */
export async function validateCredentials(username, password) {
  const profile = await getUser(username);
  if (!profile) return null;
  const ok = await verifyPassword(password, profile.passwordHash);
  if (!ok) return null;
  return { userId: profile.userId, username: profile.username };
}
