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
