import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';
import { strategyRoutes } from '../src/routes/strategies';
import { strategyLabRoutes } from '../src/routes/strategy-lab';
import { strategyVersionRoutes } from '../src/routes/strategy-versions';

vi.mock('../src/ai/home-ai-service', () => {
  class HomeAiService {
    async generatePineScript(context: {
      naturalLanguageSpec: string;
      targetMarket: string;
      targetTimeframe: string;
    }) {
      const text = context.naturalLanguageSpec ?? '';
      const hasSupportedPattern = /25|ma|sma|rsi|出来高|volume|終値|close/i.test(text);
      const shouldFail = !hasSupportedPattern;
      return {
        output: {
          normalizedRuleJson: {
            strategy_type: 'long_only',
          },
          generatedScript: shouldFail
            ? null
            : '//@version=6\nstrategy("Hokkyokusei Generated Strategy", overlay=true)\nplot(close)',
          warnings: shouldFail
            ? ['entry conditions were not detected']
            : /short|ショート/.test(text)
              ? ['空売り/ショートはMVP対象外']
              : [],
          assumptions: ['long_only'],
          status: shouldFail ? 'failed' : 'generated',
          modelName: 'stub-model',
          promptVersion: 'v1-test',
        },
        log: {
          provider: 'stub',
          fallbackToStub: false,
        },
      };
    }
  }
  return { HomeAiService };
});

type StrategyRuleRow = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

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

