'use strict';

/**
 * src/middleware/validate.js – Express-validator middleware factory
 *
 * Exports:
 *  - validate(schema)         – runs a schema (array of ValidationChain) and
 *                               pipes errors to globalErrorHandler
 *  - sanitizeInput(value)     – standalone XSS-clean + trim helper
 *  - validationErrorHandler   – reusable handler for express-validator errors
 */

const { validationResult } = require('express-validator');
const xss = require('xss');
const { AppError } = require('../utils/errorHandler');

// ─── validationErrorHandler ───────────────────────────────────────────────────
/**
 * Collects express-validator errors and forwards a 422 AppError.
 * Designed to be used after running a schema.
 */
function validationErrorHandler(req, _res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({
      field: e.path || e.param,
      message: e.msg,
    }));
    const error = new AppError('Validation failed', 422);
    error.details = details;
    return next(error);
  }
  next();
}

// ─── validate factory ─────────────────────────────────────────────────────────
/**
 * Compose a schema (array of ValidationChain) with the error handler.
 *
 * Usage:
 *   router.post('/login', validate(loginSchema), authController.login);
 *
 * @param {import('express-validator').ValidationChain[]} schema
 * @returns {import('express').RequestHandler[]}
 */
function validate(schema) {
  if (!Array.isArray(schema)) {
    throw new TypeError('validate(): schema must be an array of ValidationChain');
  }
  return [...schema, validationErrorHandler];
}

// ─── sanitizeInput ────────────────────────────────────────────────────────────
/**
 * Standalone helper to XSS-sanitise and trim a string value.
 * Use in custom validators or anywhere you need to clean a string.
 *
 * @param {string} value
 * @returns {string}
 */
function sanitizeInput(value) {
  if (typeof value !== 'string') return value;
  return xss(value.trim());
}

module.exports = { validate, sanitizeInput, validationErrorHandler };
