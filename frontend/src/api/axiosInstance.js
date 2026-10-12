/**
 * axiosInstance.js — Centralised Axios configuration
 *
 * Security considerations:
 * ─────────────────────────────────────────────────────────────────────────
 * • withCredentials: true  → sends httpOnly refresh-token cookie on every
 *   request to the same origin (or CORS-whitelisted origin).
 * • Authorization header carries the short-lived access token stored only
 *   in memory (never in localStorage / sessionStorage).
 * • On 401 the interceptor silently attempts a token refresh. If refresh
 *   fails it calls authStore.logout() to clear state and redirect to /login.
 * • We never log full request bodies or Authorization headers to avoid
 *   accidental secret exposure in production logs.
 * ─────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

// ── In-memory token store ──────────────────────────────────────────────────
// This object is imported & mutated by AuthContext so interceptors always
// read the latest token without a stale closure.
export const tokenStore = {
  accessToken: null,
  /** @param {string|null} token */
  set(token) { this.accessToken = token; },
  get()       { return this.accessToken; },
  clear()     { this.accessToken = null; },
};

// ── Refresh-in-progress guard ──────────────────────────────────────────────
// Prevents multiple concurrent refresh calls when several 401s fire at once.
let isRefreshing = false;
let failedQueue  = [];   // [{resolve, reject}]

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token)
  );
  failedQueue = [];
}

// ── Axios instance ─────────────────────────────────────────────────────────
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,          // send httpOnly refresh-token cookie
  timeout: 10_000,                // 10 s — fail fast
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ── Request interceptor ────────────────────────────────────────────────────
axiosInstance.interceptors.request.use(
  (config) => {
    const token = tokenStore.get();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // In development only — never log in production
    if (import.meta.env.DEV) {
      console.debug(`[axios] → ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor ───────────────────────────────────────────────────
axiosInstance.interceptors.response.use(
  // 2xx responses pass through unchanged
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    // Only intercept 401 Unauthorized; skip the refresh endpoint itself
    // to avoid infinite loops.
    if (
      error.response?.status === 401 &&
      !originalRequest._retried &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retried = true;

      if (isRefreshing) {
        // Queue this request until the in-flight refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axiosInstance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        // Attempt silent refresh — relies on httpOnly cookie being sent
        const { data } = await axiosInstance.post('/auth/refresh');
        const newToken = data?.accessToken;

        tokenStore.set(newToken);
        processQueue(null, newToken);

        // Retry the original request with the new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // Refresh failed — force logout
        tokenStore.clear();

        // Dynamically import to avoid circular dependency at module load time
        import('../context/AuthContext.jsx').then(({ forceLogout }) => {
          if (typeof forceLogout === 'function') forceLogout();
        });

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // For all other errors, just reject so callers can handle them
    return Promise.reject(error);
  }
);

export default axiosInstance;
