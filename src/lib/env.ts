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

// Comma-separated browser origins allowed to call this API with
// credentials (the web dashboard in web/, plus any deployment of it) —
// see src/lib/cors.ts. Empty/unset means "no browser origin is
// allowed," not "allow everything": this API is Bearer-token
// authenticated (no cookies), so a same-origin default would silently
// break every non-browser client (mobile apps, curl, server-to-server)
// that never sends an Origin header in the first place — cors() only
// ever applies to requests that do.
export const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
