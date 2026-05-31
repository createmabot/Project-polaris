import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { HomeAiService } from '../ai/home-ai-service';
import type { PineGenerationProgressStage } from '../ai/home-ai-service';
import { createHomeAiProvider, createStubHomeAiProvider } from '../ai/home-provider';
import type { HomeAiProviderType } from '../ai/home-provider';
import { env } from '../env';
import { assessGeneratedPineScript } from '../strategy/pine';
import { normalizeTimeframeAlias } from '../strategy/timeframe';
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
    warnings: Array.isArray(version.warningsJson)
      ? version.warningsJson.filter((item): item is string => typeof item === 'string')
      : [],
    assumptions: Array.isArray(version.assumptionsJson)
      ? version.assumptionsJson.filter((item): item is string => typeof item === 'string')
      : [],
    market: version.market,
    timeframe: normalizeTimeframeAlias(version.timeframe),
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

function classifyPineProviderFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|aborted|AbortError/i.test(message)) {
    return 'provider_timeout';
  }
  if (/HTTP\s+429/i.test(message)) {
    return 'provider_rate_limited';
  }
  if (/HTTP\s+5\d\d/i.test(message)) {
    return 'provider_unavailable';
  }
  if (/HTTP\s+4\d\d/i.test(message)) {
    return 'provider_rejected';
  }
  if (/invalid output|empty content|malformed|JSON|schema/i.test(message)) {
    return 'provider_invalid_response';
  }
  return 'provider_error';
}

function resolvePineGenerationProviderType(): HomeAiProviderType {
  if (env.PINE_GENERATION_PROVIDER === 'deterministic' || env.PINE_GENERATION_PROVIDER === 'stub') {
    return 'stub';
  }
  return env.PINE_GENERATION_PROVIDER;
}

function createPineGenerationService(): HomeAiService {
  return new HomeAiService(
    createHomeAiProvider(resolvePineGenerationProviderType()),
    createStubHomeAiProvider(),
    false,
  );
}

function pineGenerationJobClient() {
  return (prisma as any).pineGenerationJob;
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

type PineGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
type PineGenerationJobRequestKind = 'generate' | 'regenerate';
type PineGenerationJobStage = PineGenerationProgressStage;
type PineGenerationStageEventStatus = 'running' | 'completed' | 'skipped';

type PineGenerationStageEvent = {
  stage: PineGenerationJobStage;
  status: PineGenerationStageEventStatus;
  occurred_at: string;
};

type PineGenerationJobErrorDetails = {
  invalid_reason_codes: string[];
  pine_reviewer_issues: Array<{
    code: string;
    severity: 'error' | 'warning' | 'info';
    repair_hint: string;
  }>;
};

const PINE_GENERATION_STAGES: PineGenerationJobStage[] = [
  '生成リクエスト送信',
  'LLMでPine生成',
  '生成結果レビュー',
  '必要に応じて修正',
  '最終確認',
];

function isPineGenerationStage(value: unknown): value is PineGenerationJobStage {
  return typeof value === 'string' && PINE_GENERATION_STAGES.includes(value as PineGenerationJobStage);
}

function normalizePineStageHistory(value: unknown): PineGenerationStageEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (!isPineGenerationStage(record.stage)) {
      return [];
    }
    const status = record.status === 'completed' || record.status === 'skipped' ? record.status : 'running';
    const occurredAt = typeof record.occurred_at === 'string' ? record.occurred_at : new Date().toISOString();
    return [{ stage: record.stage, status, occurred_at: occurredAt }];
  });
}

function appendPineStage(history: unknown, stage: PineGenerationJobStage, status: PineGenerationStageEventStatus = 'running') {
  const current = normalizePineStageHistory(history).map((event) => (
    event.status === 'running' ? { ...event, status: 'completed' as const } : event
  ));
  current.push({ stage, status, occurred_at: new Date().toISOString() });
  return current;
}

