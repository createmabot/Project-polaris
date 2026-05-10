import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { detectMojibake } from '../utils/encoding';

type CreateStrategyBody = {
  title?: string;
  name?: string;
};

type CreateStrategyVersionBody = {
  natural_language_rule?: string;
  market?: string;
  timeframe?: string;
};

type StrategyStatus = 'active' | 'archived';
type StrategyApplicationStatus = StrategyStatus | 'all';

function normalizeTitle(body: CreateStrategyBody): string {
  const raw = typeof body.title === 'string' ? body.title : body.name;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    throw new AppError(400, 'VALIDATION_ERROR', 'title is required.');
  }
  return trimmed;
}

function validateStrategyStatus(status: string): asserts status is '' | StrategyStatus {
  if (status && status !== 'active' && status !== 'archived') {
    throw new AppError(400, 'VALIDATION_ERROR', 'status must be one of: active, archived.');
  }
}

function validateStrategyApplicationStatus(status: string): asserts status is StrategyApplicationStatus {
  if (status !== 'active' && status !== 'archived' && status !== 'all') {
    throw new AppError(400, 'VALIDATION_ERROR', 'status must be one of: active, archived, all.');
  }
}

function toStrategyResponse(strategy: {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: strategy.id,
    title: strategy.title,
    status: strategy.status,
    created_at: strategy.createdAt,
    updated_at: strategy.updatedAt,
  };
}

function toStrategySymbolApplicationResponse(application: any) {
  const latestRun = application.runs?.[0] ?? null;
  const latestBacktestRun = application.runs?.find((run: any) => run.backtest) ?? null;
  const latestBacktest = latestBacktestRun?.backtest ?? null;
  return {
    id: application.id,
    status: application.status,
    source: application.source,
    memo: application.memo,
    created_at: application.createdAt,
    updated_at: application.updatedAt,
    symbol: {
      id: application.symbol.id,
      symbol: application.symbol.symbol,
      symbol_code: application.symbol.symbolCode,
      display_name: application.symbol.displayName,
      market_code: application.symbol.marketCode,
      tradingview_symbol: application.symbol.tradingviewSymbol,
    },
    strategy_version: {
      id: application.strategyRuleVersion.id,
      market: application.strategyRuleVersion.market,
      timeframe: application.strategyRuleVersion.timeframe,
      status: application.strategyRuleVersion.status,
      created_at: application.strategyRuleVersion.createdAt,
      updated_at: application.strategyRuleVersion.updatedAt,
    },
    latest_run: latestRun
      ? {
          id: latestRun.id,
          run_type: latestRun.runType,
          status: latestRun.status,
          backtest_id: latestRun.backtestId,
          backtest_import_id: latestRun.backtestImportId,
          internal_backtest_execution_id: latestRun.internalBacktestExecutionId,
          created_at: latestRun.createdAt,
          updated_at: latestRun.updatedAt,
        }
      : null,
    latest_backtest_report: latestBacktest
      ? {
          id: latestBacktest.id,
          title: latestBacktest.title,
          status: latestBacktest.status,
          execution_source: latestBacktest.executionSource,
          market: latestBacktest.market,
          timeframe: latestBacktest.timeframe,
          created_at: latestBacktest.createdAt,
          updated_at: latestBacktest.updatedAt,
        }
      : null,
    run_count: application._count?.runs ?? 0,
  };
}

