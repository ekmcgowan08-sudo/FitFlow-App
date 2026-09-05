import { test, expect } from '@playwright/test';
import { login } from './support';

test.describe('admin: gym catalog CRUD', () => {
  test('creates, edits, and deletes a gym', async ({ page }) => {
    await login(page, 'admin@fitflow.example');
    await page.getByRole('link', { name: 'Gyms' }).click();
    await expect(page).toHaveURL(/\/admin\/gyms$/);

    const gymName = `E2E Gym ${Date.now()}`;
    await page.getByRole('button', { name: 'Add gym' }).click();
    await page.locator('#gym-name').fill(gymName);
    await page.locator('#gym-city').fill('Portland');
    await page.getByRole('button', { name: 'Create gym' }).click();

    const row = page.locator('tr', { hasText: gymName });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Portland');

    await row.getByRole('button', { name: 'Edit' }).click();
    await page.locator('#gym-city').fill('Seattle');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(row).toContainText('Seattle');

    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('tr', { hasText: gymName })).toHaveCount(0);
  });
});
