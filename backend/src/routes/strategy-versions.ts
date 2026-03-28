import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { generatePineFromNaturalLanguage } from '../strategy/pine';
import { Prisma } from '@prisma/client';

function toStrategyVersionResponse(version: {
  id: string;
  strategyRuleId: string;
  clonedFromVersionId: string | null;
  status: string;
  naturalLanguageRule: string;
  forwardValidationNote: string | null;
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
    cloned_from_version_id: version.clonedFromVersionId,
    status: version.status,
    natural_language_rule: version.naturalLanguageRule,
    forward_validation_note: version.forwardValidationNote,
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

function toStrategyVersionCompareBase(version: {
  id: string;
  status: string;
  naturalLanguageRule: string;
  generatedPine: string | null;
  updatedAt: Date;
}) {
  return {
    id: version.id,
    status: version.status,
    natural_language_rule: version.naturalLanguageRule,
    generated_pine: version.generatedPine,
    updated_at: version.updatedAt,
  };
}

export const strategyVersionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.patch<{
    Params: { versionId: string };
    Body: { natural_language_rule?: string; market?: string; timeframe?: string; forward_validation_note?: string };
  }>(
    '/:versionId',
    async (request, reply) => {
      const { versionId } = request.params;
      const version = await prisma.strategyRuleVersion.findUnique({
        where: { id: versionId },
      });

      if (!version) {
        throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
      }

      const hasNaturalLanguageRule = typeof request.body.natural_language_rule === 'string';
      const hasMarket = typeof request.body.market === 'string';
      const hasTimeframe = typeof request.body.timeframe === 'string';
      const hasForwardValidationNote = typeof request.body.forward_validation_note === 'string';
      if (!hasNaturalLanguageRule && !hasMarket && !hasTimeframe && !hasForwardValidationNote) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'at least one of natural_language_rule, market, timeframe, forward_validation_note is required.',
        );
      }

      const nextNaturalLanguageRule = hasNaturalLanguageRule ? request.body.natural_language_rule!.trim() : version.naturalLanguageRule;
      const nextMarket = hasMarket ? request.body.market!.trim() : version.market;
      const nextTimeframe = hasTimeframe ? request.body.timeframe!.trim() : version.timeframe;
      const nextForwardValidationNote = hasForwardValidationNote
        ? request.body.forward_validation_note!.trim() || null
        : version.forwardValidationNote;

      if (!nextNaturalLanguageRule) {
        throw new AppError(400, 'VALIDATION_ERROR', 'natural_language_rule must not be empty.');
      }
      if (!nextMarket) {
        throw new AppError(400, 'VALIDATION_ERROR', 'market must not be empty.');
      }
      if (!nextTimeframe) {
        throw new AppError(400, 'VALIDATION_ERROR', 'timeframe must not be empty.');
      }

      const updatingRuleFields = hasNaturalLanguageRule || hasMarket || hasTimeframe;
      const updated = await prisma.strategyRuleVersion.update({
        where: { id: version.id },
        data: {
          naturalLanguageRule: nextNaturalLanguageRule,
          market: nextMarket,
          timeframe: nextTimeframe,
          forwardValidationNote: nextForwardValidationNote,
          ...(updatingRuleFields
            ? {
                // Rule edits invalidate previous generation artifacts.
                normalizedRuleJson: Prisma.JsonNull,
                generatedPine: null,
                warningsJson: Prisma.JsonNull,
                assumptionsJson: Prisma.JsonNull,
                status: 'draft',
              }
            : {}),
        },
      });

      return reply.status(200).send(formatSuccess(request, {
        strategy_version: toStrategyVersionResponse(updated),
      }));
    }
  );

  fastify.get<{ Params: { versionId: string } }>('/:versionId', async (request, reply) => {
    const { versionId } = request.params;
    const version = await prisma.strategyRuleVersion.findUnique({
      where: { id: versionId },
      include: {
        clonedFromVersion: true,
      },
    });

    if (!version) {
      throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
    }

    return reply.status(200).send(formatSuccess(request, {
      strategy_version: toStrategyVersionResponse(version),
      compare_base: version.clonedFromVersion
        ? toStrategyVersionCompareBase(version.clonedFromVersion)
        : null,
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

  fastify.post<{ Params: { versionId: string } }>('/:versionId/clone', async (request, reply) => {
    const { versionId } = request.params;
    const sourceVersion = await prisma.strategyRuleVersion.findUnique({
      where: { id: versionId },
    });

    if (!sourceVersion) {
      throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
    }

    const cloned = await prisma.strategyRuleVersion.create({
      data: {
        strategyRuleId: sourceVersion.strategyRuleId,
        clonedFromVersionId: sourceVersion.id,
        naturalLanguageRule: sourceVersion.naturalLanguageRule,
        normalizedRuleJson: (sourceVersion.normalizedRuleJson ?? undefined) as Prisma.InputJsonValue | undefined,
        generatedPine: sourceVersion.generatedPine,
        warningsJson: (sourceVersion.warningsJson ?? undefined) as Prisma.InputJsonValue | undefined,
        assumptionsJson: (sourceVersion.assumptionsJson ?? undefined) as Prisma.InputJsonValue | undefined,
        market: sourceVersion.market,
        timeframe: sourceVersion.timeframe,
        status: sourceVersion.status,
      },
    });

    return reply.status(201).send(formatSuccess(request, {
      strategy_version: toStrategyVersionResponse(cloned),
      cloned_from_version_id: sourceVersion.id,
    }));
  });
};
