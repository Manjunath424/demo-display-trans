'use strict';

/**
 * src/middleware/security.js – Centralised security middleware
 *
 * Applied in this order:
 *  1. compression  – gzip responses
 *  2. helmet       – HTTP security headers + strict CSP
 *  3. cors         – Origin whitelist from env
 *  4. express-rate-limit – Global throttle
 *  5. express-mongo-sanitize – NoSQL injection prevention
 *  6. hpp          – HTTP Parameter Pollution protection
 *  7. XSS filter   – Sanitise req.body strings
 *  8. Request size limit is set on body-parser in app.js (10 kb)
 */

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const compression = require('compression');
const xss = require('xss');
const logger = require('../config/logger');

// ─── CORS configuration ───────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Allow server-to-server requests (no Origin header) in non-production
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    logger.warn('CORS: rejected request from disallowed origin', { origin });
    callback(new Error(`CORS policy does not allow origin: ${origin}`));
  },
  credentials: true, // Allow cookies / Authorization headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86_400, // 24 h preflight cache
};

// ─── Helmet – HTTP security headers ──────────────────────────────────────────
const helmetOptions = {
  // Content-Security-Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  // Strict-Transport-Security (HSTS) – 1 year, include subdomains
  hsts:
    process.env.NODE_ENV === 'production'
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
  // Prevent MIME sniffing
  noSniff: true,
  // Disable X-Powered-By
  hidePoweredBy: true,
  // Referrer-Policy
  referrerPolicy: { policy: 'no-referrer' },
  // X-Frame-Options
  frameguard: { action: 'deny' },
  // Cross-Origin-Embedder-Policy
  crossOriginEmbedderPolicy: true,
  // Cross-Origin-Opener-Policy
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  // Cross-Origin-Resource-Policy
  crossOriginResourcePolicy: { policy: 'same-origin' },
  // Permissions-Policy
  permittedCrossDomainPolicies: false,
};

// ─── Rate limiters ────────────────────────────────────────────────────────────
/**
 * Create a rate limiter with shared defaults.
 * @param {object} overrides - rateLimit options to override
 */
function createRateLimiter(overrides = {}) {
  return rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    standardHeaders: true,  // Return rate-limit info in RateLimit-* headers
    legacyHeaders: false,   // Disable X-RateLimit-* headers
    skipSuccessfulRequests: false,
    handler(_req, res) {
      res.status(429).json({
        status: 'error',
        message: 'Too many requests – please slow down and try again later.',
      });
    },
    ...overrides,
  });
}

/** Global rate limiter – applied to every route */
const globalLimiter = createRateLimiter();

/** Stricter limiter for auth endpoints – exported for use in authRoutes */
const authLimiter = createRateLimiter({
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
  message: 'Too many authentication attempts – please try again later.',
});

/** Translation endpoint limiter */
const translateLimiter = createRateLimiter({
  max: parseInt(process.env.TRANSLATE_RATE_LIMIT_MAX || '50', 10),
  message: 'Translation rate limit exceeded.',
});

// ─── XSS sanitiser middleware ─────────────────────────────────────────────────
/**
 * Recursively sanitise all string values in req.body using the xss library.
 * Applied after body-parser so the parsed object is already available.
 */
function xssSanitizer(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj) {
  if (typeof obj === 'string') return xss(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, sanitizeObject(v)])
    );
  }
  return obj;
}

// ─── Composed middleware applicator ──────────────────────────────────────────
/**
 * Apply all security middleware to an Express app instance.
 * @param {import('express').Application} app
 */
function applySecurityMiddleware(app) {
  // 1. Compression (before everything else for efficiency)
  app.use(compression({ level: 6 }));

  // 2. Helmet (sets security headers)
  app.use(helmet(helmetOptions));

  // 3. CORS
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions)); // Handle pre-flight for all routes

  // 4. Global rate limit
  app.use(globalLimiter);

  // 5. NoSQL injection prevention (strips $ and . from req.body, query, params)
  app.use(mongoSanitize({ replaceWith: '_', onSanitizeError: (_, key) => {
    logger.warn('mongoSanitize: stripped suspicious key', { key });
  }}));

  // 6. HTTP Parameter Pollution
  app.use(hpp());

  // 7. XSS sanitiser (applied after body-parser in app.js, but registered here for clarity)
  app.use(xssSanitizer);
}

module.exports = applySecurityMiddleware;
module.exports.authLimiter = authLimiter;
module.exports.translateLimiter = translateLimiter;
module.exports.createRateLimiter = createRateLimiter;
