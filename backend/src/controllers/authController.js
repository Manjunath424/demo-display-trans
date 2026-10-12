'use strict';

/**
 * src/controllers/authController.js – Authentication controller
 *
 * Endpoints handled:
 *  POST   /api/v1/auth/register       – Create account
 *  POST   /api/v1/auth/login          – Issue tokens
 *  POST   /api/v1/auth/logout         – Revoke refresh token
 *  POST   /api/v1/auth/refresh        – Rotate refresh token
 *  GET    /api/v1/auth/me             – Return current user
 *  PATCH  /api/v1/auth/change-password – Update password
 */

const User = require('../models/User');
const { blacklistToken } = require('../services/tokenService');
const { validatePassword } = require('../utils/passwordPolicy');
const { AppError } = require('../utils/errorHandler');
const logger = require('../config/logger');

// ─── Cookie options ───────────────────────────────────────────────────────────
const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,       // Inaccessible to JavaScript
  secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
  signed: true,         // HMAC signed via cookie-parser
  sameSite: 'strict',   // CSRF protection
  domain: process.env.COOKIE_DOMAIN || 'localhost',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms (matches JWT_REFRESH_EXPIRES_IN)
  path: '/api/v1/auth', // Only sent to auth routes
};

/**
 * Helper: set the refresh token as an httpOnly cookie and return the access token.
 */
function sendTokenResponse(res, statusCode, user, tokens) {
  res.cookie('refreshToken', tokens.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);

  res.status(statusCode).json({
    status: 'success',
    data: {
      accessToken: tokens.accessToken,
      user: user.clearSensitiveData(),
    },
  });
}

// ─── register ─────────────────────────────────────────────────────────────────
/**
 * POST /register
 * Body: { email, password }
 */
async function register(req, res, next) {
  try {
    const { email, password } = req.body;

    // Password policy check (before hashing)
    const { valid, errors: policyErrors } = validatePassword(password);
    if (!valid) {
      const err = new AppError('Password does not meet requirements', 422);
      err.details = policyErrors.map((msg) => ({ field: 'password', message: msg }));
      return next(err);
    }

    // Check for existing account (avoid timing oracle by always hashing)
    const existing = await User.findByEmail(email);
    if (existing) {
      return next(new AppError('An account with this email already exists.', 409));
    }

    // Create user – passwordHash field triggers pre-save bcrypt hook
    const user = new User({ email, passwordHash: password });
    await user.save();

    const clientIp = req.ip;
    // generateTokens already loads +refreshTokens; we need the version with that field
    const freshUser = await User.findById(user._id).select('+refreshTokens');
    const tokens = await freshUser.generateTokens(clientIp);

    logger.info('New user registered', { userId: freshUser._id, email: freshUser.email });

    sendTokenResponse(res, 201, freshUser, tokens);
  } catch (err) {
    next(err);
  }
}

// ─── login ────────────────────────────────────────────────────────────────────
/**
 * POST /login
 * Body: { email, password }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // Load user WITH passwordHash (select: false by default)
    const user = await User.findByEmail(email, true);

    // Generic message to prevent user enumeration
    const GENERIC_MSG = 'Invalid email or password.';

    if (!user) {
      // Still run bcrypt to prevent timing attacks that could enumerate emails
      await require('bcryptjs').hash(password, 1);
      return next(new AppError(GENERIC_MSG, 401));
    }

    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated. Contact support.', 403));
    }

    // Check lockout
    if (user.isLocked) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return next(
        new AppError(
          `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
          423
        )
      );
    }

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      await user.incrementLoginAttempts();
      const remaining = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10) - user.failedLoginAttempts;
      if (remaining <= 0) {
        return next(
          new AppError(
            'Account locked due to too many failed login attempts. Try again in 30 minutes.',
            423
          )
        );
      }
      return next(
        new AppError(
          `${GENERIC_MSG} ${remaining} attempt(s) remaining.`,
          401
        )
      );
    }

    // Successful login
    const tokens = await user.generateTokens(req.ip);

    logger.info('User logged in', { userId: user._id });

    sendTokenResponse(res, 200, user, tokens);
  } catch (err) {
    next(err);
  }
}

// ─── logout ───────────────────────────────────────────────────────────────────
/**
 * POST /logout
 * Requires: verifyAccessToken middleware (sets req.user)
 * Revokes the refresh token stored in cookie and blacklists the access token.
 */
async function logout(req, res, next) {
  try {
    const incomingRefreshToken =
      req.signedCookies?.refreshToken || req.body?.refreshToken;

    if (incomingRefreshToken) {
      const user = await User.findById(req.user.id).select('+refreshTokens');
      if (user) {
        await user.revokeRefreshToken(incomingRefreshToken);
      }
    }

    // Blacklist the current access token
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      blacklistToken(authHeader.slice(7));
    }

    // Clear the cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
    });

    logger.info('User logged out', { userId: req.user.id });

    res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
}

// ─── refreshToken ─────────────────────────────────────────────────────────────
/**
 * POST /refresh
 * Requires: refreshTokenMiddleware (sets req.refreshUser + req.usedRefreshToken)
 * Issues new access token and rotates refresh token.
 */
async function refreshToken(req, res, next) {
  try {
    const user = req.refreshUser;
    const oldToken = req.usedRefreshToken;

    // Remove old refresh token
    user.refreshTokens = user.refreshTokens.filter((t) => t.token !== oldToken);

    // Generate new token pair
    const tokens = await user.generateTokens(req.ip);

    logger.info('Refresh token rotated', { userId: user._id });

    sendTokenResponse(res, 200, user, tokens);
  } catch (err) {
    next(err);
  }
}

// ─── getMe ────────────────────────────────────────────────────────────────────
/**
 * GET /me
 * Returns the currently authenticated user's profile.
 */
async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return next(new AppError('User not found.', 404));
    }
    res.status(200).json({
      status: 'success',
      data: { user: user.clearSensitiveData() },
    });
  } catch (err) {
    next(err);
  }
}

// ─── changePassword ───────────────────────────────────────────────────────────
/**
 * PATCH /change-password
 * Body: { currentPassword, newPassword }
 * Rotates all refresh tokens to force re-login on other devices.
 */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+passwordHash +refreshTokens');
    if (!user) {
      return next(new AppError('User not found.', 404));
    }

    // Verify current password
    const passwordMatch = await user.comparePassword(currentPassword);
    if (!passwordMatch) {
      return next(new AppError('Current password is incorrect.', 401));
    }

    // Enforce new password policy
    const { valid, errors: policyErrors } = validatePassword(newPassword);
    if (!valid) {
      const err = new AppError('New password does not meet requirements', 422);
      err.details = policyErrors.map((msg) => ({ field: 'newPassword', message: msg }));
      return next(err);
    }

    // Prevent reuse of current password
    const samePassword = await user.comparePassword(newPassword);
    if (samePassword) {
      return next(
        new AppError('New password must be different from the current password.', 422)
      );
    }

    // Update password (triggers pre-save hook)
    user.passwordHash = newPassword;
    // Invalidate all refresh tokens to force re-login everywhere
    user.refreshTokens = [];
    await user.save();

    // Blacklist current access token
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      blacklistToken(authHeader.slice(7));
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
    });

    logger.info('Password changed – all sessions invalidated', { userId: user._id });

    res.status(200).json({
      status: 'success',
      message: 'Password updated successfully. Please log in again.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout, refreshToken, getMe, changePassword };
