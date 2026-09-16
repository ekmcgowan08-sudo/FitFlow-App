import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { RoleCode } from '../api/types';

export function RequireAuth() {
  const { user, isLoading, wasSignOutIntent } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!user) {
    // Two different reasons land here, and only one of them should
    // carry "remember where I was": an unauthenticated visit to a
    // protected URL (session expired, a bookmarked deep link, ...)
    // genuinely wants to return to `location` after logging in. An
    // explicit Sign-out click does not — and worse, that `from` state
    // lives on the browser's /login history *entry*, not on this one
    // render, so without this check it would silently survive to
    // redirect whoever logs in *next* on this tab (a different person,
    // even) back to a page that has nothing to do with their session.
    const state = wasSignOutIntent() ? undefined : { from: location };
    return <Navigate to="/login" state={state} replace />;
  }
  return <Outlet />;
}

/** Gate a subtree on holding at least one of the given roles. Backend enforces the real authorization on every request regardless — this only avoids showing UI for actions a request would 403 on. */
export function RequireRole({ roles }: { roles: RoleCode[] }) {
  const { hasRole, isLoading } = useAuth();

  if (isLoading) return <FullPageSpinner />;
  if (!hasRole(...roles)) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center text-slate-500">
      <span className="animate-pulse">Loading…</span>
    </div>
  );
}
