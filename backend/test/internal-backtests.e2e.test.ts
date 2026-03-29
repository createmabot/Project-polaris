import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';
import { internalBacktestRoutes } from '../src/routes/internal-backtests';

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
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    executionSeq: 1,
    nowSeq: 1,
    versions: new Map(),
    executions: new Map(),
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
    },
  };

  return { prisma };
});

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
    runtime.versions.set('ver-1', {
      id: 'ver-1',
      strategyRuleId: 'str-1',
      naturalLanguageRule: '25日線を上回ったら買い',
      generatedPine: 'strategy("base")',
      market: 'JP_STOCK',
      timeframe: 'D',
    });
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
        data_range: { from: '2024-01-01', to: '2025-12-31' },
        engine_config: { commission_percent: 0.1, slippage: 0.05 },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.execution.status).toBe('queued');
    expect(body.data.execution.strategy_rule_version_id).toBe('ver-1');

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
      },
      resultSummaryJson: {
        net_profit: 120000,
        profit_factor: 1.42,
      },
      artifactPointerJson: {
        type: 'internal_report_snapshot',
        id: 'ibtx-report-1',
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
    expect(body.data.result_summary.net_profit).toBe(120000);
    expect(body.data.artifact_pointer.id).toBe('ibtx-report-1');

    await app.close();
  });
});
