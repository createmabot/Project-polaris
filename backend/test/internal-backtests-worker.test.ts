import { beforeEach, describe, expect, it } from 'vitest';
import {
  processInternalBacktestExecution,
  INTERNAL_BACKTEST_EXECUTION_FAILED_CODE,
  INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID_CODE,
  INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE,
} from '../src/queue/internal-backtests';

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
  let seq: number;
  let prismaMock: any;

  beforeEach(() => {
    executionStore = new Map();
    seq = 0;
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
    executionStore.set('ibtx-ds-fail', createExecutionRow({ id: 'ibtx-ds-fail', status: 'queued' }));

    const error = new Error('unsupported market/timeframe: US_STOCK/D') as Error & { code?: string };
    error.code = 'DATA_SOURCE_UNAVAILABLE';

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
