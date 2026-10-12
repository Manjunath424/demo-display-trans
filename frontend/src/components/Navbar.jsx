/**
 * Navbar.jsx — Top navigation bar
 *
 * Features:
 * • Logo + app name
 * • Navigation links: Translator, History
 * • Admin link (only for role === 'admin')
 * • User avatar dropdown: Profile, Change Password, Logout
 * • WebSocket connection status indicator dot
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// ── Connection status configuration ───────────────────────────────────────
const STATUS_CONFIG = {
  connected:    { color: 'bg-green-500',  label: 'Live' },
  connecting:   { color: 'bg-yellow-400 animate-pulse-dot', label: 'Connecting…' },
  disconnected: { color: 'bg-slate-400',  label: 'Offline' },
  error:        { color: 'bg-red-500',    label: 'Error' },
};

/**
 * @param {{ wsStatus?: string }} props
 */
export function Navbar({ wsStatus = 'disconnected' }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate                  = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef                     = useRef(null);

  const statusCfg = STATUS_CONFIG[wsStatus] ?? STATUS_CONFIG.disconnected;

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = useCallback(async () => {
    setDropdownOpen(false);
    await logout();
  }, [logout]);

  // ── Initials avatar ────────────────────────────────────────────────────────
  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?';

  // ── Active link classes ────────────────────────────────────────────────────
  const navLinkClass = ({ isActive }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
      isActive
        ? 'bg-translator-50 text-translator-700'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-white/90 backdrop-blur-md">
      <nav
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between"
        aria-label="Main navigation"
      >
        {/* ── Brand ─────────────────────────────────────────────────────── */}
        <Link
          to="/translator"
          className="flex items-center gap-2.5 group"
          aria-label="Live Display Translator home"
        >
          {/* Globe icon */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-translator-500 to-accent-500 flex items-center justify-center shadow-sm group-hover:shadow-glow transition-shadow duration-200">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088
                   6.5a18.022 18.022 0 01-6.088-6.5M12.5 18a18.022 18.022
                   0 01-6.088-6.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <span className="font-bold text-slate-900 text-base hidden sm:block">
            Live <span className="text-gradient">Translator</span>
          </span>
        </Link>

        {/* ── Centre nav links ───────────────────────────────────────────── */}
        <div className="flex items-center gap-1">
          <NavLink to="/translator" className={navLinkClass}>
            Translator
          </NavLink>
          <NavLink to="/history" className={navLinkClass}>
            History
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          )}
        </div>

        {/* ── Right section ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          {/* WS status indicator */}
          <div
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500"
            title={`WebSocket: ${wsStatus}`}
          >
            <span className={`status-dot ${statusCfg.color}`} aria-hidden="true" />
            <span className="font-medium">{statusCfg.label}</span>
          </div>

          {/* User dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-100 transition-colors duration-150"
              aria-haspopup="true"
              aria-expanded={dropdownOpen}
              aria-label="User menu"
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-translator-400 to-accent-500 flex items-center justify-center text-white text-xs font-bold select-none">
                {initials}
              </div>
              {/* Name (desktop only) */}
              <span className="hidden md:block text-sm font-medium text-slate-700 max-w-[120px] truncate">
                {user?.name ?? user?.email ?? ''}
              </span>
              {/* Chevron */}
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-52 rounded-xl bg-white shadow-card border border-surface-border py-1 z-50 animate-fade-in"
                role="menu"
                aria-label="User actions"
              >
                {/* User info header */}
                <div className="px-4 py-2.5 border-b border-surface-border">
                  <p className="text-xs font-semibold text-slate-900 truncate">{user?.name ?? 'User'}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  {isAdmin && (
                    <span className="badge bg-accent-50 text-accent-700 mt-1">Admin</span>
                  )}
                </div>

                {/* Menu items */}
                <button
                  type="button"
                  onClick={() => { setDropdownOpen(false); navigate('/profile'); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  role="menuitem"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Profile
                </button>

                <button
                  type="button"
                  onClick={() => { setDropdownOpen(false); navigate('/change-password'); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  role="menuitem"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1
                         1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Change Password
                </button>

                <div className="border-t border-surface-border mt-1 pt-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-danger-500 hover:bg-danger-50 transition-colors"
                    role="menuitem"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3
                           3 0 013 3v1" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
