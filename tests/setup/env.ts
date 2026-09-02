// tests/setup/env.ts
// Loaded by Jest (see jest.config.js `setupFiles`) BEFORE any test module
// is imported, so lib/env.ts's `requireEnv()` calls at import time never
// throw for a missing secret in the test environment.

process.env.JWT_ACCESS_SECRET ??= "test-only-access-secret-do-not-use-in-prod";
process.env.REFRESH_TOKEN_PEPPER ??= "test-only-refresh-pepper-do-not-use-in-prod";
process.env.JWT_ISSUER ??= "fitflow-suite-test";
process.env.JWT_AUDIENCE ??= "fitflow-suite-api-test";
process.env.ACCESS_TOKEN_TTL_SECONDS ??= "900";
process.env.REFRESH_TOKEN_TTL_DAYS ??= "30";
