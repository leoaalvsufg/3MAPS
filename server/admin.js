/**
 * server/admin.js
 *
 * Admin API route handlers.
 * All routes require a valid JWT with isAdmin === true.
 *
 * Routes (handled in server/index.js):
 *   GET  /api/admin/users              — list all users (paginated)
 *   POST /api/admin/users              — create a new user
 *   GET  /api/admin/users/:username    — get single user details
 *   PATCH /api/admin/users/:username   — update user (plan, isActive, isAdmin, email)
 *   DELETE /api/admin/users/:username  — delete user account
 *   GET  /api/admin/stats              — global usage statistics
 *   POST /api/admin/users/:username/reset-usage — reset monthly usage
 *   GET  /api/admin/logs               — activity logs (paginated, filterable)
 *   GET  /api/admin/notifications      — admin notifications
 *   POST /api/admin/notifications/read — mark notifications as read
 *   GET  /api/admin/settings           — get admin settings
 *   PUT  /api/admin/settings           — update admin settings
 */

import { listUsers, getUser, updateUser, deleteUser, createUser } from './users.js';
import { getUsage, resetMonthlyUsage, getGlobalStats } from './usage.js';
import { getDataDir, listMaps } from './storage.js';
import {
  listActivityLogs,
  getActionTypes,
  listNotifications,
  markNotificationsRead,
  getAdminSettings,
  setAdminSettings,
} from './activity.js';

const PLAN_RESOURCE_LIMITS = {
  free: { mapsPerMonth: 5, maxMapsStored: 5, chatMessagesPerMap: 5 },
  premium: { mapsPerMonth: -1, maxMapsStored: -1, chatMessagesPerMap: -1 },
  enterprise: { mapsPerMonth: -1, maxMapsStored: -1, chatMessagesPerMap: -1 },
  admin: { mapsPerMonth: -1, maxMapsStored: -1, chatMessagesPerMap: -1 },
};

