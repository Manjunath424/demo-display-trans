'use strict';

/**
 * src/controllers/translationController.js – Translation controller
 *
 * Endpoints:
 *  POST   /api/v1/translate           – Translate text (authenticated)
 *  GET    /api/v1/translate/history   – Paginated history (authenticated)
 *  DELETE /api/v1/translate/history/:id – Delete own history entry
 *  GET    /api/v1/translate/languages  – List supported languages
 *  GET    /api/v1/admin/stats         – Admin: aggregate usage stats
 *  GET    /api/v1/admin/users/:id/history – Admin: any user's history
 */

const {
  translate,
  detectLanguage,
  getSupportedLanguages,
  checkUserRateLimit,
} = require('../services/translationService');
const TranslationHistory = require('../models/TranslationHistory');
const { AppError } = require('../utils/errorHandler');
const logger = require('../config/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function getPagination(query) {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.limit || String(DEFAULT_PAGE_SIZE), 10))
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

// ─── translateText ────────────────────────────────────────────────────────────
/**
 * POST /translate
 * Body: { text, targetLang, sourceLang? }
 */
async function translateText(req, res, next) {
  try {
    const { text, targetLang, sourceLang } = req.body;
    const userId = req.user.id;

    // Per-user service-level rate limit (complements Express rate limiter)
    checkUserRateLimit(userId);

    const result = await translate(text, targetLang, sourceLang);

    // Save history asynchronously – do NOT await to keep response fast
    const clientIp = req.ip;
    setImmediate(async () => {
      try {
        await TranslationHistory.create({
          userId,
          sourceText: text,
          translatedText: result.translatedText,
          sourceLang: sourceLang || 'auto',
          targetLang,
          detectedLang: result.detectedSourceLanguage,
          characterCount: text.length,
          ipAddressHash: TranslationHistory.hashIp(clientIp),
        });
      } catch (saveErr) {
        // History save failure must NOT affect the user-facing response
        logger.error('Failed to save translation history', {
          userId,
          message: saveErr.message,
        });
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        translatedText: result.translatedText,
        detectedSourceLanguage: result.detectedSourceLanguage,
        targetLang: result.targetLang,
        characterCount: text.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── getHistory ───────────────────────────────────────────────────────────────
/**
 * GET /history?page=1&limit=20&targetLang=es
 * Returns the authenticated user's translation history (paginated).
 */
async function getHistory(req, res, next) {
  try {
    const userId = req.user.id;
    const { page, limit, skip } = getPagination(req.query);

    // Optional filter by target language
    const filter = { userId };
    if (req.query.targetLang) {
      filter.targetLang = req.query.targetLang.toLowerCase().trim();
    }

    const [records, total] = await Promise.all([
      TranslationHistory.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TranslationHistory.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        records,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── deleteHistory ────────────────────────────────────────────────────────────
/**
 * DELETE /history/:id
 * Hard-deletes a specific history entry belonging to the current user.
 */
async function deleteHistory(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await TranslationHistory.findOneAndDelete({
      _id: id,
      userId, // Ensures users can only delete their OWN records
    });

    if (!record) {
      return next(new AppError('History record not found.', 404));
    }

    res.status(200).json({
      status: 'success',
      message: 'History record deleted.',
    });
  } catch (err) {
    next(err);
  }
}

// ─── getSupportedLangs ────────────────────────────────────────────────────────
/**
 * GET /languages?displayLang=en
 * Returns languages supported by the translation API.
 */
async function getSupportedLangs(req, res, next) {
  try {
    const displayLang = req.query.displayLang || 'en';
    const languages = await getSupportedLanguages(displayLang);
    res.status(200).json({ status: 'success', data: { languages } });
  } catch (err) {
    next(err);
  }
}

// ─── detectLang ───────────────────────────────────────────────────────────────
/**
 * POST /detect
 * Body: { text }
 */
async function detectLang(req, res, next) {
  try {
    const { text } = req.body;
    const result = await detectLanguage(text);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Admin: getAllStats ───────────────────────────────────────────────────────
/**
 * GET /admin/stats
 * Aggregate translation statistics for admins.
 */
async function getAllStats(req, res, next) {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [stats, total] = await Promise.all([
      TranslationHistory.aggregate([
        {
          $group: {
            _id: null,
            totalTranslations: { $sum: 1 },
            totalCharacters: { $sum: '$characterCount' },
            avgCharactersPerRequest: { $avg: '$characterCount' },
            uniqueUsers: { $addToSet: '$userId' },
            languagePairs: {
              $push: { source: '$sourceLang', target: '$targetLang' },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalTranslations: 1,
            totalCharacters: 1,
            avgCharactersPerRequest: { $round: ['$avgCharactersPerRequest', 0] },
            uniqueUserCount: { $size: '$uniqueUsers' },
          },
        },
      ]),
      TranslationHistory.countDocuments(),
    ]);

    // Top 10 target languages
    const topLanguages = await TranslationHistory.aggregate([
      { $group: { _id: '$targetLang', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { language: '$_id', count: 1, _id: 0 } },
    ]);

    // Recent translations (paginated)
    const recentTranslations = await TranslationHistory.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      status: 'success',
      data: {
        summary: stats[0] || {
          totalTranslations: 0,
          totalCharacters: 0,
          avgCharactersPerRequest: 0,
          uniqueUserCount: 0,
        },
        topLanguages,
        recentTranslations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Admin: getUserHistory ─────────────────────────────────────────────────────
/**
 * GET /admin/users/:id/history
 */
async function getUserHistory(req, res, next) {
  try {
    const { id } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const [records, total] = await Promise.all([
      TranslationHistory.find({ userId: id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TranslationHistory.countDocuments({ userId: id }),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        records,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  translateText,
  getHistory,
  deleteHistory,
  getSupportedLangs,
  detectLang,
  getAllStats,
  getUserHistory,
};
