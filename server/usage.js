/**
 * server/usage.js
 *
 * Usage tracking backed by SQLite (via server/db.js).
 * Replaces the previous filesystem-based usage.json approach.
 */

import { getDb } from './db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current month key in YYYY-MM format.
 * @returns {string}
 */
function currentMonthKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Ensure a usage row exists for the given user + month.
 * @param {string} username
 * @param {string} month
 */
function ensureUsageRow(username, month) {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO usage (username, month, maps_created, chat_messages_sent)
    VALUES (?, ?, 0, '{}')
  `).run(username, month);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   mapsCreatedThisMonth: number,
 *   monthKey: string,
 *   totalMapsCreated: number,
 *   chatMessagesSent: Record<string, number>
 * }} Usage
 */

/**
 * Read usage for a user, returning current-month counters.
 * @param {string} username
 * @returns {Promise<Usage>}
 */
export async function getUsage(username) {
  const db = getDb();
  const month = currentMonthKey();
  ensureUsageRow(username, month);

  const row = db.prepare('SELECT * FROM usage WHERE username = ? AND month = ?').get(username, month);

  // Sum total maps across all months
  const totalRow = db.prepare('SELECT SUM(maps_created) as total FROM usage WHERE username = ?').get(username);
  const totalMapsCreated = totalRow?.total ?? 0;

  let chatMessagesSent = {};
  try {
    chatMessagesSent = JSON.parse(row?.chat_messages_sent ?? '{}');
  } catch {
    chatMessagesSent = {};
  }

  return {
    mapsCreatedThisMonth: row?.maps_created ?? 0,
    monthKey: month,
    totalMapsCreated,
    chatMessagesSent,
  };
}

/**
 * Increment the map creation counter for the current month.
 * @param {string} username
 * @returns {Promise<Usage>}
 */
export async function incrementMapCount(username) {
  const db = getDb();
  const month = currentMonthKey();
  ensureUsageRow(username, month);

  db.prepare(`
    UPDATE usage
    SET maps_created = maps_created + 1,
        updated_at = datetime('now')
    WHERE username = ? AND month = ?
  `).run(username, month);

  return getUsage(username);
}

/**
 * Increment the chat message counter for a specific map.
 * @param {string} username
 * @param {string} mapId
 * @returns {Promise<number>} The new count for that map
 */
export async function incrementChatCount(username, mapId) {
  const db = getDb();
  const month = currentMonthKey();
  ensureUsageRow(username, month);

  // Read current chat_messages_sent JSON
  const row = db.prepare('SELECT chat_messages_sent FROM usage WHERE username = ? AND month = ?').get(username, month);
  let chatMessages = {};
  try {
    chatMessages = JSON.parse(row?.chat_messages_sent ?? '{}');
  } catch {
    chatMessages = {};
  }

  chatMessages[mapId] = (chatMessages[mapId] ?? 0) + 1;

  db.prepare(`
    UPDATE usage
    SET chat_messages_sent = ?,
        updated_at = datetime('now')
    WHERE username = ? AND month = ?
  `).run(JSON.stringify(chatMessages), username, month);

  return chatMessages[mapId];
}

/**
 * Reset the monthly usage counters for a user.
 * @param {string} username
 * @returns {Promise<void>}
 */
export async function resetMonthlyUsage(username) {
  const db = getDb();
  const month = currentMonthKey();
  ensureUsageRow(username, month);

  db.prepare(`
    UPDATE usage
    SET maps_created = 0,
        chat_messages_sent = '{}',
        updated_at = datetime('now')
    WHERE username = ? AND month = ?
  `).run(username, month);
}

/**
 * Get aggregated usage stats for all users (admin use).
 * @returns {Promise<{ totalUsers: number, totalMaps: number, currentMonthMaps: number }>}
 */
export async function getGlobalStats() {
  const db = getDb();
  const month = currentMonthKey();

  const totalMapsRow = db.prepare('SELECT SUM(maps_created) as total FROM usage').get();
  const currentMonthRow = db.prepare('SELECT SUM(maps_created) as total FROM usage WHERE month = ?').get(month);
  const totalUsersRow = db.prepare('SELECT COUNT(*) as count FROM users').get();

  return {
    totalUsers: totalUsersRow?.count ?? 0,
    totalMaps: totalMapsRow?.total ?? 0,
    currentMonthMaps: currentMonthRow?.total ?? 0,
  };
}
