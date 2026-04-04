import { describe, expect, it } from 'vitest';
import {
  getInternalBacktestDataSourceUnavailableSummary,
  recordInternalBacktestDataSourceUnavailableEvent,
} from '../src/internal-backtests/observability';

type FailureEventRow = {
  id: string;
  executionId: string | null;
  providerName: string | null;
  internalReasonCode: string | null;
  symbol: string | null;
  market: string | null;
  timeframe: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  elapsedMs: number | null;
  httpStatus: number | null;
  endpointKind: string | null;
  occurredAt: Date;
};

function createObservabilityDb() {
  const rows: FailureEventRow[] = [];
  return {
    rows,
    db: {
      internalBacktestDataSourceFailureEvent: {
        create: async ({ data }: { data: Omit<FailureEventRow, 'id' | 'occurredAt'> & { occurredAt?: Date } }) => {
          rows.push({
            id: `evt-${rows.length + 1}`,
            executionId: data.executionId,
            providerName: data.providerName,
            internalReasonCode: data.internalReasonCode,
            symbol: data.symbol,
            market: data.market,
            timeframe: data.timeframe,
            rangeFrom: data.rangeFrom,
            rangeTo: data.rangeTo,
            elapsedMs: data.elapsedMs,
            httpStatus: data.httpStatus,
            endpointKind: data.endpointKind,
            occurredAt: data.occurredAt ?? new Date(),
          });
          return rows[rows.length - 1];
        },
        findMany: async ({ where }: { where: { occurredAt: { gte: Date; lte: Date } } }) =>
          rows
            .filter((row) => row.occurredAt >= where.occurredAt.gte && row.occurredAt <= where.occurredAt.lte)
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id)),
      },
    },
  };
}

describe('internal backtest observability summary', () => {
  it('aggregates reason counts and keeps latest execution per reason', async () => {
    const { db } = createObservabilityDb();
    const now = new Date('2026-04-05T00:00:00.000Z');

    await recordInternalBacktestDataSourceUnavailableEvent(
      {
        occurredAt: new Date('2026-04-04T20:00:00.000Z'),
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
      },
      { db: db as never },
    );
    await recordInternalBacktestDataSourceUnavailableEvent(
      {
        occurredAt: new Date('2026-04-04T21:00:00.000Z'),
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
      },
      { db: db as never },
    );
    await recordInternalBacktestDataSourceUnavailableEvent(
      {
        occurredAt: new Date('2026-04-04T22:00:00.000Z'),
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
      },
      { db: db as never },
    );

    const summary = await getInternalBacktestDataSourceUnavailableSummary(
      { window: '24h', now },
      { db: db as never },
    );
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
