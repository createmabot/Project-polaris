import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AiJobRow = {
  id: string;
  jobType: string;
  targetEntityType: string;
  targetEntityId: string;
  requestPayload?: Record<string, unknown> | null;
  status: string;
  errorMessage?: string | null;
  responsePayload?: Record<string, unknown> | null;
  modelName?: string | null;
  promptVersion?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  durationMs?: number | null;
  estimatedCostUsd?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type AiSummaryRow = {
  id: string;
  aiJobId?: string | null;
  summaryScope: string;
  targetEntityType: string;
  targetEntityId: string;
  title: string | null;
  bodyMarkdown: string;
  structuredJson: Record<string, unknown> | null;
  generatedAt: Date | null;
  inputSnapshotHash?: string | null;
  modelName?: string | null;
  promptVersion?: string | null;
  generationContextJson?: Record<string, unknown> | null;
};

type BacktestRow = {
  id: string;
  strategyRuleVersionId: string;
  title: string;
  executionSource: string;
  market: string;
  timeframe: string;
  status: string;
  strategySnapshotJson: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  strategyRuleVersion: {
    id: string;
    strategyRuleId: string;
    naturalLanguageRule: string;
    generatedPine: string | null;
  } | null;
  imports: Array<{
    id: string;
    backtestId: string;
    fileName: string;
    fileSize: number;
    contentType: string | null;
    parseStatus: string;
    parseError: string | null;
    parsedSummaryJson: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

type Runtime = {
  backtest: BacktestRow | null;
  aiJobs: AiJobRow[];
  aiSummaries: AiSummaryRow[];
  nextJobId: number;
  nextSummaryId: number;
  homeAiMode: 'ok' | 'throw' | 'throw_ai_provider' | 'fallback';
  lastBacktestContext: any | null;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    backtest: {
      id: 'bt-1',
      strategyRuleVersionId: 'ver-1',
      title: 'BT Toyota',
      executionSource: 'tradingview',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'imported',
      strategySnapshotJson: {
        strategy_id: 'str-1',
        strategy_version_id: 'ver-1',
        natural_language_rule: 'ma breakout',
        generated_pine: 'strategy("x")',
        market: 'JP_STOCK',
        timeframe: 'D',
        warnings: [],
        assumptions: [],
        captured_at: '2026-04-20T10:00:00.000Z',
      },
      createdAt: new Date('2026-04-20T10:00:00.000Z'),
      updatedAt: new Date('2026-04-20T10:10:00.000Z'),
      strategyRuleVersion: {
        id: 'ver-1',
        strategyRuleId: 'str-1',
        naturalLanguageRule: 'ma breakout',
        generatedPine: 'strategy("x")',
      },
      imports: [
        {
          id: 'imp-1',
          backtestId: 'bt-1',
          fileName: 'a.csv',
          fileSize: 100,
          contentType: 'text/csv',
          parseStatus: 'parsed',
          parseError: null,
          parsedSummaryJson: {
            totalTrades: 120,
            winRate: 58.2,
            profitFactor: 1.42,
            maxDrawdown: -12.5,
            netProfit: 340000,
            periodFrom: '2025-01-01',
            periodTo: '2025-12-31',
          },
          createdAt: new Date('2026-04-20T10:05:00.000Z'),
          updatedAt: new Date('2026-04-20T10:05:00.000Z'),
        },
      ],
    },
    aiJobs: [],
    aiSummaries: [],
    nextJobId: 1,
    nextSummaryId: 1,
    homeAiMode: 'ok',
    lastBacktestContext: null,
  };
}

function nextJobId(): string {
  const id = `job-${runtime.nextJobId}`;
  runtime.nextJobId += 1;
  return id;
}

function nextSummaryId(): string {
  const id = `sum-${runtime.nextSummaryId}`;
  runtime.nextSummaryId += 1;
  return id;
}

vi.mock('../src/db', () => {
  const prisma = {
    backtest: {
      findUnique: async ({ where }: any) => {
        if (!runtime.backtest || where?.id !== runtime.backtest.id) return null;
        return runtime.backtest;
      },
    },
    aiJob: {
      create: async ({ data }: any) => {
        const row: AiJobRow = {
          id: nextJobId(),
          jobType: data.jobType,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          requestPayload: data.requestPayload ?? null,
          status: data.status ?? 'queued',
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          responsePayload: data.responsePayload ?? null,
          errorMessage: null,
          startedAt: data.startedAt ?? null,
          completedAt: data.completedAt ?? null,
          durationMs: data.durationMs ?? null,
          estimatedCostUsd: data.estimatedCostUsd ?? null,
          createdAt: new Date(Date.now() + runtime.nextJobId),
          updatedAt: new Date(Date.now() + runtime.nextJobId),
        };
        runtime.aiJobs.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => {
        const rows = runtime.aiJobs
          .filter((job) => {
            if (where?.jobType && job.jobType !== where.jobType) return false;
            if (where?.targetEntityType && job.targetEntityType !== where.targetEntityType) return false;
            if (where?.targetEntityId && job.targetEntityId !== where.targetEntityId) return false;
            if (where?.status?.in && !where.status.in.includes(job.status)) return false;
            const expectedHash = where?.requestPayload?.equals;
            if (expectedHash && job.requestPayload?.input_snapshot_hash !== expectedHash) return false;
            return true;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.aiJobs.find((job) => job.id === where.id);
        if (!row) throw new Error(`job not found: ${where.id}`);
        Object.assign(row, data, { updatedAt: new Date(Date.now() + runtime.nextJobId) });
        return row;
      },
    },
    aiSummary: {
      findFirst: async ({ where }: any) => {
        const rows = runtime.aiSummaries.filter((summary) => {
          if (where?.id && summary.id !== where.id) return false;
          if (where?.aiJobId && summary.aiJobId !== where.aiJobId) return false;
          if (where?.targetEntityType && summary.targetEntityType !== where.targetEntityType) return false;
          if (where?.targetEntityId && summary.targetEntityId !== where.targetEntityId) return false;
          if (where?.summaryScope && summary.summaryScope !== where.summaryScope) return false;
          if (where?.inputSnapshotHash && summary.inputSnapshotHash !== where.inputSnapshotHash) return false;
          if (Array.isArray(where?.OR) && where.OR.length > 0) {
            const matchedOr = where.OR.some((condition: any) => {
              if (condition.targetEntityType && summary.targetEntityType !== condition.targetEntityType) return false;
              if (condition.targetEntityId?.in) {
                return condition.targetEntityId.in.includes(summary.targetEntityId);
              }
              if (condition.targetEntityId) {
                return summary.targetEntityId === condition.targetEntityId;
              }
              return true;
            });
            if (!matchedOr) return false;
          }
          return true;
        });
        rows.sort((a, b) => (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0));
        return rows[0] ?? null;
      },
      create: async ({ data }: any) => {
        const row: AiSummaryRow = {
          id: nextSummaryId(),
          aiJobId: data.aiJobId ?? null,
          summaryScope: data.summaryScope,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          title: data.title ?? null,
          bodyMarkdown: data.bodyMarkdown,
          structuredJson: data.structuredJson ?? null,
          generatedAt: data.generatedAt ?? null,
          inputSnapshotHash: data.inputSnapshotHash ?? null,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          generationContextJson: data.generationContextJson ?? null,
        };
        runtime.aiSummaries.push(row);
        return row;
      },
    },
    symbolStrategyApplicationRun: {
      findFirst: async () => null,
    },
  };

  return { prisma };
});

vi.mock('../src/ai/home-ai-service', () => ({
  HomeAiService: class {
    async generateBacktestSummary(_context: any) {
      runtime.lastBacktestContext = _context;
      if (runtime.homeAiMode === 'throw') {
        throw new Error('provider failed');
      }
      if (runtime.homeAiMode === 'throw_ai_provider') {
        throw new Error('ai_provider_failed(local_llm): local_llm backtest summary returned empty content');
      }

      if (runtime.homeAiMode === 'fallback') {
        return {
          output: {
            title: 'fallback backtest summary',
            bodyMarkdown: [
              '## fallback backtest summary',
              '',
              '### 概要',
              'fallback',
              '',
              '### 主要メトリクス',
              '- 主要メトリクスは不足しています。',
              '',
              '### 成績評価',
              '- fallback',
              '',
              '### 問題の切り分け',
              '- limited context',
              '',
              '### 改善仮説',
              '- entry / exit / risk 条件を切り分ける',
              '',
              '### 自然言語ルール改善案',
              'fallback',
              '',
              '### Pine修正依頼に入れるべきではない注意',
              '- strategy logic の変更は自然言語ルール本文に反映する',
              '',
              '### 次に試す検証案',
              '- re-check',
              '',
              '### 注意点',
              '- 生データは含めない',
            ].join('\n'),
            structuredJson: {
              schema_name: 'backtest_review_summary',
              schema_version: '1.0',
              confidence: 'low',
              insufficient_context: true,
              payload: {
                conclusion: 'fallback',
                strengths: [],
                risks: ['limited context'],
                next_actions: ['entry / exit / risk 条件を見直して再検証する'],
                key_metrics: {
                  total_trades: null,
                  win_rate: null,
                  profit_factor: null,
                  max_drawdown: null,
                  net_profit: null,
                },
                overall_view: '自然言語ルール本文で entry / exit / risk 条件を見直す。',
                rule_refinement_candidates: [
                  {
                    title: 'entry filter見直し',
                    target_area: 'entry',
                    rationale: 'context不足時もentry条件の検証観点を残す',
                    change_summary: 'entry / exit / risk 条件を分けて比較する',
                    entry_change: 'entry triggerを測定可能な条件にする',
                    exit_change: 'exit triggerを明確化する',
                    risk_change: 'stop loss候補を比較する',
                    validation_plan: '条件を1つずつ変えた比較検証を行う',
                    expected_metric_effect: {
                      profit_factor: null,
                      win_rate: null,
                      max_drawdown: null,
                      trade_count: null,
                    },
                  },
                ],
              },
            },
            modelName: 'stub-backtest-v1',
            promptVersion: 'v1.0.0-backtest-stub',
          },
          log: {
            initialModel: 'gemma4-ns',
            finalModel: 'stub-backtest-v1',
            escalated: false,
            escalationReason: 'provider_failed_fallback_to_stub',
            retryCount: 0,
            durationMs: 20,
            estimatedTokens: 100,
            estimatedCostUsd: 0,
            provider: 'local_llm',
            fallbackToStub: true,
          },
        };
      }

      return {
        output: {
          title: 'backtest summary',
          bodyMarkdown: [
            '## backtest summary',
            '',
            '### 概要',
            '総評',
            '',
            '### 主要メトリクス',
            '- total trades: 120',
            '- profit factor: 1.42',
            '',
            '### 成績評価',
            '- Stable profitability',
            '',
            '### 問題の切り分け',
            '- Regime shift risk',
            '',
            '### 改善仮説',
            '- entry / exit / risk 条件を切り分ける',
            '',
            '### 自然言語ルール改善案',
            'entry / exit / risk 条件を改善候補として検証する。',
            '',
            '### Pine修正依頼に入れるべきではない注意',
            '- strategy logic の変更は自然言語ルール本文に反映する',
            '',
            '### 次に試す検証案',
            '- entry filter と exit 条件を分けて再検証する',
            '',
            '### 注意点',
            '- 投資助言ではなく検証候補です。',
          ].join('\n'),
          structuredJson: {
            schema_name: 'backtest_review_summary',
            schema_version: '1.0',
            confidence: 'medium',
            insufficient_context: false,
            payload: {
              conclusion: '総評',
              strengths: ['Stable profitability'],
              risks: ['Regime shift risk'],
              next_actions: ['entry filter と exit 条件を分けて再検証する'],
              key_metrics: {
                total_trades: 120,
                win_rate: 58.2,
                profit_factor: 1.42,
                max_drawdown: -12.5,
                net_profit: 340000,
              },
              overall_view: 'entry / exit / risk 条件を改善候補として検証する。',
              rule_refinement_candidates: [
                {
                  title: 'entry filter強化',
                  target_area: 'entry',
                  rationale: '勝率とPFの改善余地を切り分ける',
                  change_summary: 'entry filter と stop loss 条件を明確化する',
                  entry_change: 'entry時に出来高filterを追加する',
                  exit_change: 'exit条件を移動平均割れとtime exitで比較する',
                  risk_change: '最大DD抑制のためstop lossを比較する',
                  validation_plan: '現行ルールとentry filter追加版を同一期間で比較する',
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
          modelName: 'gemma4-ns',
          promptVersion: 'v1.0.0-backtest-local',
        },
        log: {
          initialModel: 'gemma4-ns',
          finalModel: 'gemma4-ns',
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: 25,
          estimatedTokens: 120,
          estimatedCostUsd: 0,
          provider: 'local_llm',
          fallbackToStub: false,
        },
      };
    }
  },
}));

import { backtestRoutes } from '../src/routes/backtests';
import { errorHandler } from '../src/utils/response';

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(backtestRoutes, { prefix: '/api/backtests' });
  await app.ready();
  return app;
}

describe('backtest ai-summary routes', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('generates backtest summary and stores ai_jobs/ai_summaries', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.summary.status).toBe('available');
    expect(runtime.aiJobs).toHaveLength(1);
    expect(runtime.aiJobs[0].status).toBe('succeeded');
    expect(runtime.aiSummaries).toHaveLength(1);
    expect(runtime.aiSummaries[0].summaryScope).toBe('backtest_review');
    expect(runtime.lastBacktestContext?.tradeSummary).not.toBeNull();
    expect(runtime.lastBacktestContext?.tradeSummary?.parsedImportCount).toBe(1);
    expect(runtime.lastBacktestContext?.importParsedSummaries?.length).toBeGreaterThan(0);
    expect(runtime.lastBacktestContext?.comparisonDiff).toBeNull();
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 概要');
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 主要メトリクス');
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 成績評価');
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 問題の切り分け');
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 改善仮説');
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 自然言語ルール改善案');
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### Pine修正依頼に入れるべきではない注意');
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 次に試す検証案');
    expect(runtime.aiSummaries[0].structuredJson?.schema_version).toBe('1.0');
    expect((runtime.aiSummaries[0].structuredJson?.payload as any)?.next_actions).toEqual(
      expect.arrayContaining(['entry filter と exit 条件を分けて再検証する']),
    );
    const candidates = (runtime.aiSummaries[0].structuredJson?.payload as any)?.rule_refinement_candidates;
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: expect.any(String),
          change_summary: expect.stringMatching(/entry|exit|risk|stop|filter/i),
          validation_plan: expect.any(String),
        }),
      ]),
    );
    expect(
      candidates.some((candidate: any) => candidate.entry_change || candidate.exit_change || candidate.risk_change),
    ).toBe(true);
    const serializedSummary = JSON.stringify(runtime.aiSummaries[0]);
    expect(serializedSummary).not.toContain('raw CSV');
    expect(serializedSummary).not.toContain('raw import text');
    expect(serializedSummary).not.toContain('endpoint');
    expect(serializedSummary).not.toContain('secret');

    await app.close();
  });

  it('keeps duplicate guard by default and allows explicit manual regeneration', async () => {
    const app = await createApp();

    const first = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    expect(runtime.aiSummaries).toHaveLength(1);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });
    expect(duplicate.statusCode).toBe(200);
    expect(runtime.aiSummaries).toHaveLength(1);
    expect(runtime.aiJobs).toHaveLength(2);
    expect(runtime.aiJobs[1].responsePayload).toMatchObject({ skipped: 'duplicate' });

    const regenerated = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: { force: true },
    });
    expect(regenerated.statusCode).toBe(200);
    expect(runtime.aiSummaries).toHaveLength(2);
    expect(runtime.aiJobs).toHaveLength(3);
    expect(JSON.stringify(regenerated.json().data)).not.toContain('endpoint');
    expect(JSON.stringify(regenerated.json().data)).not.toContain('secret');

    await app.close();
  });

  it('passes internal_backtest result context without requiring BacktestImport', async () => {
    runtime.backtest = {
      ...runtime.backtest!,
      executionSource: 'internal_backtest',
      status: 'completed',
      imports: [],
      strategySnapshotJson: {
        strategy_id: 'str-1',
        strategy_version_id: 'ver-1',
        natural_language_rule: 'ma breakout',
        generated_pine: 'strategy("x")',
        market: 'JP_STOCK',
        timeframe: 'D',
        warnings: [],
        assumptions: [],
        captured_at: '2026-04-20T10:00:00.000Z',
        execution_source: 'internal_backtest',
        internal_backtest_execution_id: 'exec-1',
        result_summary: {
          summary_kind: 'engine_estimated',
          period: {
            from: '2025-01-01',
            to: '2025-12-31',
          },
          metrics: {
            bar_count: 245,
            price_change_percent: 12.5,
            range_percent: 24.8,
          },
        },
        artifact_pointer: {
          kind: 'internal_backtest_result',
          execution_id: 'exec-1',
        },
        reported_at: '2026-04-21T00:00:00.000Z',
      },
    };

    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(runtime.lastBacktestContext?.metrics).toBeNull();
    expect(runtime.lastBacktestContext?.importParsedSummaries).toEqual([]);
    expect(runtime.lastBacktestContext?.internalBacktestContext).toMatchObject({
      executionSource: 'internal_backtest',
      internalBacktestExecutionId: 'exec-1',
      summaryKind: 'engine_estimated',
      period: {
        from: '2025-01-01',
        to: '2025-12-31',
      },
      metrics: {
        bar_count: 245,
        price_change_percent: 12.5,
        range_percent: 24.8,
      },
    });
    expect(runtime.aiSummaries[0].generationContextJson).toMatchObject({
      has_internal_backtest_context: true,
      internal_backtest_execution_id: 'exec-1',
      import_count: 0,
    });

    await app.close();
  });

  it('does not persist unsafe natural language rule text in generated summary payload', async () => {
    const unsafeRule = 'entry uses https://example.com/api and token=SECRET_VALUE and C:\\Users\\foo\\secret.txt';
    runtime.homeAiMode = 'fallback';
    runtime.backtest = {
      ...runtime.backtest!,
      strategySnapshotJson: {
        ...runtime.backtest!.strategySnapshotJson,
        natural_language_rule: unsafeRule,
      },
      strategyRuleVersion: {
        ...runtime.backtest!.strategyRuleVersion!,
        naturalLanguageRule: unsafeRule,
      },
    };

    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(runtime.lastBacktestContext?.strategy?.naturalLanguageRule).toBe(unsafeRule);
    const serializedSummary = JSON.stringify(runtime.aiSummaries[0]);
    expect(runtime.aiSummaries[0].structuredJson?.schema_version).toBe('1.0');
    expect(serializedSummary).not.toContain('https://example.com/api');
    expect(serializedSummary).not.toContain('SECRET_VALUE');
    expect(serializedSummary).not.toContain('C:\\Users\\foo\\secret.txt');
    expect(serializedSummary).not.toContain(unsafeRule);

    await app.close();
  });

  it('returns ai_review on backtest detail GET', async () => {
    runtime.aiSummaries.push({
      id: 'sum-existing',
      summaryScope: 'backtest_review',
      targetEntityType: 'backtest',
      targetEntityId: 'bt-1',
      title: 'existing review',
      bodyMarkdown: 'existing body',
      structuredJson: {
        schema_name: 'backtest_review_summary',
        schema_version: '1.0',
        confidence: 'medium',
        insufficient_context: false,
        payload: {},
      },
      generatedAt: new Date('2026-04-22T10:00:00+09:00'),
    });

    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/backtests/bt-1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.ai_review).toMatchObject({
      status: 'available',
      title: 'existing review',
      summary_id: 'sum-existing',
    });

    await app.close();
  });

  it('returns latest AI summary job status on backtest detail GET', async () => {
    runtime.aiJobs.push({
      id: 'job-failed',
      jobType: 'generate_backtest_review_summary',
      targetEntityType: 'backtest',
      targetEntityId: 'bt-1',
      requestPayload: {
        trigger: 'csv_import_auto',
        input_snapshot_hash: 'hash-1',
      },
      status: 'failed',
      errorMessage: 'provider failed token=<redact-me>',
      responsePayload: null,
      modelName: null,
      promptVersion: null,
      startedAt: new Date('2026-04-22T01:00:00.000Z'),
      completedAt: new Date('2026-04-22T01:00:02.000Z'),
      durationMs: 2000,
      estimatedCostUsd: 0,
      createdAt: new Date('2026-04-22T01:00:00.000Z'),
      updatedAt: new Date('2026-04-22T01:00:02.000Z'),
    });

    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/backtests/bt-1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.latest_ai_summary_job).toMatchObject({
      job_id: 'job-failed',
      status: 'failed',
      trigger: 'csv_import_auto',
      error_message: 'provider failed token=[REDACTED]',
      duration_ms: 2000,
      estimated_cost_usd: 0,
      created_at: '2026-04-22T01:00:00.000Z',
      completed_at: '2026-04-22T01:00:02.000Z',
    });
    expect(JSON.stringify(res.json().data.latest_ai_summary_job)).not.toContain('<redact-me>');

    await app.close();
  });

  it('sets ai_jobs to failed when provider returns error', async () => {
    runtime.homeAiMode = 'throw';
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(500);
    expect(runtime.aiJobs).toHaveLength(1);
    expect(runtime.aiJobs[0].status).toBe('failed');
    expect(runtime.aiJobs[0].errorMessage).toContain('provider failed');

    await app.close();
  });

  it('returns AI_PROVIDER_FAILED when provider failure is classified', async () => {
    runtime.homeAiMode = 'throw_ai_provider';
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('AI_PROVIDER_FAILED');
    expect(runtime.aiJobs).toHaveLength(1);
    expect(runtime.aiJobs[0].status).toBe('failed');
    expect(runtime.aiJobs[0].errorMessage).toContain('ai_provider_failed(local_llm)');

    await app.close();
  });

  it('persists summary with fallback metadata when provider falls back', async () => {
    runtime.homeAiMode = 'fallback';
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(runtime.aiSummaries).toHaveLength(1);
    expect(runtime.aiSummaries[0].generationContextJson?.fallback_to_stub).toBe(true);

    await app.close();
  });
});
