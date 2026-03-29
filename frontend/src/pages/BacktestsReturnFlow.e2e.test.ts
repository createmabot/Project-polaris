import { describe, expect, it } from 'vitest';
import {
  buildBacktestDetailUrl,
  buildBacktestListPath,
  buildBacktestsListUrl,
  buildBacktestRuleLabVersionDetailPath as buildListRuleLabVersionDetailPath,
  buildBacktestRuleLabVersionsPath as buildListRuleLabVersionsPath,
  parseBacktestsListQuery,
} from './BacktestList';
import {
  buildBacktestRuleLabVersionDetailPath as buildDetailRuleLabVersionDetailPath,
  buildBacktestRuleLabVersionsPath as buildDetailRuleLabVersionsPath,
  parseBacktestsReturnPath,
} from './BacktestDetail';

describe('backtests list -> detail -> list return flow (E2E-like)', () => {
  it('restores q/page after explicit return link navigation', () => {
    const listUrl = buildBacktestsListUrl('ma', 2, 'imported', 'updated_at', 'asc');
    expect(listUrl).toBe('/backtests?q=ma&status=imported&sort=updated_at&order=asc&page=2');

    const detailUrl = buildBacktestDetailUrl('bt-123', 'ma', 2, 'imported', 'updated_at', 'asc');
    expect(detailUrl).toBe('/backtests/bt-123?return=%2Fbacktests%3Fq%3Dma%26status%3Dimported%26sort%3Dupdated_at%26order%3Dasc%26page%3D2');

    const resolvedReturn = parseBacktestsReturnPath(detailUrl);
    expect(resolvedReturn).toBe('/backtests?q=ma&status=imported&page=2&sort=updated_at&order=asc');

    const restored = parseBacktestsListQuery(resolvedReturn ?? '/backtests');
    expect(restored).toEqual({
      q: 'ma',
      page: 2,
      status: 'imported',
      sort: 'updated_at',
      order: 'asc',
    });

    const apiPath = buildBacktestListPath(restored.page, 20, restored.q, restored.status, restored.sort, restored.order);
    expect(apiPath).toBe('/api/backtests?page=2&limit=20&q=ma&status=imported&sort=updated_at&order=asc');
  });

  it('falls back to /backtests when return is invalid', () => {
    const detailUrl = '/backtests/bt-123?return=%2Fbacktests%2Fanything';
    const resolvedReturn = parseBacktestsReturnPath(detailUrl) ?? '/backtests';

    expect(resolvedReturn).toBe('/backtests');
    expect(parseBacktestsListQuery(resolvedReturn)).toEqual({ q: '', page: 1, status: '', sort: 'created_at', order: 'desc' });
  });

  it('keeps Rule Lab links stable while preserving backtests return-flow context', () => {
    const listSideVersions = buildListRuleLabVersionsPath('str-1');
    const listSideVersionDetail = buildListRuleLabVersionDetailPath('str-1', 'ver-1');
    const detailSideVersions = buildDetailRuleLabVersionsPath('str-1');
    const detailSideVersionDetail = buildDetailRuleLabVersionDetailPath('str-1', 'ver-1');

    expect(listSideVersions).toBe('/strategies/str-1/versions?sort=updated_at&order=desc&page=1');
    expect(listSideVersionDetail).toBe('/strategy-versions/ver-1?return=%2Fstrategies%2Fstr-1%2Fversions%3Fsort%3Dupdated_at%26order%3Ddesc%26page%3D1');
    expect(detailSideVersions).toBe(listSideVersions);
    expect(detailSideVersionDetail).toBe(listSideVersionDetail);

    const detailUrl = buildBacktestDetailUrl('bt-1', 'ma', 2, 'imported', 'updated_at', 'asc');
    expect(parseBacktestsReturnPath(detailUrl)).toBe('/backtests?q=ma&status=imported&page=2&sort=updated_at&order=asc');
  });
});

