import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Card } from './ui';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// A class component because React's error-boundary lifecycle methods
// (getDerivedStateFromError/componentDidCatch) have no hook equivalent —
// this is the one place in the dashboard that can't be a function
// component. Without this, an unhandled render error anywhere in the
// tree (unexpected API response shape, a third-party bug, ...) would
// unmount the whole app and leave the user staring at a blank white
// page with no way back short of a manual URL edit.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in dashboard UI:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <Card className="max-w-md p-6 text-center">
            <h1 className="mb-2 text-lg font-semibold text-slate-900">Something went wrong</h1>
            <p className="mb-4 text-sm text-slate-500">
              This page hit an unexpected error. Reloading usually fixes it; if it keeps happening, let an admin
              know.
            </p>
            <Button onClick={() => window.location.assign('/')}>Reload</Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
