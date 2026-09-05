import { test, expect } from '@playwright/test';
import { login } from './support';

test.describe('authentication', () => {
  test('rejects a bad login with an error, not a crash', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('nobody@fitflow.example');
    await page.locator('#password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('redirects an unauthenticated visitor to /login', async ({ page }) => {
    await page.goto('/admin/members');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('member sees only the "Me" nav section', async ({ page }) => {
    await login(page, 'member@fitflow.example');
    await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Clients' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Members' })).toHaveCount(0);
  });

  test('coach sees the Coaching nav section', async ({ page }) => {
    await login(page, 'coach@fitflow.example');
    await expect(page.getByRole('link', { name: 'My Clients' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Coach Profile' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Members' })).toHaveCount(0);
  });

  test('admin sees the Admin nav section', async ({ page }) => {
    await login(page, 'admin@fitflow.example');
    await expect(page.getByRole('link', { name: 'Members' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Gyms' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Exercises' })).toBeVisible();
  });

  test('signing out returns to login and blocks re-entry to a protected page', async ({ page }) => {
    await login(page, 'member@fitflow.example');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});
