import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strategyVersionRoutes } from '../src/routes/strategy-versions';
import { generatePineDeterministic } from '../src/strategy/pine';
import { errorHandler } from '../src/utils/response';

type StrategyRuleVersionRow = {
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

type PineScriptRow = {
  id: string;
  strategyRuleVersionId: string;
  parentPineScriptId: string | null;
  scriptName: string;
  pineVersion: string;
  scriptBody: string;
  generationNoteJson: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type Runtime = {
  pineSeq: number;
  revisionSeq: number;
  jobSeq: number;
  versionSeq: number;
  failNextPineScriptCreate: boolean;
  versions: Map<string, StrategyRuleVersionRow>;
  backtests: Map<string, {
    id: string;
    strategyRuleVersionId: string | null;
    title: string;
    executionSource: string;
    market: string;
    timeframe: string;
    status: string;
    strategySnapshotJson: unknown;
    createdAt: Date;
    updatedAt: Date;
    imports: Array<{
      id: string;
      parsedSummaryJson: unknown;
      createdAt: Date;
    }>;
  }>;
  aiSummaries: Array<{
    id: string;
    summaryScope: string;
    targetEntityType: string;
    targetEntityId: string;
    structuredJson: unknown;
    generatedAt: Date;
    createdAt: Date;
  }>;
  pineScripts: Map<string, PineScriptRow>;
  pineRevisionInputs: Map<string, {
    id: string;
    strategyRuleVersionId: string;
    sourcePineScriptId: string;
    generatedPineScriptId: string | null;
    compileErrorText: string | null;
    validationNote: string | null;
    revisionRequest: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  pineGenerationJobs: Map<string, {
    id: string;
    strategyRuleVersionId: string | null;
    requestKind: string;
    status: string;
    currentStage: string;
    stageHistoryJson: unknown;
    resultPineScriptId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    errorDetailsJson: unknown;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

let runtime: Runtime;

const generatePineScriptMock = vi.fn();
const rewriteRuleDraftMock = vi.fn();

function createRuntime(): Runtime {
  const now = new Date('2026-04-25T10:00:00.000Z');
  return {
    pineSeq: 1,
    revisionSeq: 1,
    jobSeq: 1,
    versionSeq: 1,
    failNextPineScriptCreate: false,
    versions: new Map([
      [
        'ver-1',
        {
          id: 'ver-1',
          strategyRuleId: 'str-1',
          clonedFromVersionId: null,
          naturalLanguageRule: 'buy above ma25, exit below ma25',
          forwardValidationNote: null,
          forwardValidationNoteUpdatedAt: null,
          normalizedRuleJson: null,
          generatedPine: null,
          warningsJson: null,
          assumptionsJson: null,
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        },
      ],
    ]),
    backtests: new Map([
      [
        'bt-1',
        {
          id: 'bt-1',
          strategyRuleVersionId: 'ver-1',
          title: 'source validation',
          executionSource: 'tradingview_csv',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'succeeded',
          strategySnapshotJson: null,
          createdAt: now,
          updatedAt: now,
          imports: [
            {
              id: 'import-1',
              parsedSummaryJson: {
                totalTrades: 18,
                winRate: 42,
                profitFactor: 0.92,
                maxDrawdown: -18,
                netProfit: -12000,
                periodFrom: '2025-01-01',
                periodTo: '2025-12-31',
              },
              createdAt: now,
            },
          ],
        },
      ],
    ]),
    aiSummaries: [
      {
        id: 'sum-1',
        summaryScope: 'backtest_review',
        targetEntityType: 'backtest',
        targetEntityId: 'bt-1',
        structuredJson: {
          schema_name: 'backtest_review_summary',
          schema_version: '1.0',
          payload: {
            next_actions: ['entry filterを強化し、損切り幅を比較する'],
            overall_view: '自然言語ルール本文でentryとriskを明確化する',
            risks: ['最大DDが大きい'],
            strengths: ['検証素材は利用可能'],
            key_metrics: { trade_count: 18, profit_factor: 0.92 },
          },
        },
        generatedAt: now,
        createdAt: now,
      },
    ],
    pineScripts: new Map(),
    pineRevisionInputs: new Map(),
    pineGenerationJobs: new Map(),
  };
}

vi.mock('../src/ai/home-ai-service', () => {
  class HomeAiService {
    async rewriteNaturalLanguageRuleDraft(context: unknown) {
      return rewriteRuleDraftMock(context);
    }
    async generatePineScript(context: unknown, options?: { onProgress?: (update: any) => void | Promise<void> }) {
      await options?.onProgress?.({ stage: 'LLMでPine生成', progressPercent: 35 });
      await options?.onProgress?.({ stage: '生成結果レビュー', progressPercent: 65 });
      return generatePineScriptMock(context, options);
    }
  }
  return { HomeAiService };
});

vi.mock('../src/db', () => {
  const prisma = {
    $transaction: async (callback: any) => {
      const snapshot = {
        pineSeq: runtime.pineSeq,
        revisionSeq: runtime.revisionSeq,
        jobSeq: runtime.jobSeq,
        versionSeq: runtime.versionSeq,
        versions: new Map(runtime.versions),
        pineScripts: new Map(runtime.pineScripts),
        pineRevisionInputs: new Map(runtime.pineRevisionInputs),
        pineGenerationJobs: new Map(runtime.pineGenerationJobs),
      };
      try {
        return await callback(prisma);
      } catch (error) {
        runtime.pineSeq = snapshot.pineSeq;
        runtime.revisionSeq = snapshot.revisionSeq;
        runtime.jobSeq = snapshot.jobSeq;
        runtime.versionSeq = snapshot.versionSeq;
        runtime.versions = snapshot.versions;
        runtime.pineScripts = snapshot.pineScripts;
        runtime.pineRevisionInputs = snapshot.pineRevisionInputs;
        runtime.pineGenerationJobs = snapshot.pineGenerationJobs;
        throw error;
      }
    },
    strategyRuleVersion: {
      findUnique: async ({ where, include }: any) => {
        const row = runtime.versions.get(where.id) ?? null;
        if (!row) return null;
        if (include?.clonedFromVersion) {
          return { ...row, clonedFromVersion: null };
        }
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.versions.get(where.id);
        if (!row) throw new Error('version_not_found');
        const next = {
          ...row,
          ...data,
          updatedAt: new Date(),
        };
        runtime.versions.set(where.id, next);
        return next;
      },
      create: async ({ data }: any) => {
        const id = `ver-clone-${runtime.versionSeq++}`;
        const now = new Date();
        const row: StrategyRuleVersionRow = {
          id,
          strategyRuleId: data.strategyRuleId,
          clonedFromVersionId: data.clonedFromVersionId ?? null,
          naturalLanguageRule: data.naturalLanguageRule,
          forwardValidationNote: data.forwardValidationNote ?? null,
          forwardValidationNoteUpdatedAt: data.forwardValidationNoteUpdatedAt ?? null,
          normalizedRuleJson: data.normalizedRuleJson ?? null,
          generatedPine: data.generatedPine ?? null,
          warningsJson: data.warningsJson ?? null,
          assumptionsJson: data.assumptionsJson ?? null,
          market: data.market,
          timeframe: data.timeframe,
          status: data.status ?? 'draft',
          createdAt: now,
          updatedAt: now,
        };
        runtime.versions.set(id, row);
        return row;
      },
    },
    pineScript: {
      create: async ({ data }: any) => {
        if (runtime.failNextPineScriptCreate) {
          runtime.failNextPineScriptCreate = false;
          throw new Error('pine_script_create_failed');
        }
        const id = `pine-${runtime.pineSeq++}`;
        const now = new Date();
        const row: PineScriptRow = {
          id,
          strategyRuleVersionId: data.strategyRuleVersionId,
          parentPineScriptId: data.parentPineScriptId ?? null,
          scriptName: data.scriptName,
          pineVersion: data.pineVersion,
          scriptBody: data.scriptBody,
          generationNoteJson: data.generationNoteJson ?? null,
          status: data.status ?? 'ready',
          createdAt: now,
          updatedAt: now,
        };
        runtime.pineScripts.set(id, row);
        return row;
      },
      findFirst: async ({ where }: any) => {
        let rows = Array.from(runtime.pineScripts.values());
        if (where?.strategyRuleVersionId) {
          rows = rows.filter((row) => row.strategyRuleVersionId === where.strategyRuleVersionId);
        }
        if (where?.id) {
          rows = rows.filter((row) => row.id === where.id);
        }
        rows.sort((a, b) => (
          b.createdAt.getTime() - a.createdAt.getTime()
          || b.updatedAt.getTime() - a.updatedAt.getTime()
          || b.id.localeCompare(a.id, undefined, { numeric: true })
        ));
        const selected = rows[0] ?? null;
        if (!selected) return null;
        const generatedFromRevision = Array.from(runtime.pineRevisionInputs.values()).find(
          (item) => item.generatedPineScriptId === selected.id,
        ) ?? null;
        return { ...selected, generatedFromRevision };
      },
    },
    backtest: {
      findUnique: async ({ where, include }: any) => {
        const row = runtime.backtests.get(where.id) ?? null;
        if (!row) return null;
        return {
          ...row,
          imports: include?.imports ? row.imports : [],
        };
      },
    },
    aiSummary: {
      findFirst: async ({ where }: any) => {
        let rows = [...runtime.aiSummaries];
        if (where?.summaryScope) rows = rows.filter((row) => row.summaryScope === where.summaryScope);
        if (Array.isArray(where?.OR)) {
          rows = rows.filter((row) => where.OR.some((condition: any) => {
            if (condition.targetEntityType && row.targetEntityType !== condition.targetEntityType) return false;
            if (condition.targetEntityId?.in) return condition.targetEntityId.in.includes(row.targetEntityId);
            if (condition.targetEntityId) return row.targetEntityId === condition.targetEntityId;
            return true;
          }));
        }
        rows.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
        return rows[0] ?? null;
      },
    },
    pineRevisionInput: {
      create: async ({ data }: any) => {
        const id = `rev-${runtime.revisionSeq++}`;
        const now = new Date();
        const row = {
          id,
          strategyRuleVersionId: data.strategyRuleVersionId,
          sourcePineScriptId: data.sourcePineScriptId,
          generatedPineScriptId: data.generatedPineScriptId ?? null,
          compileErrorText: data.compileErrorText ?? null,
          validationNote: data.validationNote ?? null,
          revisionRequest: data.revisionRequest,
          createdAt: now,
          updatedAt: now,
        };
        runtime.pineRevisionInputs.set(id, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.pineRevisionInputs.get(where.id);
        if (!row) throw new Error('revision_input_not_found');
        const next = {
          ...row,
          ...data,
          updatedAt: new Date(),
        };
        runtime.pineRevisionInputs.set(where.id, next);
        return next;
      },
      findFirst: async ({ where }: any) => {
        let rows = Array.from(runtime.pineRevisionInputs.values());
        if (where?.strategyRuleVersionId) {
          rows = rows.filter((row) => row.strategyRuleVersionId === where.strategyRuleVersionId);
        }
        rows.sort((a, b) => (
          b.createdAt.getTime() - a.createdAt.getTime()
          || b.id.localeCompare(a.id, undefined, { numeric: true })
        ));
        return rows[0] ?? null;
      },
    },
    pineGenerationJob: {
      create: async ({ data }: any) => {
        const id = `pine-job-${runtime.jobSeq++}`;
        const now = new Date();
        const row = {
          id,
          strategyRuleVersionId: data.strategyRuleVersionId,
          requestKind: data.requestKind ?? 'generate',
          status: data.status ?? 'queued',
          currentStage: data.currentStage ?? '生成リクエスト送信',
          stageHistoryJson: data.stageHistoryJson ?? [],
          resultPineScriptId: data.resultPineScriptId ?? null,
          errorCode: data.errorCode ?? null,
          errorMessage: data.errorMessage ?? null,
          errorDetailsJson: data.errorDetailsJson ?? null,
          completedAt: data.completedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        runtime.pineGenerationJobs.set(id, row);
        return row;
      },
      findUnique: async ({ where }: any) => runtime.pineGenerationJobs.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = runtime.pineGenerationJobs.get(where.id);
        if (!row) throw new Error('pine_generation_job_not_found');
        const next = {
          ...row,
          ...data,
          updatedAt: new Date(),
        };
        runtime.pineGenerationJobs.set(where.id, next);
        return next;
      },
      findFirst: async ({ where }: any) => {
        let rows = Array.from(runtime.pineGenerationJobs.values());
        if (where?.id) {
          rows = rows.filter((row) => row.id === where.id);
        }
        if (where?.strategyRuleVersionId) {
          rows = rows.filter((row) => row.strategyRuleVersionId === where.strategyRuleVersionId);
        }
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      },
    },
  };

  return { prisma };
});

async function flushAsyncJob() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
  await Promise.resolve();
}

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(strategyVersionRoutes, { prefix: '/api/strategy-versions' });
  await app.ready();
  return app;
}

describe('deterministic pine market / timeframe scope', () => {
  const supportedRule =
    '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が25日移動平均線を下回ったら手仕舞い。';

  it('accepts US_STOCK and intraday timeframe without JP_STOCK/D fallback warnings', () => {
    const output = generatePineDeterministic({
      naturalLanguageSpec: supportedRule,
      normalizedRuleJson: null,
      targetMarket: 'US_STOCK',
      targetTimeframe: '1H',
    });

    expect(output.status).toBe('generated');
    expect(output.warnings.join(' ')).not.toContain('JP_STOCK 前提として扱います');
    expect(output.warnings.join(' ')).not.toContain('日足（D）前提として扱います');
    expect(output.assumptions).toContain('対象市場は US_STOCK として扱います。');
    expect(output.assumptions).toContain('対象時間足は 1H として扱います。');
    expect(output.assumptions).toContain('生成されたPineはTradingViewの表示中チャート時間足に従って検証します。');
  });

  it('canonicalizes 1D to D without D fallback warnings', () => {
    const output = generatePineDeterministic({
      naturalLanguageSpec: supportedRule,
      normalizedRuleJson: null,
      targetMarket: 'JP_STOCK',
      targetTimeframe: '1D',
    });

    expect(output.status).toBe('generated');
    expect(output.warnings.join(' ')).not.toContain('日足（D）前提として扱います');
    expect(output.assumptions).not.toContain('対象時間足は 1D として扱います。');
  });

  it('keeps explicit fallback warnings for unsupported market and timeframe', () => {
    const output = generatePineDeterministic({
      naturalLanguageSpec: supportedRule,
      normalizedRuleJson: null,
      targetMarket: 'CRYPTO',
      targetTimeframe: '15M',
    });

    expect(output.warnings).toContain('市場 CRYPTO はPine生成の初回対応範囲外です。JP_STOCK 前提として扱います。');
    expect(output.warnings).toContain('時間足 15M はPine生成の初回対応範囲外です。日足（D）前提として扱います。');
    expect(output.assumptions).toContain('対象市場は JP_STOCK として扱います。');
    expect(output.assumptions).toContain('対象時間足は日足（D）として扱います。');
  });

  it('returns Japanese warnings and assumptions from deterministic Pine generation', () => {
    const output = generatePineDeterministic({
      naturalLanguageSpec: 'ショートで高値更新を狙う。トレーリングストップも使う。',
      normalizedRuleJson: null,
      targetMarket: 'JP_STOCK',
      targetTimeframe: 'D',
    });

    expect(output.status).toBe('failed');
    expect(output.warnings).toContain('ショート条件は初回Pine生成の対応範囲外です。long_only 前提で扱います。');
    expect(output.warnings).toContain('トレーリング、ナンピン、pyramiding、詳細なポジションサイズ制御は初回Pine生成の対応範囲外です。');
    expect(output.warnings).toContain('初回対応パターンからエントリー条件を検出できませんでした。');
    expect(output.warnings).toContain('初回対応パターンから手仕舞い条件を検出できませんでした。');
    expect(output.warnings.join(' ')).not.toContain('entry conditions were not detected');
  });
});

describe('strategy version pine endpoints', () => {
  beforeEach(() => {
    runtime = createRuntime();
    generatePineScriptMock.mockReset();
    rewriteRuleDraftMock.mockReset();
  });

  it('returns an LLM rewrite draft without saving the strategy version or starting Pine jobs', async () => {
    rewriteRuleDraftMock.mockResolvedValue({
      output: {
        naturalLanguageRule: '改善後ルール本文: entry filterを強化し、stop lossを明確化する。',
        warnings: ['保存とPine生成は未実行です。'],
        assumptions: ['raw CSVは使用していません。'],
        modelName: 'stub-rule-rewrite',
        promptVersion: 'v1',
      },
      log: {
        provider: 'stub',
        fallbackToStub: false,
      },
    });
    const originalRule = runtime.versions.get('ver-1')?.naturalLanguageRule;
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/natural-language-rule/rewrite-draft',
      payload: {
        source_backtest_id: 'bt-1',
        improvement_memo: 'entry filterとrisk管理を改善する',
        current_rule: 'textarea draft should not be trusted',
        mode: 'improvement_from_backtest',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.draft).toMatchObject({
      natural_language_rule: '改善後ルール本文: entry filterを強化し、stop lossを明確化する。',
      source: 'llm_rewrite',
      base_version_id: 'ver-1',
      source_backtest_id: 'bt-1',
      warnings: ['保存とPine生成は未実行です。'],
      assumptions: ['raw CSVは使用していません。'],
    });
    expect(rewriteRuleDraftMock).toHaveBeenCalledTimes(1);
    expect(rewriteRuleDraftMock.mock.calls[0]?.[0]).toMatchObject({
      strategyVersionId: 'ver-1',
      sourceBacktestId: 'bt-1',
      baseRule: originalRule,
      market: 'JP_STOCK',
      timeframe: 'D',
      improvementMemo: 'entry filterとrisk管理を改善する',
      metrics: {
        totalTrades: 18,
        winRate: 42,
        profitFactor: 0.92,
        maxDrawdown: -18,
        netProfit: -12000,
      },
      aiSummary: {
        nextActions: ['entry filterを強化し、損切り幅を比較する'],
        overallView: '自然言語ルール本文でentryとriskを明確化する',
      },
    });
    expect(runtime.versions.get('ver-1')?.naturalLanguageRule).toBe(originalRule);
    expect(runtime.pineGenerationJobs.size).toBe(0);
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);
    expect(JSON.stringify(res.json().data)).not.toContain('textarea draft should not be trusted');
    expect(JSON.stringify(res.json().data)).not.toContain('endpoint');
    expect(JSON.stringify(res.json().data)).not.toContain('token');

    await app.close();
  });

  it('rejects unchanged LLM rewrite drafts without saving or starting Pine jobs', async () => {
    const originalRule = runtime.versions.get('ver-1')?.naturalLanguageRule ?? '';
    rewriteRuleDraftMock.mockResolvedValue({
      output: {
        naturalLanguageRule: `${originalRule}\n`,
        warnings: ['provider returned unchanged text'],
        assumptions: [],
        modelName: 'stub-rule-rewrite',
        promptVersion: 'v1',
      },
      log: {
        provider: 'stub',
        fallbackToStub: false,
      },
    });
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/natural-language-rule/rewrite-draft',
      payload: {
        source_backtest_id: 'bt-1',
        improvement_memo: 'entry filterとrisk管理を改善する',
      },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe(
      'LLM rewrite draft was unchanged. Make the improvement memo more specific and retry.',
    );
    expect(body.error.details).toMatchObject({
      reason: 'unchanged_natural_language_rule',
      task_type: 'natural_language_rule_rewrite',
    });
    expect(runtime.versions.get('ver-1')?.naturalLanguageRule).toBe(originalRule);
    expect(runtime.pineGenerationJobs.size).toBe(0);
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);
    expect(JSON.stringify(body)).not.toContain('provider returned unchanged text');
    expect(JSON.stringify(body)).not.toContain('stack');
    expect(JSON.stringify(body)).not.toContain('endpoint');

    await app.close();
  });

  it('returns sanitized not found when rewrite source backtest is invalid', async () => {
    rewriteRuleDraftMock.mockResolvedValue({
      output: {
        naturalLanguageRule: 'should not run',
        warnings: [],
        assumptions: [],
        modelName: 'stub',
        promptVersion: 'v1',
      },
      log: {},
    });
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/natural-language-rule/rewrite-draft',
      payload: {
        source_backtest_id: 'missing-bt',
        improvement_memo: '改善する',
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toBe('source backtest was not found.');
    expect(rewriteRuleDraftMock).not.toHaveBeenCalled();
    expect(JSON.stringify(res.json())).not.toContain('stack');
    expect(JSON.stringify(res.json())).not.toContain('endpoint');

    await app.close();
  });

  it('returns sanitized provider failure details when rule rewrite provider fails', async () => {
    const providerError = new Error(
      'local_llm natural_language_rule_rewrite returned invalid output: endpoint=/api/chat | model=SECRET_MODEL | token=SECRET_VALUE',
    );
    const wrappedError = new Error('natural_language_rule_rewrite_failed') as Error & { cause?: unknown };
    wrappedError.cause = providerError;
    rewriteRuleDraftMock.mockRejectedValue(wrappedError);
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/natural-language-rule/rewrite-draft',
      payload: {
        source_backtest_id: 'bt-1',
        improvement_memo: 'entry filterとrisk管理を改善する',
      },
    });

    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(body.error.message).toContain('LLM rewrite');
    expect(body.error.details).toMatchObject({
      provider_failure_reason: 'provider_invalid_response',
      task_type: 'natural_language_rule_rewrite',
    });
    expect(JSON.stringify(body)).not.toContain('/api/chat');
    expect(JSON.stringify(body)).not.toContain('SECRET_MODEL');
    expect(JSON.stringify(body)).not.toContain('SECRET_VALUE');
    expect(JSON.stringify(body)).not.toContain('stack');

    await app.close();
  });

  it('clones latest pine script lineage when cloning a strategy version', async () => {
    const createdAt = new Date('2026-04-25T10:00:00.000Z');
    runtime.pineScripts.set('pine-source-old', {
      id: 'pine-source-old',
      strategyRuleVersionId: 'ver-1',
      parentPineScriptId: null,
      scriptName: 'old source',
      pineVersion: '6',
      scriptBody: '//@version=6\nstrategy("old", overlay=true)',
      generationNoteJson: {
        raw_prompt: 'do not copy',
        provider_response: 'do not copy',
      },
      status: 'ready',
      createdAt,
      updatedAt: new Date('2026-04-25T10:05:00.000Z'),
    });
    runtime.pineScripts.set('pine-source-latest', {
      id: 'pine-source-latest',
      strategyRuleVersionId: 'ver-1',
      parentPineScriptId: null,
      scriptName: 'latest source',
      pineVersion: '6',
      scriptBody: '//@version=6\nstrategy("latest", overlay=true)',
      generationNoteJson: {
        raw_prompt: 'do not copy latest',
        reviewer_response: 'do not copy latest',
      },
      status: 'ready',
      createdAt,
      updatedAt: new Date('2026-04-25T10:10:00.000Z'),
    });

    const app = await createApp();

    const cloned = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/clone',
    });
    expect(cloned.statusCode).toBe(201);
    const clonedVersionId = cloned.json().data.strategy_version.id;
    expect(cloned.json().data.cloned_from_version_id).toBe('ver-1');

    const clonedPines = Array.from(runtime.pineScripts.values()).filter(
      (row) => row.strategyRuleVersionId === clonedVersionId,
    );
    expect(clonedPines).toHaveLength(1);
    expect(clonedPines[0].parentPineScriptId).toBe('pine-source-latest');
    expect(clonedPines[0].scriptName).toBe('latest source');
    expect(clonedPines[0].scriptBody).toBe('//@version=6\nstrategy("latest", overlay=true)');
    expect(clonedPines[0].generationNoteJson).toEqual({
      source: 'strategy_version_clone',
      source_version_id: 'ver-1',
      source_pine_script_id: 'pine-source-latest',
      cloned_for_improvement: true,
    });
    const serializedNote = JSON.stringify(clonedPines[0].generationNoteJson);
    expect(serializedNote).not.toContain('raw_prompt');
    expect(serializedNote).not.toContain('provider_response');
    expect(serializedNote).not.toContain('reviewer_response');

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/${clonedVersionId}/pine`,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.status).toBe('available');
    expect(fetched.json().data.parent_pine_script_id).toBe('pine-source-latest');
    expect(fetched.json().data.source_pine_script_id).toBe('pine-source-latest');
    expect(fetched.json().data.generated_script).toBe('//@version=6\nstrategy("latest", overlay=true)');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });

  it('keeps clone behavior unchanged when the source version has no pine script', async () => {
    const app = await createApp();

    const cloned = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/clone',
    });
    expect(cloned.statusCode).toBe(201);
    const clonedVersionId = cloned.json().data.strategy_version.id;

    const clonedPines = Array.from(runtime.pineScripts.values()).filter(
      (row) => row.strategyRuleVersionId === clonedVersionId,
    );
    expect(clonedPines).toHaveLength(0);

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/${clonedVersionId}/pine`,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.status).toBe('unavailable');
    expect(fetched.json().data.source_pine_script_id).toBeNull();
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });

  it('rolls back cloned version when pine lineage copy fails', async () => {
    runtime.pineScripts.set('pine-source-latest', {
      id: 'pine-source-latest',
      strategyRuleVersionId: 'ver-1',
      parentPineScriptId: null,
      scriptName: 'latest source',
      pineVersion: '6',
      scriptBody: '//@version=6\nstrategy("latest", overlay=true)',
      generationNoteJson: null,
      status: 'ready',
      createdAt: new Date('2026-04-25T10:00:00.000Z'),
      updatedAt: new Date('2026-04-25T10:10:00.000Z'),
    });
    runtime.failNextPineScriptCreate = true;
    const app = await createApp();

    const cloned = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/clone',
    });
    expect(cloned.statusCode).toBe(500);
    expect(cloned.json().error.code).toBe('INTERNAL_SERVER_ERROR');

    const clonedVersions = Array.from(runtime.versions.values()).filter(
      (row) => row.clonedFromVersionId === 'ver-1',
    );
    expect(clonedVersions).toHaveLength(0);
    expect(Array.from(runtime.pineScripts.values())).toHaveLength(1);
    expect(runtime.pineScripts.has('pine-source-latest')).toBe(true);
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });

  it('generates and persists pine script successfully', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("ok", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().data.strategy_version.status).toBe('generated');
    expect(generated.json().data.pine.pine_script_id).toBeTruthy();
    expect(generatePineScriptMock.mock.calls[0][1]).toMatchObject({
      maxRepairAttempts: 3,
    });

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.status).toBe('available');
    expect(typeof fetched.json().data.generated_script).toBe('string');

    await app.close();
  });

  it('starts an async pine generation job and exposes sanitized progress status', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("job-ok", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const started = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generation-jobs',
      payload: {},
    });
    expect(started.statusCode).toBe(202);
    expect(started.json().data.job.status).toBe('queued');
    expect(started.json().data.job.current_stage).toBe('生成リクエスト送信');
    expect(started.json().data.job.progress_percent).toBe(5);

    const jobId = started.json().data.job.id;
    await flushAsyncJob();

    const status = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/ver-1/pine/generation-jobs/${jobId}`,
    });
    expect(status.statusCode).toBe(200);
    const job = status.json().data.job;
    expect(job.status).toBe('succeeded');
    expect(job.current_stage).toBe('最終確認');
    expect(job.progress_percent).toBe(100);
    expect(job.result.pine_script_id).toBeTruthy();
    expect(job.result.generated_script).toBeUndefined();
    expect(job.stage_history.map((event: { stage: string }) => event.stage)).toEqual(
      expect.arrayContaining(['生成リクエスト送信', 'LLMでPine生成', '生成結果レビュー', '最終確認']),
    );
    expect(JSON.stringify(job)).not.toContain('raw prompt');
    expect(JSON.stringify(job)).not.toContain('endpoint');
    expect(JSON.stringify(job)).not.toContain('local-model');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('starts an async pine regeneration job and stores revision lineage without exposing raw revision text in job status', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("job-regenerated", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();
    const initial = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    const sourcePineScriptId = initial.json().data.pine.pine_script_id;
    generatePineScriptMock.mockClear();

    const started = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/regeneration-jobs',
      payload: {
        source_pine_script_id: sourcePineScriptId,
        compile_error_text: 'Undeclared identifier "sma" at local/path.ts',
        validation_note: 'entry was late',
        revision_request: 'Use ta.sma instead.',
      },
    });
    expect(started.statusCode).toBe(202);
    expect(started.json().data.job.request_kind).toBe('regenerate');
    const jobId = started.json().data.job.id;

    await flushAsyncJob();

    const status = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/ver-1/pine/generation-jobs/${jobId}`,
    });
    expect(status.statusCode).toBe(200);
    const jobText = JSON.stringify(status.json().data.job);
    expect(status.json().data.job.status).toBe('succeeded');
    expect(status.json().data.job.result.pine_script_id).toBeTruthy();
    expect(jobText).not.toContain('local/path.ts');
    expect(jobText).not.toContain('Use ta.sma instead.');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('marks async pine generation job failed with sanitized provider errors', async () => {
    generatePineScriptMock.mockRejectedValue(new Error('provider timeout at http://secret.local with model=sensitive'));
    const app = await createApp();

    const started = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generation-jobs',
      payload: {},
    });
    expect(started.statusCode).toBe(202);
    const jobId = started.json().data.job.id;

    await flushAsyncJob();

    const status = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/ver-1/pine/generation-jobs/${jobId}`,
    });
    expect(status.statusCode).toBe(200);
    const job = status.json().data.job;
    expect(job.status).toBe('failed');
    expect(job.error_code).toBe('PINE_GENERATION_FAILED');
    expect(job.error_message).toBe('Pine生成に失敗しました。条件を見直して再試行してください。');
    expect(JSON.stringify(job)).not.toContain('http://secret.local');
    expect(JSON.stringify(job)).not.toContain('sensitive');

    await app.close();
  });

  it('returns sanitized invalid reason codes for failed async pine generation jobs', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: null,
        warnings: ['Pine reviewer が修復対象の問題を 1 件検出しました。'],
        assumptions: [],
        status: 'failed',
        failureReason: 'pine_review_needs_repair',
        invalidReasonCodes: ['reviewer_unsupported_adx_function', 'endpoint=http://secret.local'],
        reviewerIssues: [
          {
            code: 'unsupported_adx_function',
            severity: 'error',
            repair_hint: 'Use supported DMI/ADX calculation patterns instead of ta.adx(...).',
          },
          {
            code: 'other',
            severity: 'error',
            repair_hint: 'endpoint=http://secret.local model=secret-model',
          },
        ],
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });
    const app = await createApp();

    const started = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generation-jobs',
      payload: {},
    });
    expect(started.statusCode).toBe(202);
    const jobId = started.json().data.job.id;

    await flushAsyncJob();

    const status = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/ver-1/pine/generation-jobs/${jobId}`,
    });
    expect(status.statusCode).toBe(200);
    const job = status.json().data.job;
    expect(job.status).toBe('failed');
    expect(job.error.invalid_reason_codes).toEqual(['reviewer_unsupported_adx_function']);
    expect(job.error.pine_reviewer_issues).toEqual([
      {
        code: 'unsupported_adx_function',
        severity: 'error',
        repair_hint: 'Use supported DMI/ADX calculation patterns instead of ta.adx(...).',
      },
    ]);
    expect(JSON.stringify(job)).not.toContain('http://secret.local');
    expect(JSON.stringify(job)).not.toContain('secret-model');

    await app.close();
  });

  it('passes expanded market and timeframe through pine generation context', async () => {
    const row = runtime.versions.get('ver-1');
    if (!row) throw new Error('seed row missing');
    runtime.versions.set('ver-1', {
      ...row,
      market: 'US_STOCK',
      timeframe: '4H',
    });

    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("ok", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    expect(generated.statusCode).toBe(200);
    expect(generatePineScriptMock).toHaveBeenCalledTimes(1);
    expect(generatePineScriptMock.mock.calls[0][0]).toMatchObject({
      targetMarket: 'US_STOCK',
      targetTimeframe: '4H',
    });

    await app.close();
  });

  it('preserves provider Pine notes and keeps post-processing notes in Japanese', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: 'Here is your Pine script:\n```pine\n//@version=6\nstrategy("ok", overlay=true)\n```',
        warnings: [
          'リスク管理用の損切り価格はエントリー時点で固定し、トレーリングしません。',
        ],
        assumptions: [
          'シグナル発生後、翌営業日の始値でエントリーし、損切り価格はシグナル発生足の ATR 値をもとに計算します。',
          'Chandelier Exit の「過去の最高値」は、同じ20期間における高値の最大値として解釈します。',
        ],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    expect(generated.statusCode).toBe(200);
    const generatedBody = generated.json().data;
    expect(generatedBody.strategy_version.warnings).toContain(
      'リスク管理用の損切り価格はエントリー時点で固定し、トレーリングしません。',
    );
    expect(generatedBody.strategy_version.warnings).toContain('生成結果の先頭に含まれていた説明文を削除しました。');
    expect(generatedBody.strategy_version.assumptions).toContain(
      'シグナル発生後、翌営業日の始値でエントリーし、損切り価格はシグナル発生足の ATR 値をもとに計算します。',
    );
    expect(generatedBody.strategy_version.assumptions).toContain(
      'Chandelier Exit の「過去の最高値」は、同じ20期間における高値の最大値として解釈します。',
    );
    expect(generatedBody.pine.warnings).toContain('生成結果に含まれていた Markdown code fence を削除しました。');
    expect(generatedBody.pine.warnings).toContain('生成結果の先頭に含まれていた説明文を削除しました。');
    expect(generatedBody.pine.generated_script).toContain('strategy("ok", overlay=true)');
    expect(generatedBody.pine.generated_script).not.toContain('```');
    expect(generatedBody.pine.generated_script).not.toContain('Here is your Pine script');

    const detail = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1',
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.strategy_version.warnings).toContain(
      'リスク管理用の損切り価格はエントリー時点で固定し、トレーリングしません。',
    );
    expect(detail.json().data.strategy_version.assumptions).toContain(
      'シグナル発生後、翌営業日の始値でエントリーし、損切り価格はシグナル発生足の ATR 値をもとに計算します。',
    );

    const pine = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(pine.statusCode).toBe(200);
    expect(pine.json().data.generated_script).not.toContain('```');
    expect(pine.json().data.generated_script).not.toContain('Here is your Pine script');
    expect(pine.json().data.warnings).toContain('生成結果に含まれていた Markdown code fence を削除しました。');
    expect(pine.json().data.warnings).toContain('生成結果の先頭に含まれていた説明文を削除しました。');
    expect(JSON.stringify(pine.json().data.generation_note)).toContain('シグナル発生後');

    await app.close();
  });

  it('canonicalizes 1D strategy version timeframe before pine generation', async () => {
    const row = runtime.versions.get('ver-1');
    if (!row) throw new Error('seed row missing');
    runtime.versions.set('ver-1', {
      ...row,
      timeframe: '1D',
    });

    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("ok", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    expect(generated.statusCode).toBe(200);
    expect(generatePineScriptMock.mock.calls[0][0]).toMatchObject({
      targetTimeframe: 'D',
    });
    expect(generated.json().data.strategy_version.timeframe).toBe('D');

    await app.close();
  });

  it('regenerates pine with compile_error_text and stores revision context', async () => {
    generatePineScriptMock
      .mockResolvedValueOnce({
        output: {
          normalizedRuleJson: { strategy_type: 'long_only' },
          generatedScript: '//@version=6\nstrategy("base", overlay=true)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        },
        log: { provider: 'local_llm', fallbackToStub: false },
      })
      .mockResolvedValueOnce({
        output: {
          normalizedRuleJson: { strategy_type: 'long_only' },
          generatedScript: '//@version=6\nstrategy("revised", overlay=true)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        },
        log: { provider: 'local_llm', fallbackToStub: false },
      });

    const app = await createApp();

    const initial = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    expect(initial.statusCode).toBe(200);
    const sourcePineScriptId = initial.json().data.pine.pine_script_id as string;
    expect(sourcePineScriptId).toBeTruthy();

    const regenerated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/regenerate',
      payload: {
        source_pine_script_id: sourcePineScriptId,
        compile_error_text: "Undeclared identifier 'foo'",
        validation_note: 'TradingView compile failed on line 7',
        revision_request: 'entry条件を単純化して再生成してください',
      },
    });
    expect(regenerated.statusCode).toBe(200);
    expect(regenerated.json().data.pine.parent_pine_script_id).toBe(sourcePineScriptId);
    expect(regenerated.json().data.pine.source_pine_script_id).toBe(sourcePineScriptId);
    expect(regenerated.json().data.pine.revision_input_id).toBeTruthy();

    const secondCallContext = generatePineScriptMock.mock.calls[1][0];
    expect(secondCallContext.regenerationInput.sourcePineScriptId).toBe(sourcePineScriptId);
    expect(secondCallContext.regenerationInput.compileErrorText).toContain('Undeclared identifier');

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.latest_revision_input.revision_request).toContain('entry条件');
    expect(fetched.json().data.parent_pine_script_id).toBe(sourcePineScriptId);

    await app.close();
  });

  it('regenerates with revision_request only', async () => {
    generatePineScriptMock
      .mockResolvedValueOnce({
        output: {
          normalizedRuleJson: { strategy_type: 'long_only' },
          generatedScript: '//@version=6\nstrategy("base", overlay=true)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        },
        log: { provider: 'local_llm', fallbackToStub: false },
      })
      .mockResolvedValueOnce({
        output: {
          normalizedRuleJson: { strategy_type: 'long_only' },
          generatedScript: '//@version=6\nstrategy("rev2", overlay=true)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        },
        log: { provider: 'local_llm', fallbackToStub: false },
      });

    const app = await createApp();
    const initial = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    const sourcePineScriptId = initial.json().data.pine.pine_script_id as string;

    const regenerated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/regenerate',
      payload: {
        source_pine_script_id: sourcePineScriptId,
        revision_request: 'exit条件を厳しくしてください',
      },
    });

    expect(regenerated.statusCode).toBe(200);
    expect(regenerated.json().data.pine.revision_input_id).toBeTruthy();
    expect(regenerated.json().data.pine.status).toBe('generated');

    await app.close();
  });

  it('marks failure when provider output is invalid pine format', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: 'strategy("invalid_without_version", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().data.strategy_version.status).toBe('failed');
    expect(generated.json().data.pine.pine_script_id).toBeNull();
    expect(generated.json().data.pine.failure_reason).toContain('version');

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.status).toBe('unavailable');

    await app.close();
  });

  it('returns sanitized failed status when provider call throws', async () => {
    generatePineScriptMock.mockRejectedValue(new Error('provider timeout at upstream-url with model=sensitive-model-value'));
    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().data.strategy_version.status).toBe('failed');
    expect(generated.json().data.pine.warnings).toContain('provider_error: provider_timeout');
    expect(generated.json().data.pine.failure_reason).toBe('provider_timeout');
    const serialized = JSON.stringify(generated.json().data);
    expect(serialized).not.toContain('upstream-url');
    expect(serialized).not.toContain('sensitive-model-value');

    await app.close();
  });

  it('persists fallback flag when service used stub fallback', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("stub", overlay=true)',
        warnings: ['fallback_used'],
        assumptions: [],
        status: 'generated',
        modelName: 'stub-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: true,
      },
    });

    const app = await createApp();

    await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.generation_note.payload.fallback_to_stub).toBe(true);

    await app.close();
  });

  it('returns repair attempts metadata when service repaired output', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("repaired", overlay=true)',
        warnings: ['repaired_once'],
        assumptions: [],
        status: 'generated',
        repairAttempts: 1,
        failureReason: null,
        invalidReasonCodes: ['missing_version_declaration'],
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    expect(generated.statusCode).toBe(200);
    expect(generated.json().data.pine.repair_attempts).toBe(1);
    expect(generated.json().data.pine.invalid_reason_codes).toContain('missing_version_declaration');

    await app.close();
  });

  it('returns validation error when backtest period is inconsistent', async () => {
    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {
        backtest_period_from: '2026-04-20',
        backtest_period_to: '2026-04-10',
      },
    });

    expect(generated.statusCode).toBe(400);
    expect(generated.json().error.code).toBe('VALIDATION_ERROR');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });

  it('returns validation error when backtest period field is non-string', async () => {
    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {
        backtest_period_from: 20260420,
        backtest_period_to: '2026-04-21',
      },
    });

    expect(generated.statusCode).toBe(400);
    expect(generated.json().error.code).toBe('VALIDATION_ERROR');
    expect(generated.json().error.message).toContain('backtest_period_from must be a string');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });

  it('returns validation error for impossible calendar dates', async () => {
    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {
        backtest_period_from: '2026-02-31',
        backtest_period_to: '2026-03-10',
      },
    });

    expect(generated.statusCode).toBe(400);
    expect(generated.json().error.code).toBe('VALIDATION_ERROR');
    expect(generated.json().error.message).toContain('valid calendar date');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });

  it('returns validation error when natural language rule is empty', async () => {
    const row = runtime.versions.get('ver-1');
    if (!row) throw new Error('seed row missing');
    runtime.versions.set('ver-1', {
      ...row,
      naturalLanguageRule: '   ',
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    expect(generated.statusCode).toBe(400);
    expect(generated.json().error.code).toBe('VALIDATION_ERROR');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });
});
