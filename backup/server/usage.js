import fs from 'node:fs/promises';
import path from 'node:path';
import { getDataDir } from './storage.js';

// ---------------------------------------------------------------------------
// Usage tracking for 3Maps monetization
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
 * Returns the path to the usage file for a given user.
 * @param {string} username
 * @returns {string}
 */
function usagePath(username) {
  return path.join(getDataDir(), 'users', username, 'usage.json');
}

/**
 * Returns a fresh default usage object for the current month.
 * @returns {Usage}
 */
function defaultUsage() {
  return {
    mapsCreatedThisMonth: 0,
    monthKey: currentMonthKey(),
    totalMapsCreated: 0,
    chatMessagesSent: {},
  };
}

/**
 * Read usage from disk, resetting monthly counters if the month has changed.
 * @param {string} username
 * @returns {Promise<Usage>}
 */
export async function getUsage(username) {
  const file = usagePath(username);
  let usage;
  try {
    const raw = await fs.readFile(file, 'utf8');
    usage = JSON.parse(raw);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return defaultUsage();
    }
    if (err && typeof err === 'object' && 'name' in err && err.name === 'SyntaxError') {
      return defaultUsage();
    }
    throw err;
  }

  // Ensure all fields exist (back-compat)
  if (typeof usage.mapsCreatedThisMonth !== 'number') usage.mapsCreatedThisMonth = 0;
  if (typeof usage.totalMapsCreated !== 'number') usage.totalMapsCreated = 0;
  if (!usage.chatMessagesSent || typeof usage.chatMessagesSent !== 'object') {
    usage.chatMessagesSent = {};
  }

  // Reset monthly counter if the month has changed
  const thisMonth = currentMonthKey();
  if (usage.monthKey !== thisMonth) {
    usage.mapsCreatedThisMonth = 0;
    usage.monthKey = thisMonth;
    // Persist the reset immediately
    await _writeUsage(username, usage);
  }

  return usage;
}

/**
 * Write usage to disk atomically.
 * @param {string} username
 * @param {Usage} usage
 */
async function _writeUsage(username, usage) {
  const file = usagePath(username);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(usage, null, 2), 'utf8');
}

/**
 * Increment the map creation counter for the current month.
 * @param {string} username
 * @returns {Promise<Usage>}
 */
export async function incrementMapCount(username) {
  const usage = await getUsage(username);
  usage.mapsCreatedThisMonth += 1;
  usage.totalMapsCreated += 1;
  await _writeUsage(username, usage);
  return usage;
}

/**
 * Increment the chat message counter for a specific map.
 * @param {string} username
 * @param {string} mapId
 * @returns {Promise<number>} The new count for that map
 */
export async function incrementChatCount(username, mapId) {
  const usage = await getUsage(username);
  const current = usage.chatMessagesSent[mapId] ?? 0;
  usage.chatMessagesSent[mapId] = current + 1;
  await _writeUsage(username, usage);
  return usage.chatMessagesSent[mapId];
}

/**
 * Reset the monthly usage counters for a user.
 * @param {string} username
 * @returns {Promise<void>}
 */
export async function resetMonthlyUsage(username) {
  const usage = await getUsage(username);
  usage.mapsCreatedThisMonth = 0;
  usage.monthKey = currentMonthKey();
  await _writeUsage(username, usage);
}
