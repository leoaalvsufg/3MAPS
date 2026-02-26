/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Limits each IP to MAX_REQUESTS requests within WINDOW_MS milliseconds.
 * Returns 429 Too Many Requests when the limit is exceeded.
 *
 * Usage:
 *   import { checkRateLimit } from './rateLimit.js';
 *   // Inside a request handler:
 *   if (!checkRateLimit(req, res)) return; // response already sent
 */

const MAX_REQUESTS = 300;      // requests allowed per window (API only; static files are exempt)
const WINDOW_MS = 60 * 1000;   // 1 minute in milliseconds
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

/**
 * Map of IP → array of request timestamps (ms) within the current window.
 * @type {Map<string, number[]>}
 */
const requestLog = new Map();

/**
 * Checks if an IP is localhost (IPv4, IPv6, mapped IPv6, or hostname).
 * Handles formats from Vite proxy and direct connections.
 * @param {string} ip
 * @returns {boolean}
 */
function isLocalhost(ip) {
  if (!ip || ip === 'unknown') return false;
  const normalized = String(ip).trim().replace(/^\[|\]$/g, '');
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') return true;
  if (normalized.startsWith('::ffff:')) {
    const v4 = normalized.slice(7);
    return v4 === '127.0.0.1' || /^127\.\d+\.\d+\.\d+$/.test(v4);
  }
  return /^127\.\d+\.\d+\.\d+$/.test(normalized);
}

/**
 * Extracts the client IP from the request, respecting common proxy headers.
 * @param {import('node:http').IncomingMessage} req
 * @returns {string}
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/** Common static file extensions — requests for these skip rate limiting. */
const STATIC_EXT = /\.(js|mjs|css|ico|png|jpg|jpeg|svg|webp|woff2?|ttf|map|txt)$/i;

/**
 * Returns true if the request is for a static asset (no rate limit).
 * @param {import('node:http').IncomingMessage} req
 * @returns {boolean}
 */
function isStaticRequest(req) {
  const pathname = (req.url ?? '/').split('?')[0];
  if (pathname === '/' || pathname === '/index.html') return true;
  if (pathname === '/favicon.ico' || pathname === '/robots.txt') return true;
  if (pathname.startsWith('/assets/')) return true;
  return STATIC_EXT.test(pathname);
}

/**
 * Checks whether the request is within the rate limit for its IP.
 * Skips rate limiting for localhost, development mode, and static files.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} `true` if the request is allowed, `false` if rate-limited.
 */
export function checkRateLimit(req, res) {
  const ip = getClientIp(req);
  if (IS_DEVELOPMENT || isLocalhost(ip) || isStaticRequest(req)) return true;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Retrieve and prune timestamps outside the current window.
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS) {
    const retryAfter = Math.ceil(WINDOW_MS / 1000);
    res.writeHead(429, {
      'content-type': 'application/json; charset=utf-8',
      'retry-after': String(retryAfter),
    });
    res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
    return false;
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);

  // Periodically clean up stale entries to prevent unbounded memory growth.
  // Run cleanup roughly every 500 requests (probabilistic to avoid overhead).
  if (Math.random() < 0.002) {
    for (const [key, ts] of requestLog.entries()) {
      const active = ts.filter((t) => t > windowStart);
      if (active.length === 0) {
        requestLog.delete(key);
      } else {
        requestLog.set(key, active);
      }
    }
  }

  return true;
}
