import { test, expect } from '@playwright/test';
import { login, registerTestUser, grantCoachRole } from './support';

// This is the flow that most needed an E2E test in the first place: a
// coach-initiated request and a client's acceptance of it happen in two
// different accounts' UIs, and the only way either of them learns the
// other acted is by the state actually round-tripping through the real
// API. A unit test per-component can't catch a mismatch here; this can.
test.describe('coach ↔ client coaching relationship', () => {
  test('a coach can request a client, and the client can accept it', async ({ page, request }) => {
    const coach = await registerTestUser(request, 'e2e-coach');
    await grantCoachRole(coach.id);
    const member = await registerTestUser(request, 'e2e-member');

    await login(page, coach.email);
    await page.getByRole('link', { name: 'My Clients' }).click();
    await page.getByRole('button', { name: 'Request a new client' }).click();
    await page.locator('#client-id').fill(member.id);
    await page.getByRole('button', { name: 'Send request' }).click();

    const coachRow = page.locator('tr', { hasText: member.email });
    await expect(coachRow).toContainText('pending');

    await page.getByRole('button', { name: 'Sign out' }).click();

    await login(page, member.email);
    await page.getByRole('link', { name: 'My Coaches' }).click();
    const memberRow = page.locator('tr', { hasText: coach.email });
    await expect(memberRow).toContainText('pending');

    await memberRow.getByRole('button', { name: 'Accept' }).click();
    await expect(memberRow).toContainText('active');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await login(page, coach.email);
    await page.getByRole('link', { name: 'My Clients' }).click();
    await expect(page.locator('tr', { hasText: member.email })).toContainText('active');
  });
});
