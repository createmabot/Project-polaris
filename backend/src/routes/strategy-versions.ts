import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { generatePineFromNaturalLanguage } from '../strategy/pine';
import { Prisma } from '@prisma/client';

export const strategyVersionRoutes: FastifyPluginAsync = async (fastify) => {
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
      strategy_version: {
        id: updated.id,
        strategy_id: updated.strategyRuleId,
        status: updated.status,
        natural_language_rule: updated.naturalLanguageRule,
        normalized_rule_json: updated.normalizedRuleJson,
        generated_pine: updated.generatedPine,
        warnings: Array.isArray(updated.warningsJson) ? updated.warningsJson : [],
        assumptions: Array.isArray(updated.assumptionsJson) ? updated.assumptionsJson : [],
        market: updated.market,
        timeframe: updated.timeframe,
        created_at: updated.createdAt,
        updated_at: updated.updatedAt,
      },
    }));
  });
};
