// Shared helpers for the E2E suite. These tests exercise the real
// dashboard against a real running API + Postgres (see e2e/README.md) —
// no mocking, matching how this dashboard was actually verified during
// development.
import { Page, APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

export const DEMO_PASSWORD = 'demo-password-123';
export const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://localhost:3000';

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');
}

/** Registers a brand-new account through the real API (not the UI — there's no self-serve signup page in this dashboard, deliberately, see the root README). */
export async function registerTestUser(request: APIRequestContext, emailPrefix: string) {
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await request.post(`${API_BASE_URL}/v1/auth/register`, {
    data: { email, password: DEMO_PASSWORD },
  });
  if (!res.ok()) throw new Error(`Failed to register test user: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return { email, id: body.user.id as string };
}

/**
 * Grants the COACH role directly via Postgres. There's deliberately no
 * API path to self-assign a role (see src/auth/auth.routes.ts on the
 * API side — registration always hands out USER, and nothing else in
 * the API can add COACH), so a test that needs a fresh coach account has
 * no choice but to reach past the API the same way a human operator
 * would (e.g. an internal admin tool, or a one-off SQL script) — this is
 * exactly what this session did by hand via psql throughout the
 * dashboard's own development.
 */
export async function grantCoachRole(userId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL must be set for e2e tests that need to grant roles directly (same connection string the API itself uses).',
    );
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`INSERT INTO roles (code) VALUES ('COACH') ON CONFLICT (code) DO NOTHING`);
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE code = 'COACH'
       ON CONFLICT DO NOTHING`,
      [userId],
    );
  } finally {
    await client.end();
  }
}
