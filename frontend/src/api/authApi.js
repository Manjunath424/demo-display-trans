/**
 * authApi.js — Authentication API calls
 *
 * All functions use the shared axiosInstance which automatically:
 *  • attaches the Bearer token
 *  • sends the httpOnly refresh-token cookie (withCredentials)
 *  • handles 401 → silent refresh
 */

import axiosInstance from './axiosInstance.js';

// ── Register ───────────────────────────────────────────────────────────────
/**
 * Create a new user account.
 * @param {{ email: string, password: string, name?: string }} payload
 */
export async function register(payload) {
  const { data } = await axiosInstance.post('/auth/register', payload);
  return data;   // { message: 'Account created.' }
}

// ── Login ──────────────────────────────────────────────────────────────────
/**
 * Authenticate and receive an access token.
 * The backend sets an httpOnly refresh-token cookie on the response.
 * @param {{ email: string, password: string }} credentials
 * @returns {{ accessToken: string, user: object }}
 */
export async function login(credentials) {
  const { data } = await axiosInstance.post('/auth/login', credentials);
  return data;   // { accessToken, user: { id, email, name, role } }
}

// ── Logout ─────────────────────────────────────────────────────────────────
/**
 * Invalidate the refresh token on the server and clear the httpOnly cookie.
 */
export async function logout() {
  await axiosInstance.post('/auth/logout');
}

// ── Get current user ───────────────────────────────────────────────────────
/**
 * Fetch the authenticated user's profile.
 * Used to rehydrate auth state on page load.
 * @returns {{ id: string, email: string, name: string, role: string }}
 */
export async function getMe() {
  const { data } = await axiosInstance.get('/auth/me');
  return data;
}

// ── Refresh access token ───────────────────────────────────────────────────
/**
 * Exchange the httpOnly refresh cookie for a new access token.
 * Called automatically by the Axios response interceptor — but can
 * also be called manually (e.g. on app startup to restore session).
 * @returns {{ accessToken: string, user: object }}
 */
export async function refreshToken() {
  const { data } = await axiosInstance.post('/auth/refresh');
  return data;   // { accessToken, user }
}

// ── Change password ────────────────────────────────────────────────────────
/**
 * Change the authenticated user's password.
 * @param {{ currentPassword: string, newPassword: string }} payload
 */
export async function changePassword(payload) {
  const { data } = await axiosInstance.put('/auth/change-password', payload);
  return data;   // { message: 'Password changed.' }
}
