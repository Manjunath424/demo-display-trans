'use strict';

/**
 * src/services/tokenService.js – JWT token lifecycle management
 *
 * Features:
 *  - generateAccessToken  – 15-min HS256 JWT
 *  - generateRefreshToken – 7-day HS256 JWT
 *  - verifyToken          – signature + claims validation
 *  - Token blacklist      – in-memory Set with periodic cleanup
 *                           (persisted invalidation for logout is handled
 *                            by removing the token from User.refreshTokens)
 */

const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

// ─── Secrets & configuration ──────────────────────────────────────────────────
const ACCESS_SECRET = () => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not defined');
  return secret;
};

const REFRESH_SECRET = () => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not defined');
  return secret;
};

const ISSUER = process.env.JWT_ISSUER || 'live-translator-api';
const AUDIENCE = process.env.JWT_AUDIENCE || 'live-translator-client';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// ─── In-memory access token blacklist ─────────────────────────────────────────
// Used to invalidate access tokens on logout/password-change without
// needing a database round-trip for every request.
// NOTE: In a multi-instance deployment replace this with Redis.
const blacklistedTokens = new Map(); // token → expiry timestamp

// Purge expired entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of blacklistedTokens) {
    if (expiry < now) blacklistedTokens.delete(token);
  }
}, 5 * 60 * 1000).unref(); // .unref() prevents this timer from keeping process alive

// ─── generateAccessToken ──────────────────────────────────────────────────────
/**
 * Create a short-lived access token.
 * @param {{ sub: string, role: string }} payload
 * @returns {string} signed JWT
 */
function generateAccessToken(payload) {
  if (!payload.sub) throw new Error('generateAccessToken: payload.sub is required');
  return jwt.sign(
    {
      sub: payload.sub,
      role: payload.role,
      type: 'access',
    },
    ACCESS_SECRET(),
    {
      expiresIn: ACCESS_EXPIRES,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithm: 'HS256',
    }
  );
}

// ─── generateRefreshToken ─────────────────────────────────────────────────────
/**
 * Create a long-lived refresh token.
 * @param {{ sub: string, role: string }} payload
 * @returns {string} signed JWT
 */
function generateRefreshToken(payload) {
  if (!payload.sub) throw new Error('generateRefreshToken: payload.sub is required');
  return jwt.sign(
    {
      sub: payload.sub,
      role: payload.role,
      type: 'refresh',
    },
    REFRESH_SECRET(),
    {
      expiresIn: REFRESH_EXPIRES,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithm: 'HS256',
    }
  );
}

// ─── verifyToken ──────────────────────────────────────────────────────────────
/**
 * Verify a JWT against the provided secret and standard claim constraints.
 * Throws a JWT error on failure (handled by auth middleware).
 *
 * @param {string} token
 * @param {string} secret  - Use ACCESS_SECRET() or REFRESH_SECRET()
 * @returns {object} decoded payload
 */
function verifyToken(token, secret) {
  if (!token) throw new jwt.JsonWebTokenError('No token provided');

  // Reject blacklisted access tokens
  if (blacklistedTokens.has(token)) {
    const err = new jwt.JsonWebTokenError('Token has been revoked');
    throw err;
  }

  return jwt.verify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
}

// ─── blacklistToken ───────────────────────────────────────────────────────────
/**
 * Add an access token to the in-memory blacklist until it expires.
 * @param {string} token - Raw JWT string
 */
function blacklistToken(token) {
  try {
    // Decode without verification to read the exp claim
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      blacklistedTokens.set(token, decoded.exp * 1000); // exp is in seconds
    }
  } catch {
    // If we can't decode, still blacklist with a 24h TTL as a safety net
    blacklistedTokens.set(token, Date.now() + 24 * 60 * 60 * 1000);
  }
  logger.debug('Token blacklisted', { count: blacklistedTokens.size });
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  blacklistToken,
  // Expose secrets as functions so they are read lazily after dotenv loads
  getAccessSecret: ACCESS_SECRET,
  getRefreshSecret: REFRESH_SECRET,
};
