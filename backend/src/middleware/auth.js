'use strict';

/**
 * src/middleware/auth.js – JWT authentication & RBAC middleware
 *
 * Exports:
 *  - verifyAccessToken  – validates Bearer token, attaches req.user
 *  - requireRole(roles) – factory returning RBAC middleware
 *  - refreshTokenMiddleware – validates refresh token, issues new access token
 */

const { verifyToken } = require('../services/tokenService');
const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');
const logger = require('../config/logger');

// ─── verifyAccessToken ────────────────────────────────────────────────────────
/**
 * Middleware: extract and verify the JWT Bearer token from the Authorization
 * header. On success, attaches the sanitised user document to req.user.
 */
async function verifyAccessToken(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Authentication required. Provide a Bearer token.', 401));
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    // Verify signature + expiry + issuer + audience
    const decoded = verifyToken(token, process.env.JWT_ACCESS_SECRET);

    // Fetch fresh user to catch deactivated accounts mid-session
    const user = await User.findById(decoded.sub).select(
      '-passwordHash -refreshTokens -__v'
    );

    if (!user) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated. Contact support.', 403));
    }

    // Attach sanitised user to request
    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    // Map JWT-specific errors to friendly messages
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token. Please log in again.', 401));
    }
    logger.error('verifyAccessToken unexpected error', { message: err.message });
    return next(new AppError('Authentication failed.', 401));
  }
}

// ─── requireRole ─────────────────────────────────────────────────────────────
/**
 * Middleware factory: restrict route access to users with specific roles.
 * Must be used AFTER verifyAccessToken.
 *
 * @param {string[]} roles - Allowed roles e.g. ['admin', 'moderator']
 * @returns {import('express').RequestHandler}
 */
function requireRole(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new Error('requireRole: roles must be a non-empty array');
  }
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401));
    }
    if (!roles.includes(req.user.role)) {
      logger.warn('RBAC: access denied', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });
      return next(
        new AppError('You do not have permission to perform this action.', 403)
      );
    }
    next();
  };
}

// ─── refreshTokenMiddleware ───────────────────────────────────────────────────
/**
 * Middleware: validate the refresh token (from httpOnly cookie or body),
 * rotate it, and issue a new access token.
 *
 * Used exclusively by POST /api/v1/auth/refresh.
 */
async function refreshTokenMiddleware(req, res, next) {
  try {
    // Prefer signed cookie (more secure); fall back to body for non-browser clients
    const incomingRefreshToken =
      req.signedCookies?.refreshToken || req.body?.refreshToken;

    if (!incomingRefreshToken) {
      return next(new AppError('Refresh token not provided.', 401));
    }

    // Verify JWT signature + expiry
    const decoded = verifyToken(incomingRefreshToken, process.env.JWT_REFRESH_SECRET);

    // Load user and check the token is in their active token list
    const user = await User.findById(decoded.sub);

    if (!user || !user.isActive) {
      return next(new AppError('Invalid refresh token.', 401));
    }

    const tokenEntry = user.refreshTokens.find(
      (t) => t.token === incomingRefreshToken && t.expiresAt > new Date()
    );

    if (!tokenEntry) {
      // Token reuse detected – potential token theft, invalidate all tokens
      logger.warn('Refresh token reuse detected – invalidating all tokens', {
        userId: user._id,
      });
      user.refreshTokens = [];
      await user.save({ validateBeforeSave: false });
      return next(new AppError('Session invalidated due to security concern. Please log in again.', 401));
    }

    // Attach user to request so the controller can issue new tokens
    req.refreshUser = user;
    req.usedRefreshToken = incomingRefreshToken;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Refresh token expired. Please log in again.', 401));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid refresh token.', 401));
    }
    logger.error('refreshTokenMiddleware error', { message: err.message });
    return next(new AppError('Token refresh failed.', 500));
  }
}

module.exports = { verifyAccessToken, requireRole, refreshTokenMiddleware };
