import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('App route definitions', () => {
  it('keeps Home route at / and walkthrough alias at /home', () => {
    const appSource = readFileSync(resolve(__dirname, 'App.tsx'), 'utf-8');
    expect(appSource).toContain('<Route path="/" component={Home} />');
    expect(appSource).toContain('<Route path="/home" component={Home} />');
  });

  it('keeps legacy management routes outside primary navigation', () => {
    const appSource = readFileSync(resolve(__dirname, 'App.tsx'), 'utf-8');
    const navigationSource = readFileSync(resolve(__dirname, 'components/layout/Navigation.tsx'), 'utf-8');

    expect(appSource).toContain('<Route path="/watchlist" component={WatchlistManage} />');
    expect(appSource).toContain('<Route path="/positions" component={PositionsManage} />');
    expect(navigationSource).not.toContain("href: '/watchlist'");
    expect(navigationSource).not.toContain("href: '/positions'");
    expect(navigationSource).not.toContain('監視銘柄管理');
    expect(navigationSource).not.toContain('保有銘柄管理');
  });
});
