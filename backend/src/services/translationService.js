'use strict';

/**
 * src/services/translationService.js – Google Cloud Translation API v2 client
 *
 * Security:
 *  - API key is read from process.env ONLY – never sent to the frontend
 *  - Error messages are sanitised before being forwarded to callers
 *  - Per-user in-memory rate limiting with automatic cleanup
 *
 * Methods exported:
 *  - translate(text, targetLang, sourceLang?)
 *  - detectLanguage(text)
 *  - getSupportedLanguages(targetDisplayLang?)
 *  - checkUserRateLimit(userId)
 */

const axios = require('axios');
const logger = require('../config/logger');
const { AppError } = require('../utils/errorHandler');

// ─── API configuration ────────────────────────────────────────────────────────
const BASE_URL =
  process.env.GOOGLE_TRANSLATE_BASE_URL ||
  'https://translation.googleapis.com/language/translate/v2';

/** Return the API key or throw a clear startup error */
function getApiKey() {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) {
    throw new Error(
      'GOOGLE_TRANSLATE_API_KEY is not set. Configure it in your .env file.'
    );
  }
  return key;
}

// ─── Axios instance ───────────────────────────────────────────────────────────
const translationClient = axios.create({
  timeout: 10_000, // 10 s – generous enough for the REST API
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ─── Per-user rate limiter ────────────────────────────────────────────────────
/**
 * In-memory store: userId → { count, windowStart }
 * Requests are limited to TRANSLATE_RATE_LIMIT_MAX per RATE_LIMIT_WINDOW_MS.
 * The store is cleaned up periodically to avoid unbounded memory growth.
 */
const userRequestCounts = new Map();
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const USER_LIMIT = parseInt(process.env.TRANSLATE_RATE_LIMIT_MAX || '50', 10);

// Purge stale windows every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [uid, entry] of userRequestCounts) {
    if (entry.windowStart < cutoff) userRequestCounts.delete(uid);
  }
}, 5 * 60 * 1000).unref();

/**
 * Check and increment per-user rate limit.
 * @param {string} userId
 * @throws {AppError} 429 if limit exceeded
 */
function checkUserRateLimit(userId) {
  const now = Date.now();
  const entry = userRequestCounts.get(userId);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    userRequestCounts.set(userId, { count: 1, windowStart: now });
    return;
  }

  if (entry.count >= USER_LIMIT) {
    throw new AppError(
      `Translation rate limit exceeded. You may make ${USER_LIMIT} requests per ${
        WINDOW_MS / 60000
      } minutes.`,
      429
    );
  }

  entry.count += 1;
}

// ─── Error mapper ─────────────────────────────────────────────────────────────
/**
 * Convert an Axios error from the Google API into a sanitised AppError.
 * Never forward raw Google error messages – they may reveal API key hints.
 */
function mapGoogleError(err) {
  if (!err.response) {
    // Network error (timeout, DNS, etc.)
    logger.error('Translation API network error', { message: err.message });
    return new AppError('Translation service is temporarily unavailable.', 503);
  }

  const status = err.response.status;
  const googleCode = err.response.data?.error?.code;
  const googleMessage = err.response.data?.error?.message || '';

  logger.error('Translation API error', {
    status,
    googleCode,
    // Log the real message server-side only
    googleMessage,
  });

  if (status === 400) {
    return new AppError('Invalid translation request parameters.', 400);
  }
  if (status === 403 || status === 401) {
    return new AppError('Translation service authentication error.', 500);
  }
  if (status === 429) {
    return new AppError('Translation quota exceeded. Please try again later.', 429);
  }
  return new AppError('Translation service error. Please try again.', 502);
}

// ─── translate ────────────────────────────────────────────────────────────────
/**
 * Translate text using the Google Cloud Translation API v2.
 *
 * @param {string}  text       - Source text to translate
 * @param {string}  targetLang - BCP-47 language code (e.g. 'es', 'fr', 'zh')
 * @param {string}  [sourceLang='auto'] - Source language; 'auto' lets Google detect it
 * @returns {Promise<{ translatedText: string, detectedSourceLanguage: string|null, targetLang: string }>}
 */
async function translate(text, targetLang, sourceLang = 'auto') {
  if (!text || typeof text !== 'string') {
    throw new AppError('text must be a non-empty string.', 400);
  }
  if (!targetLang) {
    throw new AppError('targetLang is required.', 400);
  }

  const maxLen = parseInt(process.env.MAX_TEXT_LENGTH || '5000', 10);
  if (text.length > maxLen) {
    throw new AppError(`Text exceeds maximum allowed length of ${maxLen} characters.`, 400);
  }

  const requestBody = {
    q: text,
    target: targetLang,
    format: 'text', // 'text' | 'html' – use 'text' to avoid XSS
  };

  if (sourceLang && sourceLang !== 'auto') {
    requestBody.source = sourceLang;
  }

  try {
    const response = await translationClient.post(BASE_URL, requestBody, {
      params: { key: getApiKey() },
    });

    const result = response.data?.data?.translations?.[0];
    if (!result) {
      throw new AppError('Unexpected response format from translation service.', 502);
    }

    return {
      translatedText: result.translatedText,
      detectedSourceLanguage: result.detectedSourceLanguage || null,
      targetLang,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapGoogleError(err);
  }
}

// ─── detectLanguage ───────────────────────────────────────────────────────────
/**
 * Detect the language of a text snippet.
 *
 * @param {string} text
 * @returns {Promise<{ language: string, confidence: number }>}
 */
async function detectLanguage(text) {
  if (!text || typeof text !== 'string') {
    throw new AppError('text must be a non-empty string.', 400);
  }

  try {
    const response = await translationClient.post(
      `${BASE_URL}/detect`,
      { q: text },
      { params: { key: getApiKey() } }
    );

    const result = response.data?.data?.detections?.[0]?.[0];
    if (!result) {
      throw new AppError('Unexpected response from language detection service.', 502);
    }

    return {
      language: result.language,
      confidence: result.confidence,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapGoogleError(err);
  }
}

// ─── getSupportedLanguages ────────────────────────────────────────────────────
/**
 * Fetch the list of languages supported by the Translation API.
 *
 * @param {string} [targetDisplayLang='en'] - Language to display names in
 * @returns {Promise<Array<{ language: string, name: string }>>}
 */
async function getSupportedLanguages(targetDisplayLang = 'en') {
  try {
    const response = await translationClient.get(`${BASE_URL}/languages`, {
      params: { key: getApiKey(), target: targetDisplayLang },
    });

    const languages = response.data?.data?.languages;
    if (!Array.isArray(languages)) {
      throw new AppError('Unexpected response from languages endpoint.', 502);
    }

    return languages;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapGoogleError(err);
  }
}

module.exports = { translate, detectLanguage, getSupportedLanguages, checkUserRateLimit };
