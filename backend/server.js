'use strict';

/**
 * server.js – Application entry point
 *
 * Responsibilities:
 *  1. Load environment variables from .env
 *  2. Bootstrap Express application
 *  3. Attach WebSocket server to the same HTTP(S) server
 *  4. Connect to MongoDB
 *  5. Start listening on configured port
 *  6. Graceful shutdown on SIGTERM / SIGINT
 */

// Must be first – loads .env before any other module reads process.env
require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const logger = require('./src/config/logger');
const { initWebSocket } = require('./src/websocket/wsHandler');

// ─── Configuration ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── Unhandled Promise Rejections / Uncaught Exceptions ────────────────────
// Log and exit so a process manager (PM2, systemd) can restart cleanly.
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise),
  });
  // Give logger time to flush, then exit
  setTimeout(() => process.exit(1), 500);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception – shutting down', {
    message: err.message,
    stack: err.stack,
  });
  setTimeout(() => process.exit(1), 500);
});

// ─── HTTP Server ────────────────────────────────────────────────────────────
const server = http.createServer(app);

// ─── WebSocket ──────────────────────────────────────────────────────────────
initWebSocket(server);

// ─── Startup ─────────────────────────────────────────────────────────────────
async function start() {
  try {
    // 1. Connect to MongoDB (retries internally)
    await connectDB();

    // 2. Start HTTP server
    server.listen(PORT, HOST, () => {
      logger.info(`Server running in ${NODE_ENV} mode`, {
        host: HOST,
        port: PORT,
        pid: process.pid,
      });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
      } else {
        logger.error('Server error', { message: err.message });
      }
      process.exit(1);
    });
  } catch (err) {
    logger.error('Failed to start server', { message: err.message });
    process.exit(1);
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
/**
 * Attempt to close all connections gracefully within a timeout.
 * @param {string} signal - The OS signal received
 */
function gracefulShutdown(signal) {
  logger.info(`${signal} received – initiating graceful shutdown`);

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close(false);
      logger.info('MongoDB connection closed');
    } catch (err) {
      logger.error('Error closing MongoDB connection', { message: err.message });
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  });

  // Force-exit if shutdown takes too long (15 s)
  setTimeout(() => {
    logger.error('Forced shutdown – graceful shutdown timed out');
    process.exit(1);
  }, 15_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start();
