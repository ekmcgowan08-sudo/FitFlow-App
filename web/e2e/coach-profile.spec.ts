import { test, expect } from '@playwright/test';
import { login, registerTestUser, grantCoachRole } from './support';

test.describe('coach: public profile and specialties', () => {
  test('creates a profile and manages specialties', async ({ page, request }) => {
    const coach = await registerTestUser(request, 'e2e-coach-profile');
    await grantCoachRole(coach.id);
    await login(page, coach.email);

    await page.getByRole('link', { name: 'Coach Profile' }).click();
    await expect(page.getByRole('button', { name: 'Create profile' })).toBeVisible();

    const displayName = `E2E Coach ${Date.now()}`;
    await page.locator('#display-name').fill(displayName);
    await page.getByRole('button', { name: 'Create profile' }).click();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
    await expect(page.getByText('No specialties added yet.')).toBeVisible();

    await page.getByPlaceholder('e.g. Powerlifting').fill('Powerlifting');
    await page.getByRole('button', { name: 'Add' }).click();
    const specialtyPill = page.locator('span', { hasText: 'Powerlifting' }).first();
    await expect(specialtyPill).toBeVisible();

    await specialtyPill.getByRole('button').click();
    await expect(page.locator('span', { hasText: 'Powerlifting' })).toHaveCount(0);
    await expect(page.getByText('No specialties added yet.')).toBeVisible();
  });
});
