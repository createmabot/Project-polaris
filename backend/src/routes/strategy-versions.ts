import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { generatePineFromNaturalLanguage } from '../strategy/pine';
import { Prisma } from '@prisma/client';

function toStrategyVersionResponse(version: {
  id: string;
  strategyRuleId: string;
  status: string;
  naturalLanguageRule: string;
  normalizedRuleJson: unknown;
  generatedPine: string | null;
  warningsJson: unknown;
  assumptionsJson: unknown;
  market: string;
  timeframe: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: version.id,
    strategy_id: version.strategyRuleId,
    status: version.status,
    natural_language_rule: version.naturalLanguageRule,
    normalized_rule_json: version.normalizedRuleJson,
    generated_pine: version.generatedPine,
    warnings: Array.isArray(version.warningsJson) ? version.warningsJson : [],
    assumptions: Array.isArray(version.assumptionsJson) ? version.assumptionsJson : [],
    market: version.market,
    timeframe: version.timeframe,
    created_at: version.createdAt,
    updated_at: version.updatedAt,
  };
}

export const strategyVersionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { versionId: string } }>('/:versionId', async (request, reply) => {
    const { versionId } = request.params;
    const version = await prisma.strategyRuleVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
    }

    return reply.status(200).send(formatSuccess(request, {
      strategy_version: toStrategyVersionResponse(version),
    }));
  });

  fastify.post<{ Params: { versionId: string } }>('/:versionId/pine/generate', async (request, reply) => {
    const { versionId } = request.params;
    const version = await prisma.strategyRuleVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
    }

    const generation = generatePineFromNaturalLanguage({
      naturalLanguageRule: version.naturalLanguageRule,
      market: version.market,
      timeframe: version.timeframe,
    });

    const updated = await prisma.strategyRuleVersion.update({
      where: { id: version.id },
      data: {
        normalizedRuleJson: generation.normalizedRuleJson as Prisma.InputJsonValue,
        generatedPine: generation.generatedPine,
        warningsJson: generation.warnings as Prisma.InputJsonValue,
        assumptionsJson: generation.assumptions as Prisma.InputJsonValue,
        status: generation.status,
      },
    });

    return reply.status(200).send(formatSuccess(request, {
      strategy_version: toStrategyVersionResponse(updated),
    }));
  });
};
