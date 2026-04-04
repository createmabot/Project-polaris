import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';
import { internalBacktestRoutes } from '../src/routes/internal-backtests';

const { enqueueInternalBacktestExecutionMock } = vi.hoisted(() => ({
  enqueueInternalBacktestExecutionMock: vi.fn(async () => ({ id: 'ibtx-job-1' })),
}));

type StrategyRuleVersionRow = {
  id: string;
  strategyRuleId: string;
  naturalLanguageRule: string;
  generatedPine: string | null;
  market: string;
  timeframe: string;
};

type InternalExecutionRow = {
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

type Runtime = {
  executionSeq: number;
  nowSeq: number;
  versions: Map<string, StrategyRuleVersionRow>;
  executions: Map<string, InternalExecutionRow>;
  failureEventSeq: number;
  failureEvents: Array<{
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
  retryOutcomeEventSeq: number;
  retryOutcomeEvents: Array<{
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
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    executionSeq: 1,
    nowSeq: 1,
    versions: new Map(),
    executions: new Map(),
    failureEventSeq: 1,
    failureEvents: [],
    retryOutcomeEventSeq: 1,
    retryOutcomeEvents: [],
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    strategyRuleVersion: {
      findUnique: async ({ where }: any) => runtime.versions.get(where.id) ?? null,
    },
    internalBacktestExecution: {
      create: async ({ data }: any) => {
        const id = `ibtx-${runtime.executionSeq++}`;
        const now = new Date(Date.now() + runtime.nowSeq++);
        const row: InternalExecutionRow = {
          id,
          strategyRuleVersionId: data.strategyRuleVersionId,
          status: data.status ?? 'queued',
          requestedAt: now,
          startedAt: data.startedAt ?? null,
          finishedAt: data.finishedAt ?? null,
          inputSnapshotJson: data.inputSnapshotJson ?? {},
          resultSummaryJson: data.resultSummaryJson ?? null,
          artifactPointerJson: data.artifactPointerJson ?? null,
          errorCode: data.errorCode ?? null,
          errorMessage: data.errorMessage ?? null,
          engineVersion: data.engineVersion ?? 'ibtx-v0',
          createdAt: now,
          updatedAt: now,
        };
        runtime.executions.set(id, row);
        return row;
      },
      findUnique: async ({ where }: any) => runtime.executions.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const existing = runtime.executions.get(where.id);
        if (!existing) throw new Error(`internal_execution_not_found:${where.id}`);
        const next: InternalExecutionRow = {
          ...existing,
          ...data,
          updatedAt: new Date(Date.now() + runtime.nowSeq++),
        };
        runtime.executions.set(where.id, next);
        return next;
      },
    },
    internalBacktestDataSourceFailureEvent: {
      create: async ({ data }: any) => {
        const row = {
          id: `ibtx-ds-fail-${runtime.failureEventSeq++}`,
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
        runtime.failureEvents.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        runtime.failureEvents
          .filter((row) => row.occurredAt >= where.occurredAt.gte && row.occurredAt <= where.occurredAt.lte)
          .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id)),
    },
    internalBacktestDataSourceRetryOutcomeEvent: {
      create: async ({ data }: any) => {
        const row = {
          id: `ibtx-ds-retry-${runtime.retryOutcomeEventSeq++}`,
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
        runtime.retryOutcomeEvents.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        runtime.retryOutcomeEvents
          .filter((row) => row.occurredAt >= where.occurredAt.gte && row.occurredAt <= where.occurredAt.lte)
          .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id)),
    },
  };

  return { prisma };
});

vi.mock('../src/queue/internal-backtests', () => ({
  enqueueInternalBacktestExecution: enqueueInternalBacktestExecutionMock,
}));

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(internalBacktestRoutes, { prefix: '/api/internal-backtests' });
  await app.ready();
  return app;
}

