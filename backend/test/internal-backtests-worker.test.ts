import { beforeEach, describe, expect, it } from 'vitest';
import {
  processInternalBacktestExecution,
  INTERNAL_BACKTEST_EXECUTION_FAILED_CODE,
  INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID_CODE,
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
            market: 'JP_STOCK',
            timeframe: 'D',
            period: { from: '2024-01-01', to: '2025-12-31' },
            metrics: {
              total_trades: 10,
              win_rate: 0.5,
              net_profit: 1234,
              profit_factor: 1.2,
              max_drawdown_percent: -5.1,
            },
            engine: { version: 'ibtx-v0' },
            notes: 'ok',
          },
          artifactPointer: {
            type: 'internal_backtest_execution',
            execution_id: 'ibtx-success',
            path: '/internal-backtests/executions/ibtx-success',
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
      metrics: { net_profit: 1234, total_trades: 10 },
    });
    expect(saved?.artifactPointerJson).toMatchObject({
      type: 'internal_backtest_execution',
      execution_id: 'ibtx-success',
      path: '/internal-backtests/executions/ibtx-success',
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
            market: 'JP_STOCK',
            timeframe: 'D',
            period: { from: '2024-01-01', to: '2025-12-31' },
            metrics: {
              total_trades: 10,
              win_rate: 0.5,
              net_profit: 1234,
              profit_factor: 1.2,
              max_drawdown_percent: -5.1,
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
