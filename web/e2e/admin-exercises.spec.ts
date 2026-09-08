import { test, expect } from '@playwright/test';
import { login } from './support';

test.describe('admin: exercise catalog CRUD', () => {
  test('creates, edits, and deletes an exercise', async ({ page }) => {
    await login(page, 'admin@fitflow.example');
    await page.getByRole('link', { name: 'Exercises' }).click();

    const name = `E2E Cable Row ${Date.now()}`;
    await page.getByRole('button', { name: 'Add exercise' }).click();
    await page.locator('#ex-name').fill(name);
    await page.locator('#ex-category').selectOption('strength');
    await page.locator('#ex-equipment').fill('Cable machine');
    await page.getByRole('button', { name: 'Create exercise' }).click();

    const row = page.locator('tr', { hasText: name });
    await expect(row).toContainText('strength');
    await expect(row).toContainText('Cable machine');

    await row.getByRole('button', { name: 'Edit' }).click();
    await page.locator('#ex-category').selectOption('mobility');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(row).toContainText('mobility');

    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('tr', { hasText: name })).toHaveCount(0);
  });
});
