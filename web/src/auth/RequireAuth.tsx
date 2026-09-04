import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { RoleCode } from '../api/types';

export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
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
