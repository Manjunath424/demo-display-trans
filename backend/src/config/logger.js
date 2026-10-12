'use strict';

/**
 * src/config/logger.js – Winston logger configuration
 *
 * Features:
 *  - Environment-aware log levels (debug in dev, warn in prod)
 *  - Console transport (colored in dev, JSON in prod)
 *  - Rotating file transports for combined + error logs
 *  - Automatic redaction of sensitive fields
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// ─── Log directory ───────────────────────────────────────────────────────────
const LOG_DIR = path.resolve(process.env.LOG_DIR || 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ─── Sensitive field names to redact ─────────────────────────────────────────
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  'jwt',
  'creditCard',
  'ssn',
]);

/**
 * Recursively redact sensitive fields from any object.
 * Returns a new object – does NOT mutate the original.
 */
function redact(value, depth = 0) {
  if (depth > 10) return value; // Guard against circular structures
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) return [k, '[REDACTED]'];
      return [k, redact(v, depth + 1)];
    })
  );
}

// ─── Custom format: apply redaction before serialisation ─────────────────────
const redactFormat = format((info) => {
  const redacted = redact(info);
  return Object.assign(info, redacted);
});

// ─── Formats ─────────────────────────────────────────────────────────────────
const baseFormat = format.combine(
  redactFormat(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true })
);

const devFormat = format.combine(
  baseFormat,
  format.colorize({ all: true }),
  format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? '\n  ' + JSON.stringify(meta, null, 2)
      : '';
    return `[${timestamp}] ${level}: ${message}${stack ? '\n' + stack : ''}${metaStr}`;
  })
);

const prodFormat = format.combine(baseFormat, format.json());

// ─── Level configuration ─────────────────────────────────────────────────────
const LOG_LEVEL =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === 'production' ? 'warn' : 'debug');

// ─── Transports ──────────────────────────────────────────────────────────────
const logTransports = [
  // Console – human-readable in dev, JSON in prod/test
  new transports.Console({
    format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
    silent: process.env.NODE_ENV === 'test', // Suppress console noise during tests
  }),
  // All logs ≥ LOG_LEVEL
  new transports.File({
    filename: path.join(LOG_DIR, 'combined.log'),
    format: prodFormat,
    maxsize: 20 * 1024 * 1024, // 20 MB
    maxFiles: 5,
    tailable: true,
  }),
  // Error-only log
  new transports.File({
    filename: path.join(LOG_DIR, 'error.log'),
    level: 'error',
    format: prodFormat,
    maxsize: 20 * 1024 * 1024,
    maxFiles: 5,
    tailable: true,
  }),
];

// ─── Logger instance ─────────────────────────────────────────────────────────
const logger = createLogger({
  level: LOG_LEVEL,
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  transports: logTransports,
  exitOnError: false, // Don't crash the process on logging errors
});

module.exports = logger;
