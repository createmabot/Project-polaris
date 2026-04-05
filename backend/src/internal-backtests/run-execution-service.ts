import type { Prisma } from '@prisma/client';
import {
  buildExecutionInputSnapshot,
  createDefaultResultSummary,
  createExecutionArtifactPointer,
  normalizeExecutionInputSnapshot,
  validateDataSourceSnapshotSchema,
  validateEngineActualArtifactPayloadSchema,
  validateResultSummarySchema,
  type InternalBacktestActualArtifactPayload,
  type InternalBacktestInputSnapshot,
  type InternalBacktestArtifactPointer,
  type InternalBacktestResultSummary,
} from './contracts';
import type { InternalBacktestDataSourceFetchObservation } from './data-source-adapter';
import {
  runDummyInternalBacktestEngine,
  type InternalBacktestEngineAdapter,
} from './engine-adapter';

export type RunExecutionServiceInput = {
  executionId: string;
  strategyRuleVersionId: string;
  inputSnapshotJson: unknown;
  engineVersion: string;
};

export type RunExecutionServiceOutput = {
  resultSummary: InternalBacktestResultSummary;
  artifactPointer: InternalBacktestArtifactPointer;
  artifactPayload?: InternalBacktestActualArtifactPayload;
  inputSnapshot: InternalBacktestInputSnapshot;
  dataSourceFetchObservation?: InternalBacktestDataSourceFetchObservation;
};

export const INVALID_EXECUTION_TARGET_CODE = 'INVALID_EXECUTION_TARGET';

export class InvalidExecutionTargetError extends Error {
  code: string;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidExecutionTargetError';
    this.code = INVALID_EXECUTION_TARGET_CODE;
  }
}

function mergeEngineResult(args: {
  base: InternalBacktestResultSummary;
  engine: Awaited<ReturnType<InternalBacktestEngineAdapter>>;
}): InternalBacktestResultSummary {
  const metrics = args.engine.metrics ?? {};
  const summaryKind = args.engine.summary_kind ?? args.base.summary_kind;
  const notes = args.engine.notes?.trim() ?? args.base.notes;

  return {
    ...args.base,
    summary_kind: summaryKind,
    metrics: {
      bar_count: metrics.bar_count ?? args.base.metrics.bar_count,
      first_close: metrics.first_close ?? args.base.metrics.first_close,
      last_close: metrics.last_close ?? args.base.metrics.last_close,
      price_change: metrics.price_change ?? args.base.metrics.price_change,
      price_change_percent: metrics.price_change_percent ?? args.base.metrics.price_change_percent,
      period_high: metrics.period_high ?? args.base.metrics.period_high,
      period_low: metrics.period_low ?? args.base.metrics.period_low,
      range_percent: metrics.range_percent ?? args.base.metrics.range_percent,
      ...(metrics.trade_count !== undefined ? { trade_count: metrics.trade_count } : {}),
      ...(metrics.win_rate !== undefined ? { win_rate: metrics.win_rate } : {}),
      ...(metrics.total_return_percent !== undefined
        ? { total_return_percent: metrics.total_return_percent }
        : {}),
      ...(metrics.max_drawdown_percent !== undefined
        ? { max_drawdown_percent: metrics.max_drawdown_percent }
        : {}),
      ...(metrics.holding_period_avg_bars !== undefined
        ? { holding_period_avg_bars: metrics.holding_period_avg_bars }
        : {}),
      ...(metrics.first_trade_at !== undefined ? { first_trade_at: metrics.first_trade_at } : {}),
      ...(metrics.last_trade_at !== undefined ? { last_trade_at: metrics.last_trade_at } : {}),
    },
    notes,
  };
}

export async function runInternalBacktestExecutionService(
  input: RunExecutionServiceInput,
  deps: { engineAdapter?: InternalBacktestEngineAdapter } = {},
): Promise<RunExecutionServiceOutput> {
  const engineAdapter = deps.engineAdapter ?? runDummyInternalBacktestEngine;
  let normalizedInput: ReturnType<typeof normalizeExecutionInputSnapshot>;
  try {
    normalizedInput = normalizeExecutionInputSnapshot(input.inputSnapshotJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid execution target.';
    if (message.includes('execution_target')) {
      throw new InvalidExecutionTargetError(message);
    }
    throw error;
  }
  const requestedSummaryMode =
    typeof normalizedInput.engineConfig.summary_mode === 'string'
      ? normalizedInput.engineConfig.summary_mode.trim().toLowerCase()
      : null;
  if (
    (requestedSummaryMode === 'engine_estimated' || requestedSummaryMode === 'engine_actual') &&
    normalizedInput.executionTarget.symbol.startsWith('legacy:')
  ) {
    throw new InvalidExecutionTargetError(
      `${requestedSummaryMode} requires execution_target.symbol for data source resolution.`,
    );
  }

  const engineResult = await engineAdapter({
    executionId: input.executionId,
    engineVersion: input.engineVersion,
    input: normalizedInput,
  });

  const summaryCandidate = mergeEngineResult({
    base: createDefaultResultSummary({
      inputSnapshot: normalizedInput,
      engineVersion: input.engineVersion,
    }),
    engine: engineResult,
  });

  const validatedSummary = validateResultSummarySchema(
    summaryCandidate as unknown as Prisma.InputJsonValue,
  );
  const dataSourceSnapshot = engineResult.data_source_snapshot
    ? validateDataSourceSnapshotSchema(engineResult.data_source_snapshot as unknown as Prisma.InputJsonValue)
    : undefined;
  const nextInputSnapshot = buildExecutionInputSnapshot({
    strategyRuleVersionId: normalizedInput.strategyRuleVersionId,
    market: normalizedInput.market,
    timeframe: normalizedInput.timeframe,
    executionTarget: normalizedInput.executionTarget,
    dataRange: normalizedInput.dataRange,
    engineConfig: normalizedInput.engineConfig,
    strategySnapshot: normalizedInput.strategySnapshot,
    dataSourceSnapshot,
  });

  return {
    resultSummary: validatedSummary,
    artifactPointer: createExecutionArtifactPointer({
      executionId: input.executionId,
      pathSuffix: engineResult.artifact_path_suffix,
    }),
    artifactPayload: engineResult.artifact_payload
      ? validateEngineActualArtifactPayloadSchema(
          engineResult.artifact_payload as unknown as Prisma.InputJsonValue,
        )
      : undefined,
    inputSnapshot: nextInputSnapshot,
    dataSourceFetchObservation: engineResult.data_source_fetch_observation,
  };
}
