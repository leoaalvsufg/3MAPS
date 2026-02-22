import http from 'node:http';
import { URL } from 'node:url';
import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { deleteMap, getMap, listMaps, putMap, validateMapId, validateUsername, getDataDir } from './storage.js';
import { checkRateLimit } from './rateLimit.js';
import { generateToken, verifyToken } from './auth.js';
import { createUser, validateCredentials, validateAuthUsername, validatePassword, getUser } from './users.js';
import { getUsage, incrementMapCount, incrementChatCount } from './usage.js';
import { logger } from './logger.js';
import { scheduleBackups, runBackup } from './backup.js';

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
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    mapsPerMonth: -1,
    templatesAllowed: ['padrao', 'brainstorm', 'analise', 'pensamento_profundo', 'academico', 'negocio', 'tecnico', 'criativo'],
    exportFormats: ['png', 'svg', 'pdf', 'markdown'],
    imageGeneration: true,
    chatEnabled: true,
    chatMessagesPerMap: -1,
    maxMapsStored: -1,
  },
};

function getPlanLimits(planId) {
  return PLAN_LIMITS[planId] ?? PLAN_LIMITS.free;
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
        const token = await generateToken(user);
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
        return await sendJson(res, 401, { error: 'Invalid username or password' }, corsHeaders ?? {});
      }

      const token = await generateToken(user);
      return await sendJson(res, 200, { token, user }, corsHeaders ?? {});
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
      return await sendJson(res, 200, { user: payload }, corsHeaders ?? {});
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
    if (!match) return await sendJson(res, 404, { error: 'Not found' }, corsHeaders ?? {});

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
server.listen(port, () => {
  logger.info('Server started', {
    port,
    env: process.env.NODE_ENV ?? 'development',
    version: VERSION,
    pid: process.pid,
    url: `http://localhost:${port}`,
  });

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
