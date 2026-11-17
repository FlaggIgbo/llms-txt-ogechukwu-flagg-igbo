import React, { Component, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Catches unhandled errors in child component trees and displays a recovery UI.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReturnToDirectory = (): void => {
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReturnToDirectory);
      }

      return (
        <div className="error-boundary-container" role="alert">
          <div className="error-boundary-card">
            <h2 className="error-boundary-title">Something went wrong</h2>
            <p className="error-boundary-message">{this.state.error.message}</p>
            <button
              type="button"
              className="error-boundary-btn"
              onClick={this.handleReturnToDirectory}
            >
              Return to Directory
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
