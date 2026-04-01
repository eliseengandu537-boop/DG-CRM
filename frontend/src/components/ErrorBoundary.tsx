'use client';

import React, { ReactNode } from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  level?: 'page' | 'section' | 'component';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorCount: 0,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to monitoring service
    console.error('Error caught by boundary:', error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to monitoring service (Sentry, LogRocket, etc.)
    if (typeof window !== 'undefined' && (window as any).errorReporter) {
      (window as any).errorReporter.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }

    this.setState(prev => ({
      errorCount: prev.errorCount + 1,
    }));
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorCount: 0,
    });
  };

  render() {
    if (this.state.hasError) {
      const { fallback, level = 'component' } = this.props;
      const { error, errorCount } = this.state;

      if (fallback) {
        return fallback;
      }

      const isPageLevel = level === 'page';
      const isSectionLevel = level === 'section';

      return (
        <div
          className={`
            border-l-4 border-red-500 bg-red-50
            ${isPageLevel ? 'min-h-screen p-8' : isSectionLevel ? 'p-6 rounded-lg' : 'p-4 rounded-lg'}
          `}
        >
          <div className="flex gap-4">
            <FiAlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={24} />
            <div className="flex-1">
              <h2 className={`font-bold text-red-900 ${isPageLevel ? 'text-2xl' : 'text-lg'} mb-2`}>
                Something went wrong
              </h2>

              {isPageLevel && (
                <p className="text-red-800 mb-4">
                  We encountered an unexpected error. Our team has been notified.
                </p>
              )}

              {!isPageLevel && (
                <p className="text-red-800 text-sm mb-3">
                  {error?.message || 'An unexpected error occurred while loading this section.'}
                </p>
              )}

              {process.env.NODE_ENV === 'development' && (
                <details className="mt-4 text-xs bg-white rounded p-3 border border-red-200">
                  <summary className="cursor-pointer font-mono text-red-700 mb-2">
                    Error Details (Development Only)
                  </summary>
                  <pre className="whitespace-pre-wrap overflow-auto text-red-600 font-mono max-h-48">
                    {error?.toString()}
                  </pre>
                </details>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={this.handleReset}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <FiRefreshCw size={18} />
                  Try Again
                </button>

                {isPageLevel && (
                  <button
                    onClick={() => (window.location.href = '/')}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Back to Home
                  </button>
                )}
              </div>

              {errorCount > 3 && (
                <p className="text-xs text-red-700 mt-3">
                  ⚠️ Multiple errors detected. Please refresh the page or contact support.
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
