import { expect, test } from '@playwright/test';

const SEED_APPLICATION_ID = '00000000-0000-4000-8000-000000000601';

test.describe('visual regression pilot', () => {
  test('keeps Application Detail summary container stable', async ({ page }) => {
    await page.goto(`/symbol-strategy-applications/${SEED_APPLICATION_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const summaryHeading = page.getByRole('heading', { level: 2, name: 'application summary' });
    await expect(summaryHeading).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(SEED_APPLICATION_ID).first()).toBeVisible();

    const summarySection = summaryHeading.locator('xpath=ancestor::section[1]');
    const updatedRow = summarySection.locator('xpath=.//div[strong[normalize-space()="updated:"]]');

    await expect(summarySection).toHaveScreenshot('application-detail-summary.png', {
      animations: 'disabled',
      mask: [updatedRow],
    });
  });
});
