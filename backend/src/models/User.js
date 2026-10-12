'use strict';

/**
 * src/models/User.js – Mongoose User model
 *
 * Security features:
 *  - bcrypt password hashing (cost 12) via pre-save hook
 *  - Account lockout after configurable failed login attempts
 *  - Refresh token store with per-token expiry
 *  - toJSON transform strips sensitive fields
 *  - Index on email for fast lookups
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { generateAccessToken, generateRefreshToken } = require('../services/tokenService');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
const LOCK_TIME = parseInt(process.env.LOCK_TIME_MS || '1800000', 10); // 30 min

// ─── Refresh token sub-schema ──────────────────────────────────────────────────
const refreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdByIp: { type: String },
  },
  { _id: false }
);

// ─── User schema ──────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      maxlength: [254, 'Email address is too long'],
    },

    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 60, // bcrypt output is always 60 chars
      select: false, // Never returned in queries by default
    },

    role: {
      type: String,
      enum: { values: ['user', 'admin'], message: '{VALUE} is not a valid role' },
      default: 'user',
    },

    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
      select: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    versionKey: false,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ isActive: 1 });
// Partial index – only index locked accounts (saves space)
userSchema.index(
  { lockUntil: 1 },
  { partialFilterExpression: { lockUntil: { $ne: null } } }
);

// ─── Virtual: isLocked ────────────────────────────────────────────────────────
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ─── Pre-save hook: hash password ─────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  // Only hash when the password field has been modified
  if (!this.isModified('passwordHash')) return next();

  try {
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Instance methods ─────────────────────────────────────────────────────────

/**
 * Compare a plaintext candidate password against the stored hash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  // passwordHash is select: false – caller must use .select('+passwordHash')
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

/**
 * Record a successful login – reset failed attempts and update lastLogin.
 * @param {string} [ip] - Client IP for token metadata
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
userSchema.methods.generateTokens = async function (ip) {
  // Reset lockout state
  this.failedLoginAttempts = 0;
  this.lockUntil = null;
  this.lastLogin = new Date();

  const payload = { sub: this._id.toString(), role: this.role };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Parse refresh token expiry from env (default 7d)
  const refreshExpiresMs = parseExpiry(process.env.JWT_REFRESH_EXPIRES_IN || '7d');
  const expiresAt = new Date(Date.now() + refreshExpiresMs);

  // Prune expired tokens before adding new one
  this.refreshTokens = this.refreshTokens.filter((t) => t.expiresAt > new Date());

  // Enforce max 10 concurrent refresh tokens per user
  if (this.refreshTokens.length >= 10) {
    this.refreshTokens.shift(); // Remove oldest
  }

  this.refreshTokens.push({ token: refreshToken, expiresAt, createdByIp: ip });
  await this.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};

/**
 * Increment failed login attempts and lock if threshold reached.
 * @returns {Promise<void>}
 */
userSchema.methods.incrementLoginAttempts = async function () {
  // If a previous lock has expired, restart the counter
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.failedLoginAttempts = 1;
    this.lockUntil = null;
  } else {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= MAX_ATTEMPTS) {
      this.lockUntil = new Date(Date.now() + LOCK_TIME);
    }
  }
  await this.save({ validateBeforeSave: false });
};

/**
 * Remove a specific refresh token (logout).
 * @param {string} token
 * @returns {Promise<void>}
 */
userSchema.methods.revokeRefreshToken = async function (token) {
  this.refreshTokens = this.refreshTokens.filter((t) => t.token !== token);
  await this.save({ validateBeforeSave: false });
};

/**
 * Return a sanitised plain object (no sensitive fields).
 */
userSchema.methods.clearSensitiveData = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokens;
  return obj;
};

// ─── Static methods ───────────────────────────────────────────────────────────
/**
 * Find a user by email, optionally selecting the password hash.
 * @param {string} email
 * @param {boolean} [withPassword=false]
 */
userSchema.statics.findByEmail = function (email, withPassword = false) {
  const query = this.findOne({ email: email.toLowerCase().trim() });
  if (withPassword) query.select('+passwordHash +refreshTokens');
  return query;
};

// ─── toJSON transform ─────────────────────────────────────────────────────────
userSchema.set('toJSON', {
  virtuals: false,
  transform(_doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.passwordHash;
    delete ret.refreshTokens;
    delete ret.__v;
    return ret;
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Parse a JWT-style duration string to milliseconds.
 * Supports: s (seconds), m (minutes), h (hours), d (days).
 * @param {string} str - e.g. '7d', '15m', '1h'
 * @returns {number} milliseconds
 */
function parseExpiry(str) {
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86_400_000; // Default 7 days
  return parseInt(match[1], 10) * (units[match[2]] || 86_400_000);
}

const User = mongoose.model('User', userSchema);

module.exports = User;
