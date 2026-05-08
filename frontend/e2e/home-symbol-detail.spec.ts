import { expect, test, type Locator, type Page } from '@playwright/test';

async function pickFirstSymbolLink(page: Page): Promise<Locator | null> {
  const watchlistSection = page.locator('section', {
    has: page.getByRole('heading', { name: '監視銘柄' }),
  });
  const positionsSection = page.locator('section', {
    has: page.getByRole('heading', { name: '保有銘柄' }),
  });

  const watchlistLinks = watchlistSection.locator('a[href^="/symbols/"]');
  if ((await watchlistLinks.count()) > 0) {
    return watchlistLinks.first();
  }

  const positionLinks = positionsSection.locator('a[href^="/symbols/"]');
  if ((await positionLinks.count()) > 0) {
    return positionLinks.first();
  }

  return null;
}

test.describe('Home -> SymbolDetail smoke', () => {
  test('opens Home and navigates to SymbolDetail from a symbol link', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: '北極星' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '監視銘柄' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '保有銘柄' })).toBeVisible();

    const symbolLink = await pickFirstSymbolLink(page);
    expect(symbolLink, 'seed または既存データに symbol link が必要です').not.toBeNull();
    if (!symbolLink) return;

    const linkText = (await symbolLink.textContent())?.trim() ?? '';
    await symbolLink.click();

    await expect(page).toHaveURL(/\/symbols\/.+/);
    await expect(page.getByRole('link', { name: 'ホームへ戻る' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '現在スナップショット' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '関連参照情報' })).toBeVisible();

    if (linkText) {
      await expect(page.getByRole('heading', { level: 1 })).toContainText(linkText);
    }
  });
});
