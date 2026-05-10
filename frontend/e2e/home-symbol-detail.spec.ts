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

async function pickSeedSymbolLink(page: Page): Promise<Locator | null> {
  const response = await page.request.get('/api/home?summary_type=latest');
  if (!response.ok()) {
    return pickFirstSymbolLink(page);
  }

  const payload = await response.json();
  const watchlistSymbols = payload?.data?.watchlist_symbols ?? [];
  const seedSymbol = watchlistSymbols.find((symbol: { tradingview_symbol?: string }) => symbol.tradingview_symbol === 'TSE:7203')
    ?? watchlistSymbols[0];
  const symbolId = seedSymbol?.symbol_id;
  if (!symbolId) {
    return pickFirstSymbolLink(page);
  }

  const link = page.locator(`a[href="/symbols/${symbolId}"]`).first();
  return (await link.count()) > 0 ? link : pickFirstSymbolLink(page);
}

async function openHomeAndWaitUntilReady(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { level: 2, name: '日次確認の見方' })).toBeVisible({ timeout: 15000 });
}

test.describe('Home -> SymbolDetail smoke', () => {
  test('opens Home and navigates to SymbolDetail from a symbol link', async ({ page }) => {
    await openHomeAndWaitUntilReady(page);

    await expect(page.getByRole('heading', { level: 1, name: '北極星' })).toBeVisible({ timeout: 15000 });
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

  test('keeps the P3 read-only navigation path available', async ({ page }) => {
    await openHomeAndWaitUntilReady(page);

    const symbolLink = await pickSeedSymbolLink(page);
    expect(symbolLink, 'seed data should provide a SideRail symbol link for the read-only scenario').not.toBeNull();
    if (!symbolLink) return;

    await symbolLink.click();

    await expect(page).toHaveURL(/\/symbols\/.+/);
    await expect(page.getByRole('heading', { level: 2, name: 'ストラテジー / 検証結果' })).toBeVisible({ timeout: 15000 });

    const strategyDetailLink = page.getByRole('link', { name: 'StrategyDetail を開く' }).first();
    await expect(strategyDetailLink).toBeVisible({ timeout: 15000 });
    await strategyDetailLink.click();

    await expect(page).toHaveURL(/\/strategies\/.+/);
    await expect(page.getByText('strategy_id:')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('application:')).toBeVisible();

    const backtestLink = page.locator('a[href^="/backtests/"]').first();
    await expect(backtestLink).toBeVisible({ timeout: 15000 });
    await backtestLink.click();

    await expect(page).toHaveURL(/\/backtests\/.+/);
    await expect(page.getByText('application ID:')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('run ID:')).toBeVisible();
    await expect(page.locator('a[href^="/symbols/"]').first()).toBeVisible();
    await expect(page.locator('a[href^="/strategies/"]').first()).toBeVisible();
    await expect(page.locator('a[href^="/strategy-versions/"]').first()).toBeVisible();
  });
});
