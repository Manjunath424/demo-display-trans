/**
 * ErrorBoundary.jsx — React class-based error boundary
 *
 * Catches synchronous render errors in the component tree below it
 * and renders a friendly fallback UI instead of a blank screen.
 *
 * Security: stack traces and component stacks are NEVER shown to the user
 * in production.  They are logged to the console (where only developers
 * with DevTools open can see them) and can be sent to a monitoring service.
 */

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError:  false,
      errorId:   null,    // a random ID for support reference
    };
  }

  static getDerivedStateFromError() {
    // Generate a short random ID for this error instance
    const errorId = Math.random().toString(36).slice(2, 9).toUpperCase();
    return { hasError: true, errorId };
  }

  componentDidCatch(error, info) {
    // Safe to log in console — stack trace not shown in the UI
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);

    // TODO: send to monitoring service (Sentry, Datadog, etc.)
    // reportError({ error, componentStack: info.componentStack });
  }

  handleReset = () => {
    this.setState({ hasError: false, errorId: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-muted p-4">
          <div className="card max-w-lg w-full p-8 text-center animate-fade-in">
            {/* Icon */}
            <div className="w-20 h-20 bg-danger-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-danger-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Something went wrong
            </h1>
            <p className="text-slate-500 mb-1 text-sm leading-relaxed">
              An unexpected error occurred. Our team has been notified.
              Please try refreshing the page.
            </p>
            <p className="text-xs text-slate-400 mb-8 font-mono">
              Reference: {this.state.errorId}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="btn-primary"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.replace('/')}
                className="btn-secondary"
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
