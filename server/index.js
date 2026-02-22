import http from 'node:http';
import { URL } from 'node:url';
import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { deleteMap, getMap, listMaps, putMap, validateMapId, validateUsername, getDataDir } from './storage.js';
import { checkRateLimit } from './rateLimit.js';
import { generateToken, verifyToken } from './auth.js';
import { createUser, validateCredentials, validateAuthUsername, validatePassword, getUser, migrateFilesystemUsers } from './users.js';
import { getUsage, incrementMapCount, incrementChatCount } from './usage.js';
import { logger } from './logger.js';
import { scheduleBackups, runBackup } from './backup.js';
import { sendPasswordResetEmail } from './email.js';
import {
  isAdminUser,
  handleListUsers,
  handleCreateUser,
  handleGetUser,
  handleUpdateUser,
  handleDeleteUser,
  handleGetStats,
  handleResetUsage,
  handleGetLogs,
  handleGetNotifications,
  handleMarkNotificationsRead,
  handleGetSettings,
  handleUpdateSettings,
} from './admin.js';
import { logActivity, checkAndNotify } from './activity.js';

// ---------------------------------------------------------------------------
// Error recovery: uncaught exceptions / unhandled rejections
// ---------------------------------------------------------------------------

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  // Continue running — do not crash
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// ---------------------------------------------------------------------------
// Plan limits (mirrors src/lib/plans.ts — keep in sync)
// ---------------------------------------------------------------------------

const ALL_TEMPLATES = ['padrao', 'brainstorm', 'analise', 'projeto', 'estudo', 'problema', 'comparacao', 'timeline', 'pensamento_profundo'];
const ALL_EXPORT_FORMATS = ['png', 'svg', 'pdf', 'markdown'];

const PLAN_LIMITS = {
  free: {
    id: 'free',
    name: 'Gratuito',
    mapsPerMonth: 5,
    templatesAllowed: ['padrao', 'brainstorm', 'analise'],
    exportFormats: ['png'],
    imageGeneration: false,
    chatEnabled: true,
    chatMessagesPerMap: 5,
    maxMapsStored: 20,
    canConfigureApiKeys: false,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    mapsPerMonth: -1,
    templatesAllowed: ALL_TEMPLATES,
    exportFormats: ALL_EXPORT_FORMATS,
    imageGeneration: true,
    chatEnabled: true,
    chatMessagesPerMap: -1,
    maxMapsStored: -1,
    canConfigureApiKeys: false,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    mapsPerMonth: -1,
    templatesAllowed: ALL_TEMPLATES,
    exportFormats: ALL_EXPORT_FORMATS,
    imageGeneration: true,
    chatEnabled: true,
    chatMessagesPerMap: -1,
    maxMapsStored: -1,
    canConfigureApiKeys: true,
  },
  admin: {
    id: 'admin',
    name: 'Admin',
    mapsPerMonth: -1,
    templatesAllowed: ALL_TEMPLATES,
    exportFormats: ALL_EXPORT_FORMATS,
    imageGeneration: true,
    chatEnabled: true,
    chatMessagesPerMap: -1,
    maxMapsStored: -1,
    canConfigureApiKeys: true,
  },
};

function getPlanLimits(planId) {
  return PLAN_LIMITS[planId] ?? PLAN_LIMITS.free;
}

// ---------------------------------------------------------------------------
// Static file serving (production)
// ---------------------------------------------------------------------------

/**
 * Resolve the path to the Vite build output directory.
 * Defaults to <repo-root>/dist but can be overridden via STATIC_DIR env var.
 */
const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve('dist');

/** MIME type map for common web asset extensions. */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
};

/**
 * Serve a static file from STATIC_DIR.
 * Returns true if the file was served, false if not found.
 * @param {http.ServerResponse} res
 * @param {string} urlPath  — URL pathname (e.g. '/assets/index-abc.js')
 * @returns {Promise<boolean>}
 */
