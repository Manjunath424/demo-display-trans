'use strict';

/**
 * src/app.js – Express application factory
 *
 * Wires together all middleware, routes, and the global error handler.
 * Exported as a factory so it can be imported by tests without starting a server.
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const logger = require('./config/logger');
const applySecurityMiddleware = require('./middleware/security');
const authRoutes = require('./routes/authRoutes');
const translationRoutes = require('./routes/translationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { globalErrorHandler, AppError } = require('./utils/errorHandler');

const app = express();

// ─── Security middleware (helmet, cors, rate-limit, sanitize, etc.) ─────────
applySecurityMiddleware(app);

// ─── Body parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// ─── HTTP request logger ─────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  // Stream morgan output through winston so it goes to the same log files
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: (_req, res) => res.statusCode < 400, // only log errors in production
    })
  );
}

// ─── Health check (no auth required) ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/translate', translationRoutes);
app.use('/api/v1/admin', adminRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.all('*', (req, _res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
});

// ─── Global error handler (must be last middleware) ───────────────────────────
app.use(globalErrorHandler);

module.exports = app;
