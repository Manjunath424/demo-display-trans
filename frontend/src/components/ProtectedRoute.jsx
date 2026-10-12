/**
 * ProtectedRoute.jsx — Authentication guard
 *
 * Redirects unauthenticated users to /login.
 * While auth is still loading (session restoration), shows a spinner.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// ── Loading spinner ────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-translator-200 border-t-translator-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading…</p>
      </div>
    </div>
  );
}

// ── ProtectedRoute ─────────────────────────────────────────────────────────
/**
 * @param {{ children: React.ReactNode }} props
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;

  if (!isAuthenticated) {
    // Preserve the attempted URL so we can redirect back after login
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  return children;
}

// ── AdminRoute ─────────────────────────────────────────────────────────────
/**
 * Requires the user to be authenticated AND have role === 'admin'.
 * Shows a 403 message instead of redirecting, to avoid leaking route existence.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted p-4">
        <div className="card max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-danger-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-danger-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            403 — Access Denied
          </h1>
          <p className="text-slate-500 text-sm">
            You don't have permission to view this page.
            Contact your administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

export default ProtectedRoute;
