import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import * as endpoints from '../api/endpoints';
import { loadSession, saveSession } from '../api/session';
import type { AuthUser, TokenPair } from '../api/types';

const USER: AuthUser = { id: 'user-1', email: 'member@fitflow.example' };
const TOKENS: TokenPair = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  tokenType: 'Bearer',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
};

// A tiny consumer that exposes AuthContext's state/actions as plain
// text/buttons - simpler and more representative than calling hooks
// outside a component, and it's what real call sites (LoginPage,
// Layout's Sign-out button, RequireAuth) actually do.
function Probe() {
  const { user, login, logout, wasSignOutIntent } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.email : 'signed-out'}</span>
      <span data-testid="sign-out-intent">{String(wasSignOutIntent())}</span>
      <button onClick={() => void login(USER.email, 'demo-password-123')}>Sign in</button>
      <button onClick={() => void logout()}>Sign out</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('AuthContext.logout', () => {
  it('clears the local session synchronously, before the network revocation call resolves', async () => {
    saveSession(TOKENS, USER);

    // The exact regression this guards against: a caller (e.g. a
    // navigation right after the Sign-out click) that runs before the
    // awaited apiLogout() network call ever settles must still see the
    // local session already gone. Modeled with a deliberately
    // never-resolving apiLogout() - if clearSession() happened after
    // that await instead of before it, this promise would still be
    // pending and the assertions below would see a stale session.
    let releaseLogoutCall: () => void = () => {};
    const logoutCallPending = new Promise<void>((resolve) => {
      releaseLogoutCall = resolve;
    });
    vi.spyOn(endpoints, 'logout').mockReturnValue(logoutCallPending as Promise<void>);
    // AuthProvider's mount effect calls whoAmI() to re-fetch roles for a
    // restored session (see its own comment on why). Left unmocked, that
    // real fetch() rejects in jsdom (no server), and its own .catch()
    // clears the session independently of anything logout() does -
    // which would make this test pass no matter how logout() is
    // ordered. Mocking it out removes that confound.
    vi.spyOn(endpoints, 'whoAmI').mockResolvedValue({ ...USER, roles: ['USER'] });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent(USER.email));

    await act(async () => {
      screen.getByRole('button', { name: 'Sign out' }).click();
      // Yield one microtask turn - enough for logout()'s synchronous
      // prefix (clearSession/setUser/setRoles) to run and for React to
      // flush the resulting state update, but nowhere near enough for
      // the still-pending apiLogout() call above to resolve.
      await Promise.resolve();
    });

    expect(loadSession()).toBeNull();
    expect(screen.getByTestId('user')).toHaveTextContent('signed-out');

    releaseLogoutCall();
  });

  it('exposes wasSignOutIntent() as true immediately after logout, reset by the next login', async () => {
    saveSession(TOKENS, USER);
    vi.spyOn(endpoints, 'logout').mockResolvedValue(undefined);
    vi.spyOn(endpoints, 'login').mockResolvedValue({ user: USER, ...TOKENS });
    vi.spyOn(endpoints, 'whoAmI').mockResolvedValue({ ...USER, roles: ['USER'] });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent(USER.email));

    await act(async () => {
      screen.getByRole('button', { name: 'Sign out' }).click();
    });
    expect(screen.getByTestId('sign-out-intent')).toHaveTextContent('true');

    await act(async () => {
      screen.getByRole('button', { name: 'Sign in' }).click();
    });
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent(USER.email));
    expect(screen.getByTestId('sign-out-intent')).toHaveTextContent('false');
  });
});