describe('internal backtests scaffold routes', () => {
  beforeEach(() => {
    runtime = createRuntime();
    enqueueInternalBacktestExecutionMock.mockReset();
    enqueueInternalBacktestExecutionMock.mockResolvedValue({ id: 'ibtx-job-1' });
    runtime.versions.set('ver-1', {
      id: 'ver-1',
      strategyRuleId: 'str-1',
      naturalLanguageRule: 'buy when close breaks above 25d high',
      generatedPine: 'strategy("base")',
      market: 'JP_STOCK',
      timeframe: 'D',
    });
  });

  it('returns internal observability summary grouped by reason', async () => {
    const app = await createApp();
    runtime.failureEvents.push({
      id: `ibtx-ds-fail-${runtime.failureEventSeq++}`,
      executionId: 'ibtx-a',
      providerName: 'stooq',
      internalReasonCode: 'provider_http_error',
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      rangeFrom: '2024-01-01',
      rangeTo: '2024-01-10',
      elapsedMs: 120,
      httpStatus: 503,
      endpointKind: 'stooq_daily_csv',
      occurredAt: new Date(),
    });
    runtime.failureEvents.push({
      id: `ibtx-ds-fail-${runtime.failureEventSeq++}`,
      executionId: 'ibtx-b',
      providerName: 'stooq',
      internalReasonCode: 'provider_parse_error',
      symbol: '6758',
      market: 'JP_STOCK',
      timeframe: 'D',
      rangeFrom: '2024-01-01',
      rangeTo: '2024-01-10',
      elapsedMs: 100,
      httpStatus: null,
      endpointKind: 'stooq_daily_csv',
      occurredAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-backtests/observability/data-source-unavailable-summary?window=24h',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.summary.total_failures).toBe(2);
    expect(body.data.summary.by_reason).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          internal_reason_code: 'provider_http_error',
          count: 1,
          provider_name: 'stooq',
        }),
        expect.objectContaining({
          internal_reason_code: 'provider_parse_error',
          count: 1,
          provider_name: 'stooq',
        }),
      ]),
    );
    expect(body.error).toBeNull();

    await app.close();
  });

  it('returns validation error for unsupported observability window', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-backtests/observability/data-source-unavailable-summary?window=30d',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });

  it('creates execution in queued status', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: {
          symbol: '7203',
          source_kind: 'daily_ohlcv',
        },
        data_range: { from: '2024-01-01', to: '2025-12-31' },
        engine_config: { commission_percent: 0.1, slippage: 0.05 },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.execution.status).toBe('queued');
    expect(body.data.execution.strategy_rule_version_id).toBe('ver-1');
    expect(enqueueInternalBacktestExecutionMock).toHaveBeenCalledTimes(1);
    expect(enqueueInternalBacktestExecutionMock).toHaveBeenCalledWith(body.data.execution.id);
    const saved = runtime.executions.get(body.data.execution.id);
    expect(saved?.inputSnapshotJson.execution_target).toMatchObject({
      symbol: '7203',
      source_kind: 'daily_ohlcv',
    });

    await app.close();
  });

  it('falls back to strategy version market/timeframe when request omits them', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        data_range: { from: '2024-01-01', to: '2025-12-31' },
      },
    });

    expect(res.statusCode).toBe(201);
    const executionId = res.json().data.execution.id as string;
    const saved = runtime.executions.get(executionId);
    expect(saved?.inputSnapshotJson.market).toBe('JP_STOCK');
    expect(saved?.inputSnapshotJson.timeframe).toBe('D');
    expect(saved?.inputSnapshotJson.execution_target).toMatchObject({
      symbol: 'legacy:ver-1',
      source_kind: 'daily_ohlcv',
    });

    await app.close();
  });

  it('uses request market/timeframe over strategy version defaults', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'US_STOCK',
        timeframe: '4H',
        data_range: { from: '2024-01-01', to: '2025-12-31' },
      },
    });

    expect(res.statusCode).toBe(201);
    const executionId = res.json().data.execution.id as string;
    const saved = runtime.executions.get(executionId);
    expect(saved?.inputSnapshotJson.market).toBe('US_STOCK');
    expect(saved?.inputSnapshotJson.timeframe).toBe('4H');
    expect(saved?.inputSnapshotJson.execution_target).toMatchObject({
      symbol: 'legacy:ver-1',
      source_kind: 'daily_ohlcv',
    });

    await app.close();
  });

  it('returns validation error when data_range uses invalid date format', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        data_range: { from: '2024/01/01', to: '2025-12-31' },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('ISO date format');

    await app.close();
  });

  it('returns validation error when data_range.from is after data_range.to', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        data_range: { from: '2026-01-01', to: '2025-12-31' },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('less than or equal');

    await app.close();
  });

  it('returns validation error when optional market is present but invalid', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 123,
        data_range: { from: '2024-01-01', to: '2025-12-31' },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('market must be a non-empty string when provided');

    await app.close();
  });

  it('returns validation error when optional timeframe is present but blank', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        timeframe: '   ',
        data_range: { from: '2024-01-01', to: '2025-12-31' },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('timeframe must be a non-empty string when provided');

    await app.close();
  });

  it('canonicalizes execution_target.symbol for JP_STOCK and stores canonical snapshot value', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: {
          symbol: '  tyo:7203  ',
          source_kind: 'daily_ohlcv',
        },
        data_range: { from: '2024-01-01', to: '2025-12-31' },
        engine_config: { summary_mode: 'engine_estimated' },
      },
    });

    expect(res.statusCode).toBe(201);
    const executionId = res.json().data.execution.id as string;
    const saved = runtime.executions.get(executionId);
    expect(saved?.inputSnapshotJson.execution_target).toMatchObject({
      symbol: '7203',
      source_kind: 'daily_ohlcv',
    });

    await app.close();
  });

  it('returns INVALID_EXECUTION_TARGET for engine_estimated without execution_target.symbol', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        data_range: { from: '2024-01-01', to: '2025-12-31' },
        engine_config: { summary_mode: 'engine_estimated' },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_EXECUTION_TARGET');

    await app.close();
  });

  it('returns INVALID_EXECUTION_TARGET when JP_STOCK symbol is invalid', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: {
          symbol: 'AAPL',
          source_kind: 'daily_ohlcv',
        },
        data_range: { from: '2024-01-01', to: '2025-12-31' },
        engine_config: { summary_mode: 'engine_estimated' },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_EXECUTION_TARGET');

    await app.close();
  });

  it('returns INVALID_EXECUTION_TARGET when request symbol uses forbidden legacy prefix', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: {
          symbol: 'legacy:ver-1',
          source_kind: 'daily_ohlcv',
        },
        data_range: { from: '2024-01-01', to: '2025-12-31' },
        engine_config: { summary_mode: 'engine_estimated' },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_EXECUTION_TARGET');

    await app.close();
  });

  it('marks execution as failed when enqueue fails', async () => {
    const app = await createApp();
    enqueueInternalBacktestExecutionMock.mockRejectedValueOnce(new Error('redis_down'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        data_range: { from: '2024-01-01', to: '2025-12-31' },
      },
    });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error.code).toBe('QUEUE_ENQUEUE_FAILED');
    expect(runtime.executions.size).toBe(1);
    const failedExecution = [...runtime.executions.values()][0];
    expect(failedExecution.status).toBe('failed');
    expect(failedExecution.errorCode).toBe('QUEUE_ENQUEUE_FAILED');

    await app.close();
  });

  it('gets execution status', async () => {
    const app = await createApp();

    const created = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        data_range: { from: '2024-01-01', to: '2025-12-31' },
      },
    });
    const executionId = created.json().data.execution.id as string;

    const statusRes = await app.inject({
      method: 'GET',
      url: `/api/internal-backtests/executions/${executionId}`,
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().data.execution.status).toBe('queued');

    await app.close();
  });

  it('handles result request before succeeded without crashing', async () => {
    const app = await createApp();

    const created = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        data_range: { from: '2024-01-01', to: '2025-12-31' },
      },
    });
    const executionId = created.json().data.execution.id as string;

    const resultRes = await app.inject({
      method: 'GET',
      url: `/api/internal-backtests/executions/${executionId}/result`,
    });
    expect(resultRes.statusCode).toBe(409);
    const body = resultRes.json();
    expect(body.error.code).toBe('RESULT_NOT_READY');
    expect(body.error.details.status).toBe('queued');

    await app.close();
  });

  it('returns result payload when execution is succeeded', async () => {
    const app = await createApp();

    const now = new Date();
    runtime.executions.set('ibtx-succeeded', {
      id: 'ibtx-succeeded',
      strategyRuleVersionId: 'ver-1',
      status: 'succeeded',
      requestedAt: now,
      startedAt: now,
      finishedAt: now,
      inputSnapshotJson: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: {
          symbol: '7203',
          source_kind: 'daily_ohlcv',
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
      resultSummaryJson: {
        schema_version: '1.0',
        summary_kind: 'scaffold_deterministic',
        market: 'JP_STOCK',
        timeframe: 'D',
        period: { from: '2024-01-01', to: '2025-12-31' },
        metrics: {
          bar_count: 731,
          first_close: 1234.56,
          last_close: 1330.12,
          price_change: 95.56,
          price_change_percent: 7.7398,
          period_high: 1410.2,
          period_low: 1188.4,
          range_percent: 18.6654,
        },
        engine: { version: 'ibtx-v0' },
        notes: 'sample summary',
      },
      artifactPointerJson: {
        type: 'internal_backtest_execution',
        execution_id: 'ibtx-succeeded',
        path: '/internal-backtests/executions/ibtx-succeeded',
      },
      errorCode: null,
      errorMessage: null,
      engineVersion: 'ibtx-v0',
      createdAt: now,
      updatedAt: now,
    });

    const resultRes = await app.inject({
      method: 'GET',
      url: '/api/internal-backtests/executions/ibtx-succeeded/result',
    });
    expect(resultRes.statusCode).toBe(200);
    const body = resultRes.json();
    expect(body.data.execution_id).toBe('ibtx-succeeded');
    expect(body.data.result_summary.summary_kind).toBe('scaffold_deterministic');
    expect(body.data.result_summary.metrics.bar_count).toBe(731);
    expect(body.data.artifact_pointer.execution_id).toBe('ibtx-succeeded');
    expect(body.data.artifact_pointer.path).toBe('/internal-backtests/executions/ibtx-succeeded');
    expect(body.data.input_snapshot.execution_target.symbol).toBe('7203');
    expect(body.data.input_snapshot.data_source_snapshot.source_kind).toBe('daily_ohlcv');
    expect(body.data.input_snapshot.data_source_snapshot.bar_count).toBe(731);

    await app.close();
  });

  it('returns succeeded result with zero metrics when engine_estimated has empty bars', async () => {
    const app = await createApp();

    const now = new Date();
    runtime.executions.set('ibtx-empty-bars', {
      id: 'ibtx-empty-bars',
      strategyRuleVersionId: 'ver-1',
      status: 'succeeded',
      requestedAt: now,
      startedAt: now,
      finishedAt: now,
      inputSnapshotJson: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: {
          symbol: '7203',
          source_kind: 'daily_ohlcv',
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
      resultSummaryJson: {
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
      artifactPointerJson: {
        type: 'internal_backtest_execution',
        execution_id: 'ibtx-empty-bars',
        path: '/internal-backtests/executions/ibtx-empty-bars',
      },
      errorCode: null,
      errorMessage: null,
      engineVersion: 'ibtx-v0',
      createdAt: now,
      updatedAt: now,
    });

    const resultRes = await app.inject({
      method: 'GET',
      url: '/api/internal-backtests/executions/ibtx-empty-bars/result',
    });

    expect(resultRes.statusCode).toBe(200);
    const body = resultRes.json();
    expect(body.data.status).toBe('succeeded');
    expect(body.data.result_summary.summary_kind).toBe('engine_estimated');
    expect(body.data.result_summary.metrics.bar_count).toBe(0);
    expect(body.data.input_snapshot.data_source_snapshot.bar_count).toBe(0);
    expect(body.error).toBeNull();

    await app.close();
  });
});
