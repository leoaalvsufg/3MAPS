import http from 'node:http';
import { URL } from 'node:url';
import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { deleteMap, getMap, listMaps, putMap, validateMapId, validateUsername, getDataDir } from './storage.js';
import { checkRateLimit } from './rateLimit.js';
import { generateToken, verifyToken, verifyApiToken } from './auth.js';
import { createUser, validateCredentials, validateAuthUsername, validatePassword, getUser, getUserByEmail, getUserByStripeCustomerId, getOrCreateUserFromFirebase, migrateFilesystemUsers, listUsers, updateUser, consumeExtraCredits, listCreditLedger, addExtraCredits } from './users.js';
import { verifyFirebaseIdToken, isFirebaseAdminConfigured } from './firebaseAdmin.js';
import { getUsage, incrementMapCount, incrementChatCount } from './usage.js';
import { logger } from './logger.js';
import { scheduleBackups, runBackup } from './backup.js';
import { sendPasswordResetEmail, sendMagicLinkEmail } from './email.js';
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
  handleAddUserCredits,
  handleGetUserCreditsLedger,
} from './admin.js';
import { logActivity, checkAndNotify, getAdminSetting } from './activity.js';
import { hasAnyLlmKey, getLlmOptionsWithModels, proxyLlmComplete, proxyLlmStream, proxyLlmMultimodal, proxyReplicateImage, proxyVideoUploadAndAnalyze, getLlmCredits } from './llmProxy.js';
import { getDb } from './db.js';
import { getOpenApiSpec } from './openapi.js';
import Busboy from 'busboy';

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
    maxMapsStored: 5,
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
const ALLOWED_ORIGINS_RAW = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set(ALLOWED_ORIGINS_RAW);

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
 * In development, any http://localhost:* is allowed (Vite pode usar portas variadas).
 * @param {string | undefined} origin
 * @returns {Record<string, string> | null}
 */
function getCorsHeaders(origin) {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) {
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET,PUT,DELETE,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
      'vary': 'Origin',
    };
  }
  // Em dev: permitir localhost e 127.0.0.1 em qualquer porta (Vite usa porta dinâmica)
  if (!IS_PRODUCTION && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET,PUT,DELETE,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
      'vary': 'Origin',
    };
  }
  return null;
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

async function readRawBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      return { ok: false, error: `Request body exceeds the ${MAX_BODY_BYTES / 1024 / 1024} MB limit`, raw: null };
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return { ok: true, raw };
}

async function readJsonBody(req) {
  const result = await readRawBody(req);
  if (!result.ok) return result;
  const raw = result.raw;
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
 * Accepts JWT (Bearer) or API token. Falls back to { userId: 'local', username: 'local' } for backward compatibility.
 * @param {http.IncomingMessage} req
 * @returns {Promise<{ userId: string, username: string }>}
 */
async function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (payload) return payload;
    const apiUser = verifyApiToken(token, getDb());
    if (apiUser) return apiUser;
  }
  return { userId: 'local', username: 'local' };
}

async function findMapOwnerForAdmin(mapId, preferredUsername) {
  const candidates = [];
  if (preferredUsername && preferredUsername !== 'local') candidates.push(preferredUsername);

  try {
    const { users } = await listUsers({ limit: 10_000, offset: 0, search: '' });
    for (const u of users) {
      if (u.username !== preferredUsername) candidates.push(u.username);
    }
  } catch {
    // ignore and fall back to preferred username only
  }

  for (const username of candidates) {
    const existing = await getMap(username, mapId);
    if (existing) return username;
  }
  return null;
}

async function listMapsForAdmin(adminUsername) {
  const all = [];
  const { users } = await listUsers({ limit: 10_000, offset: 0, search: '' });
  for (const u of users) {
    const userMaps = await listMaps(u.username);
    for (const m of userMaps) {
      all.push({
        ...m,
        ownerUsername: u.username,
        ownerPath: `${u.username}/${m.title}`,
      });
    }
  }

  // Ensure admin's own maps are included even if user listing failed for some reason
  if (!all.some((m) => m.ownerUsername === adminUsername)) {
    try {
      const own = await listMaps(adminUsername);
      for (const m of own) {
        all.push({
          ...m,
          ownerUsername: adminUsername,
          ownerPath: `${adminUsername}/${m.title}`,
        });
      }
    } catch {
      // ignore
    }
  }

  all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return all;
}

function resolveAppBaseUrl(req) {
  const configured = String(getAdminSetting('app_url', '') ?? '').trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }

  const host = req.headers.host ?? 'localhost:8787';
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = typeof forwardedProto === 'string'
    ? forwardedProto.split(',')[0].trim()
    : (IS_PRODUCTION ? 'https' : 'http');
  return `${proto}://${host}`;
}

/** Base URL para redirects Stripe (success/cancel). Prefere Origin (frontend real) em dev. */
function resolveRedirectBaseUrl(req) {
  const configured = String(getAdminSetting('app_url', process.env.APP_URL ?? '') ?? '').trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1|[^/]+)/i.test(origin)) {
    return origin.replace(/\/+$/, '');
  }
  return resolveAppBaseUrl(req);
}

function getStripePriceId(plan) {
  if (plan === 'premium') {
    return String(
      getAdminSetting('stripe_price_premium', process.env.STRIPE_PRICE_PREMIUM ?? '') ?? ''
    ).trim();
  }
  if (plan === 'enterprise') {
    return String(
      getAdminSetting('stripe_price_enterprise', process.env.STRIPE_PRICE_ENTERPRISE ?? '') ?? ''
    ).trim();
  }
  return '';
}

/** Retorna o Price ID para pacote de créditos extras (ex: 5 créditos). */
function getStripeCreditsPriceId() {
  return String(
    getAdminSetting('stripe_price_credits_5', process.env.STRIPE_PRICE_CREDITS_5 ?? '') ?? ''
  ).trim();
}

/** Mapeia price ID Stripe -> plano interno. */
function planFromStripePriceId(priceId) {
  if (!priceId || typeof priceId !== 'string') return null;
  const pid = priceId.trim();
  const premiumPrice = getStripePriceId('premium');
  const enterprisePrice = getStripePriceId('enterprise');
  if (pid === enterprisePrice && enterprisePrice) return 'enterprise';
  if (pid === premiumPrice && premiumPrice) return 'premium';
  return null;
}

/**
 * Sincroniza o plano do usuário com a Stripe (assinaturas ativas).
 * Chamado no login/me para garantir plano correto.
 * @param {object} profile - perfil do usuário (deve ter stripeCustomerId)
 * @returns {Promise<{ plan: string }>} plano efetivo após sync
 */
