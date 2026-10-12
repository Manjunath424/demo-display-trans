'use strict';

/**
 * src/utils/errorHandler.js – Centralised error handling
 *
 * Exports:
 *  - AppError               – Custom operational error class
 *  - globalErrorHandler     – Final Express error middleware
 *
 * Handles:
 *  - Mongoose ValidationError → 422
 *  - Mongoose CastError (bad ObjectId) → 400
 *  - MongoDB duplicate key (E11000) → 409
 *  - JWT errors → 401
 *  - express-rate-limit → 429
 *  - Generic errors → 500
 *
 * Production vs Development:
 *  - Development: full stack trace + details in response
 *  - Production: sanitised message only; full details logged server-side
 */

const logger = require('../config/logger');

// ─── AppError ─────────────────────────────────────────────────────────────────
/**
 * Operational (expected) error class.
 * Non-operational errors (bugs) are plain Error instances and get a generic
 * 500 response in production.
 */
class AppError extends Error {
  /**
   * @param {string} message  - Human-readable error message (safe to expose)
   * @param {number} statusCode
   * @param {object} [details] - Optional structured details (e.g. validation errors)
   */
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'error';
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Error transformers ───────────────────────────────────────────────────────

/** Mongoose validation error → 422 */
function handleValidationError(err) {
  const details = Object.values(err.errors).map((e) => ({
    field: e.path,
    message: e.message,
  }));
  const error = new AppError('Validation failed', 422);
  error.details = details;
  return error;
}

/** Mongoose CastError (invalid ObjectId etc.) → 400 */
function handleCastError(err) {
  return new AppError(
    `Invalid value for field '${err.path}': ${err.value}`,
    400
  );
}

/** MongoDB duplicate key → 409 */
function handleDuplicateKeyError(err) {
  // Extract the duplicated field name from the error message
  const fieldMatch = err.message.match(/index: (.+) dup key/);
  const field = fieldMatch ? fieldMatch[1].split('_')[0] : 'field';
  return new AppError(
    `A record with this ${field} already exists.`,
    409
  );
}

/** JWT expired → 401 */
function handleJWTExpiredError() {
  return new AppError('Your session has expired. Please log in again.', 401);
}

/** JWT invalid → 401 */
function handleJWTError() {
  return new AppError('Invalid authentication token. Please log in again.', 401);
}

// ─── Response senders ─────────────────────────────────────────────────────────

function sendDevError(err, res) {
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    details: err.details || undefined,
    stack: err.stack,
    error: err,
  });
}

function sendProdError(err, res) {
  if (err.isOperational) {
    const body = {
      status: err.status,
      message: err.message,
    };
    if (err.details) body.details = err.details;
    res.status(err.statusCode).json(body);
  } else {
    // Programming or unknown error – don't leak details
    res.status(500).json({
      status: 'error',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
}

// ─── globalErrorHandler ───────────────────────────────────────────────────────
/**
 * Express error middleware – must be registered LAST, after all routes.
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, _next) {
  // Defaults
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log every error with request context
  const logPayload = {
    method: req.method,
    path: req.path,
    statusCode: err.statusCode,
    userId: req.user?.id,
    message: err.message,
  };

  if (err.statusCode >= 500) {
    logger.error('Server error', { ...logPayload, stack: err.stack });
  } else {
    logger.warn('Client error', logPayload);
  }

  // Transform known library errors into AppError instances
  let error = err;

  if (err.name === 'ValidationError' && err.errors) {
    error = handleValidationError(err);
  } else if (err.name === 'CastError') {
    error = handleCastError(err);
  } else if (err.code === 11000) {
    error = handleDuplicateKeyError(err);
  } else if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  } else if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  }

  if (process.env.NODE_ENV === 'development') {
    sendDevError(error, res);
  } else {
    sendProdError(error, res);
  }
}

module.exports = { AppError, globalErrorHandler };
