/**
 * translationApi.js — Translation REST API calls
 *
 * Used as the fallback path when WebSocket is unavailable,
 * and for fetching history / supported languages.
 */

import axiosInstance from './axiosInstance.js';

// ── Translate text (REST) ──────────────────────────────────────────────────
/**
 * Translate a block of text via REST (non-streaming).
 * @param {{
 *   text: string,
 *   sourceLang: string,   // ISO 639-1 code, e.g. 'en' | 'auto'
 *   targetLang: string,
 * }} payload
 * @returns {{
 *   translatedText: string,
 *   detectedLanguage: string|null,
 *   confidence: number|null,
 * }}
 */
export async function translateText(payload) {
  const { data } = await axiosInstance.post('/translations/translate', {
    text:       payload.text,
    sourceLang: payload.sourceLang ?? 'auto',
    targetLang: payload.targetLang,
  });
  return data;
}

// ── Translation history ────────────────────────────────────────────────────
/**
 * Fetch paginated translation history for the authenticated user.
 * @param {{
 *   page?: number,
 *   limit?: number,
 *   sourceLang?: string,
 *   targetLang?: string,
 *   search?: string,
 * }} params
 * @returns {{
 *   items: Array<object>,
 *   total: number,
 *   page: number,
 *   totalPages: number,
 * }}
 */
export async function getHistory(params = {}) {
  const { data } = await axiosInstance.get('/translations/history', {
    params: {
      page:       params.page       ?? 1,
      limit:      params.limit      ?? 20,
      sourceLang: params.sourceLang ?? undefined,
      targetLang: params.targetLang ?? undefined,
      search:     params.search     ?? undefined,
    },
  });
  return data;
}

// ── Delete a history item ──────────────────────────────────────────────────
/**
 * @param {string} id — MongoDB ObjectId of the history record
 */
export async function deleteHistoryItem(id) {
  const { data } = await axiosInstance.delete(`/translations/history/${id}`);
  return data;
}

// ── Supported languages ────────────────────────────────────────────────────
/**
 * Fetch the list of languages the backend supports.
 * @returns {Array<{ code: string, name: string, nativeName: string }>}
 */
export async function getSupportedLanguages() {
  const { data } = await axiosInstance.get('/translations/languages');
  return data;   // Array of language objects
}

// ── Export history to CSV ──────────────────────────────────────────────────
/**
 * Request a CSV export.  Returns a Blob so the caller can trigger a download.
 * @param {{ sourceLang?: string, targetLang?: string }} filters
 * @returns {Blob}
 */
export async function exportHistoryCsv(filters = {}) {
  const response = await axiosInstance.get('/translations/history/export', {
    params:       filters,
    responseType: 'blob',
    headers:      { Accept: 'text/csv' },
  });
  return response.data;
}

// ── Admin: usage statistics ────────────────────────────────────────────────
/**
 * Fetch aggregated usage stats (admin only).
 * @returns {{ today: number, week: number, month: number, total: number }}
 */
export async function getUsageStats() {
  const { data } = await axiosInstance.get('/admin/stats/translations');
  return data;
}

// ── Admin: user list ───────────────────────────────────────────────────────
/**
 * @param {{ page?: number, limit?: number }} params
 */
export async function getUsers(params = {}) {
  const { data } = await axiosInstance.get('/admin/users', { params });
  return data;
}

// ── Admin: toggle user active status ──────────────────────────────────────
/**
 * @param {string} userId
 * @param {boolean} active
 */
export async function setUserActive(userId, active) {
  const { data } = await axiosInstance.patch(`/admin/users/${userId}`, {
    active,
  });
  return data;
}

// ── Admin: system health ───────────────────────────────────────────────────
export async function getSystemHealth() {
  const { data } = await axiosInstance.get('/admin/health');
  return data;
}