function sanitizePineGenerationJobErrorDetails(value: unknown): PineGenerationJobErrorDetails {
  if (!value || typeof value !== 'object') {
    return { invalid_reason_codes: [], pine_reviewer_issues: [] };
  }
  const record = value as Record<string, unknown>;
  const invalidReasonCodes = Array.isArray(record.invalid_reason_codes)
    ? record.invalid_reason_codes
        .filter((item): item is string => typeof item === 'string' && /^[a-z0-9_]+$/i.test(item))
        .slice(0, 16)
    : [];
  const pineReviewerIssues = Array.isArray(record.pine_reviewer_issues)
    ? record.pine_reviewer_issues.flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return [];
        }
        const issue = item as Record<string, unknown>;
        const code = typeof issue.code === 'string' && /^[a-z0-9_]+$/i.test(issue.code) ? issue.code : null;
        const severity: 'error' | 'warning' | 'info' | null =
          issue.severity === 'error' || issue.severity === 'warning' || issue.severity === 'info'
            ? issue.severity
            : null;
        const repairHint = typeof issue.repair_hint === 'string' ? issue.repair_hint.trim() : '';
        if (!code || !severity || !repairHint || repairHint.length > 180) {
          return [];
        }
        if (/https?:\/\/|endpoint|model|secret|token|credential|stack|local path/i.test(repairHint)) {
          return [];
        }
        return [{ code, severity, repair_hint: repairHint }];
      }).slice(0, 8)
    : [];
  return {
    invalid_reason_codes: invalidReasonCodes,
    pine_reviewer_issues: pineReviewerIssues,
  };
}

