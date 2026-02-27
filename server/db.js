/**
 * server/db.js
 *
 * SQLite database initialization and schema management.
 * Uses better-sqlite3 for synchronous, high-performance SQLite access.
 *
 * Tables:
 *   users        — user accounts (replaces filesystem profile.json)
 *   usage        — monthly usage counters per user
 *   sessions     — (future) active sessions / refresh tokens
 *
 * Map data itself is still stored as JSON files on disk (unchanged).
 * This DB handles only user metadata and usage tracking.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Database path
// ---------------------------------------------------------------------------

function getDbPath() {
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve('data');
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'mindmap.db');
}

// ---------------------------------------------------------------------------
// Singleton DB instance
// ---------------------------------------------------------------------------

let _db = null;

/**
 * Returns the singleton SQLite database instance.
 * Creates and initializes the database on first call.
 * @returns {Database.Database}
 */
export function getDb() {
  if (_db) return _db;

  const dbPath = getDbPath();
  _db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL');
  // Enable foreign keys
  _db.pragma('foreign_keys = ON');
  // Reasonable busy timeout (5 seconds)
  _db.pragma('busy_timeout = 5000');

  // Run migrations
  runMigrations(_db);

  return _db;
}

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

const MIGRATIONS = [
  // Migration 0001 — initial schema
  {
    version: 1,
    up: (db) => {
      db.exec(`
        -- Users table
        CREATE TABLE IF NOT EXISTS users (
          id          TEXT PRIMARY KEY,           -- UUID v4
          username    TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          plan        TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'premium', 'admin')),
          email       TEXT,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
          is_active   INTEGER NOT NULL DEFAULT 1,  -- 0 = disabled
          is_admin    INTEGER NOT NULL DEFAULT 0   -- 1 = admin
        );

        -- Index for fast username lookups
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

        -- Usage table — one row per user per month
        CREATE TABLE IF NOT EXISTS usage (
          id                    INTEGER PRIMARY KEY AUTOINCREMENT,
          username              TEXT NOT NULL,
          month                 TEXT NOT NULL,  -- format: YYYY-MM
          maps_created          INTEGER NOT NULL DEFAULT 0,
          chat_messages_sent    TEXT NOT NULL DEFAULT '{}',  -- JSON: { mapId: count }
          updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(username, month)
        );

        CREATE INDEX IF NOT EXISTS idx_usage_username_month ON usage(username, month);

        -- Schema version tracking
        CREATE TABLE IF NOT EXISTS schema_version (
          version     INTEGER PRIMARY KEY,
          applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  // Migration 0002 — add 'enterprise' plan support
  {
    version: 2,
    up: (db) => {
      // SQLite doesn't support ALTER TABLE ... MODIFY COLUMN for CHECK constraints.
      // We recreate the users table with the updated CHECK constraint.
      db.exec(`
        -- Create new users table with updated plan constraint
        CREATE TABLE IF NOT EXISTS users_v2 (
          id          TEXT PRIMARY KEY,
          username    TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          plan        TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'premium', 'enterprise', 'admin')),
          email       TEXT,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
          is_active   INTEGER NOT NULL DEFAULT 1,
          is_admin    INTEGER NOT NULL DEFAULT 0
        );

        -- Copy existing data
        INSERT OR IGNORE INTO users_v2 SELECT * FROM users;

        -- Drop old table and rename new one
        DROP TABLE users;
        ALTER TABLE users_v2 RENAME TO users;

        -- Recreate index
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      `);
    },
  },
  // Migration 0003 — password reset tokens
  {
    version: 3,
    up: (db) => {
      db.exec(`
        -- Password reset tokens table
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id          TEXT PRIMARY KEY,           -- UUID v4
          username    TEXT NOT NULL,
          token_hash  TEXT NOT NULL UNIQUE,       -- SHA-256 hash of the raw token
          expires_at  TEXT NOT NULL,              -- ISO 8601 datetime
          used        INTEGER NOT NULL DEFAULT 0, -- 1 = already used
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_prt_username ON password_reset_tokens(username);
      `);
    },
  },
  // Migration 0004 — activity logs, admin settings, notifications
  {
    version: 4,
    up: (db) => {
      db.exec(`
        -- Activity logs table — tracks user actions and system events
        CREATE TABLE IF NOT EXISTS activity_logs (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          username    TEXT,                        -- NULL for system events
          action      TEXT NOT NULL,               -- e.g. 'login', 'create_map', 'delete_map', 'register', 'password_reset', 'error'
          details     TEXT,                        -- JSON string with extra context
          ip          TEXT,                        -- client IP address
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_activity_username ON activity_logs(username);
        CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_logs(action);
        CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_logs(created_at);

        -- Admin settings table — key/value store for system configuration
        CREATE TABLE IF NOT EXISTS admin_settings (
          key         TEXT PRIMARY KEY,
          value       TEXT NOT NULL,               -- JSON-encoded value
          updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_by  TEXT                         -- admin username who last changed it
        );

        -- Notifications table — admin alerts
        CREATE TABLE IF NOT EXISTS notifications (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          type        TEXT NOT NULL,               -- 'warning', 'error', 'info'
          title       TEXT NOT NULL,
          message     TEXT NOT NULL,
          username    TEXT,                        -- related user (if any)
          read        INTEGER NOT NULL DEFAULT 0,  -- 0 = unread, 1 = read
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
        CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
      `);
    },
  },
  // Migration 0005 — Firebase Auth (firebase_uid on users)
  {
    version: 5,
    up: (db) => {
      db.exec(`
        ALTER TABLE users ADD COLUMN firebase_uid TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL;
      `);
    },
  },
  // Migration 0006 — magic link tokens (login sem senha)
  {
    version: 6,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS magic_link_tokens (
          id          TEXT PRIMARY KEY,
          username    TEXT NOT NULL,
          token_hash  TEXT NOT NULL UNIQUE,
          expires_at  TEXT NOT NULL,
          used        INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_mlt_token_hash ON magic_link_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_mlt_username ON magic_link_tokens(username);
      `);
    },
  },
  // Migration 0007 — API tokens (acesso às APIs por token, gerado por admin)
  {
    version: 7,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS api_tokens (
          id           TEXT PRIMARY KEY,
          token_hash   TEXT NOT NULL UNIQUE,
          token_prefix TEXT NOT NULL,
          username     TEXT NOT NULL,
          name         TEXT,
          scopes       TEXT NOT NULL,
          expires_at   TEXT,
          last_used_at TEXT,
          is_active    INTEGER NOT NULL DEFAULT 1,
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          created_by   TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_apit_token_hash ON api_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_apit_username ON api_tokens(username);
      `);
    },
  },
  // Migration 0008 — Stripe customer ID (para sync de plano no login)
  {
    version: 8,
    up: (db) => {
      try {
        db.exec(`ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`);
      } catch (e) {
        if (!String(e?.message || e).includes('duplicate column')) throw e;
      }
    },
  },
];

function runMigrations(db) {
  // Ensure schema_version table exists first
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const getVersion = db.prepare('SELECT MAX(version) as v FROM schema_version');
  const row = getVersion.get();
  const currentVersion = row?.v ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      const applyMigration = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(migration.version);
      });
      applyMigration();
      console.log(`[DB] Applied migration v${migration.version}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Utility: close DB (for tests / graceful shutdown)
// ---------------------------------------------------------------------------

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
