import { FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { Button, ErrorBanner, Field, Input, Label } from '../components/ui';

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The single source of truth for "logged in -> leave this page": once
  // `user` is set, render this instead of the form. AuthContext.login()
  // sets `user` before its own awaited whoAmI() call resolves, so this
  // can fire while roles are still loading — that's fine, every route
  // guard re-checks roles independently once they arrive.
  if (user) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      // No navigate() here: `login()` sets `user` on success, which
      // makes the `if (user)` branch above render `<Navigate>` on this
      // component's own next render — a *second*, redundant navigation
      // triggered here would fire later (after login()'s own awaited
      // whoAmI() call resolves) from a component that may have already
      // unmounted via that first redirect. If the user had already
      // clicked through to some other page in the meantime, this stale
      // call would yank them back to "/" out from under them.
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 h-10 w-10 rounded-lg bg-brand-500" />
          <h1 className="text-xl font-semibold text-slate-900">FitFlow Dashboard</h1>
          <p className="text-sm text-slate-500">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <ErrorBanner message={error} />
          <Field>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
