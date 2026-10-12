/**
 * AuthContext.jsx — Application-wide authentication state
 *
 * Security design:
 * ────────────────────────────────────────────────────────────────────────
 * • Access token lives ONLY in memory (this module's closure).
 *   It is never written to localStorage, sessionStorage, or any cookie
 *   accessible to JavaScript — preventing XSS token theft.
 * • The server sets a Secure, HttpOnly, SameSite=Strict refresh-token
 *   cookie.  The browser sends it automatically; JS cannot read it.
 * • Silent refresh happens every TOKEN_REFRESH_MS (default 10 min).
 * • On 401 the Axios interceptor calls refreshAccessToken() and
 *   retries the failed request transparently.
 * • forceLogout() is exported so the Axios interceptor can call it
 *   without creating a circular import at module load time.
 * ────────────────────────────────────────────────────────────────────────
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { login as apiLogin, logout as apiLogout, refreshToken, getMe } from '../api/authApi.js';
import { tokenStore } from '../api/axiosInstance.js';

// ── Context ────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ── Token refresh interval ─────────────────────────────────────────────────
const TOKEN_REFRESH_MS =
  Number(import.meta.env.VITE_TOKEN_REFRESH_MS) || 10 * 60 * 1000; // 10 min

// ── forceLogout singleton ─────────────────────────────────────────────────
// Holds a reference so Axios interceptors can trigger logout without
// importing the full context (which would be a circular dep).
let _forceLogout = null;
/** @type {() => void} */
export function forceLogout() {
  if (typeof _forceLogout === 'function') _forceLogout();
}

// ── Provider ───────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const navigate     = useNavigate();
  const refreshTimer = useRef(null);

  const [user,      setUser]      = useState(null);    // { id, email, name, role }
  const [isLoading, setIsLoading] = useState(true);    // true while restoring session

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Store new access token and schedule next silent refresh */
  const applyToken = useCallback((token) => {
    tokenStore.set(token);
    scheduleRefresh();           // eslint-disable-line no-use-before-define
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Schedule the next silent token refresh */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      try {
        const { accessToken, user: freshUser } = await refreshToken();
        tokenStore.set(accessToken);
        setUser(freshUser);
        scheduleRefresh();         // re-schedule
      } catch {
        // Refresh token has expired → logout
        doLogout();                // eslint-disable-line no-use-before-define
      }
    }, TOKEN_REFRESH_MS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Clear all auth state */
  const doLogout = useCallback(async (callServer = true) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    tokenStore.clear();
    setUser(null);
    if (callServer) {
      try { await apiLogout(); } catch { /* ignore — best effort */ }
    }
    navigate('/login', { replace: true });
  }, [navigate]);

  // Expose doLogout for Axios interceptor
  useEffect(() => {
    _forceLogout = () => doLogout(false);
    return () => { _forceLogout = null; };
  }, [doLogout]);

  // ── Session restoration on mount ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        // Try silent refresh using the httpOnly cookie
        const { accessToken, user: restoredUser } = await refreshToken();
        if (cancelled) return;
        tokenStore.set(accessToken);
        setUser(restoredUser);
        scheduleRefresh();
      } catch {
        // No valid session — user must log in
        if (!cancelled) tokenStore.clear();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    restoreSession();
    return () => { cancelled = true; };
  }, [scheduleRefresh]);

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Log in with email + password.
   * @param {string} email
   * @param {string} password
   */
  const login = useCallback(async (email, password) => {
    const { accessToken, user: loggedInUser } = await apiLogin({ email, password });
    tokenStore.set(accessToken);
    setUser(loggedInUser);
    scheduleRefresh();
    navigate('/translator', { replace: true });
  }, [navigate, scheduleRefresh]);

  /**
   * Silently refresh the access token.
   * Exposed so child components can call it if they detect expiry.
   */
  const refreshAccessToken = useCallback(async () => {
    const { accessToken, user: freshUser } = await refreshToken();
    tokenStore.set(accessToken);
    setUser(freshUser);
    scheduleRefresh();
    return accessToken;
  }, [scheduleRefresh]);

  /**
   * Log out the current user.
   */
  const logout = useCallback(() => doLogout(true), [doLogout]);

  // ── Context value ─────────────────────────────────────────────────────────
  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    login,
    logout,
    refreshAccessToken,
    setUser,         // exposed for profile updates
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────
/**
 * Returns the auth context.  Must be used inside <AuthProvider>.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

export default AuthContext;