async function syncStripePlanAtLogin(profile) {
  if (!profile?.stripeCustomerId || profile.isAdmin) {
    return { plan: profile?.isAdmin ? 'admin' : (profile?.plan ?? 'free') };
  }
  const stripeSecretKey = String(
    getAdminSetting('stripe_secret_key', process.env.STRIPE_SECRET_KEY ?? '') ?? ''
  ).trim();
  if (!stripeSecretKey) return { plan: profile.plan ?? 'free' };

  try {
    const params = new URLSearchParams();
    params.set('customer', profile.stripeCustomerId);
    params.set('status', 'active');
    params.set('limit', '10');
    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    );
    const raw = await response.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      logger.warn('Stripe subscriptions fetch failed', {
        username: profile.username,
        status: response.status,
      });
      return { plan: profile.plan ?? 'free' };
    }

    const subs = json?.data ?? [];
    let bestPlan = null;
    for (const sub of subs) {
      const items = sub?.items?.data ?? [];
      for (const item of items) {
        const priceId = item?.price?.id;
        const plan = planFromStripePriceId(priceId);
        if (plan === 'enterprise') bestPlan = 'enterprise';
        else if (plan === 'premium' && bestPlan !== 'enterprise') bestPlan = 'premium';
      }
    }

    const targetPlan = bestPlan ?? 'free';
    if (targetPlan !== (profile.plan ?? 'free')) {
      await updateUser(profile.username, { plan: targetPlan });
      logger.info('Stripe plan synced at login', {
        username: profile.username,
        from: profile.plan,
        to: targetPlan,
      });
    }
    return { plan: targetPlan };
  } catch (err) {
    logger.warn('Stripe sync at login failed', {
      username: profile.username,
      message: err instanceof Error ? err.message : String(err),
    });
    return { plan: profile.plan ?? 'free' };
  }
}

async function createStripeCheckoutSession({
  secretKey,
  priceId,
  plan,
  username,
  email,
  customerId,
  successUrl,
  cancelUrl,
}) {
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('allow_promotion_codes', 'true');
  params.set('metadata[username]', username);
  params.set('metadata[targetPlan]', plan);
  if (customerId && /^cus_/.test(customerId)) {
    params.set('customer', customerId);
  } else if (email) {
    params.set('customer_email', email);
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!response.ok || !json?.url) {
    let stripeError = json?.error?.message ?? `Stripe returned ${response.status}`;
    if (typeof stripeError === 'string' && stripeError.toLowerCase().includes('no such price')) {
      if (stripeError.includes('prod_')) {
        stripeError = 'Você configurou um Product ID (prod_...). Use um Price ID (price_...). No Stripe: Produtos → seu produto → Preços → copie o ID do preço.';
      } else {
        stripeError = 'Price ID inválido ou inexistente no Stripe. Use o ID do preço (price_xxx), não o do produto. Stripe → Produtos → Preços → copie o ID.';
      }
    }
    throw new Error(String(stripeError));
  }

  return { url: String(json.url), id: String(json.id ?? '') };
}

/** Checkout de pagamento único para créditos extras (mode: payment). */
async function createStripeCreditsCheckoutSession({
  secretKey,
  priceId,
  targetCredits,
  username,
  email,
  customerId,
  successUrl,
  cancelUrl,
}) {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('client_reference_id', username);
  params.set('metadata[username]', username);
  params.set('metadata[targetCredits]', String(targetCredits));
  if (customerId && /^cus_/.test(customerId)) {
    params.set('customer', customerId);
  } else if (email) {
    params.set('customer_email', email);
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!response.ok || !json?.url) {
    let stripeError = json?.error?.message ?? `Stripe returned ${response.status}`;
    if (typeof stripeError === 'string' && stripeError.toLowerCase().includes('no such price')) {
      stripeError = 'Price ID de créditos inválido. Configure stripe_price_credits_5 no painel admin.';
    }
    throw new Error(String(stripeError));
  }

  return { url: String(json.url), id: String(json.id ?? '') };
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
    const host = req.headers['host'];
    const corsHeaders = getCorsHeaders(origin);

    // Same-origin: quando a requisição vem do mesmo host (ex: assets, API no mesmo domínio).
    // Navegadores podem enviar Origin mesmo para recursos same-origin.
    const isSameOrigin = origin && host && (
      origin === `http://${host}` || origin === `https://${host}`
    );

    // Reject requests from disallowed origins (non-browser requests without
    // an Origin header are still allowed for server-to-server use).
    // Same-origin requests are always allowed.
    if (origin && !corsHeaders && !isSameOrigin) {
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

    // OpenAPI spec (public)
    if (url.pathname === '/api/docs/openapi.json' && req.method === 'GET') {
      const baseUrl = resolveAppBaseUrl(req);
      const spec = getOpenApiSpec(baseUrl);
      return await sendJson(res, 200, spec, corsHeaders ?? {});
    }

    // Swagger UI (public)
    if (url.pathname === '/api/docs' && req.method === 'GET') {
      const specUrl = `${resolveAppBaseUrl(req)}/api/docs/openapi.json`;
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3Maps API — Documentação</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "${specUrl.replace(/"/g, '\\"')}",
      dom_id: '#swagger-ui',
    });
  </script>
