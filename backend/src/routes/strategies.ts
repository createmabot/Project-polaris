import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';

type CreateStrategyBody = {
  title?: string;
  name?: string;
};

type CreateStrategyVersionBody = {
  natural_language_rule?: string;
  market?: string;
  timeframe?: string;
};

function normalizeTitle(body: CreateStrategyBody): string {
  const raw = typeof body.title === 'string' ? body.title : body.name;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    throw new AppError(400, 'VALIDATION_ERROR', 'title is required.');
  }
  return trimmed;
}

export const strategyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { strategyId: string }; Querystring: { q?: string; page?: string; limit?: string } }>('/:strategyId/versions', async (request, reply) => {
    const { strategyId } = request.params;
    const strategy = await prisma.strategyRule.findUnique({ where: { id: strategyId } });
    if (!strategy) {
      throw new AppError(404, 'NOT_FOUND', 'strategy was not found.');
    }

    const q = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const parsedPage = Number(request.query.page ?? 1);
    const parsedLimit = Number(request.query.limit ?? 20);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : NaN;
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50 ? parsedLimit : NaN;
    if (!Number.isFinite(page) || !Number.isFinite(limit)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'page and limit must be positive integers. limit must be <= 50.');
    }

    const where = q
      ? {
          strategyRuleId: strategy.id,
          naturalLanguageRule: {
            contains: q,
            mode: 'insensitive' as const,
          },
        }
      : {
          strategyRuleId: strategy.id,
        };

    const skip = (page - 1) * limit;
    const total = await prisma.strategyRuleVersion.count({ where });
    const versions = await prisma.strategyRuleVersion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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
        id: strategy.id,
        title: strategy.title,
        status: strategy.status,
        created_at: strategy.createdAt,
        updated_at: strategy.updatedAt,
      },
      query: {
        q,
      },
      pagination: {
        page,
        limit,
        q,
        total,
        has_next: skip + versions.length < total,
        has_prev: page > 1,
      },
      strategy_versions: versions.map((version) => ({
        id: version.id,
        strategy_id: version.strategyRuleId,
        cloned_from_version_id: version.clonedFromVersionId,
        is_derived: Boolean(version.clonedFromVersionId),
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
      strategy: {
        id: strategy.id,
        title: strategy.title,
        status: strategy.status,
        created_at: strategy.createdAt,
        updated_at: strategy.updatedAt,
      },
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
    }));
  });
};
