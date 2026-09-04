import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, whoAmI } from '../api/endpoints';
import { clearSession, loadSession, saveSession } from '../api/session';
import type { AuthUser, RoleCode } from '../api/types';

interface AuthState {
  user: AuthUser | null;
  roles: RoleCode[];
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: RoleCode[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<RoleCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      setIsLoading(false);
      return;
    }
    setUser(session.user);
    // Roles aren't stored locally (they can change server-side — an
    // ADMIN granting/revoking a role shouldn't require the affected
    // user to log out and back in to see it take effect), so they're
    // always re-fetched on load rather than cached alongside the token.
    whoAmI()
      .then((me) => setRoles(me.roles))
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    saveSession(result, result.user);
    setUser(result.user);
    const me = await whoAmI();
    setRoles(me.roles);
  }, []);

  const logout = useCallback(async () => {
    const session = loadSession();
    if (session) {
      // Best-effort: an already-expired/invalid refresh token shouldn't
      // block clearing the local session (revokeRefreshToken on the API
      // side is deliberately lenient about this too — see auth.routes.ts).
      await apiLogout(session.refreshToken).catch(() => undefined);
    }
    clearSession();
    setUser(null);
    setRoles([]);
  }, []);

  const hasRole = useCallback((...check: RoleCode[]) => check.some((r) => roles.includes(r)), [roles]);

  return (
    <AuthContext.Provider value={{ user, roles, isLoading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
