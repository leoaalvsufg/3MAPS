Carregando 3Maps…'/**
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

const MAX_REQUESTS = 300;       // API requests allowed per window (per IP)
const WINDOW_MS = 60 * 1000;   // 1 minute in milliseconds

/**
 * Map of IP → array of request timestamps (ms) within the current window.
 * @type {Map<string, number[]>}
 */
const requestLog = new Map();

/**
 * Extracts the client IP from the request, respecting common proxy headers.
 * @param {import('node:http').IncomingMessage} req
 * @returns {string}
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; take the first entry.
    return String(forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Checks whether the request is within the rate limit for its IP.
 *
 * If the limit is exceeded, writes a 429 response and returns `false`.
 * Otherwise, records the request and returns `true`.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} `true` if the request is allowed, `false` if rate-limited.
 */
export function checkRateLimit(req, res) {
  const ip = getClientIp(req);
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
