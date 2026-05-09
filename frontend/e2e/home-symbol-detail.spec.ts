import { expect, test, type Locator, type Page } from '@playwright/test';

function extractSymbolName(text: string): string {
  return text.split('価格:')[0].split('数量:')[0].trim();
}

async function pickFirstSymbolLink(page: Page): Promise<Locator | null> {
  const sideRail = page.getByLabel('共通サイドメニュー');
  const watchlistRegion = sideRail.locator('div').filter({
    has: page.getByRole('button', { name: '監視' }),
  });

  const watchlistLinks = watchlistRegion.locator('a[href^="/symbols/"]');
  if ((await watchlistLinks.count()) > 0) {
    return watchlistLinks.first();
  }

  await sideRail.getByRole('button', { name: '保有' }).click();
  const positionLinks = sideRail.locator('a[href^="/symbols/"]');
  if ((await positionLinks.count()) > 0) {
    return positionLinks.first();
  }

  return null;
}

test.describe('Home -> SymbolDetail smoke', () => {
  test('opens Home and navigates to SymbolDetail from a symbol link', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: '北極星' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'マーケット概況' })).toBeVisible();
    await expect(page.getByLabel('共通サイドメニュー')).toBeVisible();

    const symbolLink = await pickFirstSymbolLink(page);
    expect(symbolLink, 'seed または既存データに symbol link が必要です').not.toBeNull();
    if (!symbolLink) return;

    const linkText = (await symbolLink.textContent())?.trim() ?? '';
    const symbolName = extractSymbolName(linkText);
    await symbolLink.click();

    await expect(page).toHaveURL(/\/symbols\/.+/);
    await expect(page.getByRole('link', { name: 'ホームへ戻る' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '現在スナップショット' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '関連参照情報' })).toBeVisible();

    if (symbolName) {
      await expect(page.getByRole('heading', { level: 1 })).toContainText(symbolName);
    }
  });
});
