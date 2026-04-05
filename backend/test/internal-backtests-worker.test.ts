import { beforeEach, describe, expect, it } from 'vitest';
import {
  processInternalBacktestExecution,
  INTERNAL_BACKTEST_EXECUTION_FAILED_CODE,
  INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID_CODE,
  INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE,
} from '../src/queue/internal-backtests';
import { getInternalBacktestDataSourceUnavailableSummary } from '../src/internal-backtests/observability';

type ExecutionRow = {
  id: string;
  strategyRuleVersionId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  inputSnapshotJson: Record<string, unknown>;
  resultSummaryJson: Record<string, unknown> | null;
  artifactPointerJson: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  engineVersion: string;
  createdAt: Date;
  updatedAt: Date;
};

function createExecutionRow(partial: Partial<ExecutionRow>): ExecutionRow {
  const now = new Date();
  return {
    id: partial.id ?? 'ibtx-1',
    strategyRuleVersionId: partial.strategyRuleVersionId ?? 'ver-1',
    status: partial.status ?? 'queued',
    requestedAt: partial.requestedAt ?? now,
    startedAt: partial.startedAt ?? null,
    finishedAt: partial.finishedAt ?? null,
    inputSnapshotJson: partial.inputSnapshotJson ?? {
      market: 'JP_STOCK',
      timeframe: 'D',
      data_range: { from: '2024-01-01', to: '2025-12-31' },
      engine_config: {},
    },
    resultSummaryJson: partial.resultSummaryJson ?? null,
    artifactPointerJson: partial.artifactPointerJson ?? null,
    errorCode: partial.errorCode ?? null,
    errorMessage: partial.errorMessage ?? null,
    engineVersion: partial.engineVersion ?? 'ibtx-v0',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe('internal backtest worker scaffold', () => {
  let executionStore: Map<string, ExecutionRow>;
  let failureEvents: Array<{
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
  }>;
  let retryOutcomeEvents: Array<{
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
    retryTarget: boolean;
    retryAttempted: boolean;
    retryAttempts: number;
    outcome: string;
    occurredAt: Date;
  }>;
  let artifactStore: Map<
    string,
    {
      id: string;
      executionId: string;
      kind: string;
      path: string;
      payloadJson: Record<string, unknown>;
      createdAt: Date;
      updatedAt: Date;
    }
  >;
  let seq: number;
  let eventSeq: number;
  let retryEventSeq: number;
  let artifactSeq: number;
  let prismaMock: any;

  beforeEach(() => {
    executionStore = new Map();
    failureEvents = [];
    retryOutcomeEvents = [];
    artifactStore = new Map();
    seq = 0;
    eventSeq = 0;
    retryEventSeq = 0;
    artifactSeq = 0;
    prismaMock = {
      internalBacktestExecution: {
        findUnique: async ({ where }: any) => executionStore.get(where.id) ?? null,
        update: async ({ where, data }: any) => {
          const existing = executionStore.get(where.id);
          if (!existing) {
            throw new Error(`execution_not_found:${where.id}`);
          }

          const next: ExecutionRow = {
            ...existing,
            ...data,
            updatedAt: new Date(Date.now() + seq++),
          };
          executionStore.set(where.id, next);
          return next;
        },
      },
      internalBacktestDataSourceFailureEvent: {
        create: async ({ data }: any) => {
          const row = {
            id: `evt-${++eventSeq}`,
            executionId: data.executionId ?? null,
            providerName: data.providerName ?? null,
            internalReasonCode: data.internalReasonCode ?? null,
            symbol: data.symbol ?? null,
            market: data.market ?? null,
            timeframe: data.timeframe ?? null,
            rangeFrom: data.rangeFrom ?? null,
            rangeTo: data.rangeTo ?? null,
            elapsedMs: data.elapsedMs ?? null,
            httpStatus: data.httpStatus ?? null,
            endpointKind: data.endpointKind ?? null,
            occurredAt: data.occurredAt ?? new Date(),
          };
          failureEvents.push(row);
          return row;
        },
        findMany: async ({ where }: any) =>
          failureEvents
            .filter((row) => row.occurredAt >= where.occurredAt.gte && row.occurredAt <= where.occurredAt.lte)
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id)),
      },
      internalBacktestDataSourceRetryOutcomeEvent: {
        create: async ({ data }: any) => {
          const row = {
            id: `retry-evt-${++retryEventSeq}`,
            executionId: data.executionId ?? null,
            providerName: data.providerName ?? null,
            internalReasonCode: data.internalReasonCode ?? null,
            symbol: data.symbol ?? null,
            market: data.market ?? null,
            timeframe: data.timeframe ?? null,
            rangeFrom: data.rangeFrom ?? null,
            rangeTo: data.rangeTo ?? null,
            elapsedMs: data.elapsedMs ?? null,
            httpStatus: data.httpStatus ?? null,
            endpointKind: data.endpointKind ?? null,
            retryTarget: data.retryTarget ?? false,
            retryAttempted: data.retryAttempted ?? false,
            retryAttempts: data.retryAttempts ?? 1,
            outcome: data.outcome ?? 'not_retried_failed',
            occurredAt: data.occurredAt ?? new Date(),
          };
          retryOutcomeEvents.push(row);
          return row;
        },
        findMany: async ({ where }: any) =>
          retryOutcomeEvents
            .filter((row) => row.occurredAt >= where.occurredAt.gte && row.occurredAt <= where.occurredAt.lte)
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id)),
      },
      internalBacktestExecutionArtifact: {
        upsert: async ({ where, create, update }: any) => {
          const key = `${where.executionId_kind.executionId}::${where.executionId_kind.kind}`;
          const existing = artifactStore.get(key);
          const now = new Date(Date.now() + seq++);
          const row = existing
            ? {
                ...existing,
                ...update,
                updatedAt: now,
              }
            : {
                id: `artifact-${++artifactSeq}`,
                executionId: create.executionId,
                kind: create.kind,
                path: create.path,
                payloadJson: create.payloadJson,
                createdAt: now,
                updatedAt: now,
              };
          artifactStore.set(key, row);
          return row;
        },
      },
    };
  });

  it('moves queued execution to succeeded with summary/artifact', async () => {
    executionStore.set('ibtx-success', createExecutionRow({ id: 'ibtx-success', status: 'queued' }));

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-success' },
      {
        db: prismaMock,
        runExecution: async () => ({
          resultSummary: {
            schema_version: '1.0',
            summary_kind: 'scaffold_deterministic',
            market: 'JP_STOCK',
            timeframe: 'D',
            period: { from: '2024-01-01', to: '2025-12-31' },
            metrics: {
              bar_count: 10,
              first_close: 100,
              last_close: 110,
              price_change: 10,
              price_change_percent: 10,
              period_high: 112,
              period_low: 95,
              range_percent: 17.8947,
            },
            engine: { version: 'ibtx-v0' },
            notes: 'ok',
          },
          artifactPointer: {
            type: 'internal_backtest_execution',
            execution_id: 'ibtx-success',
            path: '/internal-backtests/executions/ibtx-success',
          },
          inputSnapshot: {
            strategy_rule_version_id: 'ver-1',
            market: 'JP_STOCK',
            timeframe: 'D',
            execution_target: {
              symbol: '7203',
              source_kind: 'daily_ohlcv',
            },
            data_range: { from: '2024-01-01', to: '2025-12-31' },
            engine_config: { summary_mode: 'engine_estimated' },
            strategy_snapshot: {
              natural_language_rule: 'rule',
              generated_pine: 'strategy("base")',
              market: 'JP_STOCK',
              timeframe: 'D',
            },
            data_source_snapshot: {
              source_kind: 'daily_ohlcv',
              market: 'JP_STOCK',
              timeframe: 'D',
              from: '2024-01-01',
              to: '2025-12-31',
              fetched_at: '2025-12-31T00:00:00.000Z',
              data_revision: 'stub-daily-ohlcv-v1:JP_STOCK:D:2024-01-01:2025-12-31',
              bar_count: 731,
            },
          },
        }),
      },
    );

    expect(result.status).toBe('succeeded');
    const saved = executionStore.get('ibtx-success');
    expect(saved?.status).toBe('succeeded');
    expect(saved?.startedAt).not.toBeNull();
    expect(saved?.finishedAt).not.toBeNull();
    expect(saved?.resultSummaryJson).toMatchObject({
      schema_version: '1.0',
      summary_kind: 'scaffold_deterministic',
      metrics: { bar_count: 10, last_close: 110 },
    });
    expect(saved?.artifactPointerJson).toMatchObject({
      type: 'internal_backtest_execution',
      execution_id: 'ibtx-success',
      path: '/internal-backtests/executions/ibtx-success',
    });
    expect(saved?.inputSnapshotJson).toMatchObject({
      strategy_rule_version_id: 'ver-1',
      data_source_snapshot: {
        source_kind: 'daily_ohlcv',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    expect(saved?.errorCode).toBeNull();
    expect(saved?.errorMessage).toBeNull();
  });

  it('keeps execution succeeded when engine_estimated returns empty-bars summary', async () => {
    executionStore.set('ibtx-empty-bars', createExecutionRow({ id: 'ibtx-empty-bars', status: 'queued' }));

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-empty-bars' },
      {
        db: prismaMock,
        runExecution: async () => ({
          resultSummary: {
            schema_version: '1.0',
            summary_kind: 'engine_estimated',
            market: 'JP_STOCK',
            timeframe: 'D',
            period: { from: '2024-01-01', to: '2024-01-10' },
            metrics: {
              bar_count: 0,
              first_close: 0,
              last_close: 0,
              price_change: 0,
              price_change_percent: 0,
              period_high: 0,
              period_low: 0,
              range_percent: 0,
            },
            engine: { version: 'ibtx-v0' },
            notes: 'engine_estimated empty bars summary',
          },
          artifactPointer: {
            type: 'internal_backtest_execution',
            execution_id: 'ibtx-empty-bars',
            path: '/internal-backtests/executions/ibtx-empty-bars',
          },
          inputSnapshot: {
            strategy_rule_version_id: 'ver-1',
            market: 'JP_STOCK',
            timeframe: 'D',
            execution_target: {
              symbol: '7203',
              source_kind: 'daily_ohlcv',
            },
            data_range: { from: '2024-01-01', to: '2024-01-10' },
            engine_config: { summary_mode: 'engine_estimated' },
            strategy_snapshot: {
              natural_language_rule: 'rule',
              generated_pine: 'strategy("base")',
              market: 'JP_STOCK',
              timeframe: 'D',
            },
            data_source_snapshot: {
              source_kind: 'daily_ohlcv',
              market: 'JP_STOCK',
              timeframe: 'D',
              from: '2024-01-01',
              to: '2024-01-10',
              fetched_at: '2024-01-10T00:00:00.000Z',
              data_revision: 'stub-empty-bars',
              bar_count: 0,
            },
          },
        }),
      },
    );

    expect(result.status).toBe('succeeded');
    const saved = executionStore.get('ibtx-empty-bars');
    expect(saved?.status).toBe('succeeded');
    expect(saved?.errorCode).toBeNull();
    expect(saved?.resultSummaryJson).toMatchObject({
      summary_kind: 'engine_estimated',
      metrics: {
        bar_count: 0,
        first_close: 0,
        last_close: 0,
      },
    });
    expect(saved?.inputSnapshotJson).toMatchObject({
      data_source_snapshot: {
        bar_count: 0,
      },
    });
  });

  it('keeps execution succeeded with engine_actual minimal summary fields', async () => {
    executionStore.set('ibtx-actual', createExecutionRow({ id: 'ibtx-actual', status: 'queued' }));

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-actual' },
      {
        db: prismaMock,
        runExecution: async () => ({
          resultSummary: {
            schema_version: '1.0',
            summary_kind: 'engine_actual',
            market: 'JP_STOCK',
            timeframe: 'D',
            period: { from: '2024-01-01', to: '2024-01-10' },
            metrics: {
              bar_count: 10,
              first_close: 100,
              last_close: 109,
              price_change: 9,
              price_change_percent: 9,
              period_high: 112,
              period_low: 98,
              range_percent: 14.2857,
              trade_count: 2,
              win_rate: 50,
              total_return_percent: 3.25,
              max_drawdown_percent: 1.75,
              holding_period_avg_bars: 2.5,
              first_trade_at: '2024-01-03T00:00:00.000Z',
              last_trade_at: '2024-01-10T00:00:00.000Z',
            },
            engine: { version: 'ibtx-v0' },
            notes: 'engine_actual minimal',
          },
          artifactPointer: {
            type: 'internal_backtest_execution',
            execution_id: 'ibtx-actual',
            path: '/internal-backtests/executions/ibtx-actual/artifacts/engine_actual/trades-and-equity',
          },
        }),
      },
    );

    expect(result.status).toBe('succeeded');
    const saved = executionStore.get('ibtx-actual');
    expect(saved?.status).toBe('succeeded');
    expect(saved?.resultSummaryJson).toMatchObject({
      summary_kind: 'engine_actual',
      metrics: {
        trade_count: 2,
        win_rate: 50,
      },
    });
    expect(saved?.artifactPointerJson).toMatchObject({
      path: '/internal-backtests/executions/ibtx-actual/artifacts/engine_actual/trades-and-equity',
    });
  });

  it('persists engine_actual artifact payload when worker output includes artifactPayload', async () => {
    executionStore.set('ibtx-actual-artifact', createExecutionRow({ id: 'ibtx-actual-artifact', status: 'queued' }));

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-actual-artifact' },
      {
        db: prismaMock,
        runExecution: async () => ({
          resultSummary: {
            schema_version: '1.0',
            summary_kind: 'engine_actual',
            market: 'JP_STOCK',
            timeframe: 'D',
            period: { from: '2024-01-01', to: '2024-01-10' },
            metrics: {
              bar_count: 10,
              first_close: 100,
              last_close: 109,
              price_change: 9,
              price_change_percent: 9,
              period_high: 112,
              period_low: 98,
              range_percent: 14.2857,
              trade_count: 1,
              win_rate: 100,
              total_return_percent: 1.1,
              max_drawdown_percent: 0.2,
              holding_period_avg_bars: 2,
              first_trade_at: '2024-01-03T00:00:00.000Z',
              last_trade_at: '2024-01-05T00:00:00.000Z',
            },
            engine: { version: 'ibtx-v0' },
            notes: 'engine_actual sample',
          },
          artifactPointer: {
            type: 'internal_backtest_execution',
            execution_id: 'ibtx-actual-artifact',
            path: '/internal-backtests/executions/ibtx-actual-artifact/artifacts/engine_actual/trades-and-equity',
          },
          artifactPayload: {
            trades: [
              {
                entry_at: '2024-01-03T00:00:00.000Z',
                entry_price: 101,
                exit_at: '2024-01-05T00:00:00.000Z',
                exit_price: 102.1,
                return_percent: 1.0891,
                holding_bars: 2,
              },
            ],
            equity_curve: [
              { at: '2024-01-01T00:00:00.000Z', equity_index: 100 },
              { at: '2024-01-05T00:00:00.000Z', equity_index: 101.0891 },
            ],
          },
        }),
      },
    );

    expect(result.status).toBe('succeeded');
    const storedArtifact = artifactStore.get('ibtx-actual-artifact::engine_actual_trades_and_equity');
    expect(storedArtifact).toBeDefined();
    expect(storedArtifact?.path).toBe(
      '/internal-backtests/executions/ibtx-actual-artifact/artifacts/engine_actual/trades-and-equity',
    );
    expect((storedArtifact?.payloadJson as any).trades).toHaveLength(1);
  });

  it('moves queued execution to failed and stores error on runExecution failure', async () => {
    executionStore.set('ibtx-fail', createExecutionRow({ id: 'ibtx-fail', status: 'queued' }));

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-fail' },
      {
        db: prismaMock,
        runExecution: async () => {
          throw new Error('simulated_failure');
        },
      },
    );

    expect(result.status).toBe('failed');
    const saved = executionStore.get('ibtx-fail');
    expect(saved?.status).toBe('failed');
    expect(saved?.errorCode).toBe(INTERNAL_BACKTEST_EXECUTION_FAILED_CODE);
    expect(saved?.errorMessage).toContain('simulated_failure');
    expect(saved?.finishedAt).not.toBeNull();
  });

  it('maps DATA_SOURCE_UNAVAILABLE error code when adapter path fails', async () => {
    executionStore.set(
      'ibtx-ds-fail',
      createExecutionRow({
        id: 'ibtx-ds-fail',
        status: 'queued',
        inputSnapshotJson: {
          strategy_rule_version_id: 'ver-1',
          market: 'JP_STOCK',
          timeframe: 'D',
          execution_target: {
            symbol: '7203',
            source_kind: 'daily_ohlcv',
          },
          data_range: { from: '2024-01-01', to: '2024-01-10' },
          engine_config: { summary_mode: 'engine_estimated' },
        },
      }),
    );

    const error = new Error('unsupported market/timeframe: US_STOCK/D') as Error & { code?: string };
    error.code = 'DATA_SOURCE_UNAVAILABLE';
    (error as Error & { reasonCode?: string }).reasonCode = 'provider_unsupported_target';
    (error as Error & { providerName?: string }).providerName = 'stooq';
    (error as Error & { details?: Record<string, unknown> }).details = {
      endpoint_kind: 'stooq_daily_csv',
    };

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-ds-fail' },
      {
        db: prismaMock,
        runExecution: async () => {
          throw error;
        },
      },
    );

    expect(result.status).toBe('failed');
    const saved = executionStore.get('ibtx-ds-fail');
    expect(saved?.status).toBe('failed');
    expect(saved?.errorCode).toBe(INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE);
    expect(saved?.errorMessage).toContain('unsupported market/timeframe');
    expect(result).toMatchObject({
      internal_reason_code: 'provider_unsupported_target',
      provider_name: 'stooq',
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2024-01-10',
      endpoint_kind: 'stooq_daily_csv',
    });
  });

  it('records DATA_SOURCE_UNAVAILABLE into observability summary store', async () => {
    executionStore.set(
      'ibtx-log-fail',
      createExecutionRow({
        id: 'ibtx-log-fail',
        status: 'queued',
        inputSnapshotJson: {
          strategy_rule_version_id: 'ver-1',
          market: 'JP_STOCK',
          timeframe: 'D',
          execution_target: {
            symbol: '7203',
            source_kind: 'daily_ohlcv',
          },
          data_range: { from: '2024-01-01', to: '2024-01-10' },
          engine_config: { summary_mode: 'engine_estimated' },
        },
      }),
    );

    const error = new Error('provider parse error') as Error & {
      code?: string;
      reasonCode?: string;
      providerName?: string;
      details?: Record<string, unknown>;
    };
    error.code = 'DATA_SOURCE_UNAVAILABLE';
    error.reasonCode = 'provider_parse_error';
    error.providerName = 'stooq';
    error.details = { endpoint_kind: 'stooq_daily_csv' };

    await processInternalBacktestExecution(
      { executionId: 'ibtx-log-fail' },
      {
        db: prismaMock,
        runExecution: async () => {
          throw error;
        },
      },
    );

    const summary = await getInternalBacktestDataSourceUnavailableSummary(
      {
        window: '24h',
        now: new Date(Date.now() + 1000),
      },
      { db: prismaMock },
    );
    expect(summary.total_failures).toBe(1);
    expect(summary.by_reason).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          internal_reason_code: 'provider_parse_error',
          provider_name: 'stooq',
          last_execution_id: 'ibtx-log-fail',
        }),
      ]),
    );
    expect(summary.retry_effect).toEqual(
      expect.objectContaining({
        total_observed: 1,
        not_retried_failed_count: 1,
      }),
    );
  });

  it('records retried_and_succeeded when provider retry recovers', async () => {
    executionStore.set('ibtx-retry-success', createExecutionRow({ id: 'ibtx-retry-success', status: 'queued' }));

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-retry-success' },
      {
        db: prismaMock,
        runExecution: async () => ({
          resultSummary: {
            schema_version: '1.0',
            summary_kind: 'engine_estimated',
            market: 'JP_STOCK',
            timeframe: 'D',
            period: { from: '2024-01-01', to: '2024-01-10' },
            metrics: {
              bar_count: 1,
              first_close: 100,
              last_close: 101,
              price_change: 1,
              price_change_percent: 1,
              period_high: 102,
              period_low: 99,
              range_percent: 3.03,
            },
            engine: { version: 'ibtx-v0' },
            notes: 'retry recovered',
          },
          artifactPointer: {
            type: 'internal_backtest_execution',
            execution_id: 'ibtx-retry-success',
            path: '/internal-backtests/executions/ibtx-retry-success',
          },
          dataSourceFetchObservation: {
            providerName: 'stooq',
            internalReasonCode: 'provider_timeout',
            retryTarget: true,
            retryAttempted: true,
            retryAttempts: 2,
            httpStatus: null,
            endpointKind: 'stooq_daily_csv',
          },
        }),
      },
    );

    expect(result.status).toBe('succeeded');
    expect(retryOutcomeEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          executionId: 'ibtx-retry-success',
          outcome: 'retried_and_succeeded',
          retryAttempted: true,
          retryAttempts: 2,
          internalReasonCode: 'provider_timeout',
        }),
      ]),
    );
  });

  it('records retried_and_failed when retry target still fails', async () => {
    executionStore.set('ibtx-retry-failed', createExecutionRow({ id: 'ibtx-retry-failed', status: 'queued' }));

    const error = new Error('temporary timeout') as Error & {
      code?: string;
      reasonCode?: string;
      providerName?: string;
      details?: Record<string, unknown>;
    };
    error.code = 'DATA_SOURCE_UNAVAILABLE';
    error.reasonCode = 'provider_timeout';
    error.providerName = 'stooq';
    error.details = {
      endpoint_kind: 'stooq_daily_csv',
      retry_attempted: true,
      retry_attempts: 2,
      retry_target: true,
    };

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-retry-failed' },
      {
        db: prismaMock,
        runExecution: async () => {
          throw error;
        },
      },
    );

    expect(result.status).toBe('failed');
    expect(retryOutcomeEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          executionId: 'ibtx-retry-failed',
          outcome: 'retried_and_failed',
          retryAttempted: true,
          retryAttempts: 2,
          internalReasonCode: 'provider_timeout',
        }),
      ]),
    );
  });

  it('maps INVALID_EXECUTION_TARGET when estimated execution target is missing', async () => {
    executionStore.set('ibtx-invalid-target', createExecutionRow({ id: 'ibtx-invalid-target', status: 'queued' }));

    const error = new Error('engine_estimated requires execution_target.symbol') as Error & { code?: string };
    error.code = 'INVALID_EXECUTION_TARGET';

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-invalid-target' },
      {
        db: prismaMock,
        runExecution: async () => {
          throw error;
        },
      },
    );

    expect(result.status).toBe('failed');
    const saved = executionStore.get('ibtx-invalid-target');
    expect(saved?.status).toBe('failed');
    expect(saved?.errorCode).toBe('INVALID_EXECUTION_TARGET');
  });

  it('fails execution when result summary schema is invalid', async () => {
    executionStore.set('ibtx-invalid-summary', createExecutionRow({ id: 'ibtx-invalid-summary', status: 'queued' }));

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-invalid-summary' },
      {
        db: prismaMock,
        runExecution: async () => ({
          // schema_version missing intentionally
          resultSummary: { net_profit: 1 },
          artifactPointer: {
            type: 'internal_backtest_execution',
            execution_id: 'ibtx-invalid-summary',
            path: '/internal-backtests/executions/ibtx-invalid-summary',
          },
        }),
      },
    );

    expect(result.status).toBe('failed');
    const saved = executionStore.get('ibtx-invalid-summary');
    expect(saved?.status).toBe('failed');
    expect(saved?.errorCode).toBe(INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID_CODE);
    expect(saved?.errorMessage).toContain('schema_version');
  });

  it('fails execution when artifact pointer schema is invalid', async () => {
    executionStore.set('ibtx-invalid-artifact', createExecutionRow({ id: 'ibtx-invalid-artifact', status: 'queued' }));

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-invalid-artifact' },
      {
        db: prismaMock,
        runExecution: async () => ({
          resultSummary: {
            schema_version: '1.0',
            summary_kind: 'scaffold_deterministic',
            market: 'JP_STOCK',
            timeframe: 'D',
            period: { from: '2024-01-01', to: '2025-12-31' },
            metrics: {
              bar_count: 10,
              first_close: 100,
              last_close: 110,
              price_change: 10,
              price_change_percent: 10,
              period_high: 112,
              period_low: 95,
              range_percent: 17.8947,
            },
            engine: { version: 'ibtx-v0' },
            notes: 'ok',
          },
          // missing `path`
          artifactPointer: { type: 'internal_backtest_execution', execution_id: 'ibtx-invalid-artifact' },
        }),
      },
    );

    expect(result.status).toBe('failed');
    const saved = executionStore.get('ibtx-invalid-artifact');
    expect(saved?.status).toBe('failed');
    expect(saved?.errorCode).toBe(INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID_CODE);
    expect(saved?.errorMessage).toContain('artifact_pointer');
  });

  it('fails execution when summary_kind is invalid', async () => {
    executionStore.set('ibtx-invalid-kind', createExecutionRow({ id: 'ibtx-invalid-kind', status: 'queued' }));

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-invalid-kind' },
      {
        db: prismaMock,
        runExecution: async () => ({
          resultSummary: {
            schema_version: '1.0',
            summary_kind: 'invalid_kind',
            market: 'JP_STOCK',
            timeframe: 'D',
            period: { from: '2024-01-01', to: '2025-12-31' },
            metrics: {
              bar_count: 10,
              first_close: 100,
              last_close: 110,
              price_change: 10,
              price_change_percent: 10,
              period_high: 112,
              period_low: 95,
              range_percent: 17.8947,
            },
            engine: { version: 'ibtx-v0' },
            notes: 'ok',
          },
          artifactPointer: {
            type: 'internal_backtest_execution',
            execution_id: 'ibtx-invalid-kind',
            path: '/internal-backtests/executions/ibtx-invalid-kind',
          },
        }),
      },
    );

    expect(result.status).toBe('failed');
    const saved = executionStore.get('ibtx-invalid-kind');
    expect(saved?.status).toBe('failed');
    expect(saved?.errorCode).toBe(INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID_CODE);
    expect(saved?.errorMessage).toContain('result_summary.summary_kind');
  });

  it('skips execution that is already running', async () => {
    executionStore.set('ibtx-running', createExecutionRow({ id: 'ibtx-running', status: 'running' }));

    const result = await processInternalBacktestExecution(
      { executionId: 'ibtx-running' },
      {
        db: prismaMock,
      },
    );

    expect(result).toMatchObject({
      execution_id: 'ibtx-running',
      status: 'running',
      skipped: true,
    });
    const saved = executionStore.get('ibtx-running');
    expect(saved?.status).toBe('running');
    expect(saved?.startedAt).toBeNull();
  });
});
