import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { getInternalBacktestDataSourceUnavailableSummary } from '../internal-backtests/observability';
import { type CreateExecutionRequestInput } from '../internal-backtests/contracts';
import {
  createInternalBacktestExecution,
  toInternalBacktestExecutionResponse,
} from '../internal-backtests/create-execution';
import { getEngineActualArtifactByExecutionId } from '../internal-backtests/artifact-store';

export const internalBacktestRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { window?: string } }>(
    '/observability/data-source-unavailable-summary',
    async (request, reply) => {
      const rawWindow = request.query?.window;
      const window: '24h' | '7d' = rawWindow === '7d' ? '7d' : '24h';
      if (rawWindow !== undefined && rawWindow !== '24h' && rawWindow !== '7d') {
        throw new AppError(400, 'VALIDATION_ERROR', 'window must be one of 24h or 7d');
      }

      const summary = await getInternalBacktestDataSourceUnavailableSummary({ window });
      return reply.status(200).send(formatSuccess(request, { summary }));
    },
  );

  fastify.post<{ Body: CreateExecutionRequestInput }>('/executions', async (request, reply) => {
    const { execution } = await createInternalBacktestExecution({
      body: request.body ?? {},
      logger: request.log,
    });

    return reply.status(201).send(
      formatSuccess(request, {
        execution: toInternalBacktestExecutionResponse(execution),
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

  fastify.get<{ Params: { executionId: string } }>(
    '/executions/:executionId/artifacts/engine_actual/trades-and-equity',
    async (request, reply) => {
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
          'artifact is not ready. execution status must be succeeded.',
          { status: execution.status },
        );
      }

      const artifactRecord = await getEngineActualArtifactByExecutionId(request.params.executionId);
      if (!artifactRecord) {
        throw new AppError(
          404,
          'NOT_FOUND',
          'engine_actual artifact was not found for this execution.',
        );
      }

      return reply.status(200).send(
        formatSuccess(request, {
          execution_id: execution.id,
          status: execution.status,
          artifact_pointer: artifactRecord.pointer,
          artifact: artifactRecord.artifact,
          finished_at: execution.finishedAt,
        }),
      );
    },
  );
};
