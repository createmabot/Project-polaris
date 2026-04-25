import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { HomeAiService } from '../ai/home-ai-service';
import { assessGeneratedPineScript } from '../strategy/pine';
import { AppError, formatSuccess } from '../utils/response';

function toStrategyVersionResponse(version: {
  id: string;
  strategyRuleId: string;
  clonedFromVersionId: string | null;
  status: string;
  naturalLanguageRule: string;
  forwardValidationNote: string | null;
  forwardValidationNoteUpdatedAt: Date | null;
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
    forward_validation_note_updated_at: version.forwardValidationNoteUpdatedAt,
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

function normalizeVersionNumber(script: string): string {
  const match = script.match(/@version=(\d+)/i);
  return match?.[1] ?? '6';
}

function normalizeRuleJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toPineResponse(record: {
  id: string;
  scriptName: string;
  pineVersion: string;
  scriptBody: string;
  generationNoteJson: unknown;
  status: string;
  createdAt: Date;
}) {
  const generationNote =
    typeof record.generationNoteJson === 'object' && record.generationNoteJson !== null
      ? (record.generationNoteJson as Record<string, unknown>)
      : null;
  const payload =
    generationNote && typeof generationNote.payload === 'object' && generationNote.payload !== null
      ? (generationNote.payload as Record<string, unknown>)
      : null;

  const warningsRaw = payload?.warnings;
  const warnings = Array.isArray(warningsRaw)
    ? warningsRaw.filter((item) => typeof item === 'string')
    : [];

  return {
    pine_script_id: record.id,
    script_name: record.scriptName,
    pine_version: record.pineVersion,
    generated_script: record.scriptBody,
    script_body: record.scriptBody,
    warnings,
    generation_note: generationNote,
    script_status: record.status,
    generated_at: record.createdAt.toISOString(),
  };
}

async function resolveLatestPineScript(versionId: string) {
  return prisma.pineScript.findFirst({
    where: { strategyRuleVersionId: versionId },
    orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
  });
}

export const strategyVersionRoutes: FastifyPluginAsync = async (fastify) => {
  const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  const parseDateOnly = (value: string, fieldName: string): Date => {
    if (!DATE_ONLY_PATTERN.test(value)) {
      throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be YYYY-MM-DD.`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid date.`);
    }
    return parsed;
  };

  const rethrowKnownSchemaMismatch = (error: unknown): never => {
    const code = (error as { code?: unknown })?.code;
    if (code === 'P2021' || code === 'P2022') {
      throw new AppError(
        500,
        'DATABASE_SCHEMA_MISMATCH',
        'Database schema is outdated. Run `npx prisma migrate deploy` in backend and restart the API.',
      );
    }
    throw error;
  };

  fastify.patch<{
    Params: { versionId: string };
    Body: { natural_language_rule?: string; market?: string; timeframe?: string; forward_validation_note?: string };
  }>('/:versionId', async (request, reply) => {
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

    const nextNaturalLanguageRule = hasNaturalLanguageRule
      ? request.body.natural_language_rule!.trim()
      : version.naturalLanguageRule;
    const nextMarket = hasMarket ? request.body.market!.trim() : version.market;
    const nextTimeframe = hasTimeframe ? request.body.timeframe!.trim() : version.timeframe;
    const nextForwardValidationNote = hasForwardValidationNote
      ? request.body.forward_validation_note!.trim() || null
      : version.forwardValidationNote;
    const shouldUpdateForwardValidationNoteTimestamp =
      hasForwardValidationNote && nextForwardValidationNote !== version.forwardValidationNote;

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
        ...(shouldUpdateForwardValidationNoteTimestamp
          ? {
              forwardValidationNoteUpdatedAt: nextForwardValidationNote ? new Date() : null,
            }
          : {}),
        ...(updatingRuleFields
          ? {
              normalizedRuleJson: Prisma.JsonNull,
              generatedPine: null,
              warningsJson: Prisma.JsonNull,
              assumptionsJson: Prisma.JsonNull,
              status: 'draft',
            }
          : {}),
      },
    });

    return reply.status(200).send(
      formatSuccess(request, {
        strategy_version: toStrategyVersionResponse(updated),
      }),
    );
  });

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

    return reply.status(200).send(
      formatSuccess(request, {
        strategy_version: toStrategyVersionResponse(version),
        compare_base: version.clonedFromVersion ? toStrategyVersionCompareBase(version.clonedFromVersion) : null,
      }),
    );
  });

  fastify.get<{ Params: { versionId: string } }>('/:versionId/pine', async (request, reply) => {
    const { versionId } = request.params;
    const version = await prisma.strategyRuleVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
    }

    const latest = await resolveLatestPineScript(versionId);
    if (!latest) {
      return reply.status(200).send(
        formatSuccess(request, {
          strategy_rule_version_id: versionId,
          status: 'unavailable',
          pine_script_id: null,
          generated_script: null,
          warnings: [],
        }),
      );
    }

    return reply.status(200).send(
      formatSuccess(request, {
        strategy_rule_version_id: versionId,
        status: 'available',
        ...toPineResponse(latest),
      }),
    );
  });

  fastify.post<{
    Params: { versionId: string };
    Body: {
      backtest_period_from?: string;
      backtest_period_to?: string;
    };
  }>('/:versionId/pine/generate', async (request, reply) => {
    try {
      const { versionId } = request.params;
      const backtestPeriodFrom = request.body?.backtest_period_from?.trim() ?? null;
      const backtestPeriodTo = request.body?.backtest_period_to?.trim() ?? null;
      if ((backtestPeriodFrom && !backtestPeriodTo) || (!backtestPeriodFrom && backtestPeriodTo)) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'backtest_period_from and backtest_period_to must be provided together.',
        );
      }
      if (backtestPeriodFrom && backtestPeriodTo) {
        const from = parseDateOnly(backtestPeriodFrom, 'backtest_period_from');
        const to = parseDateOnly(backtestPeriodTo, 'backtest_period_to');
        if (from.getTime() > to.getTime()) {
          throw new AppError(
            400,
            'VALIDATION_ERROR',
            'backtest period is invalid: backtest_period_from must be <= backtest_period_to.',
          );
        }
      }

      const version = await prisma.strategyRuleVersion.findUnique({
        where: { id: versionId },
      });

      if (!version) {
        throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
      }
      if (!version.naturalLanguageRule.trim()) {
        throw new AppError(400, 'VALIDATION_ERROR', 'natural_language_spec is required.');
      }
      if (!version.market.trim()) {
        throw new AppError(400, 'VALIDATION_ERROR', 'target_market is required.');
      }
      if (!version.timeframe.trim()) {
        throw new AppError(400, 'VALIDATION_ERROR', 'target_timeframe is required.');
      }

      const homeAiService = new HomeAiService();
      let output;
      let log;
      try {
        const generated = await homeAiService.generatePineScript({
          naturalLanguageSpec: version.naturalLanguageRule,
          normalizedRuleJson: normalizeRuleJson(version.normalizedRuleJson),
          targetMarket: version.market,
          targetTimeframe: version.timeframe,
        }, { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript });
        output = generated.output;
        log = generated.log;
      } catch (providerError) {
        output = {
          normalizedRuleJson: normalizeRuleJson(version.normalizedRuleJson) ?? {},
          generatedScript: null,
          warnings: [
            `provider_error: ${providerError instanceof Error ? providerError.message : String(providerError)}`,
          ],
          assumptions: [],
          status: 'failed' as const,
          repairAttempts: 0,
          failureReason: providerError instanceof Error ? providerError.message : String(providerError),
          invalidReasonCodes: ['provider_error'],
          modelName: 'provider_error',
          promptVersion: 'v1.0.0-pine-provider-error',
        };
        log = {
          initialModel: 'unknown',
          finalModel: 'unknown',
          escalated: false,
          escalationReason: 'provider_failed_fallback_to_stub',
          retryCount: 0,
          durationMs: 0,
          estimatedTokens: 0,
          estimatedCostUsd: 0,
          provider: 'provider_error',
          fallbackToStub: false,
        };
      }

      const validation = assessGeneratedPineScript(output.generatedScript);
      const warnings = [...new Set([...output.warnings, ...validation.warnings])];
      const shouldFail = output.status === 'failed' || !validation.normalizedScript || validation.failureReason !== null;
      const finalStatus: 'generated' | 'failed' = shouldFail ? 'failed' : 'generated';
      const finalScript = finalStatus === 'generated' ? validation.normalizedScript : null;
      const failureReason = output.failureReason ?? validation.failureReason;
      const repairAttempts = output.repairAttempts ?? 0;
      const invalidReasonCodes = output.invalidReasonCodes ?? validation.invalidReasonCodes ?? [];

      const generationNote = {
        schema_name: 'pine_generation_notes',
        schema_version: '1.0',
        confidence: finalStatus === 'generated' ? 'medium' : 'low',
        insufficient_context: finalStatus === 'failed',
        payload: {
          assumptions: output.assumptions,
          warnings,
          failure_reason: failureReason,
          repair_attempts: repairAttempts,
          invalid_reason_codes: invalidReasonCodes,
          provider: log.provider,
          fallback_to_stub: log.fallbackToStub,
        },
      };

      let pineScriptId: string | null = null;
      if (finalScript) {
        const created = await prisma.pineScript.create({
          data: {
            strategyRuleVersionId: version.id,
            scriptName: 'Hokkyokusei Generated Strategy',
            pineVersion: normalizeVersionNumber(finalScript),
            scriptBody: finalScript,
            generationNoteJson: generationNote as Prisma.InputJsonValue,
            status: 'ready',
          },
        });
        pineScriptId = created.id;
      }

      const updated = await prisma.strategyRuleVersion.update({
        where: { id: version.id },
        data: {
          normalizedRuleJson: output.normalizedRuleJson as Prisma.InputJsonValue,
          generatedPine: finalScript,
          warningsJson: warnings as Prisma.InputJsonValue,
          assumptionsJson: output.assumptions as Prisma.InputJsonValue,
          status: finalStatus,
        },
      });

      return reply.status(200).send(
        formatSuccess(request, {
          strategy_version: toStrategyVersionResponse(updated),
          pine: {
            pine_script_id: pineScriptId,
            generated_script: finalScript,
            warnings,
            status: finalStatus,
            failure_reason: failureReason,
            repair_attempts: repairAttempts,
            invalid_reason_codes: invalidReasonCodes,
          },
        }),
      );
    } catch (error) {
      rethrowKnownSchemaMismatch(error);
    }
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

    return reply.status(201).send(
      formatSuccess(request, {
        strategy_version: toStrategyVersionResponse(cloned),
        cloned_from_version_id: sourceVersion.id,
      }),
    );
  });
};
