import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { HomeAiService } from '../ai/home-ai-service';
import { assessGeneratedPineScript } from '../strategy/pine';
import { AppError, formatSuccess } from '../utils/response';

type StrategyVersionRecord = {
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
};

function toStrategyVersionResponse(version: StrategyVersionRecord) {
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
  parentPineScriptId: string | null;
  generatedFromRevision?: {
    id: string;
    sourcePineScriptId: string;
    compileErrorText: string | null;
    validationNote: string | null;
    revisionRequest: string;
    createdAt: Date;
  } | null;
  createdAt: Date;
}, latestRevisionInput: {
  id: string;
  sourcePineScriptId: string;
  generatedPineScriptId: string | null;
  compileErrorText: string | null;
  validationNote: string | null;
  revisionRequest: string;
  createdAt: Date;
} | null) {
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
  const generatedFromRevision = record.generatedFromRevision ?? null;

  return {
    pine_script_id: record.id,
    script_name: record.scriptName,
    pine_version: record.pineVersion,
    generated_script: record.scriptBody,
    script_body: record.scriptBody,
    warnings,
    generation_note: generationNote,
    script_status: record.status,
    parent_pine_script_id: record.parentPineScriptId,
    source_pine_script_id: generatedFromRevision?.sourcePineScriptId ?? record.parentPineScriptId ?? null,
    revision_input_id: generatedFromRevision?.id ?? null,
    latest_revision_input: latestRevisionInput
      ? {
          id: latestRevisionInput.id,
          source_pine_script_id: latestRevisionInput.sourcePineScriptId,
          generated_pine_script_id: latestRevisionInput.generatedPineScriptId,
          compile_error_text: latestRevisionInput.compileErrorText,
          validation_note: latestRevisionInput.validationNote,
          revision_request: latestRevisionInput.revisionRequest,
          created_at: latestRevisionInput.createdAt.toISOString(),
        }
      : null,
    generated_at: record.createdAt.toISOString(),
  };
}

async function resolveLatestPineScript(versionId: string) {
  return prisma.pineScript.findFirst({
    where: { strategyRuleVersionId: versionId },
    orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
    include: {
      generatedFromRevision: true,
    },
  });
}

