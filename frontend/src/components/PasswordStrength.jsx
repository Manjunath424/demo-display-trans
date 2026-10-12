/**
 * PasswordStrength.jsx — Visual password strength meter
 *
 * Shows:
 * • A colour-coded progress bar (red → orange → yellow → green)
 * • A checklist of requirements that tick off as you type
 */

import React, { useMemo } from 'react';

// ── Requirement definitions ────────────────────────────────────────────────
const REQUIREMENTS = [
  {
    id:    'length',
    label: 'At least 8 characters',
    test:  (p) => p.length >= 8,
  },
  {
    id:    'uppercase',
    label: 'One uppercase letter (A–Z)',
    test:  (p) => /[A-Z]/.test(p),
  },
  {
    id:    'lowercase',
    label: 'One lowercase letter (a–z)',
    test:  (p) => /[a-z]/.test(p),
  },
  {
    id:    'number',
    label: 'One number (0–9)',
    test:  (p) => /\d/.test(p),
  },
  {
    id:    'special',
    label: 'One special character (!@#$…)',
    test:  (p) => /[^A-Za-z0-9]/.test(p),
  },
];

// ── Strength levels ────────────────────────────────────────────────────────
const LEVELS = [
  { label: 'Very Weak', color: 'bg-red-500',    textColor: 'text-red-600'    },
  { label: 'Weak',      color: 'bg-orange-400',  textColor: 'text-orange-500' },
  { label: 'Fair',      color: 'bg-yellow-400',  textColor: 'text-yellow-600' },
  { label: 'Good',      color: 'bg-lime-500',    textColor: 'text-lime-600'   },
  { label: 'Strong',    color: 'bg-green-500',   textColor: 'text-green-600'  },
];

/**
 * @param {{ password: string }} props
 */
export function PasswordStrength({ password }) {
  const results = useMemo(
    () => REQUIREMENTS.map((req) => ({ ...req, passed: req.test(password) })),
    [password]
  );

  const score    = results.filter((r) => r.passed).length;   // 0 – 5
  const level    = LEVELS[Math.max(0, score - 1)];
  const barWidth = `${(score / REQUIREMENTS.length) * 100}%`;

  if (!password) return null;

  return (
    <div className="mt-3 space-y-3" aria-live="polite" aria-label="Password strength">
      {/* ── Bar ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-500">Strength</span>
          <span className={`text-xs font-semibold ${level?.textColor ?? ''}`}>
            {level?.label ?? ''}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${level?.color ?? 'bg-slate-200'}`}
            style={{ width: barWidth }}
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={REQUIREMENTS.length}
          />
        </div>
      </div>

      {/* ── Checklist ─────────────────────────────────────────────────── */}
      <ul className="space-y-1" role="list">
        {results.map((req) => (
          <li
            key={req.id}
            className={`flex items-center gap-2 text-xs transition-colors duration-200 ${
              req.passed ? 'text-green-600' : 'text-slate-400'
            }`}
          >
            {/* Checkmark or circle */}
            {req.passed ? (
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0
                     00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414
                     1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0
                     00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414
                     1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414
                     10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span>{req.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PasswordStrength;
