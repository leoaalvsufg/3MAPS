/**
 * server/logger.js
 * Structured logger for the 3Maps server.
 *
 * - JSON format when NODE_ENV=production
 * - Pretty-printed format otherwise
 * - Log levels: debug, info, warn, error
 * - Minimum log level configurable via LOG_LEVEL env var (default: info)
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const minLevelName = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const MIN_LEVEL = LEVELS[minLevelName] ?? LEVELS.info;

const LEVEL_COLORS = {
  debug: '\x1b[36m', // cyan
  info:  '\x1b[32m', // green
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

/**
 * Write a log entry.
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {object|undefined} context
 */
function log(level, message, context) {
  if ((LEVELS[level] ?? 0) < MIN_LEVEL) return;

  const timestamp = new Date().toISOString();

  if (IS_PRODUCTION) {
    // JSON format for production
    const entry = { timestamp, level, message };
    if (context !== undefined) entry.context = context;
    // eslint-disable-next-line no-console
    const out = level === 'error' ? console.error : console.log;
    out(JSON.stringify(entry));
  } else {
    // Pretty format for development
    const color = LEVEL_COLORS[level] ?? '';
    const levelTag = `${color}[${level.toUpperCase().padEnd(5)}]${RESET}`;
    let line = `${timestamp} ${levelTag} ${message}`;
    if (context !== undefined) {
      try {
        line += ' ' + JSON.stringify(context, null, 2);
      } catch {
        line += ' [unserializable context]';
      }
    }
    // eslint-disable-next-line no-console
    const out = level === 'error' ? console.error : console.log;
    out(line);
  }
}

export const logger = {
  /** @param {string} msg @param {object=} ctx */
  debug: (msg, ctx) => log('debug', msg, ctx),
  /** @param {string} msg @param {object=} ctx */
  info:  (msg, ctx) => log('info',  msg, ctx),
  /** @param {string} msg @param {object=} ctx */
  warn:  (msg, ctx) => log('warn',  msg, ctx),
  /** @param {string} msg @param {object=} ctx */
  error: (msg, ctx) => log('error', msg, ctx),
};
