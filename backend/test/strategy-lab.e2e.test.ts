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
  clonedFromVersionId: string | null;
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
});
