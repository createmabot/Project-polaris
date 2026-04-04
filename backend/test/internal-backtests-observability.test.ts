import { describe, expect, it } from 'vitest';
import {
  __resetInternalBacktestObservabilityForTest,
  getInternalBacktestDataSourceUnavailableSummary,
  recordInternalBacktestDataSourceUnavailableEvent,
} from '../src/internal-backtests/observability';

describe('internal backtest observability summary', () => {
  it('aggregates reason counts and keeps latest execution per reason', () => {
    __resetInternalBacktestObservabilityForTest();
    const now = new Date('2026-04-05T00:00:00.000Z');

    recordInternalBacktestDataSourceUnavailableEvent({
      at: '2026-04-04T20:00:00.000Z',
      executionId: 'exec-1',
      providerName: 'stooq',
      internalReasonCode: 'provider_http_error',
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2026-03-01',
      to: '2026-03-10',
      elapsedMs: 120,
      httpStatus: 503,
      endpointKind: 'stooq_daily_csv',
    });
    recordInternalBacktestDataSourceUnavailableEvent({
      at: '2026-04-04T21:00:00.000Z',
      executionId: 'exec-2',
      providerName: 'stooq',
      internalReasonCode: 'provider_http_error',
      symbol: '6758',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2026-03-01',
      to: '2026-03-10',
      elapsedMs: 140,
      httpStatus: 502,
      endpointKind: 'stooq_daily_csv',
    });
    recordInternalBacktestDataSourceUnavailableEvent({
      at: '2026-04-04T22:00:00.000Z',
      executionId: 'exec-3',
      providerName: 'stooq',
      internalReasonCode: 'provider_parse_error',
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2026-03-01',
      to: '2026-03-10',
      elapsedMs: 130,
      httpStatus: null,
      endpointKind: 'stooq_daily_csv',
    });

    const summary = getInternalBacktestDataSourceUnavailableSummary({ window: '24h', now });
    expect(summary.total_failures).toBe(3);
    expect(summary.by_reason).toEqual([
      expect.objectContaining({
        internal_reason_code: 'provider_http_error',
        count: 2,
        last_execution_id: 'exec-2',
        last_http_status: 502,
      }),
      expect.objectContaining({
        internal_reason_code: 'provider_parse_error',
        count: 1,
        last_execution_id: 'exec-3',
      }),
    ]);
    expect(summary.recent_failures[0]).toEqual(
      expect.objectContaining({
        execution_id: 'exec-3',
        internal_reason_code: 'provider_parse_error',
      }),
    );
  });
});

