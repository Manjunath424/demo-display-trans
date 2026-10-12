/**
 * useWebSocket.js — Custom hook for real-time translation via WebSocket
 *
 * Features:
 * ─────────────────────────────────────────────────────────────────────────
 * • Connects to the WS server with the JWT access token in the URL query
 *   (standard approach when WS upgrades can't carry headers).
 * • Exponential back-off reconnection: 1s → 2s → 4s → 8s → 16s (max 5).
 * • 30-second heartbeat ping to keep the connection alive through proxies.
 * • Exposes connection state: 'connecting' | 'connected' | 'disconnected' | 'error'
 * • Returns sendTranslation(payload) and the latest translationResult.
 * • Cleans up (close + clear timers) on component unmount.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Security note:
 *   The token is passed as a URL query param (?token=…) because the
 *   WebSocket API doesn't support custom headers during the HTTP upgrade.
 *   To minimise exposure, use a short-lived token (< 1 min) issued
 *   specifically for the WS connection.  The main access token (10 min)
 *   is an acceptable trade-off for most deployments.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { tokenStore } from '../api/axiosInstance.js';

// ── Constants ──────────────────────────────────────────────────────────────
const WS_BASE_URL    = import.meta.env.VITE_WS_URL || 'ws://localhost:5000';
const HEARTBEAT_MS   = Number(import.meta.env.VITE_WS_HEARTBEAT_MS) || 30_000;
const MAX_RETRIES    = 5;
const BASE_DELAY_MS  = 1_000;

/** @typedef {'connecting'|'connected'|'disconnected'|'error'} WsStatus */

/**
 * @returns {{
 *   status: WsStatus,
 *   sendTranslation: (payload: object) => void,
 *   translationResult: object | null,
 *   disconnect: () => void,
 * }}
 */
export function useWebSocket() {
  const [status,            setStatus]            = useState('disconnected');
  const [translationResult, setTranslationResult] = useState(null);

  const wsRef          = useRef(null);   // WebSocket instance
  const heartbeatRef   = useRef(null);   // setInterval handle
  const reconnectRef   = useRef(null);   // setTimeout handle
  const retryCountRef  = useRef(0);
  const isMountedRef   = useRef(true);   // prevent state updates after unmount

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  const startHeartbeat = useCallback(() => {
    stopHeartbeat();  // eslint-disable-line no-use-before-define
    heartbeatRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_MS);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Close any existing connection before opening a new one
    if (wsRef.current) {
      wsRef.current.onclose = null;  // prevent reconnect loop
      wsRef.current.close();
    }

    const token = tokenStore.get();
    if (!token) {
      if (import.meta.env.DEV) {
        console.debug('[WS] No access token — skipping connection.');
      }
      setStatus('disconnected');
      return;
    }

    // Attach token as query param (only acceptable WS auth method)
    const url = `${WS_BASE_URL}/ws?token=${encodeURIComponent(token)}`;

    if (import.meta.env.DEV) {
      console.debug('[WS] Connecting to', WS_BASE_URL);
    }

    setStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) { ws.close(); return; }
      retryCountRef.current = 0;
      setStatus('connected');
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pong') return;  // heartbeat ack — ignore
        if (msg.type === 'translation_result') {
          setTranslationResult(msg.payload ?? msg);
        }
        if (msg.type === 'error') {
          console.error('[WS] Server error:', msg.message);
        }
      } catch {
        console.error('[WS] Failed to parse message:', event.data);
      }
    };

    ws.onerror = () => {
      if (!isMountedRef.current) return;
      setStatus('error');
      stopHeartbeat();
    };

    ws.onclose = (event) => {
      if (!isMountedRef.current) return;
      stopHeartbeat();

      // 4001 = server-side auth failure — don't retry
      if (event.code === 4001) {
        setStatus('error');
        return;
      }

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * 2 ** retryCountRef.current;
        retryCountRef.current += 1;

        if (import.meta.env.DEV) {
          console.debug(
            `[WS] Disconnected. Retry ${retryCountRef.current}/${MAX_RETRIES} in ${delay}ms`
          );
        }

        setStatus('disconnected');
        reconnectRef.current = setTimeout(connect, delay);
      } else {
        setStatus('error');
      }
    };
  }, [startHeartbeat, stopHeartbeat]);

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      stopHeartbeat();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;  // suppress reconnect on cleanup
        wsRef.current.close();
      }
    };
  }, [connect, stopHeartbeat]);

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Send a translation request over the WebSocket.
   * @param {{ text: string, sourceLang: string, targetLang: string }} payload
   */
  const sendTranslation = useCallback((payload) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send — socket is not open.');
      return;
    }
    wsRef.current.send(
      JSON.stringify({ type: 'translate', payload })
    );
  }, []);

  /**
   * Manually close the connection (e.g. when navigating away from translator).
   */
  const disconnect = useCallback(() => {
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    stopHeartbeat();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    setStatus('disconnected');
  }, [stopHeartbeat]);

  return { status, sendTranslation, translationResult, disconnect };
}

export default useWebSocket;
