import { describe, expect, it } from 'vitest';
import {
  buildStrategyVersionDetailUrl,
  buildStrategyVersionsListUrl,
  parseStrategyVersionsListQuery,
} from './StrategyVersionList';
import { parseStrategyVersionsReturnPath } from './StrategyVersionDetail';

describe('strategy versions list -> detail -> list return flow (E2E-like)', () => {
  it('restores page state after explicit return navigation', () => {
    const listUrl = buildStrategyVersionsListUrl('str-1', 2, 'RSI', 'generated', 'updated_at', 'asc');
    expect(listUrl).toBe('/strategies/str-1/versions?q=RSI&status=generated&sort=updated_at&order=asc&page=2');

    const detailUrl = buildStrategyVersionDetailUrl('str-1', 'ver-10', 2, 'RSI', 'generated', 'updated_at', 'asc');
    expect(detailUrl).toBe('/strategy-versions/ver-10?return=%2Fstrategies%2Fstr-1%2Fversions%3Fq%3DRSI%26status%3Dgenerated%26sort%3Dupdated_at%26order%3Dasc%26page%3D2');

    const resolvedReturn = parseStrategyVersionsReturnPath(detailUrl, 'str-1');
    expect(resolvedReturn).toBe('/strategies/str-1/versions?q=RSI&status=generated&page=2&sort=updated_at&order=asc');

    const restored = parseStrategyVersionsListQuery(resolvedReturn ?? '/strategies/str-1/versions');
    expect(restored).toEqual({ page: 2, q: 'RSI', status: 'generated', sort: 'updated_at', order: 'asc' });
  });

  it('falls back to null when return path is invalid', () => {
    const detailUrl = '/strategy-versions/ver-10?return=%2Fstrategies%2Fstr-1%2Fversions%2Fextra';
    const resolvedReturn = parseStrategyVersionsReturnPath(detailUrl, 'str-1');
    expect(resolvedReturn).toBeNull();
  });

  it('normalizes invalid page but preserves q when resolving return path', () => {
    const detailUrl = '/strategy-versions/ver-10?return=%2Fstrategies%2Fstr-1%2Fversions%3Fq%3DRSI%26status%3Dgenerated%26sort%3Dupdated_at%26order%3Dasc%26page%3Dabc%26foo%3Dbar';
    const resolvedReturn = parseStrategyVersionsReturnPath(detailUrl, 'str-1');
    expect(resolvedReturn).toBe('/strategies/str-1/versions?q=RSI&status=generated&sort=updated_at&order=asc');
  });

  it('keeps review-target list state (q/page/status/sort/order) after explicit return navigation', () => {
    const listUrl = buildStrategyVersionsListUrl('str-1', 3, 'RSI', 'generated', 'updated_at', 'asc');
    expect(listUrl).toBe('/strategies/str-1/versions?q=RSI&status=generated&sort=updated_at&order=asc&page=3');

    // A "要確認差分" row uses the same detail link builder and must preserve list state.
    const detailUrl = buildStrategyVersionDetailUrl('str-1', 'ver-review-target', 3, 'RSI', 'generated', 'updated_at', 'asc');
    expect(detailUrl).toContain('/strategy-versions/ver-review-target?return=');

    const resolvedReturn = parseStrategyVersionsReturnPath(detailUrl, 'str-1');
    expect(resolvedReturn).toBe('/strategies/str-1/versions?q=RSI&status=generated&page=3&sort=updated_at&order=asc');

    const restored = parseStrategyVersionsListQuery(resolvedReturn ?? '/strategies/str-1/versions');
    expect(restored).toEqual({ page: 3, q: 'RSI', status: 'generated', sort: 'updated_at', order: 'asc' });
  });

  it('keeps list state after forward validation note editing flow on detail page', () => {
    const listUrl = buildStrategyVersionsListUrl('str-9', 2, 'MA', 'draft', 'updated_at', 'asc');
    expect(listUrl).toBe('/strategies/str-9/versions?q=MA&status=draft&sort=updated_at&order=asc&page=2');

    const detailUrl = buildStrategyVersionDetailUrl('str-9', 'ver-note-1', 2, 'MA', 'draft', 'updated_at', 'asc');
    expect(detailUrl).toContain('/strategy-versions/ver-note-1?return=');

    // ノート保存は同一 detail URL 上で完結するため、return の復帰先は変わらない。
    const detailUrlAfterNoteSave = detailUrl;
    const resolvedReturn = parseStrategyVersionsReturnPath(detailUrlAfterNoteSave, 'str-9');
    expect(resolvedReturn).toBe('/strategies/str-9/versions?q=MA&status=draft&page=2&sort=updated_at&order=asc');

    const restored = parseStrategyVersionsListQuery(resolvedReturn ?? '/strategies/str-9/versions');
    expect(restored).toEqual({ page: 2, q: 'MA', status: 'draft', sort: 'updated_at', order: 'asc' });
  });

  it('keeps list query state for note-flagged target row after explicit return navigation', () => {
    const listUrl = buildStrategyVersionsListUrl('str-11', 4, 'RSI', 'generated', 'updated_at', 'desc');
    expect(listUrl).toBe('/strategies/str-11/versions?q=RSI&status=generated&sort=updated_at&page=4');

    // "検証ノートあり" row should use the same return-flow contract as other rows.
    const detailUrl = buildStrategyVersionDetailUrl('str-11', 'ver-note-flagged', 4, 'RSI', 'generated', 'updated_at', 'desc');
    const resolvedReturn = parseStrategyVersionsReturnPath(detailUrl, 'str-11');
    expect(resolvedReturn).toBe('/strategies/str-11/versions?q=RSI&status=generated&page=4&sort=updated_at');

    const restored = parseStrategyVersionsListQuery(resolvedReturn ?? '/strategies/str-11/versions');
    expect(restored).toEqual({ page: 4, q: 'RSI', status: 'generated', sort: 'updated_at', order: 'desc' });
  });
});