function toPineGenerationJobResponse(job: {
  id: string;
  strategyRuleVersionId: string | null;
  requestKind: string;
  status: string;
  currentStage: string;
  stageHistoryJson: unknown;
  resultPineScriptId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetailsJson?: unknown;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}) {
  const progressByStage: Record<string, number> = {
    生成リクエスト送信: 5,
    LLMでPine生成: 35,
    生成結果レビュー: 65,
    必要に応じて修正: 80,
    最終確認: job.status === 'queued' ? 5 : 100,
  };
  const errorDetails = sanitizePineGenerationJobErrorDetails(job.errorDetailsJson);
  return {
    id: job.id,
    strategy_version_id: job.strategyRuleVersionId,
    strategy_rule_version_id: job.strategyRuleVersionId,
    request_kind: job.requestKind,
    job_kind: job.requestKind,
    status: job.status,
    current_stage: job.currentStage,
    stage: job.currentStage,
    progress_percent: progressByStage[job.currentStage] ?? (job.status === 'succeeded' || job.status === 'failed' ? 100 : 0),
    stage_history: normalizePineStageHistory(job.stageHistoryJson),
    result: job.resultPineScriptId
      ? {
          pine_script_id: job.resultPineScriptId,
          status: 'available',
        }
      : null,
    error: job.errorCode
      ? {
          code: job.errorCode,
          message: job.errorMessage ?? 'Pine生成に失敗しました。条件を見直して再試行してください。',
          invalid_reason_codes: errorDetails.invalid_reason_codes,
          pine_reviewer_issues: errorDetails.pine_reviewer_issues,
        }
      : null,
    error_code: job.errorCode,
    error_message: job.errorMessage,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
    completed_at: job.completedAt ? job.completedAt.toISOString() : null,
  };
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
    onStage?: (stage: PineGenerationJobStage) => void | Promise<void>;
  }) => {
    const homeAiService = createPineGenerationService();
    let output;
    let log;
    try {
      const generated = await homeAiService.generatePineScript(
        {
          naturalLanguageSpec: params.version.naturalLanguageRule,
          normalizedRuleJson: normalizeRuleJson(params.version.normalizedRuleJson),
          targetMarket: params.version.market,
          targetTimeframe: normalizeTimeframeAlias(params.version.timeframe),
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
        {
          maxRepairAttempts: 2,
          validateOutput: assessGeneratedPineScript,
          onProgress: async (update) => {
            await params.onStage?.(update.stage);
          },
        },
      );
      output = generated.output;
      log = generated.log;
    } catch (providerError) {
      const providerFailureReason = classifyPineProviderFailure(providerError);
      output = {
        normalizedRuleJson: normalizeRuleJson(params.version.normalizedRuleJson) ?? {},
        generatedScript: null,
        warnings: [`provider_error: ${providerFailureReason}`],
        assumptions: [],
        status: 'failed' as const,
        repairAttempts: 0,
        failureReason: providerFailureReason,
        invalidReasonCodes: [providerFailureReason],
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

    await params.onStage?.('最終確認');
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
        pine_reviewer: output.reviewerSummary ?? null,
        pine_reviewer_issues: output.reviewerIssues ?? [],
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
      await params.onStage?.('最終確認');
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
        assumptions: output.assumptions,
        status: finalStatus,
        failure_reason: failureReason,
        repair_attempts: repairAttempts,
        invalid_reason_codes: invalidReasonCodes,
        pine_reviewer_issues: output.reviewerIssues ?? [],
      },
    };
  };

  const updatePineGenerationJobStage = async (jobId: string, stage: PineGenerationJobStage) => {
    const job = await prisma.pineGenerationJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
      return;
    }
    await prisma.pineGenerationJob.update({
      where: { id: jobId },
      data: {
        status: 'running',
        currentStage: stage,
        stageHistoryJson: appendPineStage(job.stageHistoryJson, stage) as Prisma.InputJsonValue,
      },
    });
  };

  const completePineGenerationJob = async (
    jobId: string,
    status: Extract<PineGenerationJobStatus, 'succeeded' | 'failed'>,
    params: {
      resultPineScriptId?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      errorDetails?: PineGenerationJobErrorDetails | null;
    } = {},
  ) => {
    const job = await pineGenerationJobClient().findUnique({ where: { id: jobId } });
    if (!job) {
      return;
    }
    const finalStage: PineGenerationJobStage = '最終確認';
    await pineGenerationJobClient().update({
      where: { id: jobId },
      data: {
        status,
        currentStage: finalStage,
        stageHistoryJson: appendPineStage(job.stageHistoryJson, finalStage, 'completed') as Prisma.InputJsonValue,
        resultPineScriptId: params.resultPineScriptId ?? null,
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
        errorDetailsJson: params.errorDetails ? params.errorDetails as Prisma.InputJsonValue : Prisma.JsonNull,
        completedAt: new Date(),
      },
    });
  };

  const failPineGenerationJob = async (
    jobId: string,
    errorCode = 'PINE_GENERATION_FAILED',
    errorDetails?: PineGenerationJobErrorDetails | null,
  ) => {
    const safeErrorCode = /^[A-Z0-9_]+$/.test(errorCode) ? errorCode : 'PINE_GENERATION_FAILED';
    await completePineGenerationJob(jobId, 'failed', {
      errorCode: safeErrorCode,
      errorMessage: 'Pine生成に失敗しました。条件を見直して再試行してください。',
      errorDetails: errorDetails ?? null,
    });
  };

  const validatePineGenerationVersion = (version: StrategyVersionRecord | null): StrategyVersionRecord => {
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
    return version;
  };

  const createPineGenerationJob = async (params: {
    versionId: string;
    requestKind: PineGenerationJobRequestKind;
  }) => prisma.pineGenerationJob.create({
    data: {
      strategyRuleVersionId: params.versionId,
      requestKind: params.requestKind,
      status: 'queued',
      currentStage: '生成リクエスト送信',
      stageHistoryJson: [
        {
          stage: '生成リクエスト送信',
          status: 'running',
          occurred_at: new Date().toISOString(),
        },
      ] as Prisma.InputJsonValue,
    },
  });

  const schedulePineGenerationJob = (
    jobId: string,
    run: () => Promise<{
      pine: {
        status: 'generated' | 'failed';
        pine_script_id: string | null;
        failure_reason?: string | null;
        invalid_reason_codes?: string[];
        pine_reviewer_issues?: PineGenerationJobErrorDetails['pine_reviewer_issues'];
      };
    }>,
  ) => {
    setTimeout(() => {
      void (async () => {
        try {
          await updatePineGenerationJobStage(jobId, '生成リクエスト送信');
          const result = await run();
          if (result.pine.status === 'generated' && result.pine.pine_script_id) {
            await completePineGenerationJob(jobId, 'succeeded', {
              resultPineScriptId: result.pine.pine_script_id,
            });
            return;
          }
          await failPineGenerationJob(jobId, result.pine.failure_reason ?? 'PINE_GENERATION_FAILED', {
            invalid_reason_codes: result.pine.invalid_reason_codes ?? [],
            pine_reviewer_issues: result.pine.pine_reviewer_issues ?? [],
          });
        } catch {
          await failPineGenerationJob(jobId);
        }
      })();
    }, 0);
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
    const nextTimeframe = hasTimeframe ? normalizeTimeframeAlias(request.body.timeframe!) : normalizeTimeframeAlias(version.timeframe);
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

  fastify.get<{ Params: { versionId: string; jobId: string } }>('/:versionId/pine/generation-jobs/:jobId', async (request, reply) => {
    try {
      const { versionId, jobId } = request.params;
      const job = await pineGenerationJobClient().findFirst({
        where: {
          id: jobId,
          strategyRuleVersionId: versionId,
        },
      });
      if (!job) {
        throw new AppError(404, 'NOT_FOUND', 'pine generation job was not found.');
      }
      return reply.status(200).send(formatSuccess(request, { job: toPineGenerationJobResponse(job) }));
    } catch (error) {
      rethrowKnownSchemaMismatch(error);
    }
  });

  fastify.post<{
    Params: { versionId: string };
    Body: {
      backtest_period_from?: unknown;
      backtest_period_to?: unknown;
    };
  }>('/:versionId/pine/generation-jobs', async (request, reply) => {
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
      const validVersion = validatePineGenerationVersion(version);
      const job = await createPineGenerationJob({ versionId: validVersion.id, requestKind: 'generate' });
      schedulePineGenerationJob(job.id, () =>
        generateAndPersistPine({
          version: validVersion,
          onStage: (stage) => updatePineGenerationJobStage(job.id, stage),
        }),
      );

      return reply.status(202).send(formatSuccess(request, { job: toPineGenerationJobResponse(job) }));
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
  }>('/:versionId/pine/regeneration-jobs', async (request, reply) => {
    try {
      const { versionId } = request.params;
      const sourcePineScriptId = readRequiredText(request.body?.source_pine_script_id, 'source_pine_script_id');
      const compileErrorText = readOptionalText(request.body?.compile_error_text, 'compile_error_text');
      const validationNote = readOptionalText(request.body?.validation_note, 'validation_note');
      const revisionRequest = readRequiredText(request.body?.revision_request, 'revision_request');

      const version = await prisma.strategyRuleVersion.findUnique({
        where: { id: versionId },
      });
      const validVersion = validatePineGenerationVersion(version);

      const sourcePineScript = await prisma.pineScript.findFirst({
        where: {
          id: sourcePineScriptId,
          strategyRuleVersionId: validVersion.id,
        },
      });
      if (!sourcePineScript) {
        throw new AppError(404, 'NOT_FOUND', 'source pine script was not found for this strategy version.');
      }

      const revisionInput = await prisma.pineRevisionInput.create({
        data: {
          strategyRuleVersionId: validVersion.id,
          sourcePineScriptId: sourcePineScript.id,
          compileErrorText,
          validationNote,
          revisionRequest,
        },
      });
      const job = await createPineGenerationJob({ versionId: validVersion.id, requestKind: 'regenerate' });
      schedulePineGenerationJob(job.id, () =>
        generateAndPersistPine({
          version: validVersion,
          parentPineScriptId: sourcePineScript.id,
          onStage: (stage) => updatePineGenerationJobStage(job.id, stage),
          revisionInput: {
            id: revisionInput.id,
            sourcePineScriptId: sourcePineScript.id,
            sourceScriptBody: sourcePineScript.scriptBody,
            compileErrorText,
            validationNote,
            revisionRequest,
          },
        }),
      );

      return reply.status(202).send(formatSuccess(request, { job: toPineGenerationJobResponse(job) }));
    } catch (error) {
      rethrowKnownSchemaMismatch(error);
    }
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

    const { clonedVersion, sourceVersionId } = await prisma.$transaction(async (tx) => {
      const sourceVersion = await tx.strategyRuleVersion.findUnique({
        where: { id: versionId },
      });

      if (!sourceVersion) {
        throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
      }

      const clonedVersion = await tx.strategyRuleVersion.create({
        data: {
          strategyRuleId: sourceVersion.strategyRuleId,
          clonedFromVersionId: sourceVersion.id,
          naturalLanguageRule: sourceVersion.naturalLanguageRule,
          normalizedRuleJson: (sourceVersion.normalizedRuleJson ?? undefined) as Prisma.InputJsonValue | undefined,
          generatedPine: sourceVersion.generatedPine,
          warningsJson: (sourceVersion.warningsJson ?? undefined) as Prisma.InputJsonValue | undefined,
          assumptionsJson: (sourceVersion.assumptionsJson ?? undefined) as Prisma.InputJsonValue | undefined,
          market: sourceVersion.market,
          timeframe: normalizeTimeframeAlias(sourceVersion.timeframe),
          status: sourceVersion.status,
        },
      });

      const sourcePine = await tx.pineScript.findFirst({
        where: { strategyRuleVersionId: sourceVersion.id },
        orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      });
      if (sourcePine) {
        await tx.pineScript.create({
          data: {
            strategyRuleVersionId: clonedVersion.id,
            parentPineScriptId: sourcePine.id,
            scriptName: sourcePine.scriptName,
            pineVersion: sourcePine.pineVersion,
            scriptBody: sourcePine.scriptBody,
            status: sourcePine.status,
            generationNoteJson: {
              source: 'strategy_version_clone',
              source_version_id: sourceVersion.id,
              source_pine_script_id: sourcePine.id,
              cloned_for_improvement: true,
            },
          },
        });
      }

      return {
        clonedVersion,
        sourceVersionId: sourceVersion.id,
      };
    });

    return reply.status(201).send(
      formatSuccess(request, {
        strategy_version: toStrategyVersionResponse(clonedVersion),
        cloned_from_version_id: sourceVersionId,
      }),
    );
  });
};
