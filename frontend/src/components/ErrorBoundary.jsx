import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Prevent an unexpected React render error from replacing the entire page
 * with a blank screen. The original error is still written to the console
 * so it can be diagnosed instead of silently hidden.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('TicketsTracker render error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || 'An unexpected interface error occurred.';
      return (
        <main className="runtime-error-screen">
          <section className="runtime-error-card" role="alert">
            <div className="runtime-error-icon"><AlertTriangle size={23} /></div>
            <p className="runtime-error-eyebrow">TICKETSTRACKER</p>
            <h1>The dashboard hit an unexpected error.</h1>
            <p className="runtime-error-copy">
              Your saved tracking sessions have not been deleted. Reload the page to try again.
            </p>
            <details className="runtime-error-details">
              <summary>Technical details</summary>
              <code>{message}</code>
            </details>
            <button type="button" className="runtime-error-button" onClick={this.handleReload}>
              <RefreshCw size={15} /> Reload dashboard
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
