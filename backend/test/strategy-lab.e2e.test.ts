import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';
import { strategyRoutes } from '../src/routes/strategies';
import { strategyVersionRoutes } from '../src/routes/strategy-versions';

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
  naturalLanguageRule: string;
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
  strategySeq: number;
  versionSeq: number;
  strategies: Map<string, StrategyRuleRow>;
  versions: Map<string, StrategyRuleVersionRow>;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    strategySeq: 1,
    versionSeq: 1,
    strategies: new Map(),
    versions: new Map(),
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    strategyRule: {
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
    },
    strategyRuleVersion: {
      create: async ({ data }: any) => {
        const id = `ver-${runtime.versionSeq++}`;
        const now = new Date();
        const row: StrategyRuleVersionRow = {
          id,
          strategyRuleId: data.strategyRuleId,
          naturalLanguageRule: data.naturalLanguageRule,
          normalizedRuleJson: null,
          generatedPine: null,
          warningsJson: null,
          assumptionsJson: null,
          market: data.market,
          timeframe: data.timeframe,
          status: data.status ?? 'draft',
          createdAt: now,
          updatedAt: now,
        };
        runtime.versions.set(id, row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        return runtime.versions.get(where.id) ?? null;
      },
      findMany: async ({ where, orderBy }: any) => {
        let rows = Array.from(runtime.versions.values());
        if (where?.strategyRuleId) {
          rows = rows.filter((row) => row.strategyRuleId === where.strategyRuleId);
        }
        if (orderBy?.createdAt === 'desc') {
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (orderBy?.createdAt === 'asc') {
          rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
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
  };

  return { prisma };
});

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(strategyRoutes, { prefix: '/api/strategies' });
  app.register(strategyVersionRoutes, { prefix: '/api/strategy-versions' });
  await app.ready();
  return app;
}

describe('strategy lab vertical slice', () => {
  beforeEach(() => {
    runtime = createRuntime();
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
      url: `/api/strategies/${strategyId}/versions`,
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(Array.isArray(listBody.data.strategy_versions)).toBe(true);
    expect(listBody.data.strategy_versions.length).toBe(2);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/strategy-versions/${version2Id}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    const detailBody = detailResponse.json();
    expect(detailBody.data.strategy_version.id).toBe(version2Id);
    expect(detailBody.data.strategy_version.natural_language_rule).toContain('RSI');
    expect(Array.isArray(detailBody.data.strategy_version.warnings)).toBe(true);
    expect(Array.isArray(detailBody.data.strategy_version.assumptions)).toBe(true);

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

    await app.close();
  });
});
