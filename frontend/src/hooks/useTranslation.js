/**
 * useTranslation.js — Custom hook for translation state & logic
 *
 * Features:
 * ─────────────────────────────────────────────────────────────────────────
 * • Maintains sourceText / targetText state.
 * • Manages sourceLang / targetLang selection with a full language list.
 * • Debounces input (300 ms) before triggering translation.
 * • Uses WebSocket for live mode; falls back to REST API automatically.
 * • Tracks isLoading, error, detectedLanguage states.
 * • swapLanguages() swaps codes and reverses the text.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { translateText } from '../api/translationApi.js';
import { useWebSocket } from './useWebSocket.js';

// ── Supported languages ────────────────────────────────────────────────────
// Extend this list as the backend gains language support.
export const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Detect Language' },
  { code: 'en',   name: 'English' },
  { code: 'es',   name: 'Spanish' },
  { code: 'fr',   name: 'French' },
  { code: 'de',   name: 'German' },
  { code: 'it',   name: 'Italian' },
  { code: 'pt',   name: 'Portuguese' },
  { code: 'nl',   name: 'Dutch' },
  { code: 'pl',   name: 'Polish' },
  { code: 'ru',   name: 'Russian' },
  { code: 'ar',   name: 'Arabic' },
  { code: 'zh',   name: 'Chinese (Simplified)' },
  { code: 'ja',   name: 'Japanese' },
  { code: 'ko',   name: 'Korean' },
  { code: 'hi',   name: 'Hindi' },
  { code: 'tr',   name: 'Turkish' },
  { code: 'vi',   name: 'Vietnamese' },
  { code: 'th',   name: 'Thai' },
  { code: 'id',   name: 'Indonesian' },
  { code: 'sv',   name: 'Swedish' },
  { code: 'da',   name: 'Danish' },
  { code: 'fi',   name: 'Finnish' },
  { code: 'no',   name: 'Norwegian' },
];

const MAX_INPUT_CHARS  = Number(import.meta.env.VITE_MAX_INPUT_CHARS) || 5_000;
const DEBOUNCE_DELAY   = 300;   // ms

/**
 * @param {{ liveMode?: boolean }} options
 */
export function useTranslation({ liveMode = true } = {}) {
  const [sourceText,       setSourceText]       = useState('');
  const [targetText,       setTargetText]       = useState('');
  const [sourceLang,       setSourceLang]       = useState('auto');
  const [targetLang,       setTargetLang]       = useState('es');
  const [isLoading,        setIsLoading]        = useState(false);
  const [error,            setError]            = useState(null);
  const [detectedLanguage, setDetectedLanguage] = useState(null);

  const debounceRef = useRef(null);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const {
    status: wsStatus,
    sendTranslation,
    translationResult,
    disconnect,
  } = useWebSocket();

  const wsAvailable = wsStatus === 'connected';
  const useLiveMode = liveMode && wsAvailable;

  // ── Receive WS results ────────────────────────────────────────────────────
  useEffect(() => {
    if (!translationResult) return;
    setTargetText(translationResult.translatedText ?? '');
    setDetectedLanguage(translationResult.detectedLanguage ?? null);
    setIsLoading(false);
    setError(null);
  }, [translationResult]);

  // ── Core translate function ───────────────────────────────────────────────
  const doTranslate = useCallback(
    async (text, src, tgt) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setTargetText('');
        setDetectedLanguage(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      if (useLiveMode) {
        // Optimistic: send via WS; result arrives via translationResult effect
        sendTranslation({ text: trimmed, sourceLang: src, targetLang: tgt });
      } else {
        // REST fallback
        try {
          const result = await translateText({
            text: trimmed,
            sourceLang: src,
            targetLang: tgt,
          });
          setTargetText(result.translatedText ?? '');
          setDetectedLanguage(result.detectedLanguage ?? null);
        } catch (err) {
          const msg = err.response?.data?.message ?? 'Translation failed. Please try again.';
          setError(msg);
          setTargetText('');
        } finally {
          setIsLoading(false);
        }
      }
    },
    [useLiveMode, sendTranslation]
  );

  // ── Debounced trigger ─────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doTranslate(sourceText, sourceLang, targetLang);
    }, DEBOUNCE_DELAY);
    return () => clearTimeout(debounceRef.current);
  }, [sourceText, sourceLang, targetLang, doTranslate]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Update source text with length guard */
  const handleSourceChange = useCallback((raw) => {
    // Strip dangerous HTML before storing — defence-in-depth
    const safe = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    if (safe.length <= MAX_INPUT_CHARS) {
      setSourceText(safe);
    }
  }, []);

  /** Swap source ↔ target language and text */
  const swapLanguages = useCallback(() => {
    if (sourceLang === 'auto') return;   // can't swap if source is 'auto'
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(targetText);
    setTargetText(sourceText);
  }, [sourceLang, targetLang, sourceText, targetText]);

  /** Clear both panes */
  const clearAll = useCallback(() => {
    setSourceText('');
    setTargetText('');
    setDetectedLanguage(null);
    setError(null);
  }, []);

  return {
    // State
    sourceText,
    targetText,
    sourceLang,
    targetLang,
    isLoading,
    error,
    detectedLanguage,
    wsStatus,
    useLiveMode,
    maxChars: MAX_INPUT_CHARS,
    languages: SUPPORTED_LANGUAGES,
    // Setters
    setSourceLang,
    setTargetLang,
    // Handlers
    handleSourceChange,
    swapLanguages,
    clearAll,
    disconnect,
  };
}

export default useTranslation;