export const strategyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { q?: string; page?: string; limit?: string; status?: string; sort?: string; order?: string };
  }>('/', async (request, reply) => {
    const q = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const status = typeof request.query.status === 'string' ? request.query.status.trim() : '';
    const sort = typeof request.query.sort === 'string' ? request.query.sort.trim() : 'updated_at';
    const order = typeof request.query.order === 'string' ? request.query.order.trim().toLowerCase() : 'desc';
    const parsedPage = Number(request.query.page ?? 1);
    const parsedLimit = Number(request.query.limit ?? 20);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : NaN;
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50 ? parsedLimit : NaN;
    if (!Number.isFinite(page) || !Number.isFinite(limit)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'page and limit must be positive integers. limit must be <= 50.');
    }
    if (sort !== 'created_at' && sort !== 'updated_at' && sort !== 'title') {
      throw new AppError(400, 'VALIDATION_ERROR', 'sort must be one of: created_at, updated_at, title.');
    }
    if (order !== 'asc' && order !== 'desc') {
      throw new AppError(400, 'VALIDATION_ERROR', 'order must be one of: asc, desc.');
    }
    validateStrategyStatus(status);

    const where = {
      ...(q
        ? {
            title: {
              contains: q,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(status ? { status } : {}),
    };

    const orderBy =
      sort === 'created_at'
        ? { createdAt: order as 'asc' | 'desc' }
        : sort === 'title'
          ? { title: order as 'asc' | 'desc' }
          : { updatedAt: order as 'asc' | 'desc' };

    const skip = (page - 1) * limit;
    const total = await prisma.strategyRule.count({ where });
    const strategies = await prisma.strategyRule.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            versions: true,
          },
        },
        versions: {
          orderBy: {
            updatedAt: 'desc',
          },
          take: 1,
          select: {
            id: true,
            market: true,
            timeframe: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return reply.status(200).send(formatSuccess(request, {
      query: {
        q,
        status,
        sort,
        order,
      },
      pagination: {
        page,
        limit,
        q,
        status,
        sort,
        order,
        total,
        has_next: skip + strategies.length < total,
        has_prev: page > 1,
      },
      strategies: strategies.map((strategy) => {
        const latestVersion = strategy.versions[0] ?? null;
        return {
          ...toStrategyResponse(strategy),
          version_count: strategy._count.versions,
          latest_version: latestVersion
            ? {
                id: latestVersion.id,
                market: latestVersion.market,
                timeframe: latestVersion.timeframe,
                status: latestVersion.status,
                created_at: latestVersion.createdAt,
                updated_at: latestVersion.updatedAt,
              }
            : null,
        };
      }),
    }));
  });

  fastify.patch<{ Params: { strategyId: string } }>('/:strategyId/archive', async (request, reply) => {
    const { strategyId } = request.params;
    const existing = await prisma.strategyRule.findUnique({ where: { id: strategyId } });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'strategy was not found.');
    }

    const strategy = await prisma.strategyRule.update({
      where: { id: strategyId },
      data: { status: 'archived' },
    });

    return reply.status(200).send(formatSuccess(request, {
      strategy: toStrategyResponse(strategy),
    }));
  });

  fastify.patch<{ Params: { strategyId: string } }>('/:strategyId/restore', async (request, reply) => {
    const { strategyId } = request.params;
    const existing = await prisma.strategyRule.findUnique({ where: { id: strategyId } });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'strategy was not found.');
    }

    const strategy = await prisma.strategyRule.update({
      where: { id: strategyId },
      data: { status: 'active' },
    });

    return reply.status(200).send(formatSuccess(request, {
      strategy: toStrategyResponse(strategy),
    }));
  });

  fastify.get<{
    Params: { strategyId: string };
    Querystring: { page?: string; limit?: string; status?: string; sort?: string; order?: string };
  }>('/:strategyId/symbol-applications', async (request, reply) => {
    const { strategyId } = request.params;
    const strategy = await prisma.strategyRule.findUnique({ where: { id: strategyId } });
    if (!strategy) {
      throw new AppError(404, 'NOT_FOUND', 'strategy was not found.');
    }

    const status = typeof request.query.status === 'string' && request.query.status.trim()
      ? request.query.status.trim()
      : 'active';
    const sort = typeof request.query.sort === 'string' ? request.query.sort.trim() : 'updated_at';
    const order = typeof request.query.order === 'string' ? request.query.order.trim().toLowerCase() : 'desc';
    const parsedPage = Number(request.query.page ?? 1);
    const parsedLimit = Number(request.query.limit ?? 20);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : NaN;
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50 ? parsedLimit : NaN;
    if (!Number.isFinite(page) || !Number.isFinite(limit)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'page and limit must be positive integers. limit must be <= 50.');
    }
    validateStrategyApplicationStatus(status);
    if (sort !== 'created_at' && sort !== 'updated_at') {
      throw new AppError(400, 'VALIDATION_ERROR', 'sort must be one of: created_at, updated_at.');
    }
    if (order !== 'asc' && order !== 'desc') {
      throw new AppError(400, 'VALIDATION_ERROR', 'order must be one of: asc, desc.');
    }

    const where = {
      strategyRuleId: strategy.id,
      ...(status === 'all' ? {} : { status }),
    };
    const orderBy =
      sort === 'created_at'
        ? { createdAt: order as 'asc' | 'desc' }
        : { updatedAt: order as 'asc' | 'desc' };
    const skip = (page - 1) * limit;
    const total = await prisma.symbolStrategyApplication.count({ where });
    const applications = await prisma.symbolStrategyApplication.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        symbol: {
          select: {
            id: true,
            symbol: true,
            symbolCode: true,
            displayName: true,
            marketCode: true,
            tradingviewSymbol: true,
          },
        },
        strategyRuleVersion: {
          select: {
            id: true,
            market: true,
            timeframe: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        _count: {
          select: {
            runs: true,
          },
        },
        runs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
          include: {
            backtest: true,
          },
        },
      },
    });

    return reply.status(200).send(formatSuccess(request, {
      strategy: {
        id: strategy.id,
        title: strategy.title,
        status: strategy.status,
      },
      query: {
        status,
        sort,
        order,
      },
      pagination: {
        page,
        limit,
        total,
        has_next: skip + applications.length < total,
        has_prev: page > 1,
      },
      applications: applications.map(toStrategySymbolApplicationResponse),
    }));
  });

  fastify.get<{
    Params: { strategyId: string };
    Querystring: { q?: string; page?: string; limit?: string; status?: string; sort?: string; order?: string };
  }>('/:strategyId/versions', async (request, reply) => {
    const { strategyId } = request.params;
    const strategy = await prisma.strategyRule.findUnique({ where: { id: strategyId } });
    if (!strategy) {
      throw new AppError(404, 'NOT_FOUND', 'strategy was not found.');
    }

    const q = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const status = typeof request.query.status === 'string' ? request.query.status.trim() : '';
    const sort = typeof request.query.sort === 'string' ? request.query.sort.trim() : 'created_at';
    const order = typeof request.query.order === 'string' ? request.query.order.trim().toLowerCase() : 'desc';
    const parsedPage = Number(request.query.page ?? 1);
    const parsedLimit = Number(request.query.limit ?? 20);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : NaN;
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50 ? parsedLimit : NaN;
    if (!Number.isFinite(page) || !Number.isFinite(limit)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'page and limit must be positive integers. limit must be <= 50.');
    }
    if (sort && sort !== 'created_at' && sort !== 'updated_at') {
      throw new AppError(400, 'VALIDATION_ERROR', 'sort must be one of: created_at, updated_at.');
    }
    if (order !== 'asc' && order !== 'desc') {
      throw new AppError(400, 'VALIDATION_ERROR', 'order must be one of: asc, desc.');
    }

    const where = {
      strategyRuleId: strategy.id,
      ...(q
        ? {
            naturalLanguageRule: {
              contains: q,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(status ? { status } : {}),
    };

    const orderBy =
      sort === 'updated_at'
        ? { updatedAt: order as 'asc' | 'desc' }
        : { createdAt: order as 'asc' | 'desc' };

    const skip = (page - 1) * limit;
    const total = await prisma.strategyRuleVersion.count({ where });
    const versions = await prisma.strategyRuleVersion.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        clonedFromVersion: {
          select: {
            id: true,
            naturalLanguageRule: true,
            generatedPine: true,
          },
        },
      },
    });

    return reply.status(200).send(formatSuccess(request, {
      strategy: {
        ...toStrategyResponse(strategy),
      },
      query: {
        q,
        status,
        sort,
        order,
      },
      pagination: {
        page,
        limit,
        q,
        status,
        sort,
        order,
        total,
        has_next: skip + versions.length < total,
        has_prev: page > 1,
      },
      strategy_versions: versions.map((version) => ({
        id: version.id,
        strategy_id: version.strategyRuleId,
        cloned_from_version_id: version.clonedFromVersionId,
        is_derived: Boolean(version.clonedFromVersionId),
        has_forward_validation_note:
          typeof version.forwardValidationNote === 'string' &&
          version.forwardValidationNote.trim().length > 0,
        forward_validation_note_updated_at: version.forwardValidationNoteUpdatedAt,
        has_diff_from_clone: version.clonedFromVersion
          ? version.naturalLanguageRule !== version.clonedFromVersion.naturalLanguageRule ||
            (version.generatedPine ?? '') !== (version.clonedFromVersion.generatedPine ?? '')
          : null,
        market: version.market,
        timeframe: version.timeframe,
        status: version.status,
        has_warnings: Array.isArray(version.warningsJson) && version.warningsJson.length > 0,
        created_at: version.createdAt,
        updated_at: version.updatedAt,
      })),
    }));
  });

  fastify.post<{ Body: CreateStrategyBody }>('/', async (request, reply) => {
    const title = normalizeTitle(request.body);

    const strategy = await prisma.strategyRule.create({
      data: {
        title,
        status: 'active',
      },
    });

    return reply.status(201).send(formatSuccess(request, {
      strategy: toStrategyResponse(strategy),
    }));
  });

  fastify.post<{ Params: { strategyId: string }; Body: CreateStrategyVersionBody }>('/:strategyId/versions', async (request, reply) => {
    const { strategyId } = request.params;
    const naturalLanguageRule = typeof request.body.natural_language_rule === 'string'
      ? request.body.natural_language_rule.trim()
      : '';
    const market = typeof request.body.market === 'string' ? request.body.market.trim() : '';
    const timeframe = typeof request.body.timeframe === 'string' ? request.body.timeframe.trim() : '';

    if (!naturalLanguageRule) {
      throw new AppError(400, 'VALIDATION_ERROR', 'natural_language_rule is required.');
    }
    if (!market) {
      throw new AppError(400, 'VALIDATION_ERROR', 'market is required.');
    }
    if (!timeframe) {
      throw new AppError(400, 'VALIDATION_ERROR', 'timeframe is required.');
    }

    // mojibake 検知: 文字化けが疑われる場合はエラーにせず warning として返す
    // 小分類文字など false positive が少ないパターンのみ対象
    const mojibakeCheck = detectMojibake(naturalLanguageRule);
    const creationWarnings: string[] = [];
    if (mojibakeCheck.isSuspect) {
      creationWarnings.push(`natural_language_rule に文字化けの疑いがあります。UTF-8 で送信しているか確認してください。(hint: ${mojibakeCheck.hint})`);
    }

    const strategy = await prisma.strategyRule.findUnique({ where: { id: strategyId } });
    if (!strategy) {
      throw new AppError(404, 'NOT_FOUND', 'strategy was not found.');
    }

    const version = await prisma.strategyRuleVersion.create({
      data: {
        strategyRuleId: strategy.id,
        naturalLanguageRule,
        market,
        timeframe,
        status: 'draft',
      },
    });

    return reply.status(201).send(formatSuccess(request, {
      strategy_version: {
        id: version.id,
        strategy_id: version.strategyRuleId,
        cloned_from_version_id: version.clonedFromVersionId,
        natural_language_rule: version.naturalLanguageRule,
        market: version.market,
        timeframe: version.timeframe,
        status: version.status,
        normalized_rule_json: version.normalizedRuleJson,
        generated_pine: version.generatedPine,
        warnings: Array.isArray(version.warningsJson) ? version.warningsJson : [],
        assumptions: Array.isArray(version.assumptionsJson) ? version.assumptionsJson : [],
        created_at: version.createdAt,
        updated_at: version.updatedAt,
      },
      // mojibake 検知があった場合のサーバーサイド warning。
      // 値はそのまま保存される（自動修復はしない）。
      creation_warnings: creationWarnings,
    }));
  });
};
