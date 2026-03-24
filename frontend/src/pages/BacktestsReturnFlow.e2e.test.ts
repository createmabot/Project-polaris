import { describe, expect, it } from 'vitest';
import { buildBacktestDetailUrl, buildBacktestsListUrl, parseBacktestsListQuery } from './BacktestList';
import { parseBacktestsReturnPath } from './BacktestDetail';

describe('backtests list -> detail -> list return flow (E2E-like)', () => {
  it('restores q/page after explicit return link navigation', () => {
    const listUrl = buildBacktestsListUrl('ma', 2);
    expect(listUrl).toBe('/backtests?q=ma&page=2');

    const detailUrl = buildBacktestDetailUrl('bt-123', 'ma', 2);
    expect(detailUrl).toBe('/backtests/bt-123?return=%2Fbacktests%3Fq%3Dma%26page%3D2');

    const resolvedReturn = parseBacktestsReturnPath(detailUrl);
    expect(resolvedReturn).toBe('/backtests?q=ma&page=2');

    const restored = parseBacktestsListQuery(resolvedReturn ?? '/backtests');
    expect(restored).toEqual({ q: 'ma', page: 2 });
  });

  it('falls back to /backtests when return is invalid', () => {
    const detailUrl = '/backtests/bt-123?return=%2Fbacktests%2Fanything';
    const resolvedReturn = parseBacktestsReturnPath(detailUrl) ?? '/backtests';

    expect(resolvedReturn).toBe('/backtests');
    expect(parseBacktestsListQuery(resolvedReturn)).toEqual({ q: '', page: 1 });
  });
});