type StrategyProposalRunRow = {
  id: string;
  status: string;
  providerName: string;
  providerMode: string;
  selectedBy: string;
  inputJson: unknown;
  userHint: string | null;
  providerObservationJson: unknown;
  candidateCount: number;
  selectedCandidateId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type StrategyProposalCandidateRow = {
  id: string;
  proposalRunId: string;
  providerCandidateId: string;
  rank: number;
  candidateJson: unknown;
  selectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type Runtime = {
  strategySeq: number;
  versionSeq: number;
  pineSeq: number;
  revisionSeq: number;
  proposalRunSeq: number;
  proposalCandidateSeq: number;
  strategies: Map<string, StrategyRuleRow>;
  versions: Map<string, StrategyRuleVersionRow>;
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
  proposalRuns: Map<string, StrategyProposalRunRow>;
  proposalCandidates: Map<string, StrategyProposalCandidateRow>;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    strategySeq: 1,
    versionSeq: 1,
    pineSeq: 1,
    revisionSeq: 1,
    proposalRunSeq: 1,
    proposalCandidateSeq: 1,
    strategies: new Map(),
    versions: new Map(),
    pineScripts: new Map(),
    pineRevisionInputs: new Map(),
    proposalRuns: new Map(),
    proposalCandidates: new Map(),
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    strategyRule: {
      count: async ({ where }: any = {}) => {
        let rows = Array.from(runtime.strategies.values());
        if (where?.status) {
          rows = rows.filter((row) => row.status === where.status);
        }
        if (where?.title?.contains) {
          const keyword = String(where.title.contains);
          const insensitive = where.title.mode === 'insensitive';
          rows = rows.filter((row) => {
            if (insensitive) {
              return row.title.toLowerCase().includes(keyword.toLowerCase());
            }
            return row.title.includes(keyword);
          });
        }
        return rows.length;
      },
      create: async ({ data }: any) => {
        const id = `str-${runtime.strategySeq++}`;
        const now = new Date();
        const row: StrategyRuleRow = {
          id,
          title: data.title,
          status: data.status ?? 'active',
          createdAt: now,
          updatedAt: now,
        };
        runtime.strategies.set(id, row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        return runtime.strategies.get(where.id) ?? null;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.strategies.get(where.id);
        if (!row) {
          throw new Error(`strategy_not_found:${where.id}`);
        }
        const next: StrategyRuleRow = {
          ...row,
          ...data,
          updatedAt: new Date(),
        };
        runtime.strategies.set(where.id, next);
        return next;
      },
      findMany: async ({ where, orderBy, skip, take, include }: any = {}) => {
        let rows = Array.from(runtime.strategies.values());
        if (where?.status) {
          rows = rows.filter((row) => row.status === where.status);
        }
        if (where?.title?.contains) {
          const keyword = String(where.title.contains);
          const insensitive = where.title.mode === 'insensitive';
          rows = rows.filter((row) => {
            if (insensitive) {
              return row.title.toLowerCase().includes(keyword.toLowerCase());
            }
            return row.title.includes(keyword);
          });
        }
        if (orderBy?.createdAt === 'desc') {
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (orderBy?.createdAt === 'asc') {
          rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (orderBy?.updatedAt === 'desc') {
          rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        if (orderBy?.updatedAt === 'asc') {
          rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        }
        if (orderBy?.title === 'desc') {
          rows.sort((a, b) => b.title.localeCompare(a.title));
        }
        if (orderBy?.title === 'asc') {
          rows.sort((a, b) => a.title.localeCompare(b.title));
        }
        const offset = Number.isInteger(skip) && skip > 0 ? skip : 0;
        const limit = Number.isInteger(take) && take >= 0 ? take : rows.length;
        rows = rows.slice(offset, offset + limit);
        if (!include) {
          return rows;
        }
        return rows.map((row) => {
          const versions = Array.from(runtime.versions.values())
            .filter((version) => version.strategyRuleId === row.id)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
          return {
            ...row,
            _count: include._count ? { versions: versions.length } : undefined,
            versions: include.versions ? versions.slice(0, include.versions.take ?? versions.length) : undefined,
          };
        });
      },
    },
    strategyRuleVersion: {
      count: async ({ where }: any) => {
        let rows = Array.from(runtime.versions.values());
        if (where?.strategyRuleId) {
          rows = rows.filter((row) => row.strategyRuleId === where.strategyRuleId);
        }
        if (where?.status) {
          rows = rows.filter((row) => row.status === where.status);
        }
        if (where?.naturalLanguageRule?.contains) {
          const keyword = String(where.naturalLanguageRule.contains);
          const insensitive = where.naturalLanguageRule.mode === 'insensitive';
          rows = rows.filter((row) => {
            if (insensitive) {
              return row.naturalLanguageRule.toLowerCase().includes(keyword.toLowerCase());
            }
            return row.naturalLanguageRule.includes(keyword);
          });
        }
        return rows.length;
      },
      create: async ({ data }: any) => {
        const id = `ver-${runtime.versionSeq++}`;
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
      findUnique: async ({ where, include }: any) => {
        const row = runtime.versions.get(where.id) ?? null;
        if (!row) {
          return null;
        }
        if (include?.clonedFromVersion) {
          return {
            ...row,
            clonedFromVersion: row.clonedFromVersionId ? runtime.versions.get(row.clonedFromVersionId) ?? null : null,
          };
        }
        return row;
      },
      findMany: async ({ where, orderBy, include, skip, take }: any) => {
        let rows = Array.from(runtime.versions.values());
        if (where?.strategyRuleId) {
          rows = rows.filter((row) => row.strategyRuleId === where.strategyRuleId);
        }
        if (where?.status) {
          rows = rows.filter((row) => row.status === where.status);
        }
        if (where?.naturalLanguageRule?.contains) {
          const keyword = String(where.naturalLanguageRule.contains);
          const insensitive = where.naturalLanguageRule.mode === 'insensitive';
          rows = rows.filter((row) => {
            if (insensitive) {
              return row.naturalLanguageRule.toLowerCase().includes(keyword.toLowerCase());
            }
            return row.naturalLanguageRule.includes(keyword);
          });
        }
        if (orderBy?.createdAt === 'desc') {
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (orderBy?.createdAt === 'asc') {
          rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (orderBy?.updatedAt === 'desc') {
          rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        if (orderBy?.updatedAt === 'asc') {
          rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        }
        const offset = Number.isInteger(skip) && skip > 0 ? skip : 0;
        const limit = Number.isInteger(take) && take >= 0 ? take : rows.length;
        rows = rows.slice(offset, offset + limit);
        if (include?.clonedFromVersion) {
          return rows.map((row) => ({
            ...row,
            clonedFromVersion: row.clonedFromVersionId ? runtime.versions.get(row.clonedFromVersionId) ?? null : null,
          }));
        }
        return rows;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.versions.get(where.id);
        if (!row) {
          throw new Error(`version_not_found:${where.id}`);
        }
        const next: StrategyRuleVersionRow = {
          ...row,
          ...data,
          updatedAt: new Date(),
        };
        runtime.versions.set(where.id, next);
        return next;
      },
    },
    pineScript: {
      create: async ({ data }: any) => {
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
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const selected = rows[0] ?? null;
        if (!selected) return null;
        const generatedFromRevision = Array.from(runtime.pineRevisionInputs.values()).find(
          (item) => item.generatedPineScriptId === selected.id,
        ) ?? null;
        return { ...selected, generatedFromRevision };
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
        if (!row) throw new Error(`revision_input_not_found:${where.id}`);
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
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      },
    },
    strategyProposalRun: {
      create: async ({ data }: any) => {
        const id = `proposal-run-${runtime.proposalRunSeq++}`;
        const now = new Date();
        const row: StrategyProposalRunRow = {
          id,
          status: data.status ?? 'succeeded',
          providerName: data.providerName,
          providerMode: data.providerMode,
          selectedBy: data.selectedBy,
          inputJson: data.inputJson,
          userHint: data.userHint ?? null,
          providerObservationJson: data.providerObservationJson ?? null,
          candidateCount: data.candidateCount ?? 0,
          selectedCandidateId: data.selectedCandidateId ?? null,
          completedAt: data.completedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        runtime.proposalRuns.set(id, row);
        return row;
      },
      findMany: async ({ orderBy, take }: any = {}) => {
        let rows = Array.from(runtime.proposalRuns.values());
        if (orderBy?.createdAt === 'desc') {
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return rows.slice(0, Number.isInteger(take) ? take : rows.length);
      },
      findUnique: async ({ where, include }: any) => {
        const row = runtime.proposalRuns.get(where.id) ?? null;
        if (!row || !include?.candidates) {
          return row;
        }
        const candidates = Array.from(runtime.proposalCandidates.values())
          .filter((candidate) => candidate.proposalRunId === row.id)
          .sort((a, b) => a.rank - b.rank);
        return { ...row, candidates };
      },
      update: async ({ where, data, include }: any) => {
        const row = runtime.proposalRuns.get(where.id);
        if (!row) throw new Error(`proposal_run_not_found:${where.id}`);
        if (data.selectedCandidateId && !runtime.proposalCandidates.has(data.selectedCandidateId)) {
          throw new Error(`proposal_candidate_fk_not_found:${data.selectedCandidateId}`);
        }
        const next = {
          ...row,
          ...data,
          updatedAt: new Date(),
        };
        runtime.proposalRuns.set(where.id, next);
        if (!include?.candidates) {
          return next;
        }
        const candidates = Array.from(runtime.proposalCandidates.values())
          .filter((candidate) => candidate.proposalRunId === next.id)
          .sort((a, b) => a.rank - b.rank);
        return { ...next, candidates };
      },
    },
    strategyProposalCandidate: {
      create: async ({ data }: any) => {
        const duplicate = Array.from(runtime.proposalCandidates.values()).find((row) => (
          row.proposalRunId === data.proposalRunId && row.providerCandidateId === data.providerCandidateId
        ));
        if (duplicate) {
          throw new Error(`proposal_candidate_unique_violation:${data.providerCandidateId}`);
        }
        const id = `proposal-candidate-${runtime.proposalCandidateSeq++}`;
        const now = new Date();
        const row: StrategyProposalCandidateRow = {
          id,
          proposalRunId: data.proposalRunId,
          providerCandidateId: data.providerCandidateId,
          rank: data.rank,
          candidateJson: data.candidateJson,
          selectedAt: data.selectedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        runtime.proposalCandidates.set(id, row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of Array.from(runtime.proposalCandidates.values())) {
          if (where?.proposalRunId && row.proposalRunId !== where.proposalRunId) {
            continue;
          }
          runtime.proposalCandidates.set(row.id, {
            ...row,
            ...data,
            updatedAt: new Date(),
          });
          count += 1;
        }
        return { count };
      },
      update: async ({ where, data }: any) => {
        const row = runtime.proposalCandidates.get(where.id);
        if (!row) throw new Error(`proposal_candidate_not_found:${where.id}`);
        const next = {
          ...row,
          ...data,
          updatedAt: new Date(),
        };
        runtime.proposalCandidates.set(where.id, next);
        return next;
      },
    },
    $transaction: async (callback: any) => {
      const snapshot = {
        proposalRunSeq: runtime.proposalRunSeq,
        proposalCandidateSeq: runtime.proposalCandidateSeq,
        proposalRuns: new Map(Array.from(runtime.proposalRuns.entries()).map(([key, value]) => [key, { ...value }])),
        proposalCandidates: new Map(Array.from(runtime.proposalCandidates.entries()).map(([key, value]) => [key, { ...value }])),
      };
      try {
        return await callback(prisma);
      } catch (error) {
        runtime.proposalRunSeq = snapshot.proposalRunSeq;
        runtime.proposalCandidateSeq = snapshot.proposalCandidateSeq;
        runtime.proposalRuns = snapshot.proposalRuns;
        runtime.proposalCandidates = snapshot.proposalCandidates;
        throw error;
      }
    },
  };

  return { prisma };
});

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(strategyRoutes, { prefix: '/api/strategies' });
  app.register(strategyLabRoutes, { prefix: '/api/strategy-lab' });
  app.register(strategyVersionRoutes, { prefix: '/api/strategy-versions' });
  await app.ready();
  return app;
}

function validLocalLlmCandidate(overrides: Record<string, unknown> = {}) {
  return {
    candidate_id: 'local-1',
    title: 'ローカルLLM検証候補',
    summary: '買うべきという入力があっても、検証候補としてbacktest前提で扱う候補。',
    market_assumption: 'JP_STOCK',
    timeframe_assumption: 'D',
    strategy_type: 'trend_following',
    entry_logic: ['終値が25日移動平均を上回る'],
    exit_logic: ['終値が5日移動平均を下回る'],
    risk_management: ['1回の損失を限定する'],
    invalidation_conditions: ['出来高が伴わない上抜け'],
    expected_strengths: ['条件が単純で検証しやすい'],
    expected_weaknesses: ['横ばい相場でダマシが増える'],
    required_indicators: ['SMA', 'Volume'],
    pine_feasibility: 'high',
    backtest_cautions: ['複数期間でbacktestする'],
    research_basis: [
      {
        source_type: 'provider_knowledge',
        label: 'local llm generated candidate',
        url: null,
      },
    ],
    confidence: 'medium',
    uncertainty: ['市場環境や銘柄固有材料は未評価です。'],
    suggested_natural_language_spec:
      'JP_STOCK / D を前提に、終値が25日移動平均を上回り、出来高が平均を上回る場合に検証します。終値が5日移動平均を下回る場合に手仕舞いします。',
    suggested_pine_constraints: ['long_only', 'daily first'],
    ...overrides,
  };
}

function localLlmResponseContent(payload: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify(payload),
      },
    }),
  };
}

describe('strategy lab vertical slice', () => {
  beforeEach(() => {
    runtime = createRuntime();
    delete process.env.STRATEGY_PROPOSAL_PROVIDER;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS;
  });

  afterEach(() => {
    delete process.env.STRATEGY_PROPOSAL_PROVIDER;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS;
    vi.unstubAllGlobals();
  });

  it('returns deterministic strategy proposal candidates and persists proposal history', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        market: 'JP_STOCK',
        timeframe: 'D',
        risk_preference: 'balanced',
        strategy_type_bias: 'trend_following',
        proposal_count: 1,
        user_hint: '出来高を重視したい',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.schema_name).toBe('strategy_proposal_candidates');
    expect(body.data.proposal_run_id).toBe('proposal-run-1');
    expect(body.data.history.proposal_run_id).toBe('proposal-run-1');
    expect(body.data.provider).toMatchObject({
      name: 'stub',
      mode: 'deterministic',
      web_search: false,
      persisted: false,
    });
    expect(body.data.provider_observation).toMatchObject({
      provider_name: 'stub',
      selected_by: 'default',
      status: 'succeeded',
      candidate_count: 1,
      invalid_reason: 'none',
      validation_error_count: 0,
      fallback_used: false,
      fallback_reason: null,
      schema_valid: true,
      model_category: 'unknown',
    });
    expect(typeof body.data.provider_observation.elapsed_ms).toBe('number');
    expect(['fast', 'acceptable', 'slow']).toContain(body.data.provider_observation.latency_bucket);
    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.candidates[0]).toMatchObject({
      strategy_type: 'trend_following',
      confidence: 'medium',
      pine_feasibility: 'high',
    });
    expect(body.data.candidates[0].suggested_natural_language_spec).toContain('出来高を重視したい');
    expect(body.data.disclaimer).toContain('投資助言ではありません');

    const storedRun = runtime.proposalRuns.get(body.data.proposal_run_id);
    expect(storedRun).toBeTruthy();
    expect(storedRun?.status).toBe('succeeded');
    expect(storedRun?.candidateCount).toBe(1);
    expect(storedRun?.inputJson).toMatchObject({
      market: 'JP_STOCK',
      timeframe: 'D',
      proposal_count: 1,
      user_hint: '出来高を重視したい',
    });
    expect(storedRun?.providerObservationJson).toMatchObject({
      provider_name: 'stub',
      status: 'succeeded',
      candidate_count: 1,
    });
    const storedCandidates = Array.from(runtime.proposalCandidates.values())
      .filter((candidate) => candidate.proposalRunId === body.data.proposal_run_id);
    expect(storedCandidates).toHaveLength(1);
    expect(storedCandidates[0].candidateJson).toMatchObject({
      candidate_id: body.data.candidates[0].candidate_id,
      title: body.data.candidates[0].title,
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?limit=10',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.proposal_runs).toHaveLength(1);
    expect(listResponse.json().data.proposal_runs[0]).toMatchObject({
      id: body.data.proposal_run_id,
      status: 'succeeded',
      provider_name: 'stub',
      candidate_count: 1,
    });

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/strategy-lab/proposals/${body.data.proposal_run_id}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().data.candidates).toHaveLength(1);
    expect(detailResponse.json().data.candidates[0].candidate).toMatchObject({
      candidate_id: body.data.candidates[0].candidate_id,
    });
  });

  it('records selected proposal candidate without creating strategy artifacts', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 2,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const candidateId = body.data.candidates[1].candidate_id as string;

    const selectResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${body.data.proposal_run_id}/select`,
      payload: {
        candidate_id: candidateId,
      },
    });

    expect(selectResponse.statusCode).toBe(200);
    const selectBody = selectResponse.json();
    expect(selectBody.data.proposal_run.selected_candidate_id).toBe('proposal-candidate-2');
    expect(selectBody.data.selected_candidate.provider_candidate_id).toBe(candidateId);
    expect(selectBody.data.selected_candidate.selected_at).toBeTruthy();

    const reselectResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${body.data.proposal_run_id}/select`,
      payload: {
        candidate_id: body.data.candidates[0].candidate_id,
      },
    });

    expect(reselectResponse.statusCode).toBe(200);
    const reselectBody = reselectResponse.json();
    expect(reselectBody.data.proposal_run.selected_candidate_id).toBe('proposal-candidate-1');
    const storedCandidates = Array.from(runtime.proposalCandidates.values())
      .filter((candidate) => candidate.proposalRunId === body.data.proposal_run_id);
    expect(storedCandidates.find((candidate) => candidate.id === 'proposal-candidate-1')?.selectedAt).toBeInstanceOf(Date);
    expect(storedCandidates.find((candidate) => candidate.id === 'proposal-candidate-2')?.selectedAt).toBeNull();
    expect(runtime.proposalRuns.get(body.data.proposal_run_id)?.selectedCandidateId).toBe('proposal-candidate-1');

    const selectByInternalIdResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${body.data.proposal_run_id}/select`,
      payload: {
        proposal_candidate_id: 'proposal-candidate-2',
      },
    });

    expect(selectByInternalIdResponse.statusCode).toBe(200);
    const selectByInternalIdBody = selectByInternalIdResponse.json();
    expect(selectByInternalIdBody.data.proposal_run.selected_candidate_id).toBe('proposal-candidate-2');
    expect(selectByInternalIdBody.data.selected_candidate.id).toBe('proposal-candidate-2');
    const candidatesAfterInternalIdSelect = Array.from(runtime.proposalCandidates.values())
      .filter((candidate) => candidate.proposalRunId === body.data.proposal_run_id);
    expect(candidatesAfterInternalIdSelect.find((candidate) => candidate.id === 'proposal-candidate-1')?.selectedAt).toBeNull();
    expect(candidatesAfterInternalIdSelect.find((candidate) => candidate.id === 'proposal-candidate-2')?.selectedAt).toBeInstanceOf(Date);
    expect(runtime.strategies.size).toBe(0);
    expect(runtime.versions.size).toBe(0);
    expect(runtime.pineScripts.size).toBe(0);
  });

  it('uses stub strategy proposal provider by default without calling local llm', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.provider.name).toBe('stub');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses local_llm strategy proposal provider when selected by env', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT = 'http://local-llm.example.test';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL = 'proposal-model-test';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS = '1234';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS = '8000';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            schema_name: 'strategy_proposal_candidates',
            schema_version: '1.0',
            candidates: [validLocalLlmCandidate()],
            disclaimer: '検証候補の提案です。投資助言ではありません。',
          }),
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        market: 'JP_STOCK',
        timeframe: 'D',
        proposal_count: 1,
        user_hint: 'must buy wording should remain input context',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.provider).toMatchObject({
      name: 'local_llm',
      mode: 'local',
      web_search: false,
      persisted: false,
    });
    expect(body.data.provider_observation).toMatchObject({
      provider_name: 'local_llm',
      selected_by: 'env',
      status: 'succeeded',
      candidate_count: 1,
      invalid_reason: 'none',
      validation_error_count: 0,
      fallback_used: false,
      fallback_reason: null,
      schema_valid: true,
      model_category: 'configured',
    });
    expect(JSON.stringify(body.data.provider_observation)).not.toContain('local-llm.example.test');
    expect(JSON.stringify(body.data.provider_observation)).not.toContain('proposal-model-test');
    expect(body.data.proposal_run_id).toBe('proposal-run-1');
    const storedHistoryJson = JSON.stringify({
      runs: Array.from(runtime.proposalRuns.values()),
      candidates: Array.from(runtime.proposalCandidates.values()),
      response: body,
    });
    expect(storedHistoryJson).not.toContain('local-llm.example.test');
    expect(storedHistoryJson).not.toContain('proposal-model-test');
    expect(storedHistoryJson).not.toContain('/api/chat');
    expect(storedHistoryJson).not.toContain('C:\\');
    expect(storedHistoryJson).not.toContain('stack');
    expect(body.data.input.user_hint).toBe('must buy wording should remain input context');
    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.candidates[0].summary).toContain('買うべきという入力があっても');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://local-llm.example.test/api/chat');
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.model).toBe('proposal-model-test');
    expect(requestBody.stream).toBe(false);
    expect(requestBody.think).toBe(false);
    expect(requestBody.options.num_predict).toBe(2000);
  });

  it('does not leave partial proposal history when candidate persistence fails', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const duplicateCandidate = validLocalLlmCandidate({ candidate_id: 'dup-1' });
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseContent({
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      candidates: [
        duplicateCandidate,
        validLocalLlmCandidate({
          ...duplicateCandidate,
          title: '重複IDの別候補',
          candidate_id: 'dup-1',
        }),
      ],
      disclaimer: '検証候補の提案です。投資助言ではありません。',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 2,
      },
    });

    expect(response.statusCode).toBe(500);
    expect(runtime.proposalRuns.size).toBe(0);
    expect(runtime.proposalCandidates.size).toBe(0);
    expect(JSON.stringify(response.json())).not.toContain('dup-1');
    expect(JSON.stringify(response.json())).not.toContain('http://');

    await app.close();
  });

  it('returns safe provider error when local_llm returns malformed JSON', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: 'not json',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
      },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error.code).toBe('PROVIDER_INVALID_RESPONSE');
    expect(body.error.message).toBe('Strategy proposal provider failed to return usable candidates. Please try again later.');
    expect(body.error.details.provider_observation).toMatchObject({
      provider_name: 'local_llm',
      selected_by: 'env',
      status: 'invalid_response',
      candidate_count: 0,
      invalid_reason: 'malformed_json',
      validation_error_count: 1,
      fallback_used: false,
      fallback_reason: null,
      schema_valid: false,
    });
    expect(body.error.details.proposal_run_id).toBe('proposal-run-1');
    const storedRun = runtime.proposalRuns.get(body.error.details.proposal_run_id);
    expect(storedRun).toMatchObject({
      status: 'failed',
      providerName: 'local_llm',
      providerMode: 'local_llm',
      candidateCount: 0,
    });
    expect(storedRun?.providerObservationJson).toMatchObject({
      status: 'invalid_response',
      invalid_reason: 'malformed_json',
      schema_valid: false,
    });
    expect(runtime.proposalCandidates.size).toBe(0);
    expect(JSON.stringify(body)).not.toContain('not json');
  });

  it('returns safe provider error when local_llm schema metadata is invalid', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseContent({
      schema_name: 'unexpected_schema',
      schema_version: '1.0',
      candidates: [validLocalLlmCandidate()],
      disclaimer: '検証候補の提案です。投資助言ではありません。',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
      },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error.code).toBe('PROVIDER_INVALID_RESPONSE');
    expect(body.error.details.provider_observation).toMatchObject({
      provider_name: 'local_llm',
      status: 'invalid_response',
      invalid_reason: 'schema_invalid',
      schema_valid: false,
    });
    expect(body.error.message).not.toContain('http://');
    expect(body.error.message).not.toContain('proposal-model-test');
  });

  it('returns safe provider error when local_llm omits required candidate fields', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const candidate = validLocalLlmCandidate();
    delete (candidate as Record<string, unknown>).risk_management;
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseContent({
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      candidates: [candidate],
      disclaimer: '検証候補の提案です。投資助言ではありません。',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
      },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error.code).toBe('PROVIDER_INVALID_RESPONSE');
    expect(body.error.details.provider_observation).toMatchObject({
      provider_name: 'local_llm',
      status: 'invalid_response',
      invalid_reason: 'required_field_missing',
      schema_valid: false,
    });
    expect(JSON.stringify(body)).not.toContain('ローカルLLM検証候補');
  });

  it('returns safe provider error when local_llm returns unsupported enum values', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseContent({
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      candidates: [validLocalLlmCandidate({
        strategy_type: 'scalping',
      })],
      disclaimer: '検証候補の提案です。投資助言ではありません。',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
      },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error.code).toBe('PROVIDER_INVALID_RESPONSE');
    expect(body.error.details.provider_observation).toMatchObject({
      provider_name: 'local_llm',
      status: 'invalid_response',
      invalid_reason: 'enum_invalid',
      schema_valid: false,
    });
  });

  it('returns safe provider error when local_llm returns too many candidates', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseContent({
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      candidates: [
        validLocalLlmCandidate({ candidate_id: 'local-1' }),
        validLocalLlmCandidate({ candidate_id: 'local-2' }),
      ],
      disclaimer: '検証候補の提案です。投資助言ではありません。',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
      },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error.code).toBe('PROVIDER_INVALID_RESPONSE');
    expect(body.error.details.provider_observation).toMatchObject({
      provider_name: 'local_llm',
      status: 'invalid_response',
      invalid_reason: 'candidate_count_invalid',
      candidate_count: 0,
      schema_valid: false,
    });
  });

  it('returns safe provider error when local_llm is unavailable', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT = 'http://local-llm.example.test';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL = 'proposal-model-test';
    const fetchMock = vi.fn().mockRejectedValue(new Error('provider-error.example.test/failure'));
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
      },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error.code).toBe('PROVIDER_INVALID_RESPONSE');
    expect(body.error.details.provider_observation).toMatchObject({
      provider_name: 'local_llm',
      status: 'provider_unavailable',
      invalid_reason: 'provider_unavailable',
      schema_valid: false,
    });
    expect(JSON.stringify(body)).not.toContain('provider-error.example.test');
    expect(JSON.stringify(body)).not.toContain('local-llm.example.test');
    expect(JSON.stringify(body)).not.toContain('proposal-model-test');
  });

  it('returns safe provider error when local_llm times out', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const fetchMock = vi.fn().mockRejectedValue(new Error('timeout with provider diagnostics'));
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
      },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error.code).toBe('PROVIDER_INVALID_RESPONSE');
    expect(body.error.details.provider_observation).toMatchObject({
      provider_name: 'local_llm',
      status: 'timeout',
      latency_bucket: 'timeout',
      invalid_reason: 'timeout',
      schema_valid: false,
    });
    expect(body.error.details.proposal_run_id).toBe('proposal-run-1');
    expect(runtime.proposalRuns.get(body.error.details.proposal_run_id)).toMatchObject({
      status: 'failed',
      candidateCount: 0,
    });
    expect(JSON.stringify(body)).not.toContain('provider diagnostics');
  });

  it('uses deterministic strategy proposal defaults', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.input).toMatchObject({
      market: 'JP_STOCK',
      timeframe: 'D',
      risk_preference: 'balanced',
      strategy_type_bias: 'any',
      proposal_count: 5,
      user_hint: null,
    });
    expect(body.data.provider.persisted).toBe(false);
    expect(body.data.candidates).toHaveLength(5);
  });

  it('rejects invalid strategy proposal query values', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 99,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');

    const invalidRisk = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        risk_preference: 'maximum',
      },
    });
    expect(invalidRisk.statusCode).toBe(400);
    expect(invalidRisk.json().error.code).toBe('VALIDATION_ERROR');

    const invalidStrategyType = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        strategy_type_bias: 'scalping',
      },
    });
    expect(invalidStrategyType.statusCode).toBe(400);
    expect(invalidStrategyType.json().error.code).toBe('VALIDATION_ERROR');
    expect(runtime.proposalRuns.size).toBe(0);
    expect(runtime.proposalCandidates.size).toBe(0);
  });

  it('allows investment advice style wording in proposal user hints', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        user_hint: 'must buy this setup',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.input.user_hint).toBe('must buy this setup');
    expect(body.data.candidates.length).toBeGreaterThan(0);
    expect(body.data.disclaimer).toContain('投資助言ではありません');
  });

  it('keeps empty strategy proposal candidates representable', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        strategy_type_bias: 'other',
        proposal_count: 5,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.input.strategy_type_bias).toBe('other');
    expect(body.data.candidates).toEqual([]);
    expect(body.data.provider_observation).toMatchObject({
      status: 'succeeded',
      candidate_count: 0,
      invalid_reason: 'none',
      schema_valid: true,
    });
  });

  it('creates strategy, creates version, and generates pine successfully', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: '押し目買い戦略' },
    });
    expect(createStrategy.statusCode).toBe(201);
    const strategyBody = createStrategy.json();
    const strategyId = strategyBody.data.strategy.id as string;
    expect(strategyId).toBeTruthy();

    const createVersion = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule:
          '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が25日線を下回ったら手仕舞い。',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    expect(createVersion.statusCode).toBe(201);
    const versionBody = createVersion.json();
    const versionId = versionBody.data.strategy_version.id as string;
    expect(versionBody.data.strategy_version.status).toBe('draft');

    const generatePine = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${versionId}/pine/generate`,
      payload: {},
    });
    expect(generatePine.statusCode).toBe(200);
    const generatedBody = generatePine.json();
    expect(generatedBody.data.strategy_version.status).toBe('generated');
    expect(generatedBody.data.strategy_version.generated_pine).toContain('strategy("Hokkyokusei Generated Strategy"');
    expect(Array.isArray(generatedBody.data.strategy_version.warnings)).toBe(true);
    expect(generatedBody.data.pine.pine_script_id).toBeTruthy();

    const getPine = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/${versionId}/pine`,
    });
    expect(getPine.statusCode).toBe(200);
    const getPineBody = getPine.json();
    expect(getPineBody.data.status).toBe('available');
    expect(getPineBody.data.pine_script_id).toBeTruthy();
    expect(typeof getPineBody.data.generated_script).toBe('string');

    await app.close();
  });

  it('lists strategy versions and fetches a version detail', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: '版管理テスト' },
    });
    const strategyId = createStrategy.json().data.strategy.id as string;

    const createVersion1 = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule: '25日移動平均を上回ったら買い',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    expect(createVersion1.statusCode).toBe(201);

    const createVersion2 = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule: 'RSIが30以下で買い',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    expect(createVersion2.statusCode).toBe(201);
    const version2Id = createVersion2.json().data.strategy_version.id as string;

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/strategies/${strategyId}/versions?page=1&limit=1`,
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(Array.isArray(listBody.data.strategy_versions)).toBe(true);
    expect(listBody.data.strategy_versions.length).toBe(1);
    expect(listBody.data.pagination.page).toBe(1);
    expect(listBody.data.pagination.limit).toBe(1);
    expect(listBody.data.pagination.total).toBe(2);
    expect(listBody.data.pagination.has_next).toBe(true);
    expect(listBody.data.pagination.has_prev).toBe(false);
    expect(typeof listBody.data.strategy_versions[0].is_derived).toBe('boolean');
    expect(typeof listBody.data.strategy_versions[0].has_forward_validation_note).toBe('boolean');
    expect(listBody.data.strategy_versions[0]).toHaveProperty('has_diff_from_clone');

    const page2Response = await app.inject({
      method: 'GET',
      url: `/api/strategies/${strategyId}/versions?page=2&limit=1`,
    });
    expect(page2Response.statusCode).toBe(200);
    const page2Body = page2Response.json();
    expect(page2Body.data.strategy_versions.length).toBe(1);
    expect(page2Body.data.pagination.page).toBe(2);
    expect(page2Body.data.pagination.has_next).toBe(false);
    expect(page2Body.data.pagination.has_prev).toBe(true);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/${version2Id}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    const detailBody = detailResponse.json();
    expect(detailBody.data.strategy_version.id).toBe(version2Id);
    expect(detailBody.data.strategy_version.cloned_from_version_id).toBeNull();
    expect(detailBody.data.compare_base).toBeNull();
    expect(detailBody.data.strategy_version.natural_language_rule).toContain('RSI');
    expect(Array.isArray(detailBody.data.strategy_version.warnings)).toBe(true);
    expect(Array.isArray(detailBody.data.strategy_version.assumptions)).toBe(true);

    await app.close();
  });

  it('lists existing strategies with latest version summary', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: '一覧表示テスト' },
    });
    expect(createStrategy.statusCode).toBe(201);
    const strategyId = createStrategy.json().data.strategy.id as string;

    const createVersion = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule: '25日移動平均を上回ったら買い',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    expect(createVersion.statusCode).toBe(201);
    const versionId = createVersion.json().data.strategy_version.id as string;

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/strategies?page=1&limit=20&q=一覧&sort=updated_at&order=desc',
    });
    expect(listResponse.statusCode).toBe(200);
    const body = listResponse.json();
    expect(body.data.query.q).toBe('一覧');
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.strategies.length).toBe(1);
    expect(body.data.strategies[0].id).toBe(strategyId);
    expect(body.data.strategies[0].title).toBe('一覧表示テスト');
    expect(body.data.strategies[0].version_count).toBe(1);
    expect(body.data.strategies[0].latest_version.id).toBe(versionId);
    expect(body.data.strategies[0].latest_version.market).toBe('JP_STOCK');
    expect(body.data.strategies[0].latest_version.timeframe).toBe('D');

    await app.close();
  });

  it('archives and restores strategies with status filters', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: 'archive-restore-test' },
    });
    expect(createStrategy.statusCode).toBe(201);
    const strategyId = createStrategy.json().data.strategy.id as string;
    expect(createStrategy.json().data.strategy.status).toBe('active');

    const activeBefore = await app.inject({
      method: 'GET',
      url: '/api/strategies?status=active',
    });
    expect(activeBefore.statusCode).toBe(200);
    expect(activeBefore.json().data.strategies.map((item: any) => item.id)).toContain(strategyId);

    const invalidStatus = await app.inject({
      method: 'GET',
      url: '/api/strategies?status=deleted',
    });
    expect(invalidStatus.statusCode).toBe(400);

    const archive = await app.inject({
      method: 'PATCH',
      url: `/api/strategies/${strategyId}/archive`,
    });
    expect(archive.statusCode).toBe(200);
    expect(archive.json().data.strategy.status).toBe('archived');

    const activeAfterArchive = await app.inject({
      method: 'GET',
      url: '/api/strategies?status=active',
    });
    expect(activeAfterArchive.statusCode).toBe(200);
    expect(activeAfterArchive.json().data.strategies.map((item: any) => item.id)).not.toContain(strategyId);

    const archivedAfterArchive = await app.inject({
      method: 'GET',
      url: '/api/strategies?status=archived',
    });
    expect(archivedAfterArchive.statusCode).toBe(200);
    expect(archivedAfterArchive.json().data.strategies.map((item: any) => item.id)).toContain(strategyId);

    const restore = await app.inject({
      method: 'PATCH',
      url: `/api/strategies/${strategyId}/restore`,
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().data.strategy.status).toBe('active');

    const activeAfterRestore = await app.inject({
      method: 'GET',
      url: '/api/strategies?status=active',
    });
    expect(activeAfterRestore.statusCode).toBe(200);
    expect(activeAfterRestore.json().data.strategies.map((item: any) => item.id)).toContain(strategyId);

    const archiveMissing = await app.inject({
      method: 'PATCH',
      url: '/api/strategies/missing/archive',
    });
    expect(archiveMissing.statusCode).toBe(404);

    const restoreMissing = await app.inject({
      method: 'PATCH',
      url: '/api/strategies/missing/restore',
    });
    expect(restoreMissing.statusCode).toBe(404);

    await app.close();
  });

  it('filters strategy versions by natural language rule keyword with q', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: '検索テスト' },
    });
    const strategyId = createStrategy.json().data.strategy.id as string;

    await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule: 'RSIが30以下で買い',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule: '25日移動平均を上抜けたら買い',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/strategies/${strategyId}/versions?q=rsi&page=1&limit=1`,
    });

    expect(listResponse.statusCode).toBe(200);
    const body = listResponse.json();
    expect(body.data.query.q).toBe('rsi');
    expect(body.data.pagination.q).toBe('rsi');
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.strategy_versions.length).toBe(1);
    expect(body.data.strategy_versions[0].id).toBeDefined();

    const unfiltered = await app.inject({
      method: 'GET',
      url: `/api/strategies/${strategyId}/versions`,
    });
    expect(unfiltered.statusCode).toBe(200);
    expect(unfiltered.json().data.strategy_versions.length).toBe(2);

    await app.close();
  });

  it('filters and sorts strategy versions with status/sort/order while preserving pagination', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: 'status-sort-test' },
    });
    const strategyId = createStrategy.json().data.strategy.id as string;

    const a = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule: 'A',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const aId = a.json().data.strategy_version.id as string;
    const b = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule: 'B',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const bId = b.json().data.strategy_version.id as string;

    await app.inject({ method: 'POST', url: `/api/strategy-versions/${aId}/pine/generate`, payload: {} });
    await app.inject({ method: 'POST', url: `/api/strategy-versions/${bId}/pine/generate`, payload: {} });

    const updateA = await app.inject({
      method: 'PATCH',
      url: `/api/strategy-versions/${aId}`,
      payload: { natural_language_rule: 'A updated' },
    });
    expect(updateA.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: `/api/strategies/${strategyId}/versions?page=1&limit=20&status=draft&sort=updated_at&order=asc`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.query.status).toBe('draft');
    expect(body.data.query.sort).toBe('updated_at');
    expect(body.data.query.order).toBe('asc');
    expect(body.data.pagination.status).toBe('draft');
    expect(body.data.strategy_versions.length).toBe(1);
    expect(body.data.strategy_versions[0].id).toBe(aId);

    await app.close();
  });

  it('returns warnings for unsupported expressions while keeping generation result', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: 'ショート戦略' },
    });
    const strategyId = createStrategy.json().data.strategy.id as string;

    const createVersion = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule:
          '25日移動平均線の上で、RSIが50以上で買い。ショートも行う。終値が25日線を下回ったら手仕舞い。',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const versionId = createVersion.json().data.strategy_version.id as string;

    const generatePine = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${versionId}/pine/generate`,
      payload: {},
    });

    expect(generatePine.statusCode).toBe(200);
    const body = generatePine.json();
    expect(body.data.strategy_version.status).toBe('generated');
    const warnings: string[] = body.data.strategy_version.warnings;
    expect(warnings.some((item) => item.includes('空売り/ショート'))).toBe(true);

    await app.close();
  });

  it('regenerates pine for an existing version', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: '再生成テスト' },
    });
    const strategyId = createStrategy.json().data.strategy.id as string;

    const createVersion = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule:
          '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が5日線を下回ったら手仕舞い。',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const versionId = createVersion.json().data.strategy_version.id as string;

    const firstGenerate = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${versionId}/pine/generate`,
      payload: {},
    });
    expect(firstGenerate.statusCode).toBe(200);

    const secondGenerate = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${versionId}/pine/generate`,
      payload: {},
    });
    expect(secondGenerate.statusCode).toBe(200);
    const secondBody = secondGenerate.json();
    expect(secondBody.data.strategy_version.id).toBe(versionId);
    expect(secondBody.data.strategy_version.status).toBe('generated');
    expect(secondBody.data.strategy_version.generated_pine).toContain('strategy(');

    await app.close();
  });

  it('keeps version and marks failed when pine generation cannot detect supported conditions', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: '曖昧な戦略' },
    });
    const strategyId = createStrategy.json().data.strategy.id as string;

    const createVersion = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule: '雰囲気で上がりそうな時に買う。',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const versionId = createVersion.json().data.strategy_version.id as string;

    const generatePine = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${versionId}/pine/generate`,
      payload: {},
    });
    expect(generatePine.statusCode).toBe(200);
    const body = generatePine.json();
    expect(body.data.strategy_version.status).toBe('failed');
    expect(body.data.strategy_version.generated_pine).toBeNull();
    expect(body.data.strategy_version.warnings.length).toBeGreaterThan(0);

    const storedVersion = runtime.versions.get(versionId);
    expect(storedVersion).toBeTruthy();
    expect(storedVersion?.status).toBe('failed');

    const getPine = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/${versionId}/pine`,
    });
    expect(getPine.statusCode).toBe(200);
    expect(getPine.json().data.status).toBe('unavailable');

    await app.close();
  });

  it('clones an existing version into a new version while keeping source unchanged', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: '複製テスト' },
    });
    const strategyId = createStrategy.json().data.strategy.id as string;

    const createVersion = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule:
          '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が5日線を下回ったら手仕舞い。',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const sourceVersionId = createVersion.json().data.strategy_version.id as string;

    const generatedSource = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${sourceVersionId}/pine/generate`,
      payload: {},
    });
    expect(generatedSource.statusCode).toBe(200);
    const sourceBody = generatedSource.json();
    const sourcePine = sourceBody.data.strategy_version.generated_pine as string;
    const sourceWarnings = sourceBody.data.strategy_version.warnings as string[];
    const sourceAssumptions = sourceBody.data.strategy_version.assumptions as string[];
    const sourceStatus = sourceBody.data.strategy_version.status as string;

    const cloneResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${sourceVersionId}/clone`,
      payload: {},
    });
    expect(cloneResponse.statusCode).toBe(201);
    const cloneBody = cloneResponse.json();
    const clonedVersionId = cloneBody.data.strategy_version.id as string;
    expect(clonedVersionId).not.toBe(sourceVersionId);
    expect(cloneBody.data.cloned_from_version_id).toBe(sourceVersionId);
    expect(cloneBody.data.strategy_version.cloned_from_version_id).toBe(sourceVersionId);
    expect(cloneBody.data.strategy_version.generated_pine).toBe(sourcePine);
    expect(cloneBody.data.strategy_version.status).toBe(sourceStatus);
    expect(cloneBody.data.strategy_version.warnings).toEqual(sourceWarnings);
    expect(cloneBody.data.strategy_version.assumptions).toEqual(sourceAssumptions);

    const sourceDetail = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/${sourceVersionId}`,
    });
    expect(sourceDetail.statusCode).toBe(200);
    expect(sourceDetail.json().data.strategy_version.id).toBe(sourceVersionId);
    expect(sourceDetail.json().data.strategy_version.generated_pine).toBe(sourcePine);

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/strategies/${strategyId}/versions`,
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    const ids = listBody.data.strategy_versions.map((item: any) => item.id);
    expect(ids).toContain(sourceVersionId);
    expect(ids).toContain(clonedVersionId);
    const sourceListItem = listBody.data.strategy_versions.find((item: any) => item.id === sourceVersionId);
    const clonedListItem = listBody.data.strategy_versions.find((item: any) => item.id === clonedVersionId);
    expect(sourceListItem.is_derived).toBe(false);
    expect(sourceListItem.has_diff_from_clone).toBeNull();
    expect(clonedListItem.is_derived).toBe(true);
    expect(clonedListItem.has_diff_from_clone).toBe(false);

    const clonedDetail = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/${clonedVersionId}`,
    });
    expect(clonedDetail.statusCode).toBe(200);
    const clonedDetailBody = clonedDetail.json();
    expect(clonedDetailBody.data.strategy_version.cloned_from_version_id).toBe(sourceVersionId);
    expect(clonedDetailBody.data.compare_base.id).toBe(sourceVersionId);
    expect(clonedDetailBody.data.compare_base.status).toBe(sourceStatus);
    expect(clonedDetailBody.data.compare_base.generated_pine).toBe(sourcePine);

    await app.close();
  });

  it('updates cloned version rule and regenerates pine without mutating source version', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: 'edit-regenerate-test' },
    });
    const strategyId = createStrategy.json().data.strategy.id as string;

    const createVersion = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule:
          '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が5日線を下回ったら手仕舞い。',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const sourceVersionId = createVersion.json().data.strategy_version.id as string;

    const generateSource = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${sourceVersionId}/pine/generate`,
      payload: {},
    });
    expect(generateSource.statusCode).toBe(200);
    const sourceGeneratedPine = generateSource.json().data.strategy_version.generated_pine as string;

    const cloneResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${sourceVersionId}/clone`,
      payload: {},
    });
    expect(cloneResponse.statusCode).toBe(201);
    const cloneVersionId = cloneResponse.json().data.strategy_version.id as string;

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/strategy-versions/${cloneVersionId}`,
      payload: {
        natural_language_rule:
          '25日移動平均線の上で、RSIが55以上、出来高が20日平均の1.8倍以上で買い。終値が10日線を下回ったら手仕舞い。',
      },
    });
    expect(patchResponse.statusCode).toBe(200);
    const patchedVersion = patchResponse.json().data.strategy_version;
    expect(patchedVersion.id).toBe(cloneVersionId);
    expect(patchedVersion.status).toBe('draft');
    expect(patchedVersion.generated_pine).toBeNull();
    expect(Array.isArray(patchedVersion.warnings)).toBe(true);
    expect(patchedVersion.warnings.length).toBe(0);

    const regenerateCloned = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${cloneVersionId}/pine/generate`,
      payload: {},
    });
    expect(regenerateCloned.statusCode).toBe(200);
    const regeneratedVersion = regenerateCloned.json().data.strategy_version;
    expect(regeneratedVersion.status).toBe('generated');
    expect(regeneratedVersion.generated_pine).toContain('strategy("Hokkyokusei Generated Strategy"');

    const sourceDetail = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/${sourceVersionId}`,
    });
    expect(sourceDetail.statusCode).toBe(200);
    expect(sourceDetail.json().data.strategy_version.generated_pine).toBe(sourceGeneratedPine);

    const listAfterEdit = await app.inject({
      method: 'GET',
      url: `/api/strategies/${strategyId}/versions`,
    });
    expect(listAfterEdit.statusCode).toBe(200);
    const listAfterEditBody = listAfterEdit.json();
    const editedCloneListItem = listAfterEditBody.data.strategy_versions.find((item: any) => item.id === cloneVersionId);
    expect(editedCloneListItem.is_derived).toBe(true);
    expect(editedCloneListItem.has_diff_from_clone).toBe(true);

    await app.close();
  });

  it('stores and returns forward validation note for strategy version', async () => {
    const app = await createApp();

    const createStrategy = await app.inject({
      method: 'POST',
      url: '/api/strategies',
      payload: { title: 'forward-note-test' },
    });
    const strategyId = createStrategy.json().data.strategy.id as string;

    const createVersion = await app.inject({
      method: 'POST',
      url: `/api/strategies/${strategyId}/versions`,
      payload: {
        natural_language_rule:
          '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。買い後5日経過で手仕舞い。',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const versionId = createVersion.json().data.strategy_version.id as string;

    const generate = await app.inject({
      method: 'POST',
      url: `/api/strategy-versions/${versionId}/pine/generate`,
      payload: {},
    });
    expect(generate.statusCode).toBe(200);
    const statusBeforeNotePatch = generate.json().data.strategy_version.status as string;

      const patchNote = await app.inject({
        method: 'PATCH',
        url: `/api/strategy-versions/${versionId}`,
        payload: {
          forward_validation_note: '次回は RSI 条件を 55 以上で再検証する',
        },
      });
      expect(patchNote.statusCode).toBe(200);
      expect(patchNote.json().data.strategy_version.forward_validation_note).toContain('RSI');
      const noteUpdatedAtAfterNotePatch = patchNote.json().data.strategy_version.forward_validation_note_updated_at as string;
      expect(typeof noteUpdatedAtAfterNotePatch).toBe('string');
      expect(patchNote.json().data.strategy_version.status).toBe(statusBeforeNotePatch);

      const patchRuleOnly = await app.inject({
        method: 'PATCH',
        url: `/api/strategy-versions/${versionId}`,
        payload: {
          natural_language_rule:
            '25日移動平均線の上で、RSIが55以上、出来高が20日平均の1.8倍以上で買い。買い後5日経過で手仕舞い。',
        },
      });
      expect(patchRuleOnly.statusCode).toBe(200);
      expect(patchRuleOnly.json().data.strategy_version.forward_validation_note_updated_at).toBe(noteUpdatedAtAfterNotePatch);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/${versionId}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.strategy_version.forward_validation_note).toContain('RSI');
    expect(detail.json().data.strategy_version.forward_validation_note_updated_at).toBe(noteUpdatedAtAfterNotePatch);

    const listedWithNote = await app.inject({
      method: 'GET',
      url: `/api/strategies/${strategyId}/versions`,
    });
    expect(listedWithNote.statusCode).toBe(200);
    const listedWithNoteRow = listedWithNote.json().data.strategy_versions.find((item: any) => item.id === versionId);
    expect(listedWithNoteRow.has_forward_validation_note).toBe(true);
    expect(listedWithNoteRow.forward_validation_note_updated_at).toBe(noteUpdatedAtAfterNotePatch);

    const clearNote = await app.inject({
      method: 'PATCH',
      url: `/api/strategy-versions/${versionId}`,
      payload: {
        forward_validation_note: '   ',
      },
    });
    expect(clearNote.statusCode).toBe(200);
    expect(clearNote.json().data.strategy_version.forward_validation_note).toBeNull();
    expect(clearNote.json().data.strategy_version.forward_validation_note_updated_at).toBeNull();

    const listedWithoutNote = await app.inject({
      method: 'GET',
      url: `/api/strategies/${strategyId}/versions`,
    });
    expect(listedWithoutNote.statusCode).toBe(200);
    const listedWithoutNoteRow = listedWithoutNote.json().data.strategy_versions.find((item: any) => item.id === versionId);
    expect(listedWithoutNoteRow.has_forward_validation_note).toBe(false);
    expect(listedWithoutNoteRow.forward_validation_note_updated_at).toBeNull();

    await app.close();
  });
});