</body>
</html>`;
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        ...getSecurityHeaders(),
        ...(corsHeaders ?? {}),
      });
      res.end(html);
      return;
    }

    // Rate limiting — only applied to API routes, not static file serving.
    // Static assets (JS, CSS, fonts, images) must NOT count against the per-IP
    // request budget, otherwise a single page load (~30-50 assets) would exhaust
    // the limit before any real API call is made.
    if (url.pathname.startsWith('/api/')) {
      if (!checkRateLimit(req, res)) return;
    }

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
        return await sendJson(res, 201, {
          token,
          user: { ...user, isAdmin: false, plan: 'free', photoURL: null, extraCredits: 0 },
        }, corsHeaders ?? {});
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
      const login = (username ?? parsed.body?.login ?? '').toString().trim();

      if (!login || !password) {
        return await sendJson(res, 400, { error: 'E-mail ou nome de usuário e senha são obrigatórios' }, corsHeaders ?? {});
      }

      const user = await validateCredentials(login, password);
      if (!user) {
        logActivity({ username: login, action: 'login_failed', ip: req.socket?.remoteAddress });
        // Check for suspicious activity after failed login
        setTimeout(() => { try { checkAndNotify(); } catch {} }, 0);
        return await sendJson(res, 401, { error: 'Invalid username or password' }, corsHeaders ?? {});
      }

      logActivity({ username: user.username, action: 'login', ip: req.socket?.remoteAddress });
      const token = await generateToken(user);
      // Sync plano Stripe e retornar com acesso correto
      let plan = 'free';
      let profile = null;
      try {
        profile = await getUser(user.username);
        if (profile?.isAdmin) plan = 'admin';
        else if (profile) {
          const synced = await syncStripePlanAtLogin(profile);
          plan = synced.plan;
        }
      } catch {
        /* ignore */
      }
      return await sendJson(res, 200, {
        token,
        user: {
          userId: user.userId,
          username: user.username,
          isAdmin: user.isAdmin,
          plan,
          photoURL: profile?.photoUrl ?? null,
          extraCredits: profile?.extraCredits ?? 0,
        },
      }, corsHeaders ?? {});
    }

    // Firebase Auth — exchange Firebase ID token for app JWT
    // POST /api/auth/firebase  { idToken: string }
    if (url.pathname === '/api/auth/firebase' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const { idToken } = parsed.body ?? {};
      if (!idToken || typeof idToken !== 'string') {
        return await sendJson(res, 400, { error: 'idToken é obrigatório' }, corsHeaders ?? {});
      }
      if (!isFirebaseAdminConfigured()) {
        return await sendJson(res, 503, {
          error: 'Login social não configurado. Adicione server/firebase-service-account.json ao servidor.',
        }, corsHeaders ?? {});
      }
      const firebaseUser = await verifyFirebaseIdToken(idToken);
      if (!firebaseUser) {
        return await sendJson(res, 401, { error: 'Token inválido ou expirado' }, corsHeaders ?? {});
      }
      try {
        const { userId, username } = await getOrCreateUserFromFirebase({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.name,
          picture: firebaseUser.picture,
        });
        const profile = await getUser(username);
        const isAdmin = profile?.isAdmin ?? false;
        let plan = 'free';
        if (profile?.isAdmin) plan = 'admin';
        else if (profile) {
          const synced = await syncStripePlanAtLogin(profile);
          plan = synced.plan;
        }
        logActivity({ username, action: 'login', ip: req.socket?.remoteAddress });
        const token = await generateToken({ userId, username, isAdmin });
        return await sendJson(res, 200, {
          token,
          user: {
            userId,
            username,
            isAdmin,
            plan,
            photoURL: profile?.photoUrl ?? null,
            extraCredits: profile?.extraCredits ?? 0,
          },
        }, corsHeaders ?? {});
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error('Firebase auth error', { error: errMsg, stack: e instanceof Error ? e.stack : undefined });
        const userMessage = IS_PRODUCTION
          ? 'Erro ao criar sessão'
          : `Erro ao criar sessão: ${errMsg}`;
        return await sendJson(res, 500, { error: userMessage }, corsHeaders ?? {});
      }
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
      // Fetch fresh user data and sync plan with Stripe
      let freshUser = null;
      try {
        freshUser = await getUser(payload.username);
      } catch {
        // ignore
      }
      let plan = freshUser?.isAdmin ? 'admin' : (freshUser?.plan ?? 'free');
      if (freshUser && !freshUser.isAdmin) {
        const synced = await syncStripePlanAtLogin(freshUser);
        plan = synced.plan;
      }
      const photoURL = freshUser?.photoUrl ?? null;
      const extraCredits = freshUser?.extraCredits ?? 0;
      return await sendJson(res, 200, {
        user: {
          userId: payload.userId,
          username: payload.username,
          isAdmin: payload.isAdmin ?? false,
          plan,
          photoURL,
          extraCredits,
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
    // Magic link — request link (envia e-mail)
    // POST /api/auth/magic-link  { email ou username }
    // -----------------------------------------------------------------------

    if (url.pathname === '/api/auth/magic-link' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const { email, username: usernameInput } = parsed.body ?? {};
      const login = (email ?? usernameInput ?? '').trim();
      if (!login) {
        return await sendJson(res, 400, { error: 'Informe o e-mail ou nome de usuário.' }, corsHeaders ?? {});
      }

      try {
        const isEmail = login.includes('@');
        const profile = isEmail ? await getUserByEmail(login) : await getUser(login);
        if (!profile) {
          return await sendJson(res, 200, { message: 'Se este e-mail ou usuário existir, você receberá o link em breve.' }, corsHeaders ?? {});
        }
        const userEmail = profile.email?.trim().toLowerCase();
        if (!userEmail) {
          return await sendJson(res, 400, { error: 'Sua conta não possui e-mail cadastrado. Use a senha para entrar ou cadastre um e-mail.' }, corsHeaders ?? {});
        }
        if (!profile.isActive) {
          return await sendJson(res, 200, { message: 'Se este e-mail ou usuário existir, você receberá o link em breve.' }, corsHeaders ?? {});
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const tokenId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

        const db = (await import('./db.js')).getDb();
        db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE username = ? AND used = 0').run(profile.username);
        db.prepare(`
          INSERT INTO magic_link_tokens (id, username, token_hash, expires_at) VALUES (?, ?, ?, ?)
        `).run(tokenId, profile.username, tokenHash, expiresAt);

        sendMagicLinkEmail({
          to: userEmail,
          username: profile.username,
          token: rawToken,
        }).catch((err) => {
          logger.error('Failed to send magic link email', { error: String(err) });
        });

        return await sendJson(res, 200, {
          message: 'Se este e-mail ou usuário existir, você receberá o link em breve. Verifique sua caixa de entrada e spam.',
        }, corsHeaders ?? {});
      } catch (err) {
        logger.error('Magic link request error', { error: String(err) });
        return await sendJson(res, 500, { error: 'Erro ao enviar o link. Tente novamente.' }, corsHeaders ?? {});
      }
    }

    // -----------------------------------------------------------------------
    // Magic link — verificar token e retornar JWT
    // POST /api/auth/magic-link/verify  { token }
    // -----------------------------------------------------------------------

    if (url.pathname === '/api/auth/magic-link/verify' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const { token } = parsed.body ?? {};
      if (!token || typeof token !== 'string') {
        return await sendJson(res, 400, { error: 'Token inválido' }, corsHeaders ?? {});
      }

      try {
        const db = (await import('./db.js')).getDb();
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const tokenRow = db.prepare(`
          SELECT * FROM magic_link_tokens
          WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')
        `).get(tokenHash);

        if (!tokenRow) {
          return await sendJson(res, 400, { error: 'Link inválido ou expirado. Solicite um novo link.' }, corsHeaders ?? {});
        }

        db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE id = ?').run(tokenRow.id);

        const userProfile = await getUser(tokenRow.username);
        if (!userProfile || !userProfile.isActive) {
          return await sendJson(res, 400, { error: 'Conta indisponível.' }, corsHeaders ?? {});
        }

        let plan = userProfile.isAdmin ? 'admin' : (userProfile.plan ?? 'free');
        if (!userProfile.isAdmin) {
          const synced = await syncStripePlanAtLogin(userProfile);
          plan = synced.plan;
        }

        const jwt = await generateToken({
          userId: userProfile.userId,
          username: userProfile.username,
          isAdmin: userProfile.isAdmin ?? false,
        });

        logger.info('Magic link login successful', { username: userProfile.username });
        return await sendJson(res, 200, {
          token: jwt,
          user: {
            userId: userProfile.userId,
            username: userProfile.username,
            isAdmin: userProfile.isAdmin ?? false,
            plan,
            photoURL: userProfile.photoUrl ?? null,
            extraCredits: userProfile.extraCredits ?? 0,
          },
        }, corsHeaders ?? {});
      } catch (err) {
        logger.error('Magic link verify error', { error: String(err) });
        return await sendJson(res, 500, { error: 'Erro ao validar o link. Tente novamente.' }, corsHeaders ?? {});
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

      // POST /api/admin/users/:username/credits/add — PRIMEIRO (evita conflito com outras rotas)
      const creditsAddMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits\/add\/?$/);
      if (creditsAddMatch && req.method === 'POST') {
        let targetUsername;
        try {
          targetUsername = decodeURIComponent(creditsAddMatch[1]);
        } catch {
          return await sendJson(res, 400, { error: 'Invalid username in URL' }, corsHeaders ?? {});
        }
        const parsed = await readJsonBody(req);
        if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
        try {
          const result = await handleAddUserCredits(targetUsername, parsed.body ?? {}, authUser.username);
          if (!result) return await sendJson(res, 404, { error: 'User not found' }, corsHeaders ?? {});
          logActivity({
            username: authUser.username,
            action: 'admin_add_credits',
            details: {
              targetUsername,
              added: result.added,
              balanceBefore: result.balanceBefore,
              balanceAfter: result.balanceAfter,
              ledgerEntryId: result.ledgerEntryId,
            },
          });
          return await sendJson(res, 200, result, corsHeaders ?? {});
        } catch (e) {
          return await sendJson(res, 400, { error: e instanceof Error ? e.message : 'Credit add failed' }, corsHeaders ?? {});
        }
      }

      // GET /api/admin/users/:username/credits/ledger
      const creditsLedgerMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits\/ledger\/?$/);
      if (creditsLedgerMatch && req.method === 'GET') {
        let targetUsername;
        try {
          targetUsername = decodeURIComponent(creditsLedgerMatch[1]);
        } catch {
          return await sendJson(res, 400, { error: 'Invalid username in URL' }, corsHeaders ?? {});
        }
        const result = await handleGetUserCreditsLedger(targetUsername, url);
        if (!result) return await sendJson(res, 404, { error: 'User not found' }, corsHeaders ?? {});
        return await sendJson(res, 200, result, corsHeaders ?? {});
      }

      // POST /api/admin/billing/sync — sincronizar planos com Stripe (antes de rotas dinâmicas)
      if (url.pathname === '/api/admin/billing/sync' && req.method === 'POST') {
        try {
          const { users } = await listUsers({ limit: 500, offset: 0, search: '' });
          const stripeSecretKey = String(
            getAdminSetting('stripe_secret_key', process.env.STRIPE_SECRET_KEY ?? '') ?? ''
          ).trim();
          if (!stripeSecretKey) {
            return await sendJson(res, 400, { error: 'Stripe não configurado' }, corsHeaders ?? {});
          }
          const results = [];
          let synced = 0;
          for (const u of users) {
            if (!u.stripeCustomerId || u.isAdmin) continue;
            try {
              const syncedPlan = await syncStripePlanAtLogin(u);
              const changed = syncedPlan.plan !== (u.plan ?? 'free');
              if (changed) synced++;
              results.push({ username: u.username, plan: syncedPlan.plan, changed });
            } catch (err) {
              results.push({ username: u.username, error: err instanceof Error ? err.message : String(err) });
            }
          }
          logActivity({ username: authUser.username, action: 'admin_billing_sync', details: { synced, total: results.length } });
          return await sendJson(res, 200, { synced, total: results.length, results }, corsHeaders ?? {});
        } catch (e) {
          return await sendJson(res, 500, { error: e instanceof Error ? e.message : 'Erro ao sincronizar' }, corsHeaders ?? {});
        }
      }

      // GET /api/admin/billing/subscription-status
      if (url.pathname === '/api/admin/billing/subscription-status' && req.method === 'GET') {
        try {
          const { users } = await listUsers({ limit: 500, offset: 0, search: '' });
          const stripeSecretKey = String(
            getAdminSetting('stripe_secret_key', process.env.STRIPE_SECRET_KEY ?? '') ?? ''
          ).trim();
          if (!stripeSecretKey) {
            return await sendJson(res, 200, { statusByUser: {} }, corsHeaders ?? {});
          }
          const statusByUser = {};
          for (const u of users) {
            if (!u.stripeCustomerId || u.isAdmin) continue;
            try {
              const params = new URLSearchParams();
              params.set('customer', u.stripeCustomerId);
              params.set('status', 'all');
              params.set('limit', '5');
              const resp = await fetch(
                `https://api.stripe.com/v1/subscriptions?${params.toString()}`,
                { method: 'GET', headers: { authorization: `Bearer ${stripeSecretKey}` } }
              );
              const raw = await resp.text();
              const json = raw ? JSON.parse(raw) : null;
              const subs = json?.data ?? [];
              let periodEnd = null;
              let status = null;
              if (subs.length > 0) {
                const active = subs.find((s) => s.status === 'active');
                const sub = active ?? subs[0];
                status = sub.status ?? null;
                const end = sub.current_period_end;
                if (typeof end === 'number') periodEnd = new Date(end * 1000).toISOString().slice(0, 10);
              }
              statusByUser[u.username] = { periodEnd, status, stripeCustomerId: u.stripeCustomerId };
            } catch {
              statusByUser[u.username] = { error: true };
            }
          }
          return await sendJson(res, 200, { statusByUser }, corsHeaders ?? {});
        } catch (e) {
          return await sendJson(res, 500, { error: e instanceof Error ? e.message : 'Erro' }, corsHeaders ?? {});
        }
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

      // GET /api/admin/llm-credits — consultar créditos/saldo dos provedores
      if (url.pathname === '/api/admin/llm-credits' && req.method === 'GET') {
        try {
          const credits = await getLlmCredits();
          return await sendJson(res, 200, credits, corsHeaders ?? {});
        } catch (e) {
          return await sendJson(res, 500, { error: e instanceof Error ? e.message : 'Erro ao consultar créditos' }, corsHeaders ?? {});
        }
      }

      // POST /api/admin/tokens — create API token for a user
      if (url.pathname === '/api/admin/tokens' && req.method === 'POST') {
        const parsed = await readJsonBody(req);
        if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
        const { username, name, scopes, expiresInDays } = parsed.body ?? {};
        if (!username || typeof username !== 'string') {
          return await sendJson(res, 400, { error: 'username é obrigatório' }, corsHeaders ?? {});
        }
        const userProfile = await getUser(username.trim());
        if (!userProfile) return await sendJson(res, 404, { error: 'Usuário não encontrado' }, corsHeaders ?? {});
        const scopeList = Array.isArray(scopes) ? scopes : (typeof scopes === 'string' ? [scopes] : ['maps:read', 'maps:write', 'llm:complete', 'usage:read']);
        const rawToken = `sk-3maps-${crypto.randomBytes(24).toString('hex')}`;
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const tokenPrefix = rawToken.slice(0, 15);
        const tokenId = crypto.randomUUID();
        const expiresAt = typeof expiresInDays === 'number' && expiresInDays > 0
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
          : null;
        const db = getDb();
        db.prepare(`
          INSERT INTO api_tokens (id, token_hash, token_prefix, username, name, scopes, expires_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tokenId, tokenHash, tokenPrefix, userProfile.username, (name || '').trim() || null, JSON.stringify(scopeList), expiresAt, authUser.username);
        logActivity({ username: authUser.username, action: 'admin_create_api_token', details: { forUser: userProfile.username } });
        return await sendJson(res, 201, {
          id: tokenId,
          username: userProfile.username,
          name: (name || '').trim() || null,
          scopes: scopeList,
          expiresAt,
          token: rawToken,
          message: 'Token criado. Guarde-o: ele não será exibido novamente.',
        }, corsHeaders ?? {});
      }

      // GET /api/admin/tokens — list API tokens
      if (url.pathname === '/api/admin/tokens' && req.method === 'GET') {
        const username = url.searchParams.get('username') ?? '';
        const db = getDb();
        const rows = username.trim()
          ? db.prepare(`
              SELECT id, token_prefix, username, name, scopes, expires_at, last_used_at, is_active, created_at, created_by
              FROM api_tokens WHERE username = ? ORDER BY created_at DESC
            `).all(username.trim())
          : db.prepare(`
              SELECT id, token_prefix, username, name, scopes, expires_at, last_used_at, is_active, created_at, created_by
              FROM api_tokens ORDER BY created_at DESC
            `).all();
        const tokens = rows.map((r) => ({
          id: r.id,
          tokenPrefix: r.token_prefix,
          username: r.username,
          name: r.name,
          scopes: JSON.parse(r.scopes || '[]'),
          expiresAt: r.expires_at,
          lastUsedAt: r.last_used_at,
          isActive: r.is_active === 1,
          createdAt: r.created_at,
          createdBy: r.created_by,
        }));
        return await sendJson(res, 200, { tokens }, corsHeaders ?? {});
      }

      // DELETE /api/admin/tokens/:id — revoke token
      const tokenDeleteMatch = url.pathname.match(/^\/api\/admin\/tokens\/([^/]+)$/);
      if (tokenDeleteMatch && req.method === 'DELETE') {
        const tokenId = tokenDeleteMatch[1];
        const db = getDb();
        const row = db.prepare('SELECT username FROM api_tokens WHERE id = ?').get(tokenId);
        if (!row) return await sendJson(res, 404, { error: 'Token não encontrado' }, corsHeaders ?? {});
        db.prepare('UPDATE api_tokens SET is_active = 0 WHERE id = ?').run(tokenId);
        logActivity({ username: authUser.username, action: 'admin_revoke_api_token', details: { tokenId, forUser: row.username } });
        return await sendJson(res, 200, { message: 'Token revogado' }, corsHeaders ?? {});
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

        // POST /api/admin/users/:username/credits/add
        if (req.method === 'POST' && subPath === '/credits/add') {
          const parsed = await readJsonBody(req);
          if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
          try {
            const result = await handleAddUserCredits(targetUsername, parsed.body ?? {}, authUser.username);
            if (!result) return await sendJson(res, 404, { error: 'User not found' }, corsHeaders ?? {});
            logActivity({
              username: authUser.username,
              action: 'admin_add_credits',
              details: {
                targetUsername,
                added: result.added,
                balanceBefore: result.balanceBefore,
                balanceAfter: result.balanceAfter,
                ledgerEntryId: result.ledgerEntryId,
              },
            });
            return await sendJson(res, 200, result, corsHeaders ?? {});
          } catch (e) {
            return await sendJson(res, 400, { error: e instanceof Error ? e.message : 'Credit add failed' }, corsHeaders ?? {});
          }
        }

        // GET /api/admin/users/:username/credits/ledger
        if (req.method === 'GET' && subPath === '/credits/ledger') {
          const result = await handleGetUserCreditsLedger(targetUsername, url);
          if (!result) return await sendJson(res, 404, { error: 'User not found' }, corsHeaders ?? {});
          return await sendJson(res, 200, result, corsHeaders ?? {});
        }
      }

      return await sendJson(res, 404, { error: 'Admin route not found' }, corsHeaders ?? {});
    }

    // -----------------------------------------------------------------------
    // LLM proxy (chaves no servidor, usuário não configura)
    // -----------------------------------------------------------------------

    if (url.pathname === '/api/llm/status' && req.method === 'GET') {
      const configured = hasAnyLlmKey();
      return await sendJson(res, 200, { configured }, corsHeaders ?? {});
    }

    if (url.pathname === '/api/llm/options' && req.method === 'GET') {
      const { options, providerModels } = getLlmOptionsWithModels();
      return await sendJson(res, 200, { options, providerModels }, corsHeaders ?? {});
    }

    if (url.pathname === '/api/llm/multimodal' && req.method === 'POST') {
      const authUser = await getAuthUser(req);
      if (authUser.username === 'local') {
        return await sendJson(res, 401, { error: 'Login obrigatório' }, corsHeaders ?? {});
      }
      if (!hasAnyLlmKey()) {
        return await sendJson(res, 503, {
          error: 'Configure as chaves de API no painel administrativo antes de usar a geração de mapas.',
        }, corsHeaders ?? {});
      }
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error ?? 'Invalid JSON' }, corsHeaders ?? {});
      const { model, parts, temperature, maxTokens } = parsed.body ?? {};
      if (!Array.isArray(parts) || parts.length === 0) {
        return await sendJson(res, 400, { error: 'parts é obrigatório e deve ser um array não vazio' }, corsHeaders ?? {});
      }
      try {
        const content = await proxyLlmMultimodal({
          model: model ?? 'gemini-2.5-flash',
          parts,
          temperature: temperature ?? 0.3,
          maxTokens: maxTokens ?? 4096,
        });
        return await sendJson(res, 200, { content }, corsHeaders ?? {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return await sendJson(res, 502, { error: msg }, corsHeaders ?? {});
      }
    }

    const VIDEO_UPLOAD_MAX_BYTES = 100 * 1024 * 1024; // 100MB
    const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

    if (url.pathname === '/api/llm/upload-video' && req.method === 'POST') {
      const authUser = await getAuthUser(req);
      if (authUser.username === 'local') {
        return await sendJson(res, 401, { error: 'Login obrigatório' }, corsHeaders ?? {});
      }
      if (!hasAnyLlmKey()) {
        return await sendJson(res, 503, {
          error: 'Configure as chaves de API no painel administrativo antes de usar a geração de mapas.',
        }, corsHeaders ?? {});
      }
      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.includes('multipart/form-data')) {
        return await sendJson(res, 400, { error: 'Content-Type deve ser multipart/form-data' }, corsHeaders ?? {});
      }
      try {
        const { fileBuffer, mimeType, prompt } = await new Promise((resolve, reject) => {
          const chunks = [];
          let totalBytes = 0;
          let resolvedMime = '';
          let resolvedPrompt = '';
          const bb = Busboy({ headers: { 'content-type': contentType } });
          bb.on('file', (fieldname, file, info) => {
            if (fieldname !== 'video') {
              file.resume();
              return;
            }
            const { mimeType: mt } = info;
            if (!VIDEO_MIME_TYPES.includes(mt) && !mt.startsWith('video/')) {
              file.resume();
              reject(new Error('Formato de vídeo não suportado. Use MP4, WebM ou MOV.'));
              return;
            }
            resolvedMime = mt;
            file.on('data', (chunk) => {
              totalBytes += chunk.length;
              if (totalBytes > VIDEO_UPLOAD_MAX_BYTES) {
                file.resume();
                reject(new Error('Vídeo muito grande. Máximo 100 MB.'));
                return;
              }
              chunks.push(chunk);
            });
            file.on('end', () => {});
            file.on('error', reject);
          });
          bb.on('field', (name, value) => {
            if (name === 'prompt') resolvedPrompt = String(value ?? '').trim();
          });
          bb.on('finish', () => {
            if (chunks.length === 0) {
              reject(new Error('Nenhum arquivo de vídeo enviado. Use o campo "video".'));
              return;
            }
            resolve({
              fileBuffer: Buffer.concat(chunks),
              mimeType: resolvedMime || 'video/mp4',
              prompt: resolvedPrompt,
            });
          });
          bb.on('error', reject);
          req.pipe(bb);
        });
        const result = await proxyVideoUploadAndAnalyze(fileBuffer, mimeType, prompt);
        return await sendJson(res, 200, result, corsHeaders ?? {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return await sendJson(res, 502, { error: msg }, corsHeaders ?? {});
      }
    }

    if (url.pathname === '/api/llm/complete' && req.method === 'POST') {
      const authUser = await getAuthUser(req);
      if (authUser.username === 'local') {
        return await sendJson(res, 401, { error: 'Login obrigatório' }, corsHeaders ?? {});
      }
      if (!hasAnyLlmKey()) {
        return await sendJson(res, 503, {
          error: 'Configure as chaves de API no painel administrativo antes de usar a geração de mapas.',
        }, corsHeaders ?? {});
      }
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error ?? 'Invalid JSON' }, corsHeaders ?? {});
      const { provider, model, messages, temperature, maxTokens, stream } = parsed.body ?? {};
      if (!provider || !model || !Array.isArray(messages)) {
        return await sendJson(res, 400, { error: 'provider, model e messages são obrigatórios' }, corsHeaders ?? {});
      }
      try {
        if (stream === true) {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'connection': 'keep-alive',
            ...getSecurityHeaders(),
            ...(corsHeaders ?? {}),
          });
          for await (const chunk of proxyLlmStream({
            provider,
            model,
            messages,
            temperature: temperature ?? 0.7,
            maxTokens: maxTokens ?? 4096,
          })) {
            res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
          }
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        const content = await proxyLlmComplete({
          provider,
          model,
          messages,
          temperature: temperature ?? 0.7,
          maxTokens: maxTokens ?? 4096,
        });
        return await sendJson(res, 200, { content }, corsHeaders ?? {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return await sendJson(res, 502, { error: msg }, corsHeaders ?? {});
      }
    }

    if (url.pathname === '/api/image/generate' && req.method === 'POST') {
      const authUser = await getAuthUser(req);
      if (authUser.username === 'local') {
        return await sendJson(res, 401, { error: 'Login obrigatório' }, corsHeaders ?? {});
      }
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error ?? 'Invalid JSON' }, corsHeaders ?? {});
      const theme = parsed.body?.theme;
      if (!theme || typeof theme !== 'string') {
        return await sendJson(res, 400, { error: 'theme é obrigatório' }, corsHeaders ?? {});
      }
      try {
        const imageUrl = await proxyReplicateImage(theme);
        return await sendJson(res, 200, { imageUrl }, corsHeaders ?? {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return await sendJson(res, 502, { error: msg }, corsHeaders ?? {});
      }
    }

    // -----------------------------------------------------------------------
    // Usage routes
    // -----------------------------------------------------------------------

    if (url.pathname === '/api/usage' && req.method === 'GET') {
      const authUser = await getAuthUser(req);
      if (authUser.username === 'local') {
        return await sendJson(res, 401, { error: 'Login obrigatório' }, corsHeaders ?? {});
      }
      const username = authUser.username;
      const usage = await getUsage(username);
      const profile = await getUser(username);
      // Get plan from user profile (falls back to 'free' for unauthenticated)
      let planId = 'free';
      if (username !== 'local') {
        try {
          planId = profile?.isAdmin ? 'admin' : (profile?.plan ?? 'free');
        } catch {
          planId = 'free';
        }
      }
      const limits = getPlanLimits(planId);
      return await sendJson(res, 200, { usage, limits, extraCredits: profile?.extraCredits ?? 0 }, corsHeaders ?? {});
    }

    if (url.pathname === '/api/usage/check' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const { action, mapId, format, generationMode } = parsed.body ?? {};

      const authUser = await getAuthUser(req);
      if (authUser.username === 'local') {
        return await sendJson(res, 401, { error: 'Login obrigatório' }, corsHeaders ?? {});
      }
      const username = authUser.username;

      let planId = 'free';
      if (username !== 'local') {
        try {
          const profile = await getUser(username);
          planId = profile?.isAdmin ? 'admin' : (profile?.plan ?? 'free');
        } catch {
          planId = 'free';
        }
      }
      const limits = getPlanLimits(planId);
      const usage = await getUsage(username);

      if (action === 'create_map') {
        const effectiveGenerationMode = generationMode === 'deep' ? 'deep' : 'normal';
        const profile = await getUser(username);
        if (limits.maxMapsStored !== -1) {
          const allMaps = await listMaps(username);
          const remainingStorage = limits.maxMapsStored - allMaps.length;
          if (remainingStorage <= 0) {
            return await sendJson(res, 200, {
              allowed: false,
              reason: `Limite de ${limits.maxMapsStored} mapas no total atingido. Faça upgrade para continuar.`,
              remaining: 0,
            }, corsHeaders ?? {});
          }
        }
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
        if (effectiveGenerationMode === 'deep') {
          const extraCredits = profile?.extraCredits ?? 0;
          if (extraCredits < 2) {
            return await sendJson(res, 200, {
              allowed: false,
              reason: 'Modo aprofundado requer 2 créditos extras. Adquira créditos para continuar.',
              remaining: 0,
              extraCredits,
              requiredExtraCredits: 2,
            }, corsHeaders ?? {});
          }
        }
        return await sendJson(res, 200, {
          allowed: true,
          remaining,
          extraCredits: profile?.extraCredits ?? 0,
          requiredExtraCredits: effectiveGenerationMode === 'deep' ? 2 : 0,
        }, corsHeaders ?? {});
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

    if (url.pathname === '/api/usage/map-generation' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const generationMode = parsed.body?.generationMode === 'deep' ? 'deep' : 'normal';
      const requestId = typeof parsed.body?.requestId === 'string' ? parsed.body.requestId : '';

      const authUser = await getAuthUser(req);
      if (authUser.username === 'local') {
        return await sendJson(res, 401, { error: 'Login obrigatório' }, corsHeaders ?? {});
      }

      if (generationMode !== 'deep') {
        const profile = await getUser(authUser.username);
        return await sendJson(res, 200, {
          ok: true,
          consumedExtraCredits: 0,
          remainingExtraCredits: profile?.extraCredits ?? 0,
        }, corsHeaders ?? {});
      }

      const consumed = consumeExtraCredits(authUser.username, 2, {
        reason: 'Geração em modo aprofundado',
        createdBy: 'system',
        requestId: requestId || null,
      });
      if (!consumed.ok) {
        return await sendJson(res, 409, {
          error: 'Saldo insuficiente de créditos extras para modo aprofundado.',
          remainingExtraCredits: consumed.remaining,
          requiredExtraCredits: 2,
        }, corsHeaders ?? {});
      }

      logActivity({
        username: authUser.username,
        action: 'deep_mode_credits_consumed',
        details: { amount: 2, remaining: consumed.remaining },
        ip: req.socket?.remoteAddress,
      });

      return await sendJson(res, 200, {
        ok: true,
        consumedExtraCredits: 2,
        remainingExtraCredits: consumed.remaining,
        ledgerEntryId: consumed.ledgerEntryId ?? null,
        idempotent: consumed.idempotent === true,
      }, corsHeaders ?? {});
    }

    if (url.pathname === '/api/usage/credits/ledger' && req.method === 'GET') {
      const authUser = await getAuthUser(req);
      if (authUser.username === 'local') {
        return await sendJson(res, 401, { error: 'Login obrigatório' }, corsHeaders ?? {});
      }
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '30', 10)));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
      const profile = await getUser(authUser.username);
      const ledger = listCreditLedger(authUser.username, { limit, offset });
      return await sendJson(res, 200, {
        username: authUser.username,
        currentBalance: profile?.extraCredits ?? 0,
        ...ledger,
      }, corsHeaders ?? {});
    }

    if (url.pathname === '/api/usage/chat-message' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const { mapId } = parsed.body ?? {};
      if (!mapId || typeof mapId !== 'string' || !mapId.trim()) {
        return await sendJson(res, 400, { error: 'mapId é obrigatório' }, corsHeaders ?? {});
      }
      try {
        validateMapId(mapId.trim());
      } catch (e) {
        return await sendJson(res, 400, { error: e instanceof Error ? e.message : 'mapId inválido' }, corsHeaders ?? {});
      }

      const authUser = await getAuthUser(req);
      if (authUser.username === 'local') {
        return await sendJson(res, 401, { error: 'Login obrigatório' }, corsHeaders ?? {});
      }

      try {
        await incrementChatCount(authUser.username, mapId.trim());
        return await sendJson(res, 200, { ok: true }, corsHeaders ?? {});
      } catch (err) {
        logger.error('incrementChatCount failed', {
          username: authUser.username,
          mapId: mapId.trim(),
          message: err instanceof Error ? err.message : String(err),
        });
        return await sendJson(res, 500, { error: 'Erro ao registrar mensagem' }, corsHeaders ?? {});
      }
    }

    // -----------------------------------------------------------------------
    // Billing routes
    // -----------------------------------------------------------------------

    if (url.pathname === '/api/billing/webhook' && req.method === 'POST') {
      const rawResult = await readRawBody(req);
      if (!rawResult.ok) {
        return await sendJson(res, 400, { error: rawResult.error }, corsHeaders ?? {});
      }
      const rawBody = rawResult.raw ?? '';
      const sigHeader = req.headers['stripe-signature'] ?? '';
      const webhookSecret = String(
        getAdminSetting('stripe_webhook_secret', process.env.STRIPE_WEBHOOK_SECRET ?? '') ?? ''
      ).trim();

      if (!webhookSecret) {
        logger.warn('Stripe webhook received but stripe_webhook_secret not configured');
        return await sendJson(res, 500, { error: 'Webhook não configurado' }, corsHeaders ?? {});
      }

      let event;
      try {
        const parts = {};
        for (const part of sigHeader.split(',')) {
          const [k, v] = part.split('=').map((s) => s.trim());
          if (k && v) parts[k] = v;
        }
        const timestamp = parts.t;
        const sig = parts.v1;
        if (!timestamp || !sig) {
          throw new Error('Stripe-Signature inválido');
        }
        const payloadToSign = timestamp + '.' + rawBody;
        const expectedSig = crypto
          .createHmac('sha256', webhookSecret)
          .update(payloadToSign)
          .digest('hex');
        const sigBuffer = Buffer.from(sig, 'hex');
        const expectedBuffer = Buffer.from(expectedSig, 'hex');
        if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
          throw new Error('Assinatura inválida');
        }
        event = JSON.parse(rawBody);
      } catch (err) {
        logger.warn('Stripe webhook signature verification failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        return await sendJson(res, 400, { error: 'Webhook signature inválida' }, corsHeaders ?? {});
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data?.object;
        let username = session?.metadata?.username || session?.client_reference_id || null;
        const targetPlan = (session?.metadata?.targetPlan ?? '').toLowerCase();
        const targetCredits = parseInt(session?.metadata?.targetCredits ?? '0', 10);
        const customerId = typeof session?.customer === 'string' ? session.customer : null;

        // Fallback: se username não veio no metadata, tenta buscar por Stripe customer_id ou email
        if (!username && targetCredits > 0) {
          if (customerId) {
            const profileByCustomer = await getUserByStripeCustomerId(customerId);
            if (profileByCustomer) username = profileByCustomer.username;
          }
          if (!username && session?.customer_email) {
            const profileByEmail = await getUserByEmail(session.customer_email);
            if (profileByEmail) username = profileByEmail.username;
          }
        }

        if (username && targetCredits > 0) {
          try {
            const profile = await getUser(username);
            if (profile && !profile.isAdmin) {
              addExtraCredits(username, targetCredits, {
                reason: 'Compra via Stripe',
                createdBy: 'stripe_webhook',
                requestId: session?.id || null,
              });
              if (customerId) await updateUser(username, { stripeCustomerId: customerId });
              logActivity({ username, action: 'billing_credits_purchased', details: { credits: targetCredits } });
              logger.info('User credits added via Stripe webhook', { username, credits: targetCredits });
            } else if (profile?.isAdmin) {
              logger.info('Stripe webhook: admin user skipped for credits', { username });
            }
          } catch (err) {
            logger.error('Failed to add credits from webhook', {
              username,
              credits: targetCredits,
              message: err instanceof Error ? err.message : String(err),
            });
            return await sendJson(res, 500, { error: 'Erro ao adicionar créditos' }, corsHeaders ?? {});
          }
        } else if (targetCredits > 0 && !username) {
          logger.warn('Stripe webhook: credits purchase but no username found', {
            sessionId: session?.id,
            customerId,
            targetCredits,
            metadata: session?.metadata,
          });
        } else if (username && (targetPlan === 'premium' || targetPlan === 'enterprise')) {
          try {
            const profile = await getUser(username);
            if (profile && !profile.isAdmin) {
              const updates = { plan: targetPlan };
              if (customerId) updates.stripeCustomerId = customerId;
              await updateUser(username, updates);
              logActivity({ username, action: 'billing_plan_upgraded', details: { plan: targetPlan } });
              logger.info('User plan upgraded via Stripe webhook', { username, plan: targetPlan });
            }
          } catch (err) {
            logger.error('Failed to upgrade user plan from webhook', {
              username,
              plan: targetPlan,
              message: err instanceof Error ? err.message : String(err),
            });
            return await sendJson(res, 500, { error: 'Erro ao atualizar plano' }, corsHeaders ?? {});
          }
        }
      }

      return await sendJson(res, 200, { received: true }, corsHeaders ?? {});
    }

    if (url.pathname === '/api/billing/checkout' && req.method === 'POST') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});

      const authUser = await getAuthUser(req);
      if (authUser.username === 'local') {
        return await sendJson(res, 401, { error: 'Login obrigatório para iniciar pagamento' }, corsHeaders ?? {});
      }

      const profile = await getUser(authUser.username);
      if (!profile) return await sendJson(res, 404, { error: 'Usuário não encontrado' }, corsHeaders ?? {});
      if (profile.isAdmin) {
        return await sendJson(res, 400, { error: 'Conta admin não requer upgrade de pagamento' }, corsHeaders ?? {});
      }

      const stripeSecretKey = String(
        getAdminSetting('stripe_secret_key', process.env.STRIPE_SECRET_KEY ?? '') ?? ''
      ).trim();
      if (!stripeSecretKey) {
        return await sendJson(res, 400, { error: 'Stripe não configurado: chave secreta ausente' }, corsHeaders ?? {});
      }

      const baseUrl = resolveRedirectBaseUrl(req);
      const checkoutType = String(parsed.body?.type ?? 'plan').toLowerCase();

      if (checkoutType === 'credits') {
        const amount = 5;
        const stripePriceId = getStripeCreditsPriceId();
        if (!stripePriceId) {
          return await sendJson(res, 400, {
            error: 'Stripe não configurado: price ID de créditos (stripe_price_credits_5) ausente. Configure no painel admin.',
          }, corsHeaders ?? {});
        }
        if (stripePriceId.startsWith('prod_') || !stripePriceId.startsWith('price_')) {
          return await sendJson(res, 400, {
            error: 'Price ID de créditos inválido. Use um Price ID (price_...) no painel admin.',
          }, corsHeaders ?? {});
        }

        const successUrl = `${baseUrl}/profile?credits=success`;
        const cancelUrl = `${baseUrl}/profile?credits=cancelled`;

        try {
          const session = await createStripeCreditsCheckoutSession({
            secretKey: stripeSecretKey,
            priceId: stripePriceId,
            targetCredits: amount,
            username: authUser.username,
            email: profile.email ?? null,
            customerId: profile.stripeCustomerId ?? null,
            successUrl,
            cancelUrl,
          });

          logActivity({
            username: authUser.username,
            action: 'billing_credits_checkout_created',
            details: { credits: amount, sessionId: session.id || null },
          });

          return await sendJson(res, 200, { url: session.url }, corsHeaders ?? {});
        } catch (err) {
          logger.error('Stripe credits checkout creation failed', {
            username: authUser.username,
            credits: amount,
            message: err instanceof Error ? err.message : String(err),
          });
          return await sendJson(res, 502, {
            error: err instanceof Error ? err.message : 'Erro ao iniciar checkout de créditos',
          }, corsHeaders ?? {});
        }
      }

      const requestedPlan = String(parsed.body?.plan ?? 'premium').toLowerCase();
      if (requestedPlan !== 'premium' && requestedPlan !== 'enterprise') {
        return await sendJson(res, 400, { error: 'Plano inválido para checkout' }, corsHeaders ?? {});
      }

      const stripePriceId = getStripePriceId(requestedPlan);
      if (!stripePriceId) {
        return await sendJson(res, 400, { error: `Stripe não configurado: price ID do plano ${requestedPlan} ausente` }, corsHeaders ?? {});
      }
      if (stripePriceId.startsWith('prod_')) {
        return await sendJson(res, 400, {
          error: `Você configurou um Product ID (prod_...). O campo exige um Price ID (price_...). No Stripe: Produtos → seu produto → Preços → copie o ID do preço (começa com price_).`,
        }, corsHeaders ?? {});
      }
      if (!stripePriceId.startsWith('price_')) {
        return await sendJson(res, 400, {
          error: `Price ID inválido. Use o ID do preço do Stripe (ex: price_1ABC123xyz), não o nome do plano nem o Product ID. Stripe → Produtos → Preços → copie o ID.`,
        }, corsHeaders ?? {});
      }

      const successUrl = `${baseUrl}/thank-you?plan=${encodeURIComponent(requestedPlan)}`;
      const cancelUrl = `${baseUrl}/settings?billing=cancelled`;

      try {
        const session = await createStripeCheckoutSession({
          secretKey: stripeSecretKey,
          priceId: stripePriceId,
          plan: requestedPlan,
          username: authUser.username,
          email: profile.email ?? null,
          customerId: profile.stripeCustomerId ?? null,
          successUrl,
          cancelUrl,
        });

        logActivity({
          username: authUser.username,
          action: 'billing_checkout_created',
          details: { plan: requestedPlan, sessionId: session.id || null },
        });

        return await sendJson(res, 200, { url: session.url }, corsHeaders ?? {});
      } catch (err) {
        logger.error('Stripe checkout creation failed', {
          username: authUser.username,
          plan: requestedPlan,
          message: err instanceof Error ? err.message : String(err),
        });
        return await sendJson(res, 502, {
          error: err instanceof Error ? err.message : 'Erro ao iniciar checkout Stripe',
        }, corsHeaders ?? {});
      }
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
    if (authUser.username === 'local') {
      return await sendJson(res, 401, { error: 'Login obrigatório' }, corsHeaders ?? {});
    }

    const isAdmin = authUser.isAdmin === true;
    const effectiveUsername = isAdmin ? user : authUser.username;

    if (req.method === 'GET' && id === null) {
      if (isAdmin) {
        const maps = await listMapsForAdmin(authUser.username);
        return await sendJson(res, 200, maps, corsHeaders ?? {});
      }
      const maps = await listMaps(effectiveUsername);
      return await sendJson(res, 200, maps, corsHeaders ?? {});
    }

    if (req.method === 'GET' && id) {
      let targetUsername = effectiveUsername;
      if (isAdmin) {
        const owner = await findMapOwnerForAdmin(id, user);
        if (owner) targetUsername = owner;
      }
      const map = await getMap(targetUsername, id);
      if (!map) return await sendJson(res, 404, { error: 'Map not found' }, corsHeaders ?? {});
      if (isAdmin) {
        return await sendJson(res, 200, {
          ...map,
          ownerUsername: targetUsername,
          ownerPath: `${targetUsername}/${map.title}`,
        }, corsHeaders ?? {});
      }
      return await sendJson(res, 200, map, corsHeaders ?? {});
    }

    if (req.method === 'PUT' && id) {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return await sendJson(res, 400, { error: parsed.error }, corsHeaders ?? {});
      const body = parsed.body;
      if (!body || typeof body !== 'object') return await sendJson(res, 400, { error: 'Invalid JSON body' }, corsHeaders ?? {});

      let writeUsername = effectiveUsername;
      if (isAdmin) {
        const owner = await findMapOwnerForAdmin(id, user);
        if (owner) writeUsername = owner;
      }

      // Check if this is a new map (not an update to an existing one)
      const existingMap = await getMap(writeUsername, id);
      const isNewMap = !existingMap;

      if (isNewMap) {
        // Enforce monthly map creation limit
        let planId = 'free';
        if (writeUsername !== 'local') {
          try {
            const profile = await getUser(writeUsername);
            planId = profile?.plan ?? 'free';
          } catch {
            planId = 'free';
          }
        }
        const limits = getPlanLimits(planId);
        if (limits.maxMapsStored !== -1) {
          const allMaps = await listMaps(writeUsername);
          if (allMaps.length >= limits.maxMapsStored) {
            return await sendJson(res, 403, {
              error: `Limite de ${limits.maxMapsStored} mapas no total atingido`,
              upgrade: true,
            }, corsHeaders ?? {});
          }
        }
        if (limits.mapsPerMonth !== -1) {
          const usage = await getUsage(writeUsername);
          if (usage.mapsCreatedThisMonth >= limits.mapsPerMonth) {
            return await sendJson(res, 403, {
              error: 'Limite do plano gratuito atingido',
              upgrade: true,
            }, corsHeaders ?? {});
          }
        }
      }

      const saved = await putMap(writeUsername, id, body);

      // Increment usage counter for new maps
      if (isNewMap) {
        try {
          await incrementMapCount(writeUsername);
          logActivity({ username: writeUsername, action: 'create_map', details: { mapId: id } });
          // Check for suspicious activity after map creation
          setTimeout(() => { try { checkAndNotify(); } catch {} }, 0);
        } catch {
          // Non-critical: don't fail the request if usage tracking fails
        }
      }

      return await sendJson(res, 200, saved, corsHeaders ?? {});
    }

    if (req.method === 'DELETE' && id) {
      let deleteUsername = effectiveUsername;
      if (isAdmin) {
        const owner = await findMapOwnerForAdmin(id, user);
        if (owner) deleteUsername = owner;
      }
      const deleted = await deleteMap(deleteUsername, id);
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
server.listen(port, '0.0.0.0', async () => {
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
