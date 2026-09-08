import { test, expect } from '@playwright/test';
import { login, registerTestUser, API_BASE_URL, DEMO_PASSWORD } from './support';

test.describe('workout and nutrition log views', () => {
  test('shows a logged workout and a logged meal, and deletes them', async ({ page, request }) => {
    const member = await registerTestUser(request, 'e2e-logs');

    const loginRes = await request.post(`${API_BASE_URL}/v1/auth/login`, {
      data: { email: member.email, password: DEMO_PASSWORD },
    });
    const { accessToken } = await loginRes.json();
    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    // Seed one workout log and one nutrition log directly through the
    // API — day-to-day logging is a mobile-client flow (see web/README.md),
    // so the dashboard only ever reads/deletes this data, never creates it.
    const workoutRes = await request.post(`${API_BASE_URL}/v1/workout-logs`, {
      headers: authHeaders,
      data: {
        memberId: member.id,
        exerciseName: 'E2E Deadlift',
        category: 'STRENGTH',
        sets: 3,
        reps: 5,
        durationMinutes: 20,
        loggedAt: new Date().toISOString(),
      },
    });
    expect(workoutRes.ok()).toBeTruthy();

    const mealRes = await request.post(`${API_BASE_URL}/v1/nutrition-logs`, {
      headers: authHeaders,
      data: {
        userId: member.id,
        loggedAt: new Date().toISOString(),
        mealType: 'dinner',
        itemName: 'E2E Salmon Bowl',
        calories: 550,
      },
    });
    expect(mealRes.ok()).toBeTruthy();

    await login(page, member.email);

    await page.getByRole('link', { name: 'Workout Logs' }).click();
    const workoutRow = page.locator('tr', { hasText: 'E2E Deadlift' });
    await expect(workoutRow).toContainText('completed');
    page.once('dialog', (dialog) => dialog.accept());
    await workoutRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('tr', { hasText: 'E2E Deadlift' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Nutrition Logs' }).click();
    const mealRow = page.locator('tr', { hasText: 'E2E Salmon Bowl' });
    await expect(mealRow).toContainText('dinner');
    await expect(mealRow).toContainText('550');
    page.once('dialog', (dialog) => dialog.accept());
    await mealRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('tr', { hasText: 'E2E Salmon Bowl' })).toHaveCount(0);
    await expect(page.getByText('No nutrition logs yet.')).toBeVisible();
  });
});