async function resolveLatestPineRevisionInput(versionId: string) {
  return prisma.pineRevisionInput.findFirst({
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
    const [yearText, monthText, dayText] = value.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid date.`);
    }
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    ) {
      throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid calendar date.`);
    }
    return parsed;
  };

  const readOptionalBodyString = (
    body: { backtest_period_from?: unknown; backtest_period_to?: unknown } | undefined,
    key: 'backtest_period_from' | 'backtest_period_to',
  ): string | null => {
    const raw = body?.[key];
    if (raw === undefined || raw === null) {
      return null;
    }
    if (typeof raw !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', `${key} must be a string.`);
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const readOptionalText = (raw: unknown, key: string): string | null => {
    if (raw === undefined || raw === null) {
      return null;
    }
    if (typeof raw !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', `${key} must be a string.`);
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const readRequiredText = (raw: unknown, key: string): string => {
    const value = readOptionalText(raw, key);
    if (!value) {
      throw new AppError(400, 'VALIDATION_ERROR', `${key} is required.`);
    }
    return value;
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

  const generateAndPersistPine = async (params: {
    version: StrategyVersionRecord;
    parentPineScriptId?: string | null;
    revisionInput?: {
      id: string;
      sourcePineScriptId: string;
      sourceScriptBody: string;
      compileErrorText: string | null;
      validationNote: string | null;
      revisionRequest: string;
    } | null;
  }) => {
    const homeAiService = new HomeAiService();
    let output;
    let log;
    try {
      const generated = await homeAiService.generatePineScript(
        {
          naturalLanguageSpec: params.version.naturalLanguageRule,
          normalizedRuleJson: normalizeRuleJson(params.version.normalizedRuleJson),
          targetMarket: params.version.market,
          targetTimeframe: params.version.timeframe,
          regenerationInput: params.revisionInput
            ? {
                sourcePineScriptId: params.revisionInput.sourcePineScriptId,
                sourcePineScript: params.revisionInput.sourceScriptBody,
                compileErrorText: params.revisionInput.compileErrorText,
                validationNote: params.revisionInput.validationNote,
                revisionRequest: params.revisionInput.revisionRequest,
              }
            : null,
        },
        { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
      );
      output = generated.output;
      log = generated.log;
    } catch (providerError) {
      output = {
        normalizedRuleJson: normalizeRuleJson(params.version.normalizedRuleJson) ?? {},
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
        escalationReason: 'provider_failed_no_fallback',
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
        regeneration: params.revisionInput
          ? {
              revision_input_id: params.revisionInput.id,
              source_pine_script_id: params.revisionInput.sourcePineScriptId,
              compile_error_text: params.revisionInput.compileErrorText,
              validation_note: params.revisionInput.validationNote,
              revision_request: params.revisionInput.revisionRequest,
            }
          : null,
      },
    };

    let pineScriptId: string | null = null;
    if (finalScript) {
      const created = await prisma.pineScript.create({
        data: {
          strategyRuleVersionId: params.version.id,
          parentPineScriptId: params.parentPineScriptId ?? null,
          scriptName: 'Hokkyokusei Generated Strategy',
          pineVersion: normalizeVersionNumber(finalScript),
          scriptBody: finalScript,
          generationNoteJson: generationNote as Prisma.InputJsonValue,
          status: 'ready',
        },
      });
      pineScriptId = created.id;
    }

    if (params.revisionInput) {
      await prisma.pineRevisionInput.update({
        where: { id: params.revisionInput.id },
        data: { generatedPineScriptId: pineScriptId },
      });
    }

    const updated = await prisma.strategyRuleVersion.update({
      where: { id: params.version.id },
      data: {
        normalizedRuleJson: output.normalizedRuleJson as Prisma.InputJsonValue,
        generatedPine: finalScript,
        warningsJson: warnings as Prisma.InputJsonValue,
        assumptionsJson: output.assumptions as Prisma.InputJsonValue,
        status: finalStatus,
      },
    });

    return {
      strategy_version: toStrategyVersionResponse(updated),
      pine: {
        pine_script_id: pineScriptId,
        parent_pine_script_id: params.parentPineScriptId ?? null,
        source_pine_script_id: params.revisionInput?.sourcePineScriptId ?? params.parentPineScriptId ?? null,
        revision_input_id: params.revisionInput?.id ?? null,
        generated_script: finalScript,
        warnings,
        status: finalStatus,
        failure_reason: failureReason,
        repair_attempts: repairAttempts,
        invalid_reason_codes: invalidReasonCodes,
      },
    };
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

    const latestRevisionInput = await resolveLatestPineRevisionInput(versionId);
    const latest = await resolveLatestPineScript(versionId);
    if (!latest) {
      return reply.status(200).send(
        formatSuccess(request, {
          strategy_rule_version_id: versionId,
          status: 'unavailable',
          pine_script_id: null,
          generated_script: null,
          warnings: [],
          parent_pine_script_id: null,
          source_pine_script_id: latestRevisionInput?.sourcePineScriptId ?? null,
          revision_input_id: null,
          latest_revision_input: latestRevisionInput
            ? {
                id: latestRevisionInput.id,
                source_pine_script_id: latestRevisionInput.sourcePineScriptId,
                generated_pine_script_id: latestRevisionInput.generatedPineScriptId,
                compile_error_text: latestRevisionInput.compileErrorText,
                validation_note: latestRevisionInput.validationNote,
                revision_request: latestRevisionInput.revisionRequest,
                created_at: latestRevisionInput.createdAt.toISOString(),
              }
            : null,
        }),
      );
    }

    return reply.status(200).send(
      formatSuccess(request, {
        strategy_rule_version_id: versionId,
        status: 'available',
        ...toPineResponse(latest, latestRevisionInput),
      }),
    );
  });

  fastify.post<{
    Params: { versionId: string };
    Body: {
      backtest_period_from?: unknown;
      backtest_period_to?: unknown;
    };
  }>('/:versionId/pine/generate', async (request, reply) => {
    try {
      const { versionId } = request.params;
      const backtestPeriodFrom = readOptionalBodyString(request.body, 'backtest_period_from');
      const backtestPeriodTo = readOptionalBodyString(request.body, 'backtest_period_to');
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

      const generated = await generateAndPersistPine({
        version,
      });

      return reply.status(200).send(formatSuccess(request, generated));
    } catch (error) {
      rethrowKnownSchemaMismatch(error);
    }
  });

  fastify.post<{
    Params: { versionId: string };
    Body: {
      source_pine_script_id?: unknown;
      compile_error_text?: unknown;
      validation_note?: unknown;
      revision_request?: unknown;
    };
  }>('/:versionId/pine/regenerate', async (request, reply) => {
    try {
      const { versionId } = request.params;
      const sourcePineScriptId = readRequiredText(request.body?.source_pine_script_id, 'source_pine_script_id');
      const compileErrorText = readOptionalText(request.body?.compile_error_text, 'compile_error_text');
      const validationNote = readOptionalText(request.body?.validation_note, 'validation_note');
      const revisionRequest = readRequiredText(request.body?.revision_request, 'revision_request');

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

      const sourcePineScript = await prisma.pineScript.findFirst({
        where: {
          id: sourcePineScriptId,
          strategyRuleVersionId: version.id,
        },
      });
      if (!sourcePineScript) {
        throw new AppError(404, 'NOT_FOUND', 'source pine script was not found for this strategy version.');
      }

      const revisionInput = await prisma.pineRevisionInput.create({
        data: {
          strategyRuleVersionId: version.id,
          sourcePineScriptId: sourcePineScript.id,
          compileErrorText,
          validationNote,
          revisionRequest,
        },
      });

      const generated = await generateAndPersistPine({
        version,
        parentPineScriptId: sourcePineScript.id,
        revisionInput: {
          id: revisionInput.id,
          sourcePineScriptId: sourcePineScript.id,
          sourceScriptBody: sourcePineScript.scriptBody,
          compileErrorText,
          validationNote,
          revisionRequest,
        },
      });

      return reply.status(200).send(formatSuccess(request, generated));
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
