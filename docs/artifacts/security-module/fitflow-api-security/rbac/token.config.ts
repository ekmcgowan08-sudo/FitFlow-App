// rbac/token.config.ts
// Token lifetime configuration, overridable via env vars for staging/prod
// tuning without a code change.

export const ACCESS_TOKEN_TTL_SECONDS = Number(
  process.env.ACCESS_TOKEN_TTL_SECONDS ?? 15 * 60 // 15 minutes
);

export const REFRESH_TOKEN_TTL_DAYS = Number(
  process.env.REFRESH_TOKEN_TTL_DAYS ?? 30 // 30 days
);