async function serveStaticFile(res, urlPath) {
  // Prevent path traversal
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(STATIC_DIR, safePath);

  // Ensure the resolved path is still inside STATIC_DIR
  if (!filePath.startsWith(STATIC_DIR + path.sep) && filePath !== STATIC_DIR) {
    return false;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    // Cache-control: immutable for hashed assets, no-cache for HTML
    const isHashed = /\.[a-f0-9]{8,}\.(js|css|woff2?)$/.test(filePath);
    const cacheControl = isHashed
      ? 'public, max-age=31536000, immutable'
      : 'no-cache, no-store, must-revalidate';

    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      'content-type': contentType,
      'content-length': String(content.length),
      'cache-control': cacheControl,
      ...getSecurityHeaders(),
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serve the SPA index.html for client-side routing fallback.
 * @param {http.ServerResponse} res
 */
async function serveIndexHtml(res) {
  const indexPath = path.join(STATIC_DIR, 'index.html');
  try {
    const content = await fs.readFile(indexPath);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      ...getSecurityHeaders(),
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const VERSION = process.env.VERSION ?? '1.0.0';

/**
 * Allowed CORS origins. Configurable via the ALLOWED_ORIGINS environment
 * variable as a comma-separated list.
 * Default: localhost dev servers.
 * In production, the frontend is served from the same origin as the API,
 * so no CORS headers are needed for same-origin requests (Origin header is absent).
 */
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);

/** Maximum allowed body size for PUT requests (5 MB). */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/** Minimum response size (bytes) to compress. */
const COMPRESS_THRESHOLD = 1024;

// ---------------------------------------------------------------------------
// Request ID counter
// ---------------------------------------------------------------------------

let requestCounter = 0;
const SERVER_RANDOM = crypto.randomBytes(4).toString('hex');

function generateRequestId() {
  requestCounter = (requestCounter + 1) % 1_000_000;
  return `${SERVER_RANDOM}-${requestCounter.toString().padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Security headers added to every response
// ---------------------------------------------------------------------------

function getSecurityHeaders() {
  const headers = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-xss-protection': '1; mode=block',
  };
  if (IS_PRODUCTION) {
    headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  }
  return headers;
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

/**
 * Returns the CORS headers for an allowed origin, or null if the origin is
 * not in the allowed list.
 * @param {string | undefined} origin
 * @returns {Record<string, string> | null}
 */
function getCorsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,PUT,DELETE,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'vary': 'Origin',
  };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Send a JSON response, compressing with gzip if the client supports it and
 * the payload is larger than COMPRESS_THRESHOLD bytes.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {any} body
 * @param {Record<string, string>} extraHeaders
 */
async function sendJson(res, status, body, extraHeaders = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);

  const acceptEncoding = res.req ? (res.req.headers['accept-encoding'] ?? '') : '';
  const canGzip = acceptEncoding.includes('gzip');
  const shouldCompress = canGzip && payload.length > COMPRESS_THRESHOLD;

  if (shouldCompress) {
    try {
      const compressed = await new Promise((resolve, reject) => {
        zlib.gzip(Buffer.from(payload, 'utf8'), (err, buf) => {
          if (err) reject(err);
          else resolve(buf);
        });
      });
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-encoding': 'gzip',
        'content-length': String(compressed.length),
        ...getSecurityHeaders(),
        ...extraHeaders,
      });
      res.end(compressed);
      return;
    } catch {
      // Fall through to uncompressed response
    }
  }

  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...getSecurityHeaders(),
    ...extraHeaders,
  });
  res.end(payload);
}

function sendText(res, status, text, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    ...getSecurityHeaders(),
    ...extraHeaders,
  });
  res.end(text);
}

// ---------------------------------------------------------------------------
// Body reading with size limit
// ---------------------------------------------------------------------------

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      return { ok: false, error: `Request body exceeds the ${MAX_BODY_BYTES / 1024 / 1024} MB limit` };
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return { ok: true, body: null };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/**
 * Extract the authenticated user from the request's Authorization header.
 * Falls back to { userId: 'local', username: 'local' } for backward compatibility.
 * @param {http.IncomingMessage} req
 * @returns {Promise<{ userId: string, username: string }>}
 */
async function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (payload) return payload;
  }
  return { userId: 'local', username: 'local' };
}

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

function matchRoute(pathname) {
  // GET  /api/users/:user/maps
  // GET  /api/users/:user/maps/:id
  // PUT  /api/users/:user/maps/:id
  // DELETE /api/users/:user/maps/:id
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'users') return null;
  let user;
  try {
    user = decodeURIComponent(parts[2] ?? '');
  } catch {
    return null;
  }
  if (!user) return null;
  if (parts[3] !== 'maps') return null;
  let id = parts[4] ?? null;
  if (id !== null) {
    try {
      id = decodeURIComponent(id);
    } catch {
      return null;
    }
  }
  return { user, id };
}

// ---------------------------------------------------------------------------
// Health check helper
// ---------------------------------------------------------------------------

async function buildHealthPayload() {
  const dataDir = getDataDir();
  let dataDirExists = false;
  let dataDirWritable = false;

  try {
    await fs.access(dataDir);
    dataDirExists = true;
    // Test writability by attempting to write a temp file
    const testFile = path.join(dataDir, `.health-check-${process.pid}`);
    try {
      await fs.writeFile(testFile, '1', 'utf8');
      await fs.rm(testFile, { force: true });
      dataDirWritable = true;
    } catch {
      dataDirWritable = false;
    }
  } catch {
    dataDirExists = false;
    dataDirWritable = false;
  }

  const mem = process.memoryUsage();
  return {
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: VERSION,
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    dataDir: {
      exists: dataDirExists,
      writable: dataDirWritable,
    },
  };
}

// ---------------------------------------------------------------------------
// Active connections tracking (for graceful shutdown)
// ---------------------------------------------------------------------------

let activeConnections = 0;

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  // Attach req to res so sendJson can read headers
  res.req = req;

  // Request ID and timing
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Add request ID and response time headers to every response
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function (statusCode, headers) {
    const elapsed = Date.now() - startTime;
    const merged = typeof headers === 'object' && headers !== null ? headers : {};
    return originalWriteHead(statusCode, {
      'x-request-id': requestId,
      'x-response-time': `${elapsed}ms`,
      ...merged,
    });
  };

  // Track active connections
  activeConnections++;
  res.on('finish', () => {
    activeConnections--;
    const elapsed = Date.now() - startTime;
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.url,
      status: res.statusCode,
      durationMs: elapsed,
    });
  });

  try {
    if (!req.url) return sendText(res, 400, 'Missing URL');

    const origin = req.headers['origin'];
    const corsHeaders = getCorsHeaders(origin);

    // Reject requests from disallowed origins (non-browser requests without
    // an Origin header are still allowed for server-to-server use).
    if (origin && !corsHeaders) {
      return await sendJson(res, 403, { error: 'Origin not allowed' });
    }

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return await sendJson(res, 204, undefined, corsHeaders ?? {});
    }

    // Health check (no rate limiting)
    if (url.pathname === '/api/health') {
      const health = await buildHealthPayload();
      return await sendJson(res, 200, health, corsHeaders ?? {});
    }

    // Rate limiting
    if (!checkRateLimit(req, res)) return;

    // -----------------------------------------------------------------------
    // Auth routes
    // -----------------------------------------------------------------------

    if (url.pathname === '/api/auth/register' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const { username, password } = parsed.body ?? {};

      try {
        validateAuthUsername(username);
        validatePassword(password);
      } catch (e) {
        return await sendJson(res, 400, { error: e instanceof Error ? e.message : 'Invalid parameters' }, corsHeaders ?? {});
      }

      try {
        const user = await createUser(username, password);
        const token = await generateToken({ ...user, isAdmin: false });
        logActivity({ username, action: 'register', ip: req.socket?.remoteAddress });
        return await sendJson(res, 201, { token, user }, corsHeaders ?? {});
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Registration failed';
        // "Username already taken" → 409 Conflict
        const status = msg.includes('already taken') ? 409 : 400;
        return await sendJson(res, status, { error: msg }, corsHeaders ?? {});
      }
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const { username, password } = parsed.body ?? {};

      if (!username || !password) {
        return await sendJson(res, 400, { error: 'Username and password are required' }, corsHeaders ?? {});
      }

      const user = await validateCredentials(username, password);
      if (!user) {
        logActivity({ username, action: 'login_failed', ip: req.socket?.remoteAddress });
        // Check for suspicious activity after failed login
        setTimeout(() => { try { checkAndNotify(); } catch {} }, 0);
        return await sendJson(res, 401, { error: 'Invalid username or password' }, corsHeaders ?? {});
      }

      logActivity({ username: user.username, action: 'login', ip: req.socket?.remoteAddress });
      const token = await generateToken(user);
      // Return user info including isAdmin flag (without exposing it in the token payload directly)
      return await sendJson(res, 200, { token, user: { userId: user.userId, username: user.username, isAdmin: user.isAdmin } }, corsHeaders ?? {});
    }

    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return await sendJson(res, 401, { error: 'Authorization header required' }, corsHeaders ?? {});
      }
      const token = authHeader.slice(7);
      const payload = await verifyToken(token);
      if (!payload) {
        return await sendJson(res, 401, { error: 'Invalid or expired token' }, corsHeaders ?? {});
      }
      // Fetch fresh user data to include current plan and isAdmin status
      let freshUser = null;
      try {
        freshUser = await getUser(payload.username);
      } catch {
        // ignore
      }
      return await sendJson(res, 200, {
        user: {
          userId: payload.userId,
          username: payload.username,
          isAdmin: payload.isAdmin ?? false,
          plan: freshUser?.plan ?? 'free',
        },
      }, corsHeaders ?? {});
    }

    // -----------------------------------------------------------------------
    // Password reset — forgot password
    // POST /api/auth/forgot-password  { email }
    // -----------------------------------------------------------------------

    if (url.pathname === '/api/auth/forgot-password' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const { email } = parsed.body ?? {};

      if (!email || typeof email !== 'string') {
        return await sendJson(res, 400, { error: 'E-mail é obrigatório' }, corsHeaders ?? {});
      }

      // Always return 200 to avoid user enumeration
      try {
        const db = (await import('./db.js')).getDb();
        const userRow = db.prepare('SELECT username, email FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());

        if (userRow) {
          // Generate a secure random token
          const rawToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          const tokenId = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

          // Invalidate any existing unused tokens for this user
          db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE username = ? AND used = 0").run(userRow.username);

          // Insert new token
          db.prepare(`
            INSERT INTO password_reset_tokens (id, username, token_hash, expires_at)
            VALUES (?, ?, ?, ?)
          `).run(tokenId, userRow.username, tokenHash, expiresAt);

          // Send email (non-blocking)
          sendPasswordResetEmail({
            to: userRow.email,
            username: userRow.username,
            token: rawToken,
          }).catch((err) => {
            logger.error('Failed to send password reset email', { error: String(err) });
          });
        }
      } catch (err) {
        logger.error('Forgot password error', { error: String(err) });
        // Still return 200 to avoid leaking info
      }

      return await sendJson(res, 200, {
        message: 'Se este e-mail estiver cadastrado, você receberá as instruções em breve.',
      }, corsHeaders ?? {});
    }

    // -----------------------------------------------------------------------
    // Password reset — reset password with token
    // POST /api/auth/reset-password  { token, newPassword }
    // -----------------------------------------------------------------------

    if (url.pathname === '/api/auth/reset-password' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const { token, newPassword } = parsed.body ?? {};

      if (!token || typeof token !== 'string') {
        return await sendJson(res, 400, { error: 'Token inválido' }, corsHeaders ?? {});
      }

      try {
        validatePassword(newPassword);
      } catch (e) {
        return await sendJson(res, 400, { error: e instanceof Error ? e.message : 'Senha inválida' }, corsHeaders ?? {});
      }

      try {
        const db = (await import('./db.js')).getDb();
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const tokenRow = db.prepare(`
          SELECT * FROM password_reset_tokens
          WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')
        `).get(tokenHash);

        if (!tokenRow) {
          return await sendJson(res, 400, { error: 'Token inválido ou expirado. Solicite um novo link de redefinição.' }, corsHeaders ?? {});
        }

        // Mark token as used
        db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE id = ?").run(tokenRow.id);

        // Update password
        const { updateUser } = await import('./users.js');
        await updateUser(tokenRow.username, { password: newPassword });

        logger.info('Password reset successful', { username: tokenRow.username });
        return await sendJson(res, 200, { message: 'Senha redefinida com sucesso. Você já pode fazer login.' }, corsHeaders ?? {});
      } catch (err) {
        logger.error('Reset password error', { error: String(err) });
        return await sendJson(res, 500, { error: 'Erro ao redefinir senha. Tente novamente.' }, corsHeaders ?? {});
      }
    }

    // -----------------------------------------------------------------------
    // Admin routes — require isAdmin === true in JWT
    // -----------------------------------------------------------------------

    if (url.pathname.startsWith('/api/admin/')) {
      const authUser = await getAuthUser(req);
      if (!isAdminUser(authUser)) {
        return await sendJson(res, 403, { error: 'Admin access required' }, corsHeaders ?? {});
      }

      // GET /api/admin/stats
      if (url.pathname === '/api/admin/stats' && req.method === 'GET') {
        const stats = await handleGetStats();
        return await sendJson(res, 200, stats, corsHeaders ?? {});
      }

      // GET /api/admin/users
      if (url.pathname === '/api/admin/users' && req.method === 'GET') {
        const result = await handleListUsers(req, url);
        return await sendJson(res, 200, result, corsHeaders ?? {});
      }

      // POST /api/admin/users — create new user
      if (url.pathname === '/api/admin/users' && req.method === 'POST') {
        const parsed = await readJsonBody(req);
        if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
        try {
          const result = await handleCreateUser(parsed.body ?? {});
          logActivity({ username: authUser.username, action: 'admin_create_user', details: { created: result.username } });
          return await sendJson(res, 201, result, corsHeaders ?? {});
        } catch (e) {
          return await sendJson(res, 400, { error: e instanceof Error ? e.message : 'Create user failed' }, corsHeaders ?? {});
        }
      }

      // GET /api/admin/logs
      if (url.pathname === '/api/admin/logs' && req.method === 'GET') {
        const result = await handleGetLogs(url);
        return await sendJson(res, 200, result, corsHeaders ?? {});
      }

      // GET /api/admin/notifications
      if (url.pathname === '/api/admin/notifications' && req.method === 'GET') {
        const result = await handleGetNotifications(url);
        return await sendJson(res, 200, result, corsHeaders ?? {});
      }

      // POST /api/admin/notifications/read
      if (url.pathname === '/api/admin/notifications/read' && req.method === 'POST') {
        const parsed = await readJsonBody(req);
        if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
        const result = await handleMarkNotificationsRead(parsed.body ?? {});
        return await sendJson(res, 200, result, corsHeaders ?? {});
      }

      // GET /api/admin/settings
      if (url.pathname === '/api/admin/settings' && req.method === 'GET') {
        const result = await handleGetSettings();
        return await sendJson(res, 200, result, corsHeaders ?? {});
      }

      // PUT /api/admin/settings
      if (url.pathname === '/api/admin/settings' && req.method === 'PUT') {
        const parsed = await readJsonBody(req);
        if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
        try {
          const result = await handleUpdateSettings(parsed.body ?? {}, authUser.username);
          logActivity({ username: authUser.username, action: 'admin_update_settings' });
          return await sendJson(res, 200, result, corsHeaders ?? {});
        } catch (e) {
          return await sendJson(res, 400, { error: e instanceof Error ? e.message : 'Update settings failed' }, corsHeaders ?? {});
        }
      }

      // Routes with :username param
      const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)(\/.*)?$/);
      if (adminUserMatch) {
        let targetUsername;
        try {
          targetUsername = decodeURIComponent(adminUserMatch[1]);
        } catch {
          return await sendJson(res, 400, { error: 'Invalid username in URL' }, corsHeaders ?? {});
        }

        const subPath = adminUserMatch[2] ?? '';

        // GET /api/admin/users/:username
        if (req.method === 'GET' && subPath === '') {
          const userData = await handleGetUser(targetUsername);
          if (!userData) return await sendJson(res, 404, { error: 'User not found' }, corsHeaders ?? {});
          return await sendJson(res, 200, userData, corsHeaders ?? {});
        }

        // PATCH /api/admin/users/:username
        if (req.method === 'PATCH' && subPath === '') {
          const parsed = await readJsonBody(req);
          if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
          try {
            const updated = await handleUpdateUser(targetUsername, parsed.body ?? {});
            if (!updated) return await sendJson(res, 404, { error: 'User not found' }, corsHeaders ?? {});
            return await sendJson(res, 200, updated, corsHeaders ?? {});
          } catch (e) {
            return await sendJson(res, 400, { error: e instanceof Error ? e.message : 'Update failed' }, corsHeaders ?? {});
          }
        }

        // DELETE /api/admin/users/:username
        if (req.method === 'DELETE' && subPath === '') {
          // Prevent deleting yourself
          if (targetUsername === authUser.username) {
            return await sendJson(res, 400, { error: 'Cannot delete your own account' }, corsHeaders ?? {});
          }
          const result = await handleDeleteUser(targetUsername);
          return await sendJson(res, 200, result, corsHeaders ?? {});
        }

        // POST /api/admin/users/:username/reset-usage
        if (req.method === 'POST' && subPath === '/reset-usage') {
          const result = await handleResetUsage(targetUsername);
          if (!result) return await sendJson(res, 404, { error: 'User not found' }, corsHeaders ?? {});
          return await sendJson(res, 200, result, corsHeaders ?? {});
        }
      }

      return await sendJson(res, 404, { error: 'Admin route not found' }, corsHeaders ?? {});
    }

    // -----------------------------------------------------------------------
    // Usage routes
    // -----------------------------------------------------------------------

    if (url.pathname === '/api/usage' && req.method === 'GET') {
      const authUser = await getAuthUser(req);
      const username = authUser.username;
      const usage = await getUsage(username);
      // Get plan from user profile (falls back to 'free' for unauthenticated)
      let planId = 'free';
      if (username !== 'local') {
        try {
          const profile = await getUser(username);
          planId = profile?.plan ?? 'free';
        } catch {
          planId = 'free';
        }
      }
      const limits = getPlanLimits(planId);
      return await sendJson(res, 200, { usage, limits }, corsHeaders ?? {});
    }

    if (url.pathname === '/api/usage/check' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const { action, mapId, format } = parsed.body ?? {};

      const authUser = await getAuthUser(req);
      const username = authUser.username;

      let planId = 'free';
      if (username !== 'local') {
        try {
          const profile = await getUser(username);
          planId = profile?.plan ?? 'free';
        } catch {
          planId = 'free';
        }
      }
      const limits = getPlanLimits(planId);
      const usage = await getUsage(username);

      if (action === 'create_map') {
        if (limits.mapsPerMonth === -1) {
          return await sendJson(res, 200, { allowed: true }, corsHeaders ?? {});
        }
        const remaining = limits.mapsPerMonth - usage.mapsCreatedThisMonth;
        if (remaining <= 0) {
          return await sendJson(res, 200, {
            allowed: false,
            reason: `Limite de ${limits.mapsPerMonth} mapas por mês atingido. Faça upgrade para continuar.`,
            remaining: 0,
          }, corsHeaders ?? {});
        }
        return await sendJson(res, 200, { allowed: true, remaining }, corsHeaders ?? {});
      }

      if (action === 'chat_message') {
        if (!limits.chatEnabled) {
          return await sendJson(res, 200, { allowed: false, reason: 'Chat não disponível no plano gratuito.' }, corsHeaders ?? {});
        }
        if (limits.chatMessagesPerMap === -1) {
          return await sendJson(res, 200, { allowed: true }, corsHeaders ?? {});
        }
        const mapMsgCount = mapId ? (usage.chatMessagesSent[mapId] ?? 0) : 0;
        const remaining = limits.chatMessagesPerMap - mapMsgCount;
        if (remaining <= 0) {
          return await sendJson(res, 200, {
            allowed: false,
            reason: `Limite de ${limits.chatMessagesPerMap} mensagens por mapa atingido. Faça upgrade para continuar.`,
            remaining: 0,
          }, corsHeaders ?? {});
        }
        return await sendJson(res, 200, { allowed: true, remaining }, corsHeaders ?? {});
      }

      if (action === 'export') {
        const fmt = format ?? 'png';
        const allowed = limits.exportFormats.includes(fmt);
        return await sendJson(res, 200, {
          allowed,
          reason: allowed ? undefined : `Exportação em ${fmt.toUpperCase()} não está disponível no plano gratuito.`,
        }, corsHeaders ?? {});
      }

      return await sendJson(res, 400, { error: 'Unknown action' }, corsHeaders ?? {});
    }

    // -----------------------------------------------------------------------
    // Map routes
    // -----------------------------------------------------------------------

    const match = matchRoute(url.pathname);
    if (!match) {
      // In production, try to serve static files from the Vite build output.
      // Fall back to index.html for SPA client-side routing.
      if (IS_PRODUCTION && fsSync.existsSync(STATIC_DIR)) {
        const served = await serveStaticFile(res, url.pathname);
        if (!served) {
          // SPA fallback: serve index.html for any non-API, non-asset path
          await serveIndexHtml(res);
        }
        return;
      }
      return await sendJson(res, 404, { error: 'Not found' }, corsHeaders ?? {});
    }

    const { user, id } = match;

    // Strict validation to avoid invalid filenames / path traversal
    try {
      validateUsername(user);
      if (id) validateMapId(id);
    } catch (e) {
      return await sendJson(res, 400, { error: e instanceof Error ? e.message : 'Invalid parameters' }, corsHeaders ?? {});
    }

    // Extract authenticated user (falls back to 'local' if no token)
    const authUser = await getAuthUser(req);

    // Use the authenticated username instead of the URL username when a valid
    // token is present (the URL username is kept for backward compatibility
    // with unauthenticated "local" requests).
    const effectiveUsername = authUser.username !== 'local' ? authUser.username : user;

    if (req.method === 'GET' && id === null) {
      const maps = await listMaps(effectiveUsername);
      return await sendJson(res, 200, maps, corsHeaders ?? {});
    }

    if (req.method === 'GET' && id) {
      const map = await getMap(effectiveUsername, id);
      if (!map) return await sendJson(res, 404, { error: 'Map not found' }, corsHeaders ?? {});
      return await sendJson(res, 200, map, corsHeaders ?? {});
    }

    if (req.method === 'PUT' && id) {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const body = parsed.body;
      if (!body || typeof body !== 'object') return await sendJson(res, 400, { error: 'Invalid JSON body' }, corsHeaders ?? {});

      // Check if this is a new map (not an update to an existing one)
      const existingMap = await getMap(effectiveUsername, id);
      const isNewMap = !existingMap;

      if (isNewMap) {
        // Enforce monthly map creation limit
        let planId = 'free';
        if (effectiveUsername !== 'local') {
          try {
            const profile = await getUser(effectiveUsername);
            planId = profile?.plan ?? 'free';
          } catch {
            planId = 'free';
          }
        }
        const limits = getPlanLimits(planId);
        if (limits.mapsPerMonth !== -1) {
          const usage = await getUsage(effectiveUsername);
          if (usage.mapsCreatedThisMonth >= limits.mapsPerMonth) {
            return await sendJson(res, 403, {
              error: 'Limite do plano gratuito atingido',
              upgrade: true,
            }, corsHeaders ?? {});
          }
        }
      }

      const saved = await putMap(effectiveUsername, id, body);

      // Increment usage counter for new maps
      if (isNewMap) {
        try {
          await incrementMapCount(effectiveUsername);
          logActivity({ username: effectiveUsername, action: 'create_map', details: { mapId: id } });
          // Check for suspicious activity after map creation
          setTimeout(() => { try { checkAndNotify(); } catch {} }, 0);
        } catch {
          // Non-critical: don't fail the request if usage tracking fails
        }
      }

      return await sendJson(res, 200, saved, corsHeaders ?? {});
    }

    if (req.method === 'DELETE' && id) {
      const deleted = await deleteMap(effectiveUsername, id);
      return await sendJson(res, 200, { ok: true, deleted }, corsHeaders ?? {});
    }

    return await sendJson(res, 405, { error: 'Method not allowed' }, corsHeaders ?? {});
  } catch (err) {
    logger.error('Unhandled request error', {
      requestId,
      method: req.method,
      path: req.url,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    try {
      return await sendJson(res, 500, { error: 'Internal server error' });
    } catch {
      // If we can't even send the error response, just end the response
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Shutting down gracefully...', { signal, activeConnections });

  // Stop accepting new connections
  server.close(() => {
    logger.info('Server closed. Exiting.');
    process.exit(0);
  });

  // Force exit after 10 seconds if in-flight requests don't complete
  const forceExitTimer = setTimeout(() => {
    logger.warn('Graceful shutdown timed out after 10s. Forcing exit.', { activeConnections });
    process.exit(1);
  }, 10_000);

  // Don't let the timer prevent exit
  if (forceExitTimer.unref) forceExitTimer.unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT ?? 8787);
server.listen(port, async () => {
  logger.info('Server started', {
    port,
    env: process.env.NODE_ENV ?? 'development',
    version: VERSION,
    pid: process.pid,
    url: `http://localhost:${port}`,
  });

  // Initialize SQLite database (runs migrations)
  try {
    const { getDb } = await import('./db.js');
    getDb(); // triggers initialization + migrations
    logger.info('SQLite database initialized');
  } catch (err) {
    logger.error('SQLite initialization failed', { error: String(err) });
  }

  // Migrate existing filesystem users to SQLite (safe to run multiple times)
  setTimeout(async () => {
    try {
      const result = await migrateFilesystemUsers(getDataDir());
      if (result.migrated > 0 || result.errors.length > 0) {
        logger.info('Filesystem user migration complete', result);
      }
    } catch (err) {
      logger.error('User migration failed', { error: String(err) });
    }
  }, 2_000).unref();

  // Schedule automated backups every 24 hours
  scheduleBackups(24);

  // Run an initial backup 60 seconds after startup
  setTimeout(async () => {
    try {
      await runBackup();
    } catch (err) {
      logger.error('Initial backup failed', { error: String(err) });
    }
  }, 60_000).unref();
});
