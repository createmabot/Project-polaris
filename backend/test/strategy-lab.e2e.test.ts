import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';
import { strategyRoutes } from '../src/routes/strategies';
import { strategyLabRoutes } from '../src/routes/strategy-lab';
import { strategyVersionRoutes } from '../src/routes/strategy-versions';
import {
  getStrategyProposalLocalLlmGuardConfig,
  resetStrategyProposalRateLimitForTests,
  resolveStrategyProposalRateLimitKey,
} from '../src/strategy-proposals/guards';

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
  archivedAt: Date | null;
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

type StrategyProposalProviderEventRow = {
  id: string;
  proposalRunId: string | null;
  eventType: string;
  providerName: string;
  providerMode: string | null;
  selectedBy: string | null;
  status: string;
  invalidReason: string | null;
  latencyBucket: string | null;
  elapsedMs: number | null;
  candidateCount: number | null;
  validationErrorCount: number | null;
  retryUsed: boolean;
  retryReason: string | null;
  retrySucceeded: boolean | null;
  rateLimited: boolean;
  rateLimitKeySource: string | null;
  manualImport: boolean;
  benchmark: boolean;
  metadataJson: unknown;
  occurredAt: Date;
  createdAt: Date;
};

type Runtime = {
  strategySeq: number;
  versionSeq: number;
  pineSeq: number;
  revisionSeq: number;
  proposalRunSeq: number;
  proposalCandidateSeq: number;
  proposalProviderEventSeq: number;
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
  proposalProviderEvents: Map<string, StrategyProposalProviderEventRow>;
  proposalRunFindManyCalls: any[];
  proposalRunCountCalls: any[];
  proposalProviderEventFindManyCalls: any[];
  proposalProviderEventCountCalls: any[];
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
    proposalProviderEventSeq: 1,
    strategies: new Map(),
    versions: new Map(),
    pineScripts: new Map(),
    pineRevisionInputs: new Map(),
    proposalRuns: new Map(),
    proposalCandidates: new Map(),
    proposalProviderEvents: new Map(),
    proposalRunFindManyCalls: [],
    proposalRunCountCalls: [],
    proposalProviderEventFindManyCalls: [],
    proposalProviderEventCountCalls: [],
  };
}

function findProviderEvent(
  eventType: string,
  predicate: (event: StrategyProposalProviderEventRow) => boolean = () => true,
) {
  return Array.from(runtime.proposalProviderEvents.values())
    .find((event) => event.eventType === eventType && predicate(event));
}

function readJsonPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function stringMatches(value: unknown, filter: any): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const needle = String(filter.contains ?? filter.string_contains ?? '');
  const haystack = filter.mode === 'insensitive' ? value.toLowerCase() : value;
  const normalizedNeedle = filter.mode === 'insensitive' ? needle.toLowerCase() : needle;
  return haystack.includes(normalizedNeedle);
}

function proposalRunMatchesWhere(row: StrategyProposalRunRow, where: any): boolean {
  if (!where || Object.keys(where).length === 0) {
    return true;
  }
  if (Array.isArray(where.AND)) {
    return where.AND.every((condition: any) => proposalRunMatchesWhere(row, condition));
  }
  if (Array.isArray(where.OR)) {
    return where.OR.some((condition: any) => proposalRunMatchesWhere(row, condition));
  }
  if (where.providerName !== undefined) {
    if (typeof where.providerName === 'string' && row.providerName !== where.providerName) {
      return false;
    }
    if (typeof where.providerName === 'object' && !stringMatches(row.providerName, where.providerName)) {
      return false;
    }
  }
  if (where.providerMode !== undefined && !stringMatches(row.providerMode, where.providerMode)) {
    return false;
  }
  if (where.selectedBy !== undefined && !stringMatches(row.selectedBy, where.selectedBy)) {
    return false;
  }
  if (where.id !== undefined && !stringMatches(row.id, where.id)) {
    return false;
  }
  if (where.status !== undefined && row.status !== where.status) {
    return false;
  }
  if (where.selectedCandidateId === null && row.selectedCandidateId !== null) {
    return false;
  }
  if (where.selectedCandidateId?.not === null && row.selectedCandidateId === null) {
    return false;
  }
  if (where.archivedAt === null && row.archivedAt !== null) {
    return false;
  }
  if (where.archivedAt?.not === null && row.archivedAt === null) {
    return false;
  }
  if (where.inputJson?.path) {
    const value = readJsonPath(row.inputJson, where.inputJson.path);
    if ('equals' in where.inputJson && value !== where.inputJson.equals) {
      return false;
    }
    if ('string_contains' in where.inputJson && !stringMatches(value, where.inputJson)) {
      return false;
    }
  }
  return true;
}