function sumChatMessages(chatMessagesSent) {
  if (!chatMessagesSent || typeof chatMessagesSent !== 'object') return 0;
  return Object.values(chatMessagesSent).reduce((acc, value) => {
    const n = Number(value ?? 0);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

// ---------------------------------------------------------------------------
// Admin middleware helper
// ---------------------------------------------------------------------------

/**
 * Check if the authenticated user is an admin.
 * @param {{ userId: string, username: string, isAdmin?: boolean } | null} authUser
 * @returns {boolean}
 */
export function isAdminUser(authUser) {
  return authUser?.isAdmin === true;
}

// ---------------------------------------------------------------------------
// Handler functions
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/users
 * List all users with pagination and optional search.
 */
export async function handleListUsers(req, url) {
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const search = url.searchParams.get('search') ?? '';

  const { users, total } = await listUsers({ limit, offset, search });

  // Strip password hashes from response
  const safeUsers = users.map(({ passwordHash: _ph, ...rest }) => rest);

  return { users: safeUsers, total, limit, offset };
}

/**
 * POST /api/admin/users
 * Create a new user.
 */
export async function handleCreateUser(body) {
  const { username, password, plan = 'free', email = null, isAdmin = false } = body ?? {};

  if (!username || !password) {
    throw new Error('Username e password são obrigatórios');
  }

  const result = await createUser(username, password, { plan, email, isAdmin });
  return result;
}

/**
 * GET /api/admin/users/:username
 * Get a single user's details including usage.
 */
export async function handleGetUser(username) {
  const profile = await getUser(username);
  if (!profile) return null;

  const usage = await getUsage(username);

  // Count maps on disk
  let mapCount = 0;
  try {
    const maps = await listMaps(username);
    mapCount = maps.length;
  } catch {
    mapCount = 0;
  }

  const { passwordHash: _ph, ...safeProfile } = profile;
  return { ...safeProfile, usage, mapCount };
}

/**
 * PATCH /api/admin/users/:username
 * Update user fields.
 * Allowed fields: plan, isActive, isAdmin, email, password
 */
export async function handleUpdateUser(username, body) {
  const allowed = ['plan', 'isActive', 'isAdmin', 'email', 'password'];
  const updates = {};

  for (const key of allowed) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  // Validate plan
  if (updates.plan !== undefined) {
    const validPlans = ['free', 'premium', 'enterprise', 'admin'];
    if (!validPlans.includes(updates.plan)) {
      throw new Error(`Invalid plan. Must be one of: ${validPlans.join(', ')}`);
    }
  }

  const updated = await updateUser(username, updates);
  if (!updated) return null;

  const { passwordHash: _ph, ...safeProfile } = updated;
  return safeProfile;
}

/**
 * DELETE /api/admin/users/:username
 * Delete a user account.
 */
export async function handleDeleteUser(username) {
  const deleted = await deleteUser(username);
  return { ok: deleted };
}

/**
 * GET /api/admin/stats
 * Global usage statistics with enhanced metrics.
 */
export async function handleGetStats() {
  const stats = await getGlobalStats();

  // Count total map files on disk
  let totalMapFiles = 0;
  try {
    const dataDir = getDataDir();
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const usersDir = path.join(dataDir, 'users');
    const entries = await fs.readdir(usersDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const mapsDir = path.join(usersDir, entry.name, 'maps');
        const files = await fs.readdir(mapsDir);
        totalMapFiles += files.filter((f) => f.endsWith('.json')).length;
      } catch {
        // ignore missing maps dir
      }
    }
  } catch {
    // ignore
  }

  // Users by plan breakdown
  let usersByPlan = {};
  try {
    const { getDb } = await import('./db.js');
    const db = getDb();
    const rows = db.prepare(`
      SELECT plan, COUNT(*) as count FROM users GROUP BY plan ORDER BY count DESC
    `).all();
    for (const row of rows) {
      usersByPlan[row.plan] = row.count;
    }
  } catch {
    // ignore
  }

  // Recent registrations (last 30 days, grouped by day)
  let recentRegistrations = [];
  try {
    const { getDb } = await import('./db.js');
    const db = getDb();
    const rows = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all();
    recentRegistrations = rows;
  } catch {
    // ignore
  }

  // Recent activity summary (last 24h)
  let recentActivity = {};
  try {
    const { getDb } = await import('./db.js');
    const db = getDb();
    const rows = db.prepare(`
      SELECT action, COUNT(*) as count
      FROM activity_logs
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY action
      ORDER BY count DESC
    `).all();
    for (const row of rows) {
      recentActivity[row.action] = row.count;
    }
  } catch {
    // ignore
  }

  // LLM usage + per-account resource usage (maps/chat available vs used)
  let llmUsage = {
    estimatedRequestsThisMonth: 0,
    mapsGenerationRequestsThisMonth: 0,
    chatRequestsThisMonth: 0,
    topAccounts: [],
  };
  let accountResourceUsage = [];
  try {
    const { users } = await listUsers({ limit: 10_000, offset: 0, search: '' });

    const perAccount = [];
    let mapsGenerationRequestsThisMonth = 0;
    let chatRequestsThisMonth = 0;

    for (const user of users) {
      const effectivePlan = user.isAdmin ? 'admin' : (user.plan ?? 'free');
      const limits = PLAN_RESOURCE_LIMITS[effectivePlan] ?? PLAN_RESOURCE_LIMITS.free;

      const usage = await getUsage(user.username);
      const mapsStored = await listMaps(user.username).then((m) => m.length).catch(() => 0);
      const chatMessagesUsedThisMonth = sumChatMessages(usage.chatMessagesSent);
      const mapsUsedThisMonth = usage.mapsCreatedThisMonth ?? 0;

      mapsGenerationRequestsThisMonth += mapsUsedThisMonth;
      chatRequestsThisMonth += chatMessagesUsedThisMonth;

      const estimatedLlmRequests = (mapsUsedThisMonth * 3) + chatMessagesUsedThisMonth;
      perAccount.push({
        username: user.username,
        plan: effectivePlan,
        isAdmin: user.isAdmin === true,
        resources: {
          mapsPerMonth: {
            used: mapsUsedThisMonth,
            limit: limits.mapsPerMonth,
            remaining: limits.mapsPerMonth === -1 ? -1 : Math.max(0, limits.mapsPerMonth - mapsUsedThisMonth),
          },
          mapsStored: {
            used: mapsStored,
            limit: limits.maxMapsStored,
            remaining: limits.maxMapsStored === -1 ? -1 : Math.max(0, limits.maxMapsStored - mapsStored),
          },
          chatMessagesThisMonth: {
            used: chatMessagesUsedThisMonth,
            perMapLimit: limits.chatMessagesPerMap,
          },
          estimatedLlmRequestsThisMonth: estimatedLlmRequests,
        },
      });
    }

    const estimatedRequestsThisMonth = (mapsGenerationRequestsThisMonth * 3) + chatRequestsThisMonth;
    llmUsage = {
      estimatedRequestsThisMonth,
      mapsGenerationRequestsThisMonth,
      chatRequestsThisMonth,
      topAccounts: perAccount
        .slice()
        .sort((a, b) => b.resources.estimatedLlmRequestsThisMonth - a.resources.estimatedLlmRequestsThisMonth)
        .slice(0, 10)
        .map((a) => ({
          username: a.username,
          plan: a.plan,
          estimatedLlmRequestsThisMonth: a.resources.estimatedLlmRequestsThisMonth,
          mapsUsedThisMonth: a.resources.mapsPerMonth.used,
          chatMessagesUsedThisMonth: a.resources.chatMessagesThisMonth.used,
        })),
    };
    accountResourceUsage = perAccount
      .slice()
      .sort((a, b) => a.username.localeCompare(b.username, 'pt-BR'));
  } catch {
    // ignore
  }

  return {
    ...stats,
    totalMapFiles,
    usersByPlan,
    recentRegistrations,
    recentActivity,
    llmUsage,
    accountResourceUsage,
    serverTime: new Date().toISOString(),
  };
}

/**
 * POST /api/admin/users/:username/reset-usage
 * Reset monthly usage counters for a user.
 */
export async function handleResetUsage(username) {
  const profile = await getUser(username);
  if (!profile) return null;
  await resetMonthlyUsage(username);
  return { ok: true, username };
}

/**
 * GET /api/admin/logs
 * Activity logs with pagination and filters.
 */
export async function handleGetLogs(url) {
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const username = url.searchParams.get('username') ?? '';
  const action = url.searchParams.get('action') ?? '';
  const since = url.searchParams.get('since') ?? '';

  const result = listActivityLogs({ limit, offset, username, action, since });
  const actionTypes = getActionTypes();

  return { ...result, actionTypes };
}

/**
 * GET /api/admin/notifications
 * Admin notifications.
 */
export async function handleGetNotifications(url) {
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const unreadOnly = url.searchParams.get('unread') === 'true';

  return listNotifications({ limit, offset, unreadOnly });
}

/**
 * POST /api/admin/notifications/read
 * Mark notifications as read.
 */
export async function handleMarkNotificationsRead(body) {
  const { ids } = body ?? {};
  if (ids === 'all' || (Array.isArray(ids) && ids.length > 0)) {
    markNotificationsRead(ids);
  }
  return { ok: true };
}

/**
 * GET /api/admin/settings
 * Get admin settings.
 */
export async function handleGetSettings() {
  const settings = getAdminSettings();
  // Mask sensitive values
  const masked = { ...settings };
  if (masked.stripe_secret_key && typeof masked.stripe_secret_key === 'string') {
    masked.stripe_secret_key = masked.stripe_secret_key.replace(/^(sk_(?:test|live)_[A-Za-z0-9]{4}).*/, '$1****');
  }
  // Mask LLM / Replicate keys
  for (const k of ['openrouter_api_key', 'openai_api_key', 'gemini_api_key', 'replicate_api_key']) {
    if (masked[k] && typeof masked[k] === 'string' && masked[k].length > 8) {
      masked[k] = masked[k].slice(0, 4) + '****' + masked[k].slice(-4);
    }
  }
  return masked;
}

/**
 * PUT /api/admin/settings
 * Update admin settings.
 */
export async function handleUpdateSettings(body, adminUsername) {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid settings body');
  }

  // Allowed setting keys
  const allowedKeys = [
    'openrouter_api_key',
    'openai_api_key',
    'gemini_api_key',
    'replicate_api_key',
    'llm_default_provider',
    'llm_default_model',
    'stripe_publishable_key',
    'stripe_secret_key',
    'stripe_webhook_secret',
    'stripe_price_free',
    'stripe_price_premium',
    'stripe_price_enterprise',
    'plan_free_name',
    'plan_free_description',
    'plan_free_price',
    'plan_premium_name',
    'plan_premium_description',
    'plan_premium_price',
    'plan_enterprise_name',
    'plan_enterprise_description',
    'plan_enterprise_price',
    'app_name',
    'app_url',
    'support_email',
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_from',
  ];

  const filtered = {};
  for (const key of allowedKeys) {
    if (key in body) {
      filtered[key] = body[key];
    }
  }

  // Don't allow empty string for SMTP_PASS — keep existing if not provided
  if ('smtp_pass' in body && body.smtp_pass) {
    filtered['smtp_pass'] = body.smtp_pass;
  }

  setAdminSettings(filtered, adminUsername);
  return { ok: true, updated: Object.keys(filtered) };
}
