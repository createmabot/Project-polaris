import { describe, expect, it } from 'vitest';
import {
  buildStrategyVersionDetailUrl,
  buildStrategyVersionsListUrl,
  parseStrategyVersionsListQuery,
} from './StrategyVersionList';
import { parseStrategyVersionsReturnPath } from './StrategyVersionDetail';

describe('strategy versions list -> detail -> list return flow (E2E-like)', () => {
  it('restores page state after explicit return navigation', () => {
    const listUrl = buildStrategyVersionsListUrl('str-1', 2, 'RSI');
    expect(listUrl).toBe('/strategies/str-1/versions?q=RSI&page=2');

    const detailUrl = buildStrategyVersionDetailUrl('str-1', 'ver-10', 2, 'RSI');
    expect(detailUrl).toBe('/strategy-versions/ver-10?return=%2Fstrategies%2Fstr-1%2Fversions%3Fq%3DRSI%26page%3D2');

    const resolvedReturn = parseStrategyVersionsReturnPath(detailUrl, 'str-1');
    expect(resolvedReturn).toBe('/strategies/str-1/versions?q=RSI&page=3');

    const restored = parseStrategyVersionsListQuery(resolvedReturn ?? '/strategies/str-1/versions');
    expect(restored).toEqual({ page: 2, q: 'RSI' });
  });

  it('falls back to null when return path is invalid', () => {
    const detailUrl = '/strategy-versions/ver-10?return=%2Fstrategies%2Fstr-1%2Fversions%2Fextra';
    const resolvedReturn = parseStrategyVersionsReturnPath(detailUrl, 'str-1');
    expect(resolvedReturn).toBeNull();
  });

  it('normalizes invalid page but preserves q when resolving return path', () => {
    const detailUrl = '/strategy-versions/ver-10?return=%2Fstrategies%2Fstr-1%2Fversions%3Fq%3DRSI%26page%3Dabc%26foo%3Dbar';
    const resolvedReturn = parseStrategyVersionsReturnPath(detailUrl, 'str-1');
    expect(resolvedReturn).toBe('/strategies/str-1/versions?q=RSI');
  });
});

