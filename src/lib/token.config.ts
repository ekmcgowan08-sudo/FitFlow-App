// Token lifetime configuration, overridable via env vars for staging/prod
// tuning without a code change.

// `??` only falls back on `undefined`/`null`, not on an empty string — a
// blank `ACCESS_TOKEN_TTL_SECONDS=` in the environment (e.g. an unset
// shell variable interpolated into a .env file) would otherwise become
// `Number("")`, which is `0`, not the intended default. Treat blank the
// same as unset.
function numberEnv(value: string | undefined, fallback: number): number {
  return value === undefined || value === "" ? fallback : Number(value);
}

export const ACCESS_TOKEN_TTL_SECONDS = numberEnv(
  process.env.ACCESS_TOKEN_TTL_SECONDS,
  15 * 60 // 15 minutes
);

export const REFRESH_TOKEN_TTL_DAYS = numberEnv(
  process.env.REFRESH_TOKEN_TTL_DAYS,
  30 // 30 days
);

// Used only by prisma/prune-refresh-tokens.ts, not by request-serving
// code — how long past its own natural expiry a RefreshToken row (used,
// revoked, or reuse-detected) is kept before that script deletes it. The
// row's `expiresAt` doesn't change on early revocation (see
// auth/token.service.ts), so this is time since the token would have
// expired anyway, not time since it was revoked — a revoked-on-day-1
// token from a 30-day TTL still sticks around for the rest of that
// window, keeping a full audit trail for exactly as long as the token
// itself would have been usable.
export const REFRESH_TOKEN_PRUNE_GRACE_DAYS = numberEnv(process.env.REFRESH_TOKEN_PRUNE_GRACE_DAYS, 7);
