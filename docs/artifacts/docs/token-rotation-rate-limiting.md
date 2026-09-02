# Refresh Token Rotation & Rate Limiting

## Why rotation

A long-lived refresh token that never changes is a single high-value
target: steal it once (XSS, a compromised device, a log leak) and it
keeps working until it expires — often weeks later. Rotation means each
refresh token can be used exactly once. Every `/auth/refresh` call
consumes the presented token and issues a brand-new one, so a stolen
token is only useful until the legitimate client's next refresh — and if
the thief uses it first, the legitimate client's next attempt fails
loudly and the whole session family gets revoked (see reuse detection
below).

## How it's implemented

Everything lives in [`rbac/token.service.ts`](../rbac/token.service.ts) and uses the `RefreshToken` model already in `prisma/schema.prisma`:

```prisma
model RefreshToken {
  id         String    @id @default(uuid())
  userId     String
  tokenHash  String    @unique
  revokedAt  DateTime?
  replacedBy String?
  expiresAt  DateTime
  createdAt  DateTime  @default(now())
}
```

- **Refresh tokens are opaque**, not JWTs — 48 random bytes, base64url-encoded. There's no signature to forge and nothing to decode; the only way to use one is to present the exact string.
- **Only a hash is stored.** `tokenHash = HMAC-SHA256(REFRESH_TOKEN_PEPPER, token)`. A database dump alone can't be turned into usable refresh tokens.
- **Issuing** (`issueTokenPair`) creates the new `RefreshToken` row and, if rotating, revokes the old row and links it via `replacedBy` — both writes happen inside one `prisma.$transaction`, so a crash mid-request can never leave two simultaneously-valid tokens for one session.
- **Rotating** (`rotateRefreshToken`, called from `POST /auth/refresh`):
  1. Look up the row by `tokenHash`. Not found → 401.
  2. `revokedAt` already set → **reuse detected**. Revoke every active refresh token for that `userId` and return 401. This is the theft-response: one confirmed reuse nukes the whole session family rather than just the one token.
  3. `expiresAt` in the past → 401.
  4. Account not `active` → 401.
  5. Otherwise, issue a new pair and revoke the presented token in the same transaction.
- **Logging out** (`revokeRefreshToken`) revokes one token, or every token for the user if `allSessions: true` is passed. It's idempotent by design — presenting an unknown/already-revoked token still returns 204, so logout can't be used to fingerprint valid tokens.

## Access token lifetime

Access tokens stay short-lived (`ACCESS_TOKEN_TTL_SECONDS`, default 15
minutes) so that a role change, ban, or account deactivation takes effect
quickly even without revoking anything — `authenticate` (in
`after/auth.middleware.ts`) re-reads the user's roles and status from
Prisma on every request regardless of what the token claims.

## Rate limiting

[`rbac/rate-limit.middleware.ts`](../rbac/rate-limit.middleware.ts) adds three limiters, all forwarding 429s through the same `AppError` → `rbacErrorHandler` pipeline as every other error (see `SECURITY_AUDIT_REPORT.md` §10-12 for why a consistent error contract matters):

| Route | Limit | Key |
|---|---|---|
| `POST /auth/login` | 10 / 15 min | `ip + email` — one IP can't spray-guess many accounts without also tripping the window, and one victim's account can't be locked out from many IPs |
| `POST /auth/refresh` | 30 / 15 min | `ip` — blunts automated replay of a stolen refresh token |
| `POST /auth/register` | 5 / hour | `ip` — limits automated bulk account creation |

Tune these via the `windowMs`/`limit` values in `rate-limit.middleware.ts`, or put a shared store (e.g. Redis, via `rate-limit-redis`) behind `express-rate-limit` once you run more than one API instance — the default in-memory store is per-process and won't share counts across horizontally-scaled pods.

## Testing checklist

- [ ] Login with valid credentials → 200 with a token pair; the refresh token is a new, unused row in `RefreshToken`.
- [ ] Call `/auth/refresh` with that refresh token → 200 with a NEW pair; the original row now has `revokedAt` set and `replacedBy` pointing at the new row.
- [ ] Call `/auth/refresh` again with the ORIGINAL (now-rotated) token → 401, and every refresh token for that user now has `revokedAt` set.
- [ ] Call `/auth/refresh` with an expired token (`expiresAt` in the past) → 401.
- [ ] Call `/auth/logout` with `allSessions: true` → every active token for the user is revoked; subsequent refresh attempts with any of them return 401.
- [ ] Send 11 login requests for the same email within 15 minutes → the 11th returns 429 with `RateLimit-*` headers.
- [ ] Send 31 refresh requests from the same IP within 15 minutes → the 31st returns 429.
