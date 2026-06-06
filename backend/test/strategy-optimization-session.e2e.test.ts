import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backtestRoutes } from '../src/routes/backtests';
import { strategyOptimizationSessionRoutes, strategyRefinementCandidateRoutes } from '../src/routes/strategy-optimization-sessions';
import { strategyVersionRoutes } from '../src/routes/strategy-versions';
import { errorHandler } from '../src/utils/response';

type VersionRow = {
  id: string;
  strategyRuleId: string;
  clonedFromVersionId: string | null;
  naturalLanguageRule: string;
  forwardValidationNote: string | null;
  forwardValidationNoteUpdatedAt: Date | null;
  normalizedRuleJson: unknown;
  generatedPine: string | null;
  warningsJson: unknown;
  assumptionsJson: unknown;
  market: string;
  timeframe: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type Runtime = {
  seq: number;
  versionSeq: number;
  versions: Map<string, VersionRow>;
  pineScripts: Map<string, any>;
  annotations: Map<string, any>;
  sessions: Map<string, any>;
  candidates: Map<string, any>;
  rewriteContexts: unknown[];
};

let runtime: Runtime;

const rewriteRuleDraftMock = vi.fn();

function now() {
  return new Date('2026-06-07T00:00:00.000Z');
}

function createRuntime(): Runtime {
  return {
    seq: 1,
    versionSeq: 1,
    versions: new Map([
      [
        'ver-1',
        {
          id: 'ver-1',
          strategyRuleId: 'str-1',
          clonedFromVersionId: null,
          naturalLanguageRule: '25日移動平均を上抜けたら買い、下抜けたら手仕舞いする。',
          forwardValidationNote: null,
          forwardValidationNoteUpdatedAt: null,
          normalizedRuleJson: null,
          generatedPine: '//@version=6\nstrategy("base")',
          warningsJson: ['base warning'],
          assumptionsJson: [],
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'draft',
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    ]),
    pineScripts: new Map([
      [
        'pine-1',
        {
          id: 'pine-1',
          strategyRuleVersionId: 'ver-1',
          parentPineScriptId: null,
          scriptName: 'base',
          pineVersion: '6',
          scriptBody: '//@version=6\nstrategy("base")',
          generationNoteJson: { source: 'test' },
          status: 'ready',
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    ]),
    annotations: new Map(),
    sessions: new Map(),
    candidates: new Map(),
    rewriteContexts: [],
  };
}

const backtestRow = {
  id: 'bt-1',
  strategyRuleVersionId: 'ver-1',
  title: 'source backtest',
  executionSource: 'tradingview',
  market: 'JP_STOCK',
  timeframe: 'D',
  status: 'imported',
  strategySnapshotJson: null,
  createdAt: now(),
  updatedAt: now(),
  imports: [{ id: 'imp-1', parsedSummaryJson: { totalTrades: 18, profitFactor: 0.91 }, createdAt: now() }],
};

const aiSummaryRow = {
  id: 'sum-1',
  summaryScope: 'backtest_review',
  targetEntityType: 'backtest',
  targetEntityId: 'bt-1',
  title: 'AI review',
  bodyMarkdown: 'safe body',
  structuredJson: {
    schema_name: 'backtest_review_summary',
    schema_version: '1.0',
    payload: {
      next_actions: ['候補1のversionを作り、PFと最大DDを比較する。'],
      overall_view: '自然言語ルール本文でentryとriskを分けて改善する。',
      risks: ['PFが弱い。'],
      strengths: ['検証素材は利用可能。'],
      key_metrics: { total_trades: 18, profit_factor: 0.91 },
      rule_refinement_candidates: [
        {
          title: 'entry filterを強化する',
          target_area: 'entry',
          rationale: 'PFが弱いためentry条件を明確化する。',
          change_summary: '出来高filterとtrend filterをentry条件に追加する。',
          entry_change: '出来高が20日平均を上回り、終値が25日移動平均を上回る場合のみentryする。',
          exit_change: null,
          risk_change: '5% stop lossを比較する。',
          validation_plan: '元versionと候補versionを同じ期間で比較する。',
          expected_metric_effect: {
            profit_factor: '改善候補',
            win_rate: '改善候補',
            max_drawdown: '低下候補',
            trade_count: '減少候補',
          },
        },
      ],
    },
  },
  generatedAt: now(),
  createdAt: now(),
};

vi.mock('../src/ai/home-ai-service', () => {
  class HomeAiService {
    async rewriteNaturalLanguageRuleDraft(context: unknown) {
      runtime.rewriteContexts.push(context);
      return rewriteRuleDraftMock(context);
    }
  }
  return { HomeAiService };
});

vi.mock('../src/db', () => {
  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    backtest: {
      findUnique: async ({ where, include }: any) => {
        if (where.id !== 'bt-1') return null;
        return {
          ...backtestRow,
          strategyRuleVersion: runtime.versions.get('ver-1'),
          imports: include?.imports ? backtestRow.imports : [],
        };
      },
      findFirst: async ({ where, include }: any) => {
        const versionId = where.strategyRuleVersionId;
        if (versionId === 'ver-created-1') {
          return {
            ...backtestRow,
            id: 'bt-candidate-1',
            strategyRuleVersionId: versionId,
            title: 'candidate report',
            imports: include?.imports ? [{ id: 'imp-candidate-1', parsedSummaryJson: { totalTrades: 12, profitFactor: 1.24, winRate: 55, maxDrawdown: -1200, netProfit: 2400 }, createdAt: now() }] : [],
          };
        }
        return null;
      },
    },
    aiSummary: {
      findFirst: async () => aiSummaryRow,
    },
    symbolStrategyApplicationRun: {
      findFirst: async () => ({
        id: 'run-1',
        backtestId: 'bt-1',
        application: {
          id: 'app-1',
          symbolId: 'sym-1',
        },
      }),
    },
    strategyOptimizationSession: {
      create: async ({ data }: any) => {
        const id = `sess-${runtime.seq++}`;
        const row = { id, ...data, createdAt: now(), updatedAt: now() };
        runtime.sessions.set(id, row);
        return row;
      },
      findUnique: async ({ where }: any) => runtime.sessions.get(where.id) ?? null,
      findFirst: async ({ where }: any) => Array.from(runtime.sessions.values()).find((row) =>
        row.sourceBacktestId === where.sourceBacktestId &&
        row.baseStrategyVersionId === where.baseStrategyVersionId &&
        row.objectiveType === where.objectiveType &&
        row.status === where.status
      ) ?? null,
    },
    strategyRefinementCandidate: {
      create: async ({ data }: any) => {
        const id = `cand-${runtime.seq++}`;
        const row = { id, ...data, createdAt: now(), updatedAt: now(), selectedAt: null, createdStrategyRuleVersionId: null };
        runtime.candidates.set(id, row);
        return row;
      },
      findUnique: async ({ where }: any) => runtime.candidates.get(where.id) ?? null,
      findMany: async ({ where }: any) => Array.from(runtime.candidates.values())
        .filter((row) => row.sessionId === where.sessionId)
        .sort((a, b) => a.candidateIndex - b.candidateIndex),
      update: async ({ where, data }: any) => {
        const row = runtime.candidates.get(where.id);
        if (!row) throw new Error('candidate_not_found');
        const next = { ...row, ...data, updatedAt: now() };
        runtime.candidates.set(where.id, next);
        return next;
      },
    },
    strategyRuleVersion: {
      findUnique: async ({ where, include }: any) => {
        const row = runtime.versions.get(where.id) ?? null;
        if (!row) return null;
        return include?.clonedFromVersion ? { ...row, clonedFromVersion: null } : row;
      },
      create: async ({ data }: any) => {
        const id = `ver-created-${runtime.versionSeq++}`;
        const row: VersionRow = {
          id,
          strategyRuleId: data.strategyRuleId,
          clonedFromVersionId: data.clonedFromVersionId ?? null,
          naturalLanguageRule: data.naturalLanguageRule,
          forwardValidationNote: null,
          forwardValidationNoteUpdatedAt: null,
          normalizedRuleJson: data.normalizedRuleJson ?? null,
          generatedPine: data.generatedPine ?? null,
          warningsJson: data.warningsJson ?? null,
          assumptionsJson: data.assumptionsJson ?? null,
          market: data.market,
          timeframe: data.timeframe,
          status: data.status ?? 'draft',
          createdAt: now(),
          updatedAt: now(),
        };
        runtime.versions.set(id, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.versions.get(where.id);
        if (!row) throw new Error('version_not_found');
        const next = { ...row, ...data, updatedAt: now() };
        runtime.versions.set(where.id, next);
        return next;
      },
    },
    pineScript: {
      findFirst: async ({ where }: any) => Array.from(runtime.pineScripts.values())
        .filter((row) => row.strategyRuleVersionId === where.strategyRuleVersionId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      create: async ({ data }: any) => {
        const id = `pine-${runtime.seq++}`;
        const row = { id, ...data, createdAt: now(), updatedAt: now() };
        runtime.pineScripts.set(id, row);
        return row;
      },
    },
    strategyVersionAnnotation: {
      create: async ({ data }: any) => {
        const row = { id: `ann-${runtime.seq++}`, ...data, createdAt: now(), updatedAt: now() };
        runtime.annotations.set(data.strategyRuleVersionId, row);
        return row;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = runtime.annotations.get(where.strategyRuleVersionId);
        const row = existing ? { ...existing, ...update, updatedAt: now() } : { id: `ann-${runtime.seq++}`, ...create, createdAt: now(), updatedAt: now() };
        runtime.annotations.set(where.strategyRuleVersionId, row);
        return row;
      },
    },
  };
  return { prisma };
});

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(backtestRoutes, { prefix: '/api/backtests' });
  app.register(strategyOptimizationSessionRoutes, { prefix: '/api/strategy-optimization-sessions' });
  app.register(strategyRefinementCandidateRoutes, { prefix: '/api/strategy-refinement-candidates' });
  app.register(strategyVersionRoutes, { prefix: '/api/strategy-versions' });
  await app.ready();
  return app;
}

describe('strategy optimization session routes', () => {
  beforeEach(() => {
    runtime = createRuntime();
    rewriteRuleDraftMock.mockReset();
    rewriteRuleDraftMock.mockResolvedValue({
      output: {
        naturalLanguageRule: 'entry filterを強化し、riskを明確化した改善後ルール。',
        warnings: ['保存は未実行です。'],
        assumptions: [],
        modelName: 'stub',
        promptVersion: 'v1',
      },
      log: { provider: 'stub', fallbackToStub: false },
    });
  });

  it('creates a session from sanitized AI summary candidates without cloning automatically', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/optimization-sessions',
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    const body = res.json().data.optimization_session;
    expect(body).toMatchObject({
      source_backtest_id: 'bt-1',
      symbol_id: 'sym-1',
      strategy_rule_id: 'str-1',
      base_strategy_version_id: 'ver-1',
      objective_type: 'balanced',
      status: 'active',
      candidate_count: 1,
    });
    expect(body.candidates[0]).toMatchObject({
      candidate_index: 1,
      parent_strategy_version_id: 'ver-1',
      title: 'entry filterを強化する',
      status: 'proposed',
    });
    expect(runtime.versions.size).toBe(1);
    expect(JSON.stringify(body)).not.toContain('//@version=6');
    expect(JSON.stringify(body)).not.toContain('raw prompt');

    await app.close();
  });

  it('creates a cloned version only from explicit candidate create-version', async () => {
    const app = await createApp();
    const createdSession = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/optimization-sessions',
      payload: {},
    });
    const candidateId = createdSession.json().data.optimization_session.candidates[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/strategy-refinement-candidates/${candidateId}/create-version`,
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.strategy_version).toMatchObject({
      id: 'ver-created-1',
      strategy_id: 'str-1',
      cloned_from_version_id: 'ver-1',
      market: 'JP_STOCK',
      timeframe: 'D',
    });
    expect(body.refinement_candidate).toMatchObject({
      id: candidateId,
      status: 'version_created',
      created_strategy_version_id: 'ver-created-1',
    });
    expect(body.detail_url).toContain('/strategy-versions/ver-created-1?');
    expect(body.detail_url).toContain('refinement_candidate_id=');
    expect(JSON.stringify(body)).not.toContain('natural_language_rule');
    expect(JSON.stringify(body)).not.toContain('generated_pine');
    const copiedPine = Array.from(runtime.pineScripts.values()).find((item) => item.strategyRuleVersionId === 'ver-created-1');
    expect(copiedPine?.parentPineScriptId).toBe('pine-1');
    expect(runtime.annotations.get('ver-created-1')?.label).toContain('entry filter');

    await app.close();
  });

  it('passes refinement_candidate_id into rewrite draft without saving or running Pine', async () => {
    const app = await createApp();
    const createdSession = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/optimization-sessions',
      payload: {},
    });
    const candidateId = createdSession.json().data.optimization_session.candidates[0].id;
    await app.inject({
      method: 'POST',
      url: `/api/strategy-refinement-candidates/${candidateId}/create-version`,
      payload: {},
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-created-1/natural-language-rule/rewrite-draft',
      payload: {
        refinement_candidate_id: candidateId,
        improvement_memo: 'candidateをもとにentryとriskを改善する',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.draft).toMatchObject({
      source: 'llm_rewrite',
      base_version_id: 'ver-created-1',
      source_backtest_id: 'bt-1',
      refinement_candidate_id: candidateId,
    });
    expect(rewriteRuleDraftMock).toHaveBeenCalledTimes(1);
    expect(runtime.rewriteContexts[0]).toMatchObject({
      strategyVersionId: 'ver-created-1',
      sourceBacktestId: 'bt-1',
      aiSummary: {
        ruleRefinementCandidates: expect.arrayContaining([
          expect.objectContaining({
            title: 'entry filterを強化する',
          }),
        ]),
      },
    });
    expect(runtime.versions.get('ver-created-1')?.naturalLanguageRule).toBe(runtime.versions.get('ver-1')?.naturalLanguageRule);
    expect(runtime.pineScripts.size).toBe(2);

    await app.close();
  });

  it('reuses an active session for the same source backtest and objective', async () => {
    const app = await createApp();

    const first = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/optimization-sessions',
      payload: {},
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/optimization-sessions',
      payload: {},
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.optimization_session.id).toBe(first.json().data.optimization_session.id);
    expect(runtime.sessions.size).toBe(1);
    expect(runtime.candidates.size).toBe(1);

    await app.close();
  });

  it('returns comparison rows and raw-data flags from session detail', async () => {
    const app = await createApp();
    const createdSession = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/optimization-sessions',
      payload: {},
    });
    const sessionId = createdSession.json().data.optimization_session.id;
    const candidateId = createdSession.json().data.optimization_session.candidates[0].id;
    await app.inject({
      method: 'POST',
      url: `/api/strategy-refinement-candidates/${candidateId}/create-version`,
      payload: {},
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/strategy-optimization-sessions/${sessionId}`,
    });

    expect(detail.statusCode).toBe(200);
    const body = detail.json().data.optimization_session;
    expect(body.source_backtest.metrics.profit_factor).toBe(0.91);
    expect(body.base_version).toMatchObject({
      id: 'ver-1',
      strategy_id: 'str-1',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'draft',
    });
    expect(body.candidates[0].latest_backtest_report.metrics.profit_factor).toBe(1.24);
    expect(body.comparison_rows[0].latest_backtest_report.diff_vs_base.profit_factor).toBe(0.33);
    expect(body.meta).toMatchObject({
      includes_raw_prompt: false,
      includes_raw_provider_response: false,
      includes_raw_csv: false,
      includes_raw_import_text: false,
      includes_raw_pine: false,
    });

    await app.close();
  });
});
