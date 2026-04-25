import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strategyVersionRoutes } from '../src/routes/strategy-versions';
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
  versions: Map<string, StrategyRuleVersionRow>;
  pineScripts: Map<string, PineScriptRow>;
};

let runtime: Runtime;

const generatePineScriptMock = vi.fn();

function createRuntime(): Runtime {
  const now = new Date('2026-04-25T10:00:00.000Z');
  return {
    pineSeq: 1,
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
    pineScripts: new Map(),
  };
}

vi.mock('../src/ai/home-ai-service', () => {
  class HomeAiService {
    async generatePineScript(context: unknown) {
      return generatePineScriptMock(context);
    }
  }
  return { HomeAiService };
});

vi.mock('../src/db', () => {
  const prisma = {
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
      create: async () => {
        throw new Error('not used');
      },
    },
    pineScript: {
      create: async ({ data }: any) => {
        const id = `pine-${runtime.pineSeq++}`;
        const now = new Date();
        const row: PineScriptRow = {
          id,
          strategyRuleVersionId: data.strategyRuleVersionId,
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
        const rows = Array.from(runtime.pineScripts.values()).filter(
          (row) => row.strategyRuleVersionId === where.strategyRuleVersionId,
        );
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      },
    },
  };

  return { prisma };
});

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(strategyVersionRoutes, { prefix: '/api/strategy-versions' });
  await app.ready();
  return app;
}

describe('strategy version pine endpoints', () => {
  beforeEach(() => {
    runtime = createRuntime();
    generatePineScriptMock.mockReset();
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

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.status).toBe('available');
    expect(typeof fetched.json().data.generated_script).toBe('string');

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

  it('returns failed status when provider call throws', async () => {
    generatePineScriptMock.mockRejectedValue(new Error('provider timeout'));
    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().data.strategy_version.status).toBe('failed');
    expect(generated.json().data.pine.warnings.join(' ')).toContain('provider_error');

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
});