function providerEventMatchesWhere(row: StrategyProposalProviderEventRow, where: any): boolean {
  if (!where || Object.keys(where).length === 0) {
    return true;
  }
  if (Array.isArray(where.AND)) {
    return where.AND.every((condition: any) => providerEventMatchesWhere(row, condition));
  }
  if (where.providerName !== undefined && row.providerName !== where.providerName) {
    return false;
  }
  if (where.eventType !== undefined && row.eventType !== where.eventType) {
    return false;
  }
  if (where.status !== undefined && row.status !== where.status) {
    return false;
  }
  if (where.proposalRunId !== undefined && row.proposalRunId !== where.proposalRunId) {
    return false;
  }
  if (where.occurredAt?.gte && row.occurredAt < where.occurredAt.gte) {
    return false;
  }
  if (where.occurredAt?.lte && row.occurredAt > where.occurredAt.lte) {
    return false;
  }
  return true;
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
          archivedAt: data.archivedAt ?? null,
          completedAt: data.completedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        runtime.proposalRuns.set(id, row);
        return row;
      },
      count: async ({ where }: any = {}) => {
        runtime.proposalRunCountCalls.push({ where });
        return Array.from(runtime.proposalRuns.values())
          .filter((row) => proposalRunMatchesWhere(row, where))
          .length;
      },
      findMany: async ({ where, orderBy, skip, take, include }: any = {}) => {
        runtime.proposalRunFindManyCalls.push({ where, orderBy, skip, take, include });
        let rows = Array.from(runtime.proposalRuns.values())
          .filter((row) => proposalRunMatchesWhere(row, where));
        if (orderBy?.createdAt === 'desc') {
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else if (orderBy?.createdAt === 'asc') {
          rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        const offset = Number.isInteger(skip) ? skip : 0;
        rows = rows.slice(offset, Number.isInteger(take) ? offset + take : rows.length);
        if (!include?.candidates) {
          return rows;
        }
        return rows.map((row) => {
          const candidates = Array.from(runtime.proposalCandidates.values())
            .filter((candidate) => candidate.proposalRunId === row.id)
            .sort((a, b) => a.rank - b.rank);
          return { ...row, candidates };
        });
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
    strategyProposalProviderEvent: {
      create: async ({ data }: any) => {
        const id = `proposal-event-${runtime.proposalProviderEventSeq++}`;
        const now = new Date();
        const row: StrategyProposalProviderEventRow = {
          id,
          proposalRunId: data.proposalRunId ?? null,
          eventType: data.eventType,
          providerName: data.providerName,
          providerMode: data.providerMode ?? null,
          selectedBy: data.selectedBy ?? null,
          status: data.status,
          invalidReason: data.invalidReason ?? null,
          latencyBucket: data.latencyBucket ?? null,
          elapsedMs: data.elapsedMs ?? null,
          candidateCount: data.candidateCount ?? null,
          validationErrorCount: data.validationErrorCount ?? null,
          retryUsed: data.retryUsed ?? false,
          retryReason: data.retryReason ?? null,
          retrySucceeded: data.retrySucceeded ?? null,
          rateLimited: data.rateLimited ?? false,
          rateLimitKeySource: data.rateLimitKeySource ?? null,
          manualImport: data.manualImport ?? false,
          benchmark: data.benchmark ?? false,
          metadataJson: data.metadataJson ?? null,
          occurredAt: data.occurredAt ?? now,
          createdAt: data.createdAt ?? now,
        };
        runtime.proposalProviderEvents.set(id, row);
        return row;
      },
      count: async ({ where }: any = {}) => {
        runtime.proposalProviderEventCountCalls.push({ where });
        return Array.from(runtime.proposalProviderEvents.values())
          .filter((row) => providerEventMatchesWhere(row, where))
          .length;
      },
      findMany: async ({ where, orderBy, skip, take }: any = {}) => {
        runtime.proposalProviderEventFindManyCalls.push({ where, orderBy, skip, take });
        let rows = Array.from(runtime.proposalProviderEvents.values())
          .filter((row) => providerEventMatchesWhere(row, where));
        if (orderBy?.occurredAt === 'desc') {
          rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
        } else if (orderBy?.occurredAt === 'asc') {
          rows.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
        }
        const offset = Number.isInteger(skip) ? skip : 0;
        rows = rows.slice(offset, Number.isInteger(take) ? offset + take : rows.length);
        return rows;
      },
    },
    $transaction: async (callback: any) => {
      const snapshot = {
        proposalRunSeq: runtime.proposalRunSeq,
        proposalCandidateSeq: runtime.proposalCandidateSeq,
        proposalProviderEventSeq: runtime.proposalProviderEventSeq,
        proposalRuns: new Map(Array.from(runtime.proposalRuns.entries()).map(([key, value]) => [key, { ...value }])),
        proposalCandidates: new Map(Array.from(runtime.proposalCandidates.entries()).map(([key, value]) => [key, { ...value }])),
        proposalProviderEvents: new Map(Array.from(runtime.proposalProviderEvents.entries()).map(([key, value]) => [key, { ...value }])),
      };
      try {
        return await callback(prisma);
      } catch (error) {
        runtime.proposalRunSeq = snapshot.proposalRunSeq;
        runtime.proposalCandidateSeq = snapshot.proposalCandidateSeq;
        runtime.proposalProviderEventSeq = snapshot.proposalProviderEventSeq;
        runtime.proposalRuns = snapshot.proposalRuns;
        runtime.proposalCandidates = snapshot.proposalCandidates;
        runtime.proposalProviderEvents = snapshot.proposalProviderEvents;
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
  return localLlmResponseText(JSON.stringify(payload));
}

function localLlmResponseText(content: string) {
  return {
    ok: true,
    json: async () => ({
      message: {
        content,
      },
    }),
  };
}

function codexCliImportPayload(candidates: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
  return {
    schema_name: 'strategy_proposal_candidates',
    schema_version: '1.0',
    input: {
      market: 'JP_STOCK',
      timeframe: 'D',
      symbol_code: '7203',
      risk_preference: 'balanced',
      strategy_type_bias: 'any',
      proposal_count: candidates.length,
      user_hint: 'Codex CLI manual import fixture',
    },
    candidates,
    disclaimer: 'This is a verification candidate, not investment advice.',
    ...overrides,
  };
}

describe('strategy lab vertical slice', () => {
  beforeEach(() => {
    runtime = createRuntime();
    resetStrategyProposalRateLimitForTests();
    delete process.env.STRATEGY_PROPOSAL_PROVIDER;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_PROFILE;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS;
    delete process.env.STRATEGY_PROPOSAL_RATE_LIMIT_ENABLED;
    delete process.env.STRATEGY_PROPOSAL_RATE_LIMIT_MAX_REQUESTS;
    delete process.env.STRATEGY_PROPOSAL_RATE_LIMIT_WINDOW_MS;
    delete process.env.STRATEGY_PROPOSAL_TRUST_FORWARDED_IP;
  });

  afterEach(() => {
    resetStrategyProposalRateLimitForTests();
    delete process.env.STRATEGY_PROPOSAL_PROVIDER;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_PROFILE;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS;
    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS;
    delete process.env.STRATEGY_PROPOSAL_RATE_LIMIT_ENABLED;
    delete process.env.STRATEGY_PROPOSAL_RATE_LIMIT_MAX_REQUESTS;
    delete process.env.STRATEGY_PROPOSAL_RATE_LIMIT_WINDOW_MS;
    delete process.env.STRATEGY_PROPOSAL_TRUST_FORWARDED_IP;
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
        symbol_code: 'AAPL',
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
    expect(storedRun?.archivedAt).toBeNull();
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
      is_archived: false,
      archived_at: null,
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

    const event = findProviderEvent('proposal_generate');
    expect(event).toMatchObject({
      proposalRunId: body.data.proposal_run_id,
      eventType: 'proposal_generate',
      providerName: 'stub',
      providerMode: 'deterministic',
      selectedBy: 'default',
      status: 'succeeded',
      invalidReason: 'none',
      candidateCount: 1,
      validationErrorCount: 0,
      retryUsed: false,
      rateLimited: false,
      manualImport: false,
    });
    expect(event?.metadataJson).toMatchObject({
      schema_valid: true,
      fallback_used: false,
      candidate_count_requested: 1,
      source: 'strategy_lab',
    });
    expect(JSON.stringify(event)).not.toContain('出来高を重視したい');
    expect(JSON.stringify(event)).not.toContain(body.data.candidates[0].title);
  });

  it('filters, paginates, and searches proposal history without returning candidate free text', async () => {
    const app = await createApp();

    const stubResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        market: 'JP_STOCK',
        timeframe: 'D',
        risk_preference: 'balanced',
        strategy_type_bias: 'trend_following',
        proposal_count: 1,
        user_hint: 'privatealpha privatebeta',
      },
    });
    expect(stubResponse.statusCode).toBe(200);

    const codexCandidate = validLocalLlmCandidate({
      candidate_id: 'codex-history-1',
      title: 'Unique history management candidate marker',
    });
    const codexResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/import',
      payload: {
        source: 'paste',
        result_json_text: JSON.stringify(codexCliImportPayload([codexCandidate], {
          input: {
            market: 'JP_STOCK',
            timeframe: 'D',
            symbol_code: 'AAPL',
            risk_preference: 'balanced',
            strategy_type_bias: 'any',
            proposal_count: 1,
            user_hint: 'Codex CLI manual import fixture',
          },
        })),
      },
    });
    expect(codexResponse.statusCode).toBe(200);

    const selectResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${codexResponse.json().data.proposal_run_id}/select`,
      payload: { candidate_id: 'codex-history-1' },
    });
    expect(selectResponse.statusCode).toBe(200);

    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(localLlmResponseText('not-json')));
    const failedResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: { proposal_count: 1 },
    });
    expect(failedResponse.statusCode).toBe(502);

    const pageOne = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?page=1&limit=2&sort=created_at&order=desc',
    });
    expect(pageOne.statusCode).toBe(200);
    expect(pageOne.json().data.proposal_runs).toHaveLength(2);
    expect(pageOne.json().data.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total_count: 3,
      has_next: true,
      has_previous: false,
    });
    expect(pageOne.json().data.meta).toMatchObject({
      raw_prompt_included: false,
      raw_response_included: false,
      candidate_free_text_included: false,
      user_hint_full_text_included: false,
    });
    expect(JSON.stringify(pageOne.json().data.proposal_runs)).not.toContain('privatealpha privatebeta');
    const pageOneListCall = runtime.proposalRunFindManyCalls.find((call) => (
      call.take === 2 && call.skip === 0 && call.orderBy?.createdAt === 'desc' && !call.include
    ));
    expect(pageOneListCall).toBeTruthy();
    expect(runtime.proposalRunCountCalls.some((call) => (
      JSON.stringify(call.where) === JSON.stringify(pageOneListCall?.where)
    ))).toBe(true);

    const userHintSearch = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?q=history%20filter%20hint',
    });
    expect(userHintSearch.statusCode).toBe(200);
    expect(userHintSearch.json().data.pagination.total_count).toBe(0);
    expect(JSON.stringify(userHintSearch.json())).not.toContain('privatealpha privatebeta');

    for (const q of ['aapl', 'AAPL', 'aApL']) {
      const symbolSearch = await app.inject({
        method: 'GET',
        url: `/api/strategy-lab/proposals?q=${q}`,
      });
      expect(symbolSearch.statusCode).toBe(200);
      expect(symbolSearch.json().data.pagination.total_count).toBe(1);
      expect(JSON.stringify(symbolSearch.json())).not.toContain('privatealpha privatebeta');
    }

    const lowerMarketSearch = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?q=jp_stock',
    });
    expect(lowerMarketSearch.statusCode).toBe(200);
    expect(lowerMarketSearch.json().data.pagination.total_count).toBe(3);

    const lowerTimeframeSearch = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?q=d',
    });
    expect(lowerTimeframeSearch.statusCode).toBe(200);
    expect(lowerTimeframeSearch.json().data.pagination.total_count).toBe(3);

    const pageTwo = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?page=2&limit=2&sort=created_at&order=desc',
    });
    expect(pageTwo.statusCode).toBe(200);
    expect(pageTwo.json().data.proposal_runs).toHaveLength(1);
    expect(pageTwo.json().data.pagination).toMatchObject({
      page: 2,
      has_next: false,
      has_previous: true,
    });

    const providerFilter = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?provider_name=codex_cli_manual&selected=true',
    });
    expect(providerFilter.statusCode).toBe(200);
    expect(providerFilter.json().data.proposal_runs).toHaveLength(1);
    expect(providerFilter.json().data.proposal_runs[0]).toMatchObject({
      provider_name: 'codex_cli_manual',
      selected_candidate_id: expect.any(String),
    });

    const failedFilter = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?status=failed',
    });
    expect(failedFilter.statusCode).toBe(200);
    expect(failedFilter.json().data.proposal_runs).toHaveLength(1);
    expect(failedFilter.json().data.proposal_runs[0]).toMatchObject({
      status: 'failed',
      provider_name: 'local_llm',
    });

    const searchResponse = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?q=codex_cli_manual',
    });
    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.json().data.pagination.total_count).toBe(1);
    expect(searchResponse.json().data.filters).toMatchObject({
      q_present: true,
    });
    const serializedSearchBody = JSON.stringify(searchResponse.json());
    expect(serializedSearchBody).not.toContain('Unique history management candidate marker');
    expect(serializedSearchBody).not.toContain('suggested_natural_language_spec');
    expect(serializedSearchBody).not.toContain('not-json');

    const candidateTextSearch = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?q=Unique%20history%20management%20candidate%20marker',
    });
    expect(candidateTextSearch.statusCode).toBe(200);
    expect(candidateTextSearch.json().data.pagination.total_count).toBe(0);
    expect(JSON.stringify(candidateTextSearch.json())).not.toContain('Unique history management candidate marker');

    const invalidSort = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?sort=updated_at',
    });
    expect(invalidSort.statusCode).toBe(400);

    const longSearch = await app.inject({
      method: 'GET',
      url: `/api/strategy-lab/proposals?q=${'x'.repeat(201)}`,
    });
    expect(longSearch.statusCode).toBe(400);
    expect(JSON.stringify(longSearch.json())).not.toContain('x'.repeat(201));
  });

  it('soft archives proposal runs without deleting detail, candidates, or provider events', async () => {
    const app = await createApp();

    const activeResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: { proposal_count: 1 },
    });
    expect(activeResponse.statusCode).toBe(200);
    const archivedResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: { proposal_count: 1, strategy_type_bias: 'breakout' },
    });
    expect(archivedResponse.statusCode).toBe(200);
    const archivedRunId = archivedResponse.json().data.proposal_run_id as string;
    const providerEventCountBeforeArchive = runtime.proposalProviderEvents.size;

    const archiveResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${archivedRunId}/archive`,
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json().data.proposal_run).toMatchObject({
      id: archivedRunId,
      is_archived: true,
    });
    expect(archiveResponse.json().data.proposal_run.archived_at).toBeTruthy();
    expect(runtime.proposalRuns.get(archivedRunId)?.archivedAt).toBeInstanceOf(Date);
    expect(runtime.proposalProviderEvents.size).toBe(providerEventCountBeforeArchive);

    const archiveAgainResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${archivedRunId}/archive`,
    });
    expect(archiveAgainResponse.statusCode).toBe(200);
    expect(archiveAgainResponse.json().data.proposal_run).toMatchObject({
      id: archivedRunId,
      is_archived: true,
    });

    const defaultList = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?limit=10',
    });
    expect(defaultList.statusCode).toBe(200);
    expect(defaultList.json().data.proposal_runs.map((run: any) => run.id)).toEqual([
      activeResponse.json().data.proposal_run_id,
    ]);
    expect(defaultList.json().data.pagination.total_count).toBe(1);
    expect(defaultList.json().data.filters.archived).toBe('active');

    const archivedList = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?archived=archived&limit=10',
    });
    expect(archivedList.statusCode).toBe(200);
    expect(archivedList.json().data.proposal_runs).toEqual([
      expect.objectContaining({
        id: archivedRunId,
        is_archived: true,
        archived_at: expect.any(String),
      }),
    ]);
    expect(archivedList.json().data.pagination.total_count).toBe(1);

    const allList = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?archived=all&limit=10',
    });
    expect(allList.statusCode).toBe(200);
    expect(allList.json().data.proposal_runs.map((run: any) => run.id).sort()).toEqual([
      activeResponse.json().data.proposal_run_id,
      archivedRunId,
    ].sort());
    expect(allList.json().data.pagination.total_count).toBe(2);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/strategy-lab/proposals/${archivedRunId}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().data.proposal_run).toMatchObject({
      id: archivedRunId,
      is_archived: true,
    });
    expect(detailResponse.json().data.candidates).toHaveLength(1);

    const selectArchivedResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${archivedRunId}/select`,
      payload: {
        candidate_id: archivedResponse.json().data.candidates[0].candidate_id,
      },
    });
    expect(selectArchivedResponse.statusCode).toBe(200);
    expect(selectArchivedResponse.json().data.proposal_run).toMatchObject({
      id: archivedRunId,
      is_archived: true,
    });
    expect(runtime.proposalRuns.get(archivedRunId)?.archivedAt).toBeInstanceOf(Date);
    expect(runtime.strategies.size).toBe(0);
    expect(runtime.versions.size).toBe(0);
    expect(runtime.pineScripts.size).toBe(0);

    const unarchiveResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${archivedRunId}/unarchive`,
    });
    expect(unarchiveResponse.statusCode).toBe(200);
    expect(unarchiveResponse.json().data.proposal_run).toMatchObject({
      id: archivedRunId,
      is_archived: false,
      archived_at: null,
    });
    expect(runtime.proposalRuns.get(archivedRunId)?.archivedAt).toBeNull();

    const unarchiveAgainResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${archivedRunId}/unarchive`,
    });
    expect(unarchiveAgainResponse.statusCode).toBe(200);
    expect(unarchiveAgainResponse.json().data.proposal_run).toMatchObject({
      id: archivedRunId,
      is_archived: false,
      archived_at: null,
    });

    const invalidArchiveFilter = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?archived=deleted',
    });
    expect(invalidArchiveFilter.statusCode).toBe(400);
    expect(JSON.stringify(invalidArchiveFilter.json())).not.toContain('raw');
  });

  it('builds a Codex CLI manual import prompt without provider runtime details', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/request',
      payload: {
        market: 'JP_STOCK',
        timeframe: 'D',
        risk_preference: 'balanced',
        strategy_type_bias: 'breakout',
        proposal_count: 5,
        user_hint: '短期スイング候補を日本語で出す',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toMatchObject({
      provider_name: 'codex_cli_manual',
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      proposal_count: 5,
      web_search_prompt: false,
    });
    expect(body.data.prompt).toContain('JSON objectを1つだけ返してください');
    expect(body.data.prompt).toContain('strategy_proposal_candidates');
    expect(body.data.prompt).toContain('ユーザーに見える値の文章は日本語で書いてください');
    expect(body.data.prompt).toContain('候補同士は意味のある差分を持たせてください');
    expect(body.data.prompt).toContain('risk_preference は risk_management、invalidation_conditions、backtest_cautions、confidence、uncertainty に反映してください');
    expect(body.data.prompt).toContain('strategy_type_bias が any でない場合、少なくとも先頭候補は bias に沿わせてください');
    expect(body.data.prompt).toContain('suggested_natural_language_spec には market、timeframe、long/short assumption、entry trigger、exit trigger、stop loss rule、indicator periods、backtest caution を含めてください');
    expect(body.data.prompt).toContain('confidence は利益期待ではなく、ルール明確性、Pine feasible、uncertainty の低さを示す値です');
    expect(body.data.prompt).toContain('これらは backtest 前の検証候補です');
    expect(body.data.prompt).toContain('Web検索で補助確認した場合でも、北極星側は citation / freshness を保存しない');
    expect(body.data.prompt).toContain('research_basis は user_hint に明示された条件を user_input、market/timeframe/risk setting を internal、一般的な戦略類型を provider_knowledge としてください');
    expect(body.data.prompt).toContain('短期スイング候補を日本語で出す');
    expect(body.data.prompt).not.toContain('Codex CLI側でWeb検索が利用できる場合');
    expect(body.data.prompt).not.toContain('SymbolDetail 起点の銘柄調査付き strategy proposal');
    expect(body.data.prompt).not.toContain('対象銘柄の基本情報');
    expect(body.data.prompt).not.toContain('Web search なし、最新 market data なし');
    expect(body.data.prompt).not.toContain('STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT');
    expect(body.data.prompt).not.toContain('STRATEGY_PROPOSAL_LOCAL_LLM_MODEL');
    expect(body.data.prompt).not.toContain('secret');
    expect(body.data.prompt).not.toMatch(/[A-Za-z]:\\/);
  });

  it('builds a Codex CLI manual import prompt with optional Web search guidance', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/request',
      payload: {
        market: 'JP_STOCK',
        timeframe: 'D',
        risk_preference: 'balanced',
        strategy_type_bias: 'any',
        proposal_count: 5,
        user_hint: 'Web確認できる場合でもJSON schemaを守る',
        web_search_prompt: true,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toMatchObject({
      provider_name: 'codex_cli_manual',
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      proposal_count: 5,
      web_search_prompt: true,
    });
    expect(body.data.prompt).toContain('Codex CLI側でWeb検索が利用できる場合');
    expect(body.data.prompt).toContain('JSON objectを1つだけ返してください');
    expect(body.data.prompt).toContain('research_basis.source_type は internal / user_input / provider_knowledge のみを使い、source_type=web は使わないでください');
    expect(body.data.prompt).toContain('URL、引用、長い本文抜粋をJSONに含めないでください');
    expect(body.data.prompt).toContain('URLを捏造しないでください');
    expect(body.data.prompt).toContain('Web検索で補助確認した場合でも、北極星側は citation / freshness を保存しない');
    expect(body.data.prompt).toContain('confidence=high はルールが明確で Pine 化しやすく、不確実性が低い場合に限定してください');
    expect(body.data.prompt).not.toContain('SymbolDetail 起点の銘柄調査付き strategy proposal');
    expect(body.data.prompt).not.toContain('対象銘柄の基本情報');
    expect(body.data.prompt).not.toContain('Web search なし、最新 market data なし');
    expect(body.data.prompt).not.toContain('STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT');
    expect(body.data.prompt).not.toContain('STRATEGY_PROPOSAL_LOCAL_LLM_MODEL');
    expect(body.data.prompt).not.toContain('secret');
    expect(body.data.prompt).not.toMatch(/[A-Za-z]:\\/);
  });

  it.each([false, true])('builds a symbol research Codex CLI prompt when symbol_code is present, web_search_prompt=%s', async (webSearchPrompt) => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/request',
      payload: {
        market: 'JP_STOCK',
        timeframe: 'D',
        symbol_code: '7203',
        risk_preference: 'balanced',
        strategy_type_bias: 'any',
        proposal_count: 5,
        user_hint: '銘柄起点で候補を作る',
        web_search_prompt: webSearchPrompt,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toMatchObject({
      provider_name: 'codex_cli_manual',
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      proposal_count: 5,
      web_search_prompt: true,
    });
    expect(body.data.prompt).toContain('SymbolDetail 起点の銘柄調査付き strategy proposal');
    expect(body.data.prompt).toContain('対象銘柄コードは 7203');
    expect(body.data.prompt).toContain('Web検索を使い');
    expect(body.data.prompt).toContain('対象銘柄の基本情報');
    expect(body.data.prompt).toContain('直近の価格傾向');
    expect(body.data.prompt).toContain('出来高傾向');
    expect(body.data.prompt).toContain('ボラティリティ');
    expect(body.data.prompt).toContain('決算・業績');
    expect(body.data.prompt).toContain('ニュース');
    expect(body.data.prompt).toContain('投資カレンダー上のイベント');
    expect(body.data.prompt).toContain('セクター環境');
    expect(body.data.prompt).toContain('その銘柄で検証する価値のある strategy_type');
    expect(body.data.prompt).toContain('なぜこの銘柄で検証する価値があるか');
    expect(body.data.prompt).toContain('overfitting');
    expect(body.data.prompt).toContain('slippage');
    expect(body.data.prompt).toContain('drawdown');
    expect(body.data.prompt).toContain('event risk');
    expect(body.data.prompt).toContain('strategy_proposal_candidates v1.0 JSON object 1個だけ');
    expect(body.data.prompt).toContain('URL、citation、長い引用、raw article text、raw Web result を含めないでください');
    expect(body.data.prompt).toContain('source_type=web は使わないでください');
    expect(body.data.prompt).toContain('Pine化してbacktestするための検証候補');
    expect(body.data.prompt).not.toContain('Codex CLI側でWeb検索が利用できる場合');
    expect(body.data.prompt).not.toContain('STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT');
    expect(body.data.prompt).not.toContain('STRATEGY_PROPOSAL_LOCAL_LLM_MODEL');
    expect(body.data.prompt).not.toContain('secret');
    expect(body.data.prompt).not.toMatch(/[A-Za-z]:\\/);
  });

  it('imports Codex CLI manual JSON candidates and persists sanitized proposal history', async () => {
    const app = await createApp();
    const candidates = Array.from({ length: 5 }, (_, index) => validLocalLlmCandidate({
      candidate_id: `codex-${index + 1}`,
      title: `Codex CLI manual candidate ${index + 1}`,
    }));
    const importJson = codexCliImportPayload(candidates, {
      raw_debug: 'raw codex output marker should not be returned or persisted',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/import',
      payload: {
        source: 'paste',
        result_json_text: JSON.stringify(importJson),
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.provider).toMatchObject({
      name: 'codex_cli_manual',
      mode: 'manual_import',
      web_search: false,
      persisted: true,
    });
    expect(body.data.provider_observation).toMatchObject({
      provider_name: 'codex_cli_manual',
      selected_by: 'config',
      status: 'succeeded',
      candidate_count: 5,
      invalid_reason: 'none',
      schema_valid: true,
      manual_import: true,
    });
    expect(body.data.candidates).toHaveLength(5);
    expect(body.data.proposal_run_id).toBe('proposal-run-1');
    expect(JSON.stringify(body)).not.toContain('raw codex output marker');

    const storedRun = runtime.proposalRuns.get(body.data.proposal_run_id);
    expect(storedRun).toMatchObject({
      providerName: 'codex_cli_manual',
      providerMode: 'manual_import',
      selectedBy: 'config',
      candidateCount: 5,
    });
    expect(JSON.stringify(storedRun)).not.toContain('raw codex output marker');
    const storedCandidates = Array.from(runtime.proposalCandidates.values())
      .filter((candidate) => candidate.proposalRunId === body.data.proposal_run_id);
    expect(storedCandidates).toHaveLength(5);
    const event = findProviderEvent('codex_cli_import');
    expect(event).toMatchObject({
      proposalRunId: body.data.proposal_run_id,
      eventType: 'codex_cli_import',
      providerName: 'codex_cli_manual',
      providerMode: 'manual_import',
      selectedBy: 'config',
      status: 'succeeded',
      invalidReason: 'none',
      candidateCount: 5,
      validationErrorCount: 0,
      manualImport: true,
      rateLimited: false,
    });
    expect(event?.metadataJson).toMatchObject({
      schema_valid: true,
      candidate_count_requested: 5,
      manual_import_source: 'paste',
      source: 'strategy_lab',
    });
    expect(JSON.stringify(event)).not.toContain('raw codex output marker');
    expect(JSON.stringify(event)).not.toContain('Codex CLI manual candidate');

    const selectResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${body.data.proposal_run_id}/select`,
      payload: {
        candidate_id: 'codex-2',
      },
    });
    expect(selectResponse.statusCode).toBe(200);
    expect(selectResponse.json().data.selected_candidate.candidate.candidate_id).toBe('codex-2');
  });

  it('rate limits repeated Codex CLI manual imports before persistence', async () => {
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_ENABLED = 'true';
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_MAX_REQUESTS = '1';
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_WINDOW_MS = '60000';
    const app = await createApp();
    const importJson = JSON.stringify(codexCliImportPayload([
      validLocalLlmCandidate({ candidate_id: 'codex-rate-1' }),
    ]));

    const first = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/import',
      headers: { 'x-forwarded-for': 'spoofed-client, 203.0.113.10' },
      payload: {
        source: 'paste',
        result_json_text: importJson,
      },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/import',
      headers: { 'x-forwarded-for': 'another-spoofed-client, 203.0.113.10' },
      payload: {
        source: 'paste',
        result_json_text: JSON.stringify({
          ...codexCliImportPayload([
            validLocalLlmCandidate({ candidate_id: 'codex-rate-2' }),
          ]),
          raw_marker: 'blocked raw import payload should not leak',
        }),
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    const body = second.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details).toMatchObject({
      rate_limited: true,
      limit: 1,
      window_ms: 60000,
      provider_mode: 'manual_import',
      rate_limit_key_source: 'request_ip',
    });
    expect(typeof body.error.details.retry_after_ms).toBe('number');
    expect(runtime.proposalRuns.size).toBe(1);
    expect(Array.from(runtime.proposalCandidates.values())).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('blocked raw import payload should not leak');
    expect(JSON.stringify(body)).not.toContain('another-spoofed-client');
    expect(JSON.stringify(body)).not.toContain('203.0.113.10');
    expect(JSON.stringify(body)).not.toContain('request_ip:');
    expect(JSON.stringify(body)).not.toContain('manual_import:');

    const rateLimitedEvent = findProviderEvent('codex_cli_import_rate_limited');
    expect(rateLimitedEvent).toMatchObject({
      proposalRunId: null,
      providerName: 'codex_cli_manual',
      providerMode: 'manual_import',
      selectedBy: 'config',
      status: 'rate_limited',
      invalidReason: 'none',
      rateLimited: true,
      rateLimitKeySource: 'request_ip',
      manualImport: true,
    });
    expect(JSON.stringify(rateLimitedEvent)).not.toContain('blocked raw import payload should not leak');
    expect(JSON.stringify(rateLimitedEvent)).not.toContain('another-spoofed-client');
    expect(JSON.stringify(rateLimitedEvent)).not.toContain('203.0.113.10');
  });

  it('rejects invalid Codex CLI import JSON without echoing raw output', async () => {
    const app = await createApp();
    const malformedResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/import',
      payload: {
        source: 'paste',
        result_json_text: '{"schema_name":"strategy_proposal_candidates", "raw":"must not leak"',
      },
    });
    expect(malformedResponse.statusCode).toBe(400);
    expect(malformedResponse.json().error.details.invalid_reason).toBe('malformed_json');
    expect(JSON.stringify(malformedResponse.json())).not.toContain('must not leak');
    const malformedEvent = findProviderEvent('codex_cli_import_failed', (event) => (
      event.invalidReason === 'malformed_json'
    ));
    expect(malformedEvent).toMatchObject({
      proposalRunId: null,
      providerName: 'codex_cli_manual',
      providerMode: 'manual_import',
      status: 'invalid_response',
      invalidReason: 'malformed_json',
      manualImport: true,
    });
    expect(JSON.stringify(malformedEvent)).not.toContain('must not leak');

    const missingCandidate = validLocalLlmCandidate({ candidate_id: 'codex-missing' }) as Record<string, unknown>;
    delete missingCandidate.title;
    const missingResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/import',
      payload: {
        source: 'paste',
        result_json_text: JSON.stringify(codexCliImportPayload([missingCandidate])),
      },
    });
    expect(missingResponse.statusCode).toBe(400);
    expect(missingResponse.json().error.details.invalid_reason).toBe('required_field_missing');
    expect(missingResponse.json().error.details.missing_required_fields).toContain('title');
    expect(JSON.stringify(missingResponse.json())).not.toContain('codex-missing');
    expect(runtime.proposalRuns.size).toBe(0);
    const missingEvent = findProviderEvent('codex_cli_import_failed', (event) => (
      event.invalidReason === 'required_field_missing'
    ));
    expect(missingEvent).toMatchObject({
      proposalRunId: null,
      providerName: 'codex_cli_manual',
      status: 'invalid_response',
      invalidReason: 'required_field_missing',
      manualImport: true,
    });
    expect(missingEvent?.metadataJson).toMatchObject({
      schema_valid: false,
      missing_required_field_count: 1,
      affected_candidate_count: 1,
      source: 'strategy_lab',
    });
    expect(JSON.stringify(missingEvent)).not.toContain('codex-missing');
  });

  it('rejects Codex CLI imports that exceed candidate or research source boundaries', async () => {
    const app = await createApp();
    const tooManyCandidates = Array.from({ length: 11 }, (_, index) => validLocalLlmCandidate({
      candidate_id: `codex-many-${index + 1}`,
    }));
    const tooManyResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/import',
      payload: {
        source: 'file',
        result_json_text: JSON.stringify(codexCliImportPayload(tooManyCandidates, {
          input: {
            market: 'JP_STOCK',
            timeframe: 'D',
            risk_preference: 'balanced',
            strategy_type_bias: 'any',
            proposal_count: 10,
            user_hint: null,
          },
        })),
      },
    });
    expect(tooManyResponse.statusCode).toBe(400);
    expect(tooManyResponse.json().error.details.invalid_reason).toBe('candidate_count_invalid');

    const webCandidate = validLocalLlmCandidate({
      candidate_id: 'codex-web',
      research_basis: [{ source_type: 'web', label: 'not imported', url: null }],
    });
    const webResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/import',
      payload: {
        source: 'paste',
        result_json_text: JSON.stringify(codexCliImportPayload([webCandidate])),
      },
    });
    expect(webResponse.statusCode).toBe(400);
    expect(webResponse.json().error.details.invalid_reason).toBe('web_research_basis_disabled');
    expect(JSON.stringify(webResponse.json())).not.toContain('not imported');
    expect(runtime.proposalRuns.size).toBe(0);
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

  it('aggregates sanitized strategy proposal provider quality trends from proposal history', async () => {
    const app = await createApp();

    const successfulProposal = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 2,
        user_hint: 'must buy wording with private diagnostics should not appear in trends',
      },
    });
    expect(successfulProposal.statusCode).toBe(200);
    const successfulBody = successfulProposal.json();

    const selectResponse = await app.inject({
      method: 'POST',
      url: `/api/strategy-lab/proposals/${successfulBody.data.proposal_run_id}/select`,
      payload: {
        candidate_id: successfulBody.data.candidates[0].candidate_id,
      },
    });
    expect(selectResponse.statusCode).toBe(200);

    const emptySuccess = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        strategy_type_bias: 'other',
        proposal_count: 5,
      },
    });
    expect(emptySuccess.statusCode).toBe(200);

    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT = 'http://local-llm.example.test';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL = 'proposal-model-test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: 'not json',
        },
      }),
    }));
    const failedProposal = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
      },
    });
    expect(failedProposal.statusCode).toBe(502);

    const response = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals/provider-quality-trend?limit=10',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.summary).toMatchObject({
      total_runs: 3,
      succeeded_runs: 2,
      failed_runs: 1,
      selected_runs: 1,
      zero_candidate_runs: 2,
    });
    expect(body.data.summary.success_rate).toBe(0.6667);
    expect(body.data.summary.selected_rate).toBe(0.3333);
    expect(body.data.summary.avg_candidate_count).toBe(0.67);
    expect(body.data.by_provider).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider_name: 'stub',
        run_count: 2,
        succeeded_runs: 2,
        failed_runs: 0,
        selected_runs: 1,
        zero_candidate_runs: 1,
      }),
      expect.objectContaining({
        provider_name: 'local_llm',
        run_count: 1,
        succeeded_runs: 0,
        failed_runs: 1,
        selected_runs: 0,
        zero_candidate_runs: 1,
      }),
    ]));
    const localLlmProvider = body.data.by_provider.find((provider: any) => provider.provider_name === 'local_llm');
    expect(localLlmProvider.status_counts).toEqual(expect.arrayContaining([
      { value: 'invalid_response', count: 1 },
    ]));
    expect(localLlmProvider.invalid_reason_counts).toEqual(expect.arrayContaining([
      { value: 'malformed_json', count: 1 },
    ]));
    expect(body.data.candidate_distribution.strategy_type_counts.length).toBeGreaterThan(0);
    expect(body.data.recent_failures).toEqual([
      expect.objectContaining({
        provider_name: 'local_llm',
        status: 'invalid_response',
        invalid_reason: 'malformed_json',
        candidate_count: 0,
      }),
    ]);
    expect(body.data.meta).toMatchObject({
      source: 'strategy_proposal_history',
      sanitized: true,
      raw_prompt_included: false,
      raw_response_included: false,
      limit: 10,
    });

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('must buy wording');
    expect(serialized).not.toContain('private diagnostics');
    expect(serialized).not.toContain('local-llm.example.test');
    expect(serialized).not.toContain('proposal-model-test');
    expect(serialized).not.toContain('not json');
  });

  it('lists sanitized provider events with pagination and filters', async () => {
    const app = await createApp();

    const stubResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
        user_hint: 'private provider event hint should not be listed',
      },
    });
    expect(stubResponse.statusCode).toBe(200);

    const codexResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals/codex-cli/import',
      payload: {
        source: 'paste',
        result_json_text: JSON.stringify(codexCliImportPayload([
          validLocalLlmCandidate({
            candidate_id: 'event-codex-1',
            title: 'Provider event free text marker',
          }),
        ])),
      },
    });
    expect(codexResponse.statusCode).toBe(200);

    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT = 'http://local-llm.example.test';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL = 'proposal-model-test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(localLlmResponseText('raw provider text should not be listed')));
    const failedResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: { proposal_count: 1 },
    });
    expect(failedResponse.statusCode).toBe(502);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals/provider-events?page=1&limit=2',
    });
    expect(listResponse.statusCode).toBe(200);
    const body = listResponse.json();
    expect(body.data.events).toHaveLength(2);
    expect(body.data.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total_count: 3,
      has_next: true,
      has_previous: false,
    });
    expect(body.data.meta).toMatchObject({
      source: 'strategy_proposal_provider_events',
      sanitized: true,
      raw_prompt_included: false,
      raw_response_included: false,
      raw_codex_output_included: false,
      endpoint_included: false,
      model_value_included: false,
      user_hint_full_text_included: false,
      candidate_free_text_included: false,
    });
    const listCall = runtime.proposalProviderEventFindManyCalls.find((call) => (
      call.take === 2 && call.skip === 0 && call.orderBy?.occurredAt === 'desc'
    ));
    expect(listCall).toBeTruthy();
    expect(runtime.proposalProviderEventCountCalls.some((call) => (
      JSON.stringify(call.where) === JSON.stringify(listCall?.where)
    ))).toBe(true);

    const providerFilter = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals/provider-events?provider_name=codex_cli_manual&event_type=codex_cli_import&status=succeeded',
    });
    expect(providerFilter.statusCode).toBe(200);
    expect(providerFilter.json().data.events).toHaveLength(1);
    expect(providerFilter.json().data.events[0]).toMatchObject({
      proposal_run_id: codexResponse.json().data.proposal_run_id,
      event_type: 'codex_cli_import',
      provider_name: 'codex_cli_manual',
      provider_mode: 'manual_import',
      status: 'succeeded',
      invalid_reason: 'none',
      candidate_count: 1,
      manual_import: true,
    });

    const runFilter = await app.inject({
      method: 'GET',
      url: `/api/strategy-lab/proposals/provider-events?proposal_run_id=${stubResponse.json().data.proposal_run_id}`,
    });
    expect(runFilter.statusCode).toBe(200);
    expect(runFilter.json().data.events).toHaveLength(1);
    expect(runFilter.json().data.events[0]).toMatchObject({
      proposal_run_id: stubResponse.json().data.proposal_run_id,
      event_type: 'proposal_generate',
      provider_name: 'stub',
    });

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('private provider event hint should not be listed');
    expect(serialized).not.toContain('Provider event free text marker');
    expect(serialized).not.toContain('raw provider text should not be listed');
    expect(serialized).not.toContain('local-llm.example.test');
    expect(serialized).not.toContain('proposal-model-test');
    expect(serialized).not.toContain('C:\\');
    expect(serialized).not.toContain('stack');
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
    expect(requestBody.messages[0].content).toContain('Write all user-facing string values in Japanese');
    expect(requestBody.messages[0].content).toContain('Only schema keys, enum values, and source_type values must remain in English');
    expect(requestBody.messages[0].content).toContain('Candidate diversity: make candidates meaningfully different');
    expect(requestBody.messages[0].content).toContain('risk_preference alignment: reflect input.risk_preference in risk_management, invalidation_conditions, backtest_cautions, confidence, and uncertainty');
    expect(requestBody.messages[0].content).toContain('strategy_type_bias alignment: if input.strategy_type_bias is not any, make at least the first candidate follow that bias');
    expect(requestBody.messages[0].content).toContain('suggested_natural_language_spec quality: include market, timeframe, long/short assumption, entry trigger, exit trigger, stop loss rule, indicator periods, and backtest caution');
    expect(requestBody.messages[0].content).toContain('confidence calibration: before backtest, Web search, or latest market data, use confidence=high sparingly');
    expect(requestBody.messages[0].content).toContain('research_basis usage: explicit user_hint conditions are user_input; market, timeframe, and risk settings are internal; common strategy archetypes are provider_knowledge');
    expect(requestBody.format).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['schema_name', 'schema_version', 'input', 'candidates', 'disclaimer']),
      properties: {
        candidates: expect.objectContaining({
          maxItems: 10,
        }),
      },
    });
    expect(requestBody.format.properties.candidates.items.required).toEqual(expect.arrayContaining([
      'candidate_id',
      'title',
      'summary',
      'entry_logic',
      'exit_logic',
      'risk_management',
      'suggested_natural_language_spec',
    ]));
    expect(requestBody.options.num_predict).toBe(2000);
  });

  it('bounds local_llm guard env values before provider request options are built', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT = 'http://local-llm.example.test';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL = 'proposal-model-test';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS = '999999';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS = '999999';
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseContent({
      schema_name: 'strategy_proposal_candidates',
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
        market: 'JP_STOCK',
        timeframe: 'D',
        proposal_count: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    const [, init] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.options.num_predict).toBe(10000);
    expect(JSON.stringify(response.json())).not.toContain('999999');
    expect(JSON.stringify(response.json())).not.toContain('proposal-model-test');
    expect(JSON.stringify(response.json())).not.toContain('local-llm.example.test');
  });

  it('uses the tuned default local_llm timeout when env is unset', () => {
    expect(getStrategyProposalLocalLlmGuardConfig()).toMatchObject({
      timeoutProfile: 'default',
      timeoutMs: 150000,
      maxOutputChars: 20000,
    });
  });

  it('clamps high local_llm timeout env values to the default profile maximum', () => {
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS = '999999';

    expect(getStrategyProposalLocalLlmGuardConfig()).toMatchObject({
      timeoutProfile: 'default',
      timeoutMs: 240000,
      maxOutputChars: 20000,
    });
  });

  it('keeps the long_context local_llm timeout maximum and fallback', () => {
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS = '999999';
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_PROFILE = 'long_context';

    expect(getStrategyProposalLocalLlmGuardConfig()).toMatchObject({
      timeoutProfile: 'long_context',
      timeoutMs: 300000,
      maxOutputChars: 20000,
    });

    delete process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS;
    expect(getStrategyProposalLocalLlmGuardConfig()).toMatchObject({
      timeoutProfile: 'long_context',
      timeoutMs: 180000,
      maxOutputChars: 20000,
    });
  });

  it('uses the default local_llm timeout profile for invalid profile env values', () => {
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_PROFILE = 'unknown';

    expect(getStrategyProposalLocalLlmGuardConfig()).toMatchObject({
      timeoutProfile: 'default',
      timeoutMs: 150000,
      maxOutputChars: 20000,
    });
  });

  it('rate limits repeated strategy proposal provider calls without persisting blocked runs', async () => {
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_ENABLED = 'true';
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_MAX_REQUESTS = '1';
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_WINDOW_MS = '60000';
    const app = await createApp();

    const first = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      headers: { 'x-forwarded-for': 'forwarded-alpha, proxy-alpha' },
      payload: {
        proposal_count: 1,
      },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      headers: { 'x-forwarded-for': 'forwarded-beta, proxy-alpha' },
      payload: {
        proposal_count: 1,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    const body = second.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toContain('少し時間をおいて再試行してください');
    expect(body.error.details).toMatchObject({
      rate_limited: true,
      limit: 1,
      window_ms: 60000,
      provider_mode: 'stub',
      rate_limit_key_source: 'request_ip',
    });
    expect(typeof body.error.details.retry_after_ms).toBe('number');
    expect(runtime.proposalRuns.size).toBe(1);
    expect(JSON.stringify(body)).not.toContain('prompt');
    expect(JSON.stringify(body)).not.toContain('response');
    expect(JSON.stringify(body)).not.toContain('http://');
    expect(JSON.stringify(body)).not.toContain('C:\\');
    expect(JSON.stringify(body)).not.toContain('stack');

    const rateLimitedEvent = findProviderEvent('proposal_generate_rate_limited');
    expect(rateLimitedEvent).toMatchObject({
      proposalRunId: null,
      providerName: 'stub',
      providerMode: 'stub',
      selectedBy: 'default',
      status: 'rate_limited',
      invalidReason: 'none',
      rateLimited: true,
      rateLimitKeySource: 'request_ip',
      manualImport: false,
    });
    expect(rateLimitedEvent?.metadataJson).toMatchObject({
      candidate_count_requested: 1,
      rate_limit_limit: 1,
      rate_limit_window_ms: 60000,
      source: 'strategy_lab',
    });
    expect(JSON.stringify(rateLimitedEvent)).not.toContain('forwarded-alpha');
    expect(JSON.stringify(rateLimitedEvent)).not.toContain('forwarded-beta');
  });

  it('resolves strategy proposal rate limit keys without exposing identifier values', () => {
    const userKey = resolveStrategyProposalRateLimitKey({
      userId: 'user-alpha',
      requestIp: '198.51.100.10',
      forwardedFor: '203.0.113.10, 198.51.100.1',
      trustedForwardedIp: true,
    });
    const trustedForwardedIpv4Key = resolveStrategyProposalRateLimitKey({
      requestIp: '198.51.100.10',
      forwardedFor: '203.0.113.10, 198.51.100.1',
      trustedForwardedIp: true,
    });
    const trustedForwardedIpv6Key = resolveStrategyProposalRateLimitKey({
      requestIp: '198.51.100.10',
      forwardedFor: '[2001:db8::1], 198.51.100.1',
      trustedForwardedIp: true,
    });
    const untrustedForwardedKey = resolveStrategyProposalRateLimitKey({
      requestIp: '198.51.100.10',
      forwardedFor: '203.0.113.10, 198.51.100.1',
      trustedForwardedIp: false,
    });
    const malformedForwardedKey = resolveStrategyProposalRateLimitKey({
      requestIp: '198.51.100.10',
      forwardedFor: 'spoof-1, 203.0.113.10',
      trustedForwardedIp: true,
    });
    const unknownKey = resolveStrategyProposalRateLimitKey({});

    expect(userKey.source).toBe('user');
    expect(trustedForwardedIpv4Key.source).toBe('forwarded_ip');
    expect(trustedForwardedIpv6Key.source).toBe('forwarded_ip');
    expect(untrustedForwardedKey.source).toBe('request_ip');
    expect(malformedForwardedKey.source).toBe('request_ip');
    expect(unknownKey.source).toBe('unknown');
    expect(userKey.key).not.toContain('user-alpha');
    expect(trustedForwardedIpv4Key.key).not.toContain('203.0.113.10');
    expect(trustedForwardedIpv6Key.key).not.toContain('2001:db8::1');
    expect(untrustedForwardedKey.key).not.toContain('198.51.100.10');
    expect(malformedForwardedKey.key).toBe(untrustedForwardedKey.key);
    expect(userKey.key).not.toBe(trustedForwardedIpv4Key.key);
  });

  it('uses trusted forwarded client header for rate limit buckets only when opt-in is enabled', async () => {
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_ENABLED = 'true';
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_MAX_REQUESTS = '1';
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.STRATEGY_PROPOSAL_TRUST_FORWARDED_IP = 'true';
    const app = await createApp();

    const first = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      headers: { 'x-forwarded-for': '203.0.113.10, 198.51.100.1' },
      payload: { proposal_count: 1 },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      headers: { 'x-forwarded-for': '203.0.113.11, 198.51.100.1' },
      payload: { proposal_count: 1 },
    });
    const third = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      headers: { 'x-forwarded-for': '203.0.113.10, 198.51.100.1' },
      payload: { proposal_count: 1 },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    const body = third.json();
    expect(body.error.details).toMatchObject({
      rate_limited: true,
      rate_limit_key_source: 'forwarded_ip',
    });
    expect(JSON.stringify(body)).not.toContain('203.0.113.10');
    expect(JSON.stringify(body)).not.toContain('198.51.100.1');
    expect(JSON.stringify(body)).not.toContain('request_ip:');
    expect(JSON.stringify(body)).not.toContain('forwarded_ip:');
    expect(runtime.proposalRuns.size).toBe(2);
  });

  it('falls back to request IP when trusted forwarded first hop is malformed', async () => {
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_ENABLED = 'true';
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_MAX_REQUESTS = '1';
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.STRATEGY_PROPOSAL_TRUST_FORWARDED_IP = 'true';
    const app = await createApp();

    const first = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      headers: { 'x-forwarded-for': 'spoof-1, 203.0.113.10' },
      payload: { proposal_count: 1 },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      headers: { 'x-forwarded-for': 'spoof-2, 203.0.113.10' },
      payload: { proposal_count: 1 },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    const body = second.json();
    expect(body.error.details).toMatchObject({
      rate_limited: true,
      rate_limit_key_source: 'request_ip',
    });
    expect(JSON.stringify(body)).not.toContain('spoof-1');
    expect(JSON.stringify(body)).not.toContain('spoof-2');
    expect(JSON.stringify(body)).not.toContain('203.0.113.10');
    expect(JSON.stringify(body)).not.toContain('request_ip:');
    expect(runtime.proposalRuns.size).toBe(1);
  });

  it('can disable the strategy proposal in-memory rate guard for local checks', async () => {
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_ENABLED = 'false';
    process.env.STRATEGY_PROPOSAL_RATE_LIMIT_MAX_REQUESTS = '1';
    const app = await createApp();

    const first = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: { proposal_count: 1 },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: { proposal_count: 1 },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(runtime.proposalRuns.size).toBe(2);
  });

  it('extracts local_llm JSON from markdown fences and surrounding explanation', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const payload = {
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      candidates: [validLocalLlmCandidate()],
      disclaimer: '検証候補の提案です。投資助言ではありません。',
    };
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseText([
      '以下は検証候補です。',
      '```json',
      JSON.stringify(payload),
      '```',
      'backtestで確認してください。',
    ].join('\n')));
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
    const body = response.json();
    expect(body.data.provider.name).toBe('local_llm');
    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.provider_observation).toMatchObject({
      status: 'succeeded',
      invalid_reason: 'none',
      schema_valid: true,
    });
    expect(JSON.stringify(body)).not.toContain('以下は検証候補です。');
  });

  it('repairs safe local_llm shape issues without accepting missing candidate substance', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const candidate = validLocalLlmCandidate({
      entry_logic: '終値が25日移動平均を上回る',
      exit_logic: '終値が5日移動平均を下回る',
      risk_management: '1回の損失を限定する',
      invalidation_condition: '出来高が伴わない上抜け',
      expected_strengths: '条件が単純で検証しやすい',
      expected_weaknesses: '横ばい相場でダマシが増える',
      required_indicators: 'SMA',
      backtest_cautions: '複数期間でbacktestする',
      uncertainty: '市場環境や銘柄固有材料は未評価です。',
      suggested_pine_constraints: 'long_only',
      strategy_type: 'trend following',
      pine_feasibility: 'High',
      confidence: 'Moderate',
      research_basis: [],
    });
    delete (candidate as Record<string, unknown>).schema_name;
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseContent({
      candidates: [candidate],
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

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.candidates[0]).toMatchObject({
      strategy_type: 'trend_following',
      pine_feasibility: 'high',
      confidence: 'medium',
    });
    expect(body.data.candidates[0].entry_logic).toEqual(['終値が25日移動平均を上回る']);
    expect(body.data.candidates[0].invalidation_conditions).toEqual(['出来高が伴わない上抜け']);
    expect(body.data.candidates[0].research_basis).toEqual([
      {
        source_type: 'provider_knowledge',
        label: 'local llm generated candidate',
        url: null,
      },
    ]);
  });

  it('normalizes common local_llm field aliases and safe metadata fallbacks', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const candidate = validLocalLlmCandidate({
      entry: ['終値が高値を上抜ける'],
      exit: ['終値が短期平均を下回る'],
      riskManagement: ['1回の損失を限定する'],
      strengths: ['条件が単純で検証しやすい'],
      weaknesses: ['レンジでダマシが出る'],
      indicators: ['SMA'],
      natural_language_spec:
        'JP_STOCK / D を前提に、上抜け条件と手仕舞い条件を明確化して検証します。',
    }) as Record<string, unknown>;
    delete candidate.entry_logic;
    delete candidate.exit_logic;
    delete candidate.risk_management;
    delete candidate.expected_strengths;
    delete candidate.expected_weaknesses;
    delete candidate.required_indicators;
    delete candidate.backtest_cautions;
    delete candidate.uncertainty;
    delete candidate.suggested_pine_constraints;
    delete candidate.suggested_natural_language_spec;
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseContent({
      candidates: [candidate],
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

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.candidates[0].entry_logic).toEqual(['終値が高値を上抜ける']);
    expect(body.data.candidates[0].exit_logic).toEqual(['終値が短期平均を下回る']);
    expect(body.data.candidates[0].risk_management).toEqual(['1回の損失を限定する']);
    expect(body.data.candidates[0].expected_strengths).toEqual(['条件が単純で検証しやすい']);
    expect(body.data.candidates[0].expected_weaknesses).toEqual(['レンジでダマシが出る']);
    expect(body.data.candidates[0].required_indicators).toEqual(['SMA']);
    expect(body.data.candidates[0].backtest_cautions).toHaveLength(1);
    expect(body.data.candidates[0].uncertainty).toHaveLength(1);
    expect(body.data.candidates[0].suggested_pine_constraints).toHaveLength(1);
    expect(body.data.provider_observation).toMatchObject({
      status: 'succeeded',
      normalization_fallback_used: true,
      fallback_field_count: 3,
    });
    expect(JSON.stringify(body)).not.toContain('raw');
  });

  it('unwraps common local_llm candidate wrappers and scalar aliases without generating candidate substance', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const wrappedCandidate = {
      proposal: {
        id: 'wrapped-1',
        name: 'ラップされた候補',
        description: '候補本文がproposal wrapper内にある場合も検証候補として扱う。',
        market: 'JP_STOCK',
        timeframe: 'D',
        type: 'trend following',
        entry_conditions: ['終値が25日移動平均を上回る'],
        exit_conditions: ['終値が5日移動平均を下回る'],
        risk_controls: ['1回の損失を限定する'],
        invalidation_condition: ['出来高が伴わない上抜け'],
        pros: ['条件が単純で検証しやすい'],
        cons: ['レンジでダマシが出る'],
        indicators: ['SMA'],
        feasibility: 'moderate',
        backtest_caution: ['十分な期間で検証する'],
        confidence_level: 'normal',
        limitations: ['市場環境により有効性が変わる'],
        natural_language_spec:
          'JP_STOCK / D を前提に、25日移動平均の上抜けと5日移動平均の下抜けで検証します。',
        pine_constraints: ['Pine生成前に条件を確認する'],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseContent({
      candidates: [wrappedCandidate],
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

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.candidates[0]).toMatchObject({
      candidate_id: 'wrapped-1',
      title: 'ラップされた候補',
      strategy_type: 'trend_following',
      pine_feasibility: 'medium',
      confidence: 'medium',
      entry_logic: ['終値が25日移動平均を上回る'],
      exit_logic: ['終値が5日移動平均を下回る'],
      risk_management: ['1回の損失を限定する'],
      expected_strengths: ['条件が単純で検証しやすい'],
      expected_weaknesses: ['レンジでダマシが出る'],
      required_indicators: ['SMA'],
    });
    expect(JSON.stringify(body)).not.toContain('proposal wrapper raw value');
  });

  it('retries once when local_llm omits required candidate fields and succeeds with sanitized metadata', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const missingCandidate = validLocalLlmCandidate({
      title: 'first response should not leak',
    }) as Record<string, unknown>;
    delete missingCandidate.entry_logic;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(localLlmResponseContent({
        schema_name: 'strategy_proposal_candidates',
        schema_version: '1.0',
        candidates: [missingCandidate],
        disclaimer: '検証候補の提案です。投資助言ではありません。',
      }))
      .mockResolvedValueOnce(localLlmResponseContent({
        schema_name: 'strategy_proposal_candidates',
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

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.data.provider_observation).toMatchObject({
      status: 'succeeded',
      retry_used: true,
      retry_reason: 'required_field_missing',
      retry_succeeded: true,
    });
    const retryRequestBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(JSON.stringify(retryRequestBody)).toContain('entry_logic');
    expect(JSON.stringify(retryRequestBody)).not.toContain('first response should not leak');
    expect(JSON.stringify(body)).not.toContain('first response should not leak');
    const retryEvent = findProviderEvent('proposal_generate_retry');
    expect(retryEvent).toMatchObject({
      proposalRunId: body.data.proposal_run_id,
      providerName: 'local_llm',
      providerMode: 'local',
      selectedBy: 'env',
      status: 'succeeded',
      invalidReason: 'none',
      retryUsed: true,
      retryReason: 'required_field_missing',
      retrySucceeded: true,
    });
    expect(JSON.stringify(retryEvent)).not.toContain('first response should not leak');
  });

  it('treats non-string required scalar fields as missing diagnostics for retry', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const invalidCandidate = validLocalLlmCandidate({
      title: 123,
      summary: { text: 'summary raw value should not leak' },
      strategy_type: ['trend_following'],
      confidence: true,
      pine_feasibility: null,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(localLlmResponseContent({
        schema_name: 'strategy_proposal_candidates',
        schema_version: '1.0',
        candidates: [invalidCandidate],
        disclaimer: '検証候補の提案です。投資助言ではありません。',
      }))
      .mockResolvedValueOnce(localLlmResponseContent({
        schema_name: 'strategy_proposal_candidates',
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

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.data.provider_observation).toMatchObject({
      status: 'succeeded',
      retry_used: true,
      retry_reason: 'required_field_missing',
      retry_succeeded: true,
    });
    const retryRequestBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(retryRequestBody.messages[2].content).toContain('confidence');
    expect(retryRequestBody.messages[2].content).toContain('pine_feasibility');
    expect(retryRequestBody.messages[2].content).toContain('strategy_type');
    expect(retryRequestBody.messages[2].content).toContain('summary');
    expect(retryRequestBody.messages[2].content).toContain('title');
    expect(JSON.stringify(retryRequestBody)).not.toContain('summary raw value should not leak');
    expect(JSON.stringify(body)).not.toContain('summary raw value should not leak');
    const retryEvent = findProviderEvent('proposal_generate_retry');
    expect(retryEvent).toMatchObject({
      providerName: 'local_llm',
      status: 'succeeded',
      retryUsed: true,
      retryReason: 'required_field_missing',
      retrySucceeded: true,
    });
    expect(JSON.stringify(retryEvent)).not.toContain('summary raw value should not leak');
  });

  it('returns sanitized missing required field diagnostics when local_llm retry still fails', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const firstCandidate = validLocalLlmCandidate({
      title: 'first missing candidate should not leak',
    }) as Record<string, unknown>;
    const secondCandidate = validLocalLlmCandidate({
      title: 'second missing candidate should not leak',
    }) as Record<string, unknown>;
    delete firstCandidate.entry_logic;
    delete secondCandidate.expected_strengths;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(localLlmResponseContent({
        candidates: [firstCandidate],
      }))
      .mockResolvedValueOnce(localLlmResponseContent({
        candidates: [secondCandidate],
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.error.details.provider_observation).toMatchObject({
      provider_name: 'local_llm',
      status: 'invalid_response',
      invalid_reason: 'required_field_missing',
      retry_used: true,
      retry_reason: 'required_field_missing',
      retry_succeeded: false,
      schema_valid: false,
      missing_required_fields: ['expected_strengths'],
      missing_required_field_count: 1,
      affected_candidate_count: 1,
    });
    expect(JSON.stringify(body)).not.toContain('first missing candidate should not leak');
    expect(JSON.stringify(body)).not.toContain('second missing candidate should not leak');
    const failedEvent = findProviderEvent('proposal_generate_failed');
    expect(failedEvent).toMatchObject({
      providerName: 'local_llm',
      providerMode: 'local',
      selectedBy: 'env',
      status: 'invalid_response',
      invalidReason: 'required_field_missing',
      candidateCount: 0,
      retryUsed: true,
      retryReason: 'required_field_missing',
      retrySucceeded: false,
    });
    const retryEvent = findProviderEvent('proposal_generate_retry');
    expect(retryEvent).toMatchObject({
      providerName: 'local_llm',
      status: 'failed',
      invalidReason: 'required_field_missing',
      retryUsed: true,
      retryReason: 'required_field_missing',
      retrySucceeded: false,
    });
    expect(JSON.stringify(failedEvent)).not.toContain('first missing candidate should not leak');
    expect(JSON.stringify(failedEvent)).not.toContain('second missing candidate should not leak');
    expect(JSON.stringify(retryEvent)).not.toContain('first missing candidate should not leak');
    expect(JSON.stringify(retryEvent)).not.toContain('second missing candidate should not leak');
  });

  it('extracts bare local_llm candidate arrays with nested arrays, objects, and escaped delimiters', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const candidate = validLocalLlmCandidate({
      title: '記号 { } [ ] と "quote" を含む候補',
      entry_logic: ['終値が25日移動平均を上回る [確認]'],
      exit_logic: ['終値が5日移動平均を下回る {手仕舞い}'],
      risk_management: ['1回の損失を限定し "manual review" を前提にする'],
      research_basis: [
        {
          source_type: 'provider_knowledge',
          label: 'nested object basis with [brackets]',
          url: null,
        },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseText([
      'candidate array follows',
      JSON.stringify([candidate]),
      'review with backtest',
    ].join('\n')));
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
    const body = response.json();
    expect(body.data.schema_name).toBe('strategy_proposal_candidates');
    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.candidates[0].title).toBe('記号 { } [ ] と "quote" を含む候補');
    expect(body.data.candidates[0].entry_logic).toEqual(['終値が25日移動平均を上回る [確認]']);
    expect(body.data.candidates[0].exit_logic).toEqual(['終値が5日移動平均を下回る {手仕舞い}']);
    expect(body.data.provider_observation).toMatchObject({
      status: 'succeeded',
      invalid_reason: 'none',
      schema_valid: true,
    });
    expect(JSON.stringify(body.data.provider_observation)).not.toContain('candidate array follows');
  });

  it('returns malformed_json for mismatched local_llm JSON delimiters without leaking raw text', async () => {
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    const validCandidateWithTrailingText = JSON.stringify([validLocalLlmCandidate()]);
    const fetchMock = vi.fn().mockResolvedValue(localLlmResponseText(
      `${validCandidateWithTrailingText} extra }`,
    ));
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
    expect(response.json().data.candidates).toHaveLength(1);

    const truncatedFetch = vi.fn().mockResolvedValue(localLlmResponseText(
      '[{"candidate_id":"broken","entry_logic":["nested array"}]',
    ));
    vi.stubGlobal('fetch', truncatedFetch);
    const failedResponse = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        proposal_count: 1,
      },
    });

    expect(failedResponse.statusCode).toBe(502);
    const body = failedResponse.json();
    expect(body.error.details.provider_observation).toMatchObject({
      provider_name: 'local_llm',
      status: 'invalid_response',
      invalid_reason: 'malformed_json',
      schema_valid: false,
    });
    expect(JSON.stringify(body)).not.toContain('nested array');
    expect(JSON.stringify(body)).not.toContain('broken');
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

  it('canonicalizes 1D proposal requests and preserves timeframe-specific stub guidance', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-lab/proposals',
      payload: {
        market: 'JP_STOCK',
        timeframe: '1D',
        risk_preference: 'balanced',
        strategy_type_bias: 'trend_following',
        proposal_count: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.input.timeframe).toBe('D');
    expect(body.data.candidates[0].timeframe_assumption).toBe('D');
    expect(body.data.candidates[0].suggested_natural_language_spec).toContain('日足（D）');
    expect(body.data.candidates[0].backtest_cautions.join(' ')).toContain('ギャップ');

    const storedRun = runtime.proposalRuns.get(body.data.proposal_run_id);
    expect(storedRun?.inputJson).toMatchObject({ timeframe: 'D' });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/strategy-lab/proposals?timeframe=1D&limit=10',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.proposal_runs[0].input.timeframe).toBe('D');
    expect(listResponse.json().data.filters.timeframe).toBe('D');

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
