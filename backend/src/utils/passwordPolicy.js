'use strict';

/**
 * src/utils/passwordPolicy.js – Password strength validator
 *
 * Rules:
 *  - Minimum 8 characters
 *  - At least 1 uppercase letter (A-Z)
 *  - At least 1 lowercase letter (a-z)
 *  - At least 1 digit (0-9)
 *  - At least 1 special character  (!@#$%^&*…)
 *  - Maximum 128 characters (prevents bcrypt DoS via very long inputs)
 *  - Not in the common password blacklist
 *
 * Export:
 *  - validatePassword(password) → { valid: boolean, errors: string[] }
 */

// ─── Common password blacklist (top 30 – extend as needed) ───────────────────
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'Password1',
  'Password1!',
  '12345678',
  '123456789',
  'qwerty123',
  'iloveyou',
  'admin123',
  'letmein',
  'welcome1',
  'monkey123',
  'dragon123',
  'master123',
  'passw0rd',
  'Passw0rd',
  'Passw0rd!',
  'abc12345',
  'sunshine',
  'princess',
  'football',
  'shadow12',
  'superman',
  'michael1',
  'charlie1',
  'donald12',
  'trustno1',
  'baseball',
  'starwars',
  'qazwsxedc',
]);

// ─── Validation rules ─────────────────────────────────────────────────────────
const RULES = [
  {
    test: (p) => typeof p === 'string' && p.length >= 8,
    message: 'Password must be at least 8 characters long.',
  },
  {
    test: (p) => p.length <= 128,
    message: 'Password must not exceed 128 characters.',
  },
  {
    test: (p) => /[A-Z]/.test(p),
    message: 'Password must contain at least one uppercase letter.',
  },
  {
    test: (p) => /[a-z]/.test(p),
    message: 'Password must contain at least one lowercase letter.',
  },
  {
    test: (p) => /[0-9]/.test(p),
    message: 'Password must contain at least one number.',
  },
  {
    test: (p) => /[!@#$%^&*()\-_=+[\]{};':",.<>?/\\|`~]/.test(p),
    message: 'Password must contain at least one special character (e.g. !@#$%^&*).',
  },
  {
    test: (p) => !COMMON_PASSWORDS.has(p),
    message: 'Password is too common. Please choose a more unique password.',
  },
];

// ─── validatePassword ─────────────────────────────────────────────────────────
/**
 * Validate a plaintext password against all policy rules.
 *
 * @param {string} password
 * @returns {{ valid: boolean, errors: string[] }}
 *
 * @example
 * const { valid, errors } = validatePassword('MyP@ssw0rd');
 * if (!valid) console.error(errors);
 */
function validatePassword(password) {
  const errors = [];

  for (const rule of RULES) {
    if (!rule.test(password)) {
      errors.push(rule.message);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = { validatePassword };
