/**
 * main.jsx — Application entry point
 *
 * Uses React 18 createRoot API for concurrent features.
 * Wraps the app in StrictMode during development to surface
 * potential issues early (double-invocation of effects, etc.).
 */

import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import './index.css';

// ── Mount ──────────────────────────────────────────────────────────────────
const container = document.getElementById('root');

if (!container) {
  throw new Error(
    '[main] Root element #root not found. Check index.html.'
  );
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
