import type { Prisma } from '@prisma/client';
import {
  createDefaultResultSummary,
  createExecutionArtifactPointer,
  normalizeExecutionInputSnapshot,
  validateResultSummarySchema,
  type InternalBacktestArtifactPointer,
  type InternalBacktestResultSummary,
} from './contracts';
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
};

function mergeEngineResult(args: {
  base: InternalBacktestResultSummary;
  engine: Awaited<ReturnType<InternalBacktestEngineAdapter>>;
}): InternalBacktestResultSummary {
  const metrics = args.engine.metrics ?? {};
  const notes = args.engine.notes?.trim() ?? args.base.notes;

  return {
    ...args.base,
    summary_kind: args.engine.summary_kind ?? args.base.summary_kind,
    metrics: {
      total_trades: metrics.total_trades ?? args.base.metrics.total_trades,
      win_rate: metrics.win_rate ?? args.base.metrics.win_rate,
      net_profit: metrics.net_profit ?? args.base.metrics.net_profit,
      profit_factor:
        metrics.profit_factor === undefined ? args.base.metrics.profit_factor : metrics.profit_factor,
      max_drawdown_percent:
        metrics.max_drawdown_percent === undefined
          ? args.base.metrics.max_drawdown_percent
          : metrics.max_drawdown_percent,
    },
    notes,
  };
}

export async function runInternalBacktestExecutionService(
  input: RunExecutionServiceInput,
  deps: { engineAdapter?: InternalBacktestEngineAdapter } = {},
): Promise<RunExecutionServiceOutput> {
  const engineAdapter = deps.engineAdapter ?? runDummyInternalBacktestEngine;
  const normalizedInput = normalizeExecutionInputSnapshot(input.inputSnapshotJson);

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

  return {
    resultSummary: validatedSummary,
    artifactPointer: createExecutionArtifactPointer({ executionId: input.executionId }),
  };
}
