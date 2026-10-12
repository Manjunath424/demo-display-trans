'use strict';

/**
 * src/models/TranslationHistory.js – Translation history record
 *
 * Features:
 *  - Stores per-user translation events
 *  - IP address is stored as a SHA-256 hash (never raw IP)
 *  - Compound index on (userId, createdAt) for efficient paginated queries
 *  - TTL index: documents auto-delete after 90 days
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

// ─── Schema ───────────────────────────────────────────────────────────────────
const translationHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },

    sourceText: {
      type: String,
      required: [true, 'sourceText is required'],
      maxlength: [5000, 'sourceText cannot exceed 5000 characters'],
      trim: true,
    },

    translatedText: {
      type: String,
      required: [true, 'translatedText is required'],
      maxlength: [10000, 'translatedText cannot exceed 10000 characters'],
      trim: true,
    },

    sourceLang: {
      type: String,
      required: [true, 'sourceLang is required'],
      maxlength: [10, 'sourceLang code is too long'],
      trim: true,
      lowercase: true,
    },

    targetLang: {
      type: String,
      required: [true, 'targetLang is required'],
      maxlength: [10, 'targetLang code is too long'],
      trim: true,
      lowercase: true,
    },

    detectedLang: {
      type: String,
      maxlength: [10, 'detectedLang code is too long'],
      trim: true,
      lowercase: true,
      default: null,
    },

    characterCount: {
      type: Number,
      required: true,
      min: [0, 'characterCount cannot be negative'],
    },

    /**
     * SHA-256 hash of the client IP address.
     * We never store raw IPs to limit PII exposure.
     * The hash still allows per-IP abuse analysis without exposing identities.
     */
    ipAddressHash: {
      type: String,
      default: null,
      maxlength: 64, // SHA-256 hex is 64 chars
    },

    /**
     * TTL field – Mongoose TTL index uses this field to auto-expire documents.
     * Set to createdAt + 90 days when the document is created.
     */
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
    versionKey: false,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Compound index for paginated per-user history queries
translationHistorySchema.index({ userId: 1, createdAt: -1 });

// TTL index – MongoDB will delete documents when expiresAt is in the past
translationHistorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Static helpers ───────────────────────────────────────────────────────────
/**
 * Hash a raw IP address with SHA-256 before storing.
 * @param {string} ip
 * @returns {string} hex digest
 */
translationHistorySchema.statics.hashIp = function (ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex');
};

// ─── toJSON transform ─────────────────────────────────────────────────────────
translationHistorySchema.set('toJSON', {
  virtuals: false,
  transform(_doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.ipAddressHash; // Never expose hashed IP in API responses
    delete ret.expiresAt;
    return ret;
  },
});

const TranslationHistory = mongoose.model(
  'TranslationHistory',
  translationHistorySchema
);

module.exports = TranslationHistory;
