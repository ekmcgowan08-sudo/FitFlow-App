import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  // Lets RequireAuth tell "user is null because they just clicked Sign
  // out" apart from "user is null because this is an unauthenticated
  // visit to a protected URL" — see the comment on its call site for
  // why that distinction matters. A plain, *pure* read — no mutation —
  // so it's safe to call from a component's render body. Consciously
  // not "read-and-reset in one call": React 18 StrictMode deliberately
  // double-invokes render functions in development to surface exactly
  // that anti-pattern (a render calling something with a side effect),
  // and a read-and-reset here would make the first, discarded
  // invocation consume the flag before the second, real one ever saw
  // it — reintroducing this bug intermittently, only in dev, in a way
  // that looks like nothing changed. The flag is instead reset by
  // `login()` itself (an event-handler context, not a render), once a
  // new session actually starts.
  wasSignOutIntent: () => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<RoleCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const signOutIntentRef = useRef(false);

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
    // A new session has now genuinely started — whatever "we just came
    // from a sign-out" meant is no longer relevant to anything that
    // happens from here on, including this same tab's *next* sign-out
    // (which will set the flag fresh when it happens).
    signOutIntentRef.current = false;
  }, []);

  const logout = useCallback(async () => {
    signOutIntentRef.current = true;
    const session = loadSession();
    // Clear the LOCAL session synchronously, before the network call
    // below - not after it. Confirmed with a standalone Playwright
    // repro: this function is a fire-and-forget promise at every call
    // site (`onClick={() => void logout()}`), and the very next thing a
    // caller typically does is navigate (e.g. an E2E test's login()
    // helper calling page.goto('/login') right after clicking Sign
    // out). That navigation actively aborts this function's in-flight
    // apiLogout() fetch (net::ERR_ABORTED) - and if the abort's rejection
    // doesn't get processed before the navigation finishes tearing down
    // this page's JS context, clearSession() below would simply never
    // run, leaving the old tokens in localStorage. A subsequent load of
    // any page then finds a still-"valid" session and logs the
    // signed-out user right back in. Clearing state before the await
    // removes the race entirely rather than narrowing its window: there
    // is no async gap left for a navigation to land in between the
    // click and the local session actually being cleared.
    clearSession();
    setUser(null);
    setRoles([]);
    if (session) {
      // Best-effort: an already-expired/invalid refresh token shouldn't
      // block clearing the local session (revokeRefreshToken on the API
      // side is deliberately lenient about this too — see auth.routes.ts).
      await apiLogout(session.refreshToken).catch(() => undefined);
    }
  }, []);

  const hasRole = useCallback((...check: RoleCode[]) => check.some((r) => roles.includes(r)), [roles]);

  const wasSignOutIntent = useCallback(() => signOutIntentRef.current, []);

  return (
    <AuthContext.Provider value={{ user, roles, isLoading, login, logout, hasRole, wasSignOutIntent }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
