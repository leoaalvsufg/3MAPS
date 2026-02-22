/**
 * server/activity.js
 *
 * Activity logging and querying for the admin panel.
 * Logs user actions, logins, errors, and system events to the activity_logs table.
 */

import { getDb } from './db.js';
import { syncSettingsToFirestore } from './settingsSync.js';

// ---------------------------------------------------------------------------
// Log an activity event
// ---------------------------------------------------------------------------

/**
 * Log an activity event.
 * @param {{ username?: string, action: string, details?: object, ip?: string }} event
 */
export function logActivity({ username = null, action, details = null, ip = null }) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO activity_logs (username, action, details, ip)
      VALUES (?, ?, ?, ?)
    `).run(
      username,
      action,
      details ? JSON.stringify(details) : null,
      ip
    );
  } catch {
    // Non-critical — never throw from logging
  }
}

// ---------------------------------------------------------------------------
// Query activity logs
// ---------------------------------------------------------------------------

/**
 * List activity logs with optional filters.
 * @param {{ limit?: number, offset?: number, username?: string, action?: string, since?: string }} options
 * @returns {{ logs: object[], total: number }}
 */
export function listActivityLogs({ limit = 50, offset = 0, username = '', action = '', since = '' } = {}) {
  const db = getDb();

  const conditions = [];
  const params = [];

  if (username) {
    conditions.push('username LIKE ?');
    params.push(`%${username}%`);
  }
  if (action) {
    conditions.push('action = ?');
    params.push(action);
  }
  if (since) {
    conditions.push('created_at >= ?');
    params.push(since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) as count FROM activity_logs ${where}`).get(...params)?.count ?? 0;
  const rows = db.prepare(`
    SELECT * FROM activity_logs ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return {
    logs: rows.map((row) => ({
      id: row.id,
      username: row.username,
      action: row.action,
      details: row.details ? (() => { try { return JSON.parse(row.details); } catch { return row.details; } })() : null,
      ip: row.ip,
      createdAt: row.created_at,
    })),
    total,
  };
}

/**
 * Get distinct action types for filter dropdown.
 * @returns {string[]}
 */
export function getActionTypes() {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT action FROM activity_logs ORDER BY action').all();
  return rows.map((r) => r.action);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Create a notification.
 * @param {{ type: 'warning'|'error'|'info', title: string, message: string, username?: string }} notification
 */
export function createNotification({ type, title, message, username = null }) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO notifications (type, title, message, username)
      VALUES (?, ?, ?, ?)
    `).run(type, title, message, username);
  } catch {
    // Non-critical
  }
}

/**
 * List notifications.
 * @param {{ limit?: number, offset?: number, unreadOnly?: boolean }} options
 * @returns {{ notifications: object[], total: number, unreadCount: number }}
 */
export function listNotifications({ limit = 50, offset = 0, unreadOnly = false } = {}) {
  const db = getDb();

  const where = unreadOnly ? 'WHERE read = 0' : '';
  const total = db.prepare(`SELECT COUNT(*) as count FROM notifications ${where}`).get()?.count ?? 0;
  const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get()?.count ?? 0;

  const rows = db.prepare(`
    SELECT * FROM notifications ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  return {
    notifications: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      username: row.username,
      read: row.read === 1,
      createdAt: row.created_at,
    })),
    total,
    unreadCount,
  };
}

/**
 * Mark notifications as read.
 * @param {number[]|'all'} ids — array of IDs or 'all'
 */
export function markNotificationsRead(ids) {
  const db = getDb();
  if (ids === 'all') {
    db.prepare('UPDATE notifications SET read = 1').run();
  } else if (Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE notifications SET read = 1 WHERE id IN (${placeholders})`).run(...ids);
  }
}

// ---------------------------------------------------------------------------
// Admin settings
// ---------------------------------------------------------------------------

/**
 * Get all admin settings.
 * @returns {Record<string, any>}
 */
export function getAdminSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM admin_settings').all();
  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

/**
 * Get a single admin setting.
 * @param {string} key
 * @param {any} defaultValue
 * @returns {any}
 */
export function getAdminSetting(key, defaultValue = null) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

/**
 * Set an admin setting.
 * @param {string} key
 * @param {any} value
 * @param {string} [updatedBy]
 */
export function setAdminSetting(key, value, updatedBy = null) {
  const db = getDb();
  db.prepare(`
    INSERT INTO admin_settings (key, value, updated_by, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run(key, JSON.stringify(value), updatedBy);
}

/**
 * Set multiple admin settings at once.
 * Dual-write: SQLite local + Firebase Firestore (async).
 * @param {Record<string, any>} settings
 * @param {string} [updatedBy]
 */
export function setAdminSettings(settings, updatedBy = null) {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO admin_settings (key, value, updated_by, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `);
  const transaction = db.transaction((entries) => {
    for (const [key, value] of entries) {
      upsert.run(key, JSON.stringify(value), updatedBy);
    }
  });
  transaction(Object.entries(settings));
  syncSettingsToFirestore(settings, updatedBy).catch(() => {});
}

// ---------------------------------------------------------------------------
// Auto-generate notifications from activity patterns
// ---------------------------------------------------------------------------

/**
 * Check for suspicious activity and generate notifications.
 * Called periodically or after certain events.
 */
export function checkAndNotify() {
  try {
    const db = getDb();

    // Check for users with many failed logins in the last hour
    const failedLogins = db.prepare(`
      SELECT username, COUNT(*) as count
      FROM activity_logs
      WHERE action = 'login_failed'
        AND created_at >= datetime('now', '-1 hour')
        AND username IS NOT NULL
      GROUP BY username
      HAVING count >= 5
    `).all();

    for (const row of failedLogins) {
      // Check if we already notified about this recently
      const existing = db.prepare(`
        SELECT id FROM notifications
        WHERE type = 'warning'
          AND username = ?
          AND title LIKE '%tentativas de login%'
          AND created_at >= datetime('now', '-1 hour')
      `).get(row.username);

      if (!existing) {
        createNotification({
          type: 'warning',
          title: `${row.count} tentativas de login falhas`,
          message: `O usuário "${row.username}" teve ${row.count} tentativas de login falhas na última hora. Possível ataque de força bruta.`,
          username: row.username,
        });
      }
    }

    // Check for users creating many maps in a short time (possible abuse)
    const heavyUsers = db.prepare(`
      SELECT username, COUNT(*) as count
      FROM activity_logs
      WHERE action = 'create_map'
        AND created_at >= datetime('now', '-1 hour')
        AND username IS NOT NULL
      GROUP BY username
      HAVING count >= 20
    `).all();

    for (const row of heavyUsers) {
      const existing = db.prepare(`
        SELECT id FROM notifications
        WHERE type = 'warning'
          AND username = ?
          AND title LIKE '%uso excessivo%'
          AND created_at >= datetime('now', '-1 hour')
      `).get(row.username);

      if (!existing) {
        createNotification({
          type: 'warning',
          title: `Uso excessivo detectado`,
          message: `O usuário "${row.username}" criou ${row.count} mapas na última hora. Verifique se é uso legítimo.`,
          username: row.username,
        });
      }
    }
  } catch {
    // Non-critical
  }
}
