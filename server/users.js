/**
 * server/users.js
 *
 * User management backed by SQLite (via server/db.js).
 * Replaces the previous filesystem-based profile.json approach.
 *
 * Provides:
 *   createUser, getUser, updateUser, deleteUser,
 *   validateCredentials, listUsers,
 *   validateAuthUsername, validatePassword
 */

import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from './auth.js';
import { getDb } from './db.js';

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
// User CRUD
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   userId: string,
 *   username: string,
 *   passwordHash: string,
 *   plan: 'free' | 'premium' | 'admin',
 *   email: string | null,
 *   createdAt: string,
 *   updatedAt: string,
 *   isActive: boolean,
 *   isAdmin: boolean
 * }} UserProfile
 */

/**
 * Map a raw DB row to a UserProfile object.
 * @param {object} row
 * @returns {UserProfile}
 */
function rowToProfile(row) {
  return {
    userId: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    plan: row.plan,
    email: row.email ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active === 1,
    isAdmin: row.is_admin === 1,
  };
}

/**
 * Create a new user with a hashed password.
 * @param {string} username
 * @param {string} password
 * @param {{ plan?: string, email?: string, isAdmin?: boolean }} [options]
 * @returns {Promise<{ userId: string, username: string }>}
 */
export async function createUser(username, password, options = {}) {
  validateAuthUsername(username);
  validatePassword(password);

  // Check if user already exists
  const existing = await getUser(username);
  if (existing) throw new Error('Username already taken');

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const plan = options.plan ?? 'free';
  const email = options.email ?? null;
  const isAdmin = options.isAdmin ? 1 : 0;

  const db = getDb();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, plan, email, is_admin)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, username, passwordHash, plan, email, isAdmin);

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

  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) return null;
  return rowToProfile(row);
}

/**
 * Read a user profile by userId.
 * @param {string} userId
 * @returns {Promise<UserProfile | null>}
 */
export async function getUserById(userId) {
  if (typeof userId !== 'string' || !userId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!row) return null;
  return rowToProfile(row);
}

/**
 * Update user fields (plan, email, isActive, isAdmin, password).
 * @param {string} username
 * @param {{ plan?: string, email?: string, isActive?: boolean, isAdmin?: boolean, password?: string }} updates
 * @returns {Promise<UserProfile | null>}
 */
export async function updateUser(username, updates) {
  const db = getDb();
  const existing = await getUser(username);
  if (!existing) return null;

  const fields = [];
  const values = [];

  if (updates.plan !== undefined) {
    fields.push('plan = ?');
    values.push(updates.plan);
  }
  if (updates.email !== undefined) {
    fields.push('email = ?');
    values.push(updates.email);
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }
  if (updates.isAdmin !== undefined) {
    fields.push('is_admin = ?');
    values.push(updates.isAdmin ? 1 : 0);
  }
  if (updates.password !== undefined) {
    validatePassword(updates.password);
    const newHash = await hashPassword(updates.password);
    fields.push('password_hash = ?');
    values.push(newHash);
  }

  if (fields.length === 0) return existing;

  fields.push("updated_at = datetime('now')");
  values.push(username);

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE username = ?`).run(...values);

  return getUser(username);
}

/**
 * Delete a user by username.
 * @param {string} username
 * @returns {Promise<boolean>}
 */
export async function deleteUser(username) {
  const db = getDb();
  const result = db.prepare('DELETE FROM users WHERE username = ?').run(username);
  return result.changes > 0;
}

/**
 * List all users (admin use only).
 * @param {{ limit?: number, offset?: number, search?: string }} [options]
 * @returns {Promise<{ users: UserProfile[], total: number }>}
 */
export async function listUsers(options = {}) {
  const db = getDb();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const search = options.search ?? '';

  let whereClause = '';
  const params = [];

  if (search) {
    whereClause = 'WHERE username LIKE ?';
    params.push(`%${search}%`);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM users ${whereClause}`).get(...params)?.count ?? 0;
  const rows = db.prepare(`
    SELECT * FROM users ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return {
    users: rows.map(rowToProfile),
    total,
  };
}

/**
 * Validate username + password and return the user identity if correct.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ userId: string, username: string, isAdmin: boolean } | null>}
 */
export async function validateCredentials(username, password) {
  const profile = await getUser(username);
  if (!profile) return null;
  if (!profile.isActive) return null;
  const ok = await verifyPassword(password, profile.passwordHash);
  if (!ok) return null;
  return { userId: profile.userId, username: profile.username, isAdmin: profile.isAdmin };
}

// ---------------------------------------------------------------------------
// Migration helper: import existing filesystem users into SQLite
// ---------------------------------------------------------------------------

/**
 * Migrate existing filesystem-based user profiles into SQLite.
 * Safe to call multiple times — skips users that already exist.
 * @param {string} dataDir
 * @returns {Promise<{ migrated: number, skipped: number, errors: string[] }>}
 */
export async function migrateFilesystemUsers(dataDir) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const usersDir = path.join(dataDir, 'users');
  const result = { migrated: 0, skipped: 0, errors: [] };

  let entries;
  try {
    entries = await fs.readdir(usersDir, { withFileTypes: true });
  } catch {
    return result; // No users directory — nothing to migrate
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const username = entry.name;
    if (username === 'local') continue; // Skip the anonymous "local" user

    const profilePath = path.join(usersDir, username, 'profile.json');
    try {
      const raw = await fs.readFile(profilePath, 'utf8');
      const profile = JSON.parse(raw);

      // Check if already in DB
      const existing = await getUser(username);
      if (existing) {
        result.skipped++;
        continue;
      }

      const db = getDb();
      db.prepare(`
        INSERT INTO users (id, username, password_hash, plan, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        profile.userId ?? crypto.randomUUID(),
        profile.username,
        profile.passwordHash,
        profile.plan ?? 'free',
        profile.createdAt ?? new Date().toISOString(),
      );

      result.migrated++;
    } catch (err) {
      result.errors.push(`${username}: ${err?.message ?? String(err)}`);
    }
  }

  return result;
}
