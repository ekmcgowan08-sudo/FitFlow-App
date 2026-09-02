// rbac/env.ts
// Single source of truth for auth-related configuration. Fails at import
// time (process startup) if a required secret is missing, rather than
// falling back to an insecure default at request time.

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const JWT_ACCESS_SECRET = requireEnv("JWT_ACCESS_SECRET");

// HMAC pepper used to hash refresh tokens before they're stored in
// RefreshToken.tokenHash. Kept separate from JWT_ACCESS_SECRET so
// rotating one never invalidates the other.
export const REFRESH_TOKEN_PEPPER = requireEnv("REFRESH_TOKEN_PEPPER");

export const JWT_ISSUER = process.env.JWT_ISSUER ?? "fitflow-suite";
export const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "fitflow-suite-api";
