'use strict';

/**
 * src/config/db.js – MongoDB connection manager
 *
 * Features:
 *  - Exponential-backoff retry logic (up to MAX_RETRIES attempts)
 *  - Graceful connection event logging
 *  - Production-aware SSL / authSource options
 *  - Pool sizing from environment variables
 */

const mongoose = require('mongoose');
const logger = require('./logger');

// ─── Constants ───────────────────────────────────────────────────────────────
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2_000; // Initial retry delay
const MAX_DELAY_MS = 30_000; // Cap for exponential back-off

// ─── Connection options ───────────────────────────────────────────────────────
function buildConnectionOptions() {
  const opts = {
    maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10),
    minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2', 10),
    // Fail fast if initial connection can't be established
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    connectTimeoutMS: 10_000,
    // Heartbeat keeps idle connections alive
    heartbeatFrequencyMS: 10_000,
    // Use new URL parser & unified topology (defaults in Mongoose 8+, but explicit is safer)
    family: 4, // Force IPv4 to avoid DNS ambiguity
  };

  if (process.env.NODE_ENV === 'production') {
    // Enforce TLS in production – adjust if your Atlas string already includes TLS options
    opts.tls = true;
    opts.authSource = 'admin';
  }

  return opts;
}

// ─── Event listeners ─────────────────────────────────────────────────────────
function attachEventListeners() {
  const conn = mongoose.connection;

  conn.on('connected', () =>
    logger.info('MongoDB connected', { host: conn.host, db: conn.name })
  );

  conn.on('error', (err) =>
    logger.error('MongoDB connection error', { message: err.message })
  );

  conn.on('disconnected', () =>
    logger.warn('MongoDB disconnected – Mongoose will try to reconnect')
  );

  conn.on('reconnected', () => logger.info('MongoDB reconnected'));

  conn.on('close', () => logger.info('MongoDB connection closed'));
}

// ─── Retry logic ─────────────────────────────────────────────────────────────
/**
 * Attempt to connect, retrying with exponential back-off on failure.
 * @param {number} attempt - current attempt number (1-based)
 */
async function connectWithRetry(attempt = 1) {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      'MONGODB_URI is not defined. Set it in your .env file.'
    );
  }

  try {
    await mongoose.connect(uri, buildConnectionOptions());
    // Listeners only need to be attached once
    if (attempt === 1) attachEventListeners();
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      logger.error('MongoDB: max retries reached – giving up', {
        attempts: attempt,
        message: err.message,
      });
      throw err; // Let server.js decide what to do
    }

    const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
    logger.warn(`MongoDB: connection attempt ${attempt} failed – retrying in ${delay}ms`, {
      message: err.message,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));
    return connectWithRetry(attempt + 1);
  }
}

/**
 * Primary export – call once at application startup.
 */
async function connectDB() {
  // Avoid duplicate listeners if connectDB is called multiple times (e.g., in tests)
  if (mongoose.connection.readyState !== 0) {
    return mongoose.connection;
  }
  await connectWithRetry();
  return mongoose.connection;
}

module.exports = connectDB;
