import { test, expect } from '@playwright/test';
import { login, registerTestUser } from './support';

test.describe('member self-service', () => {
  test('can edit their profile and manage a goal', async ({ page, request }) => {
    const member = await registerTestUser(request, 'e2e-self-service');
    await login(page, member.email);

    await page.getByRole('link', { name: 'My Profile' }).click();
    await page.locator('#full-name').fill('E2E Test Athlete');
    await page.locator('#height').fill('182');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Profile updated.')).toBeVisible();

    await page.getByRole('link', { name: 'My Goals' }).click();
    await page.getByRole('button', { name: 'Add goal' }).click();
    const goalTitle = `Bench 100kg ${Date.now()}`;
    await page.locator('#goal-title').fill(goalTitle);
    await page.getByRole('button', { name: 'Create goal' }).click();

    const row = page.locator('tr', { hasText: goalTitle });
    await expect(row).toContainText('active');

    await row.getByRole('button', { name: 'Mark achieved' }).click();
    await expect(row).toContainText('achieved');

    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('tr', { hasText: goalTitle })).toHaveCount(0);
  });
});
