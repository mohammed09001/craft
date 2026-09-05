import { Component, type ErrorInfo, type ReactNode } from "react";

import styles from "@/app/error-boundary/AppErrorBoundary.module.css";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(error, errorInfo);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className={styles.page}>
        <section className={styles.panel} aria-labelledby="error-title">
          <h1 className={styles.title} id="error-title">
            The interface could not continue.
          </h1>
          <p className={styles.description}>
            Reload the page to start the shell again.
          </p>
          <button
            className={styles.reloadButton}
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload
          </button>
        </section>
      </main>
    );
  }
}
