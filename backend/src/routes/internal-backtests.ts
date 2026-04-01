import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { enqueueInternalBacktestExecution } from '../queue/internal-backtests';
import {
  buildExecutionInputSnapshot,
  normalizeCreateExecutionRequest,
  resolveExecutionInput,
  type CreateExecutionRequestInput,
  type NormalizedCreateExecutionRequest,
} from '../internal-backtests/contracts';

export const internalBacktestRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateExecutionRequestInput }>('/executions', async (request, reply) => {
    let normalizedRequest: NormalizedCreateExecutionRequest;
    try {
      normalizedRequest = normalizeCreateExecutionRequest(request.body ?? {});
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

    const resolvedInput = resolveExecutionInput({
      request: normalizedRequest,
      strategyVersion: {
        market: strategyVersion.market,
        timeframe: strategyVersion.timeframe,
      },
    });
    const requestedSummaryMode =
      typeof resolvedInput.engineConfig.summary_mode === 'string'
        ? resolvedInput.engineConfig.summary_mode.trim().toLowerCase()
        : null;
    if (requestedSummaryMode === 'engine_estimated' && normalizedRequest.executionTarget.symbol === null) {
      throw new AppError(
        400,
        'INVALID_EXECUTION_TARGET',
        'execution_target.symbol is required when engine_config.summary_mode is engine_estimated.',
      );
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

      request.log.error({
        event: 'internal_backtest_execution_enqueue_failed',
        execution_id: execution.id,
        error: errorMessage,
      });

      throw new AppError(503, 'QUEUE_ENQUEUE_FAILED', 'internal backtest execution enqueue failed.', {
        execution_id: execution.id,
      });
    }

    return reply.status(201).send(
      formatSuccess(request, {
        execution: {
          id: execution.id,
          strategy_rule_version_id: execution.strategyRuleVersionId,
          status: execution.status,
          requested_at: execution.requestedAt,
          engine_version: execution.engineVersion,
          created_at: execution.createdAt,
          updated_at: execution.updatedAt,
        },
      }),
    );
  });

  fastify.get<{ Params: { executionId: string } }>('/executions/:executionId', async (request, reply) => {
    const execution = await prisma.internalBacktestExecution.findUnique({
      where: { id: request.params.executionId },
    });
    if (!execution) {
      throw new AppError(404, 'NOT_FOUND', 'internal backtest execution was not found.');
    }

    return reply.status(200).send(
      formatSuccess(request, {
        execution: {
          id: execution.id,
          strategy_rule_version_id: execution.strategyRuleVersionId,
          status: execution.status,
          requested_at: execution.requestedAt,
          started_at: execution.startedAt,
          finished_at: execution.finishedAt,
          error_code: execution.errorCode,
          error_message: execution.errorMessage,
          engine_version: execution.engineVersion,
          created_at: execution.createdAt,
          updated_at: execution.updatedAt,
        },
      }),
    );
  });

  fastify.get<{ Params: { executionId: string } }>('/executions/:executionId/result', async (request, reply) => {
    const execution = await prisma.internalBacktestExecution.findUnique({
      where: { id: request.params.executionId },
    });
    if (!execution) {
      throw new AppError(404, 'NOT_FOUND', 'internal backtest execution was not found.');
    }
    if (execution.status !== 'succeeded') {
      throw new AppError(
        409,
        'RESULT_NOT_READY',
        'result is not ready. execution status must be succeeded.',
        { status: execution.status },
      );
    }

    return reply.status(200).send(
      formatSuccess(request, {
        execution_id: execution.id,
        strategy_rule_version_id: execution.strategyRuleVersionId,
        status: execution.status,
        result_summary: execution.resultSummaryJson,
        artifact_pointer: execution.artifactPointerJson,
        input_snapshot: execution.inputSnapshotJson,
        engine_version: execution.engineVersion,
        finished_at: execution.finishedAt,
      }),
    );
  });
};
