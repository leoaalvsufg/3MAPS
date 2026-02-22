/**
 * server/backup.js
 * Automated backup system for the 3Maps server.
 *
 * - runBackup(): iterates all users, creates a compressed daily backup
 * - scheduleBackups(intervalHours): sets up periodic backups
 *
 * Backup files are stored at: data/backups/{username}_{date}.json
 * Only the last 7 daily backups per user are kept.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { getDataDir, listMaps } from './storage.js';
import { logger } from './logger.js';

const MAX_DAILY_BACKUPS = 7;

/**
 * Returns the path to the global backups directory.
 * @returns {string}
 */
function globalBackupsDir() {
  return path.join(getDataDir(), 'backups');
}

/**
 * Returns a date string in YYYY-MM-DD format for a given Date.
 * @param {Date} date
 * @returns {string}
 */
function dateString(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Run a full backup of all users' maps.
 * Creates one backup file per user at data/backups/{username}_{date}.json
 * Keeps only the last MAX_DAILY_BACKUPS backups per user.
 */
export async function runBackup() {
  const dataDir = getDataDir();
  const usersDir = path.join(dataDir, 'users');
  const backupDir = globalBackupsDir();

  logger.info('[backup] Starting backup run');

  // Ensure backup directory exists
  try {
    await fs.mkdir(backupDir, { recursive: true });
  } catch (err) {
    logger.error('[backup] Failed to create backup directory', { error: String(err) });
    return;
  }

  // List all users
  let usernames;
  try {
    const entries = await fs.readdir(usersDir, { withFileTypes: true });
    usernames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      logger.info('[backup] No users directory found, skipping backup');
      return;
    }
    logger.error('[backup] Failed to list users', { error: String(err) });
    return;
  }

  if (usernames.length === 0) {
    logger.info('[backup] No users found, nothing to back up');
    return;
  }

  const timestamp = new Date().toISOString();
  const dateStr = dateString(new Date());
  let successCount = 0;
  let errorCount = 0;

  for (const username of usernames) {
    try {
      // Load all maps for this user
      const maps = await listMaps(username);

      const backupData = {
        username,
        timestamp,
        maps,
      };

      const backupFilename = `${username}_${dateStr}.json`;
      const backupPath = path.join(backupDir, backupFilename);

      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
      logger.info(`[backup] Backed up ${maps.length} maps for user "${username}"`, {
        file: backupFilename,
      });

      // Prune old backups for this user (keep last MAX_DAILY_BACKUPS)
      await pruneUserBackups(username, backupDir);

      successCount++;
    } catch (err) {
      logger.error(`[backup] Failed to back up user "${username}"`, { error: String(err) });
      errorCount++;
    }
  }

  logger.info('[backup] Backup run complete', { successCount, errorCount, totalUsers: usernames.length });
}

/**
 * Delete old backup files for a user, keeping only the last MAX_DAILY_BACKUPS.
 * @param {string} username
 * @param {string} backupDir
 */
async function pruneUserBackups(username, backupDir) {
  try {
    const files = await fs.readdir(backupDir);
    const prefix = `${username}_`;
    const userBackups = files
      .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
      .sort(); // lexicographic sort works because dates are YYYY-MM-DD

    if (userBackups.length > MAX_DAILY_BACKUPS) {
      const toDelete = userBackups.slice(0, userBackups.length - MAX_DAILY_BACKUPS);
      for (const f of toDelete) {
        try {
          await fs.rm(path.join(backupDir, f), { force: true });
          logger.debug(`[backup] Deleted old backup: ${f}`);
        } catch (err) {
          logger.warn(`[backup] Failed to delete old backup: ${f}`, { error: String(err) });
        }
      }
    }
  } catch (err) {
    logger.warn('[backup] Failed to prune old backups', { username, error: String(err) });
  }
}

/**
 * Schedule periodic backups.
 * @param {number} intervalHours - How often to run backups (in hours)
 * @returns {NodeJS.Timeout} The interval handle (can be used to cancel)
 */
export function scheduleBackups(intervalHours) {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  logger.info(`[backup] Scheduled backups every ${intervalHours} hour(s)`);

  const handle = setInterval(async () => {
    try {
      await runBackup();
    } catch (err) {
      logger.error('[backup] Unhandled error during scheduled backup', { error: String(err) });
    }
  }, intervalMs);

  // Don't prevent process from exiting
  if (handle.unref) handle.unref();

  return handle;
}
