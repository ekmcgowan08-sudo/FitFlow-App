// Token storage for the dashboard. Kept as its own tiny module (rather
// than inlined in client.ts) so every other module reads/writes tokens
// through one place.
//
// Tradeoff, documented rather than silently accepted: tokens live in
// localStorage, which is readable by any script running on this origin
// (an XSS bug here could exfiltrate them) — the FitFlow API is Bearer-
// token only with no cookie/session support, so there is no httpOnly-
// cookie option available without also changing the API. The blast
// radius is bounded by the API's own design: access tokens expire in
// 15 minutes, and every refresh both rotates the refresh token (single
// use) and detects reuse by revoking every session for the account (see
// src/auth/token.service.ts on the API side) — so a stolen token pair
// is only usable once, briefly, before the legitimate user's own next
// refresh (or the thief's) burns it. Moving to httpOnly cookies + CSRF
// tokens would close this further but is an API-side change, out of
// this dashboard's scope to make unilaterally.
import type { AuthUser, TokenPair } from './types';

const ACCESS_TOKEN_KEY = 'fitflow.accessToken';
const REFRESH_TOKEN_KEY = 'fitflow.refreshToken';
const USER_KEY = 'fitflow.user';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export function loadSession(): Session | null {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  if (!accessToken || !refreshToken || !userRaw) return null;
  try {
    return { accessToken, refreshToken, user: JSON.parse(userRaw) as AuthUser };
  } catch {
    return null;
  }
}

export function saveSession(tokens: TokenPair, user: AuthUser): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateTokens(tokens: TokenPair): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
