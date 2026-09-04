// Thin fetch wrapper: injects the bearer token, retries exactly once
// after a transparent refresh on 401, and normalizes error bodies (the
// API's error shape is always `{ error: { code, message, fieldErrors? } }`
// — see src/lib/errors.ts and src/middleware/validate.ts on the API side).
import { clearSession, loadSession, updateTokens } from './session';
import type { TokenPair } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// A refresh already in flight is awaited by every concurrent 401 rather
// than each firing its own /auth/refresh call — the API's refresh tokens
// are single-use (see auth/token.service.ts's rotation model), so two
// concurrent refreshes would race: only one wins, and the loser's own
// 401 retry would come back a second time with no way to recover short
// of forcing the user to log in again.
let refreshInFlight: Promise<TokenPair | null> | null = null;

async function refreshSession(): Promise<TokenPair | null> {
  const session = loadSession();
  if (!session) return null;

  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as TokenPair;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  const tokens = await refreshInFlight;
  if (tokens) updateTokens(tokens);
  return tokens;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Internal: set on the retry attempt so a second 401 doesn't loop forever. */
  _isRetry?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = loadSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.accessToken}`;

  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && session && !options._isRetry) {
    const tokens = await refreshSession();
    if (tokens) {
      return apiFetch<T>(path, { ...options, _isRetry: true });
    }
    clearSession();
    // Full reload rather than a router redirect: guarantees every piece
    // of in-memory state built on the now-invalid session is discarded,
    // not just the visible page.
    window.location.href = '/login';
    throw new ApiError('Session expired', 401);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : undefined;

  if (!res.ok) {
    const message = data?.error?.message ?? res.statusText;
    throw new ApiError(message, res.status, data?.error?.code, data?.error?.details?.fieldErrors);
  }

  return data as T;
}
