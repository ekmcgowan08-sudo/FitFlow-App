import { test, expect } from '@playwright/test';
import { login, registerTestUser } from './support';

test.describe('admin: role management', () => {
  test('grants and revokes a role from a member detail page', async ({ page, request }) => {
    const member = await registerTestUser(request, 'e2e-role-target');

    await login(page, 'admin@fitflow.example');
    await page.goto(`/admin/members/${member.id}`);

    // Starts as a plain USER — no remove button on a lone role.
    const userPill = page.locator('span', { hasText: 'USER' }).first();
    await expect(userPill).toBeVisible();

    await page.getByRole('combobox').selectOption('COACH');
    await page.getByRole('button', { name: 'Add role' }).click();

    const coachPill = page.locator('span', { hasText: 'COACH' }).first();
    await expect(coachPill).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await coachPill.getByRole('button', { name: 'Remove COACH role' }).click();
    await expect(page.locator('span', { hasText: 'COACH' })).toHaveCount(0);
  });

  test('an admin cannot remove their own ADMIN role from the UI', async ({ page }) => {
    // Uses the seeded admin@fitflow.example account directly — this
    // check is about the UI's self-view, not about setting up a fresh
    // admin, so there's nothing to gain from registering a new one.
    await login(page, 'admin@fitflow.example');
    const meId = await page.evaluate(() => JSON.parse(localStorage.getItem('fitflow.user') ?? '{}').id as string);

    await page.goto(`/admin/members/${meId}`);
    const adminPill = page.locator('span', { hasText: 'ADMIN' }).first();
    await expect(adminPill).toBeVisible();
    // No remove ("×") button on ADMIN when viewing your own account —
    // the UI mirrors the API's self-lockout guard rather than offering
    // a button that would just 403.
    await expect(adminPill.getByRole('button', { name: 'Remove ADMIN role' })).toHaveCount(0);
  });
});
