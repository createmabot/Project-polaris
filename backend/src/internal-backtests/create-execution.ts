import { FastifyBaseLogger } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { enqueueInternalBacktestExecution } from '../queue/internal-backtests';
import { AppError } from '../utils/response';
import {
  buildExecutionInputSnapshot,
  normalizeCreateExecutionRequest,
  resolveExecutionInput,
  type CreateExecutionRequestInput,
  type NormalizedCreateExecutionRequest,
} from './contracts';
import { normalizeEngineActualRuleSet } from './engine-actual-rules';

type CreateInternalBacktestExecutionArgs = {
  body: CreateExecutionRequestInput | Record<string, unknown>;
  logger: FastifyBaseLogger;
  strategyRuleVersionId?: string;
  executionTargetSymbol?: string | null;
};

export type InternalBacktestExecutionResponse = {
  id: string;
  strategy_rule_version_id: string;
  status: string;
  requested_at: Date;
  engine_version: string;
  created_at: Date;
  updated_at: Date;
};

function withExecutionDefaults(
  body: CreateExecutionRequestInput | Record<string, unknown>,
  defaults: { strategyRuleVersionId?: string; executionTargetSymbol?: string | null },
): CreateExecutionRequestInput | Record<string, unknown> {
  const nextBody = { ...(body as Record<string, unknown>) };
  if (defaults.strategyRuleVersionId) {
    nextBody.strategy_rule_version_id = defaults.strategyRuleVersionId;
  }

  const defaultSymbol = defaults.executionTargetSymbol?.trim();
  if (defaultSymbol) {
    const rawExecutionTarget = nextBody.execution_target;
    const executionTarget =
      rawExecutionTarget && typeof rawExecutionTarget === 'object' && !Array.isArray(rawExecutionTarget)
        ? { ...(rawExecutionTarget as Record<string, unknown>) }
        : {};

    if (typeof executionTarget.symbol !== 'string' || executionTarget.symbol.trim().length === 0) {
      executionTarget.symbol = defaultSymbol;
    }
    nextBody.execution_target = executionTarget;
  }

  return nextBody;
}

export function toInternalBacktestExecutionResponse(execution: {
  id: string;
  strategyRuleVersionId: string;
  status: string;
  requestedAt: Date;
  engineVersion: string;
  createdAt: Date;
  updatedAt: Date;
}): InternalBacktestExecutionResponse {
  return {
    id: execution.id,
    strategy_rule_version_id: execution.strategyRuleVersionId,
    status: execution.status,
    requested_at: execution.requestedAt,
    engine_version: execution.engineVersion,
    created_at: execution.createdAt,
    updated_at: execution.updatedAt,
  };
}

export async function createInternalBacktestExecution(args: CreateInternalBacktestExecutionArgs) {
  let normalizedRequest: NormalizedCreateExecutionRequest;
  try {
    normalizedRequest = normalizeCreateExecutionRequest(
      withExecutionDefaults(args.body ?? {}, {
        strategyRuleVersionId: args.strategyRuleVersionId,
        executionTargetSymbol: args.executionTargetSymbol,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid request body';
    throw new AppError(400, 'VALIDATION_ERROR', message);
  }

  const strategyVersion = await prisma.strategyRuleVersion.findUnique({
    where: { id: normalizedRequest.strategyRuleVersionId },
  });
  if (!strategyVersion) {
    throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
  }

  let resolvedInput: ReturnType<typeof resolveExecutionInput>;
  try {
    resolvedInput = resolveExecutionInput({
      request: normalizedRequest,
      strategyVersion: {
        market: strategyVersion.market,
        timeframe: strategyVersion.timeframe,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid execution target.';
    throw new AppError(400, 'INVALID_EXECUTION_TARGET', message);
  }

  const requestedSummaryMode =
    typeof resolvedInput.engineConfig.summary_mode === 'string'
      ? resolvedInput.engineConfig.summary_mode.trim().toLowerCase()
      : null;
  if (
    (requestedSummaryMode === 'engine_estimated' || requestedSummaryMode === 'engine_actual') &&
    normalizedRequest.executionTarget.symbol === null
  ) {
    throw new AppError(
      400,
      'INVALID_EXECUTION_TARGET',
      `execution_target.symbol is required when engine_config.summary_mode is ${requestedSummaryMode}.`,
    );
  }
  if (requestedSummaryMode === 'engine_actual') {
    try {
      normalizeEngineActualRuleSet(resolvedInput.engineConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid engine_config.actual_rules.';
      throw new AppError(400, 'VALIDATION_ERROR', message);
    }
  }

  const inputSnapshot = buildExecutionInputSnapshot({
    strategyRuleVersionId: strategyVersion.id,
    market: resolvedInput.market,
    timeframe: resolvedInput.timeframe,
    executionTarget: resolvedInput.executionTarget,
    dataRange: resolvedInput.dataRange,
    engineConfig: resolvedInput.engineConfig,
    strategySnapshot: {
      naturalLanguageRule: strategyVersion.naturalLanguageRule,
      generatedPine: strategyVersion.generatedPine,
      market: strategyVersion.market,
      timeframe: strategyVersion.timeframe,
    },
  });

  const execution = await prisma.internalBacktestExecution.create({
    data: {
      strategyRuleVersionId: strategyVersion.id,
      status: 'queued',
      inputSnapshotJson: inputSnapshot as Prisma.InputJsonValue,
    },
  });

  try {
    await enqueueInternalBacktestExecution(execution.id);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'failed_to_enqueue_internal_backtest_execution';
    await prisma.internalBacktestExecution.update({
      where: { id: execution.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorCode: 'QUEUE_ENQUEUE_FAILED',
        errorMessage,
      },
    });

    args.logger.error({
      event: 'internal_backtest_execution_enqueue_failed',
      execution_id: execution.id,
      error: errorMessage,
    });

    throw new AppError(503, 'QUEUE_ENQUEUE_FAILED', 'internal backtest execution enqueue failed.', {
      execution_id: execution.id,
    });
  }

  return { execution };
}
