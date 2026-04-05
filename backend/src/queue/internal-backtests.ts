import { Job, Queue, Worker } from 'bullmq';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { redis } from '../redis';
import {
  runInternalBacktestExecutionService,
  INVALID_EXECUTION_TARGET_CODE,
  type RunExecutionServiceInput,
} from '../internal-backtests/run-execution-service';
import { validateArtifactPointerSchema, validateResultSummarySchema } from '../internal-backtests/contracts';
import {
  INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE,
  type InternalBacktestDataSourceFetchObservation,
  isDataSourceUnavailableError,
} from '../internal-backtests/data-source-adapter';
import {
  recordInternalBacktestDataSourceRetryOutcomeEvent,
  recordInternalBacktestDataSourceUnavailableEvent,
} from '../internal-backtests/observability';

export const INTERNAL_BACKTEST_EXECUTION_QUEUE = 'internal_backtest_execution_queue';
export const RUN_INTERNAL_BACKTEST_EXECUTION_JOB = 'run_internal_backtest_execution';
export const INTERNAL_BACKTEST_EXECUTION_FAILED_CODE = 'INTERNAL_BACKTEST_EXECUTION_FAILED';
export const INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID_CODE = 'INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID';
export { INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE };

export type InternalBacktestExecutionJobData = {
  executionId: string;
};

type ExecutionOutput = {
  resultSummary: unknown;
  artifactPointer?: Prisma.InputJsonValue | null;
  artifactPayload?: Prisma.InputJsonValue | null;
  inputSnapshot?: Prisma.InputJsonValue | null;
  dataSourceFetchObservation?: InternalBacktestDataSourceFetchObservation;
};

type RunExecutionFn = (execution: RunExecutionServiceInput) => Promise<ExecutionOutput>;

type WorkerLogger = {
  info: (payload: Record<string, unknown>) => void;
  warn: (payload: Record<string, unknown>) => void;
  error: (payload: Record<string, unknown>) => void;
};

type ProcessExecutionDeps = {
  db?: typeof prisma;
  now?: () => Date;
  runExecution?: RunExecutionFn;
};

type SetupWorkerDeps = {
  db?: typeof prisma;
  now?: () => Date;
  runExecution?: RunExecutionFn;
  queueConnection?: typeof redis;
};

let internalBacktestExecutionQueue: Queue | null = null;

type DataSourceUnavailableMeta = {
  internalReasonCode: string | null;
  providerName: string | null;
  httpStatus: number | null;
  endpointKind: string | null;
  retryAttempted: boolean | null;
  retryAttempts: number | null;
  retryTarget: boolean | null;
};

function extractExecutionTargetContext(
  inputSnapshot: unknown,
): {
  symbol: string | null;
  market: string | null;
  timeframe: string | null;
  from: string | null;
  to: string | null;
} {
  if (!inputSnapshot || typeof inputSnapshot !== 'object') {
    return { symbol: null, market: null, timeframe: null, from: null, to: null };
  }
  const snapshot = inputSnapshot as Record<string, unknown>;
  const executionTarget =
    snapshot.execution_target && typeof snapshot.execution_target === 'object'
      ? (snapshot.execution_target as Record<string, unknown>)
      : null;
  const dataRange =
    snapshot.data_range && typeof snapshot.data_range === 'object'
      ? (snapshot.data_range as Record<string, unknown>)
      : null;
  return {
    symbol: typeof executionTarget?.symbol === 'string' ? executionTarget.symbol : null,
    market: typeof snapshot.market === 'string' ? snapshot.market : null,
    timeframe: typeof snapshot.timeframe === 'string' ? snapshot.timeframe : null,
    from: typeof dataRange?.from === 'string' ? dataRange.from : null,
    to: typeof dataRange?.to === 'string' ? dataRange.to : null,
  };
}

function extractDataSourceUnavailableMeta(error: unknown): DataSourceUnavailableMeta {
  const reasonCandidate =
    !!error && typeof error === 'object' && 'reasonCode' in error
      ? (error as { reasonCode?: unknown }).reasonCode
      : null;
  const providerCandidate =
    !!error && typeof error === 'object' && 'providerName' in error
      ? (error as { providerName?: unknown }).providerName
      : null;
  const detailsCandidate =
    !!error && typeof error === 'object' && 'details' in error
      ? (error as { details?: unknown }).details
      : null;
  const details =
    detailsCandidate && typeof detailsCandidate === 'object'
      ? (detailsCandidate as Record<string, unknown>)
      : {};
  const httpStatusCandidate = details.http_status;
  const endpointKindCandidate = details.endpoint_kind;
  const retryAttemptedCandidate = details.retry_attempted;
  const retryAttemptsCandidate = details.retry_attempts;
  const retryTargetCandidate = details.retry_target;
  return {
    internalReasonCode: typeof reasonCandidate === 'string' ? reasonCandidate : null,
    providerName: typeof providerCandidate === 'string' ? providerCandidate : null,
    httpStatus: typeof httpStatusCandidate === 'number' ? httpStatusCandidate : null,
    endpointKind: typeof endpointKindCandidate === 'string' ? endpointKindCandidate : null,
    retryAttempted: typeof retryAttemptedCandidate === 'boolean' ? retryAttemptedCandidate : null,
    retryAttempts: typeof retryAttemptsCandidate === 'number' ? retryAttemptsCandidate : null,
    retryTarget: typeof retryTargetCandidate === 'boolean' ? retryTargetCandidate : null,
  };
}

export function getInternalBacktestExecutionQueue() {
  if (!internalBacktestExecutionQueue) {
    internalBacktestExecutionQueue = new Queue(INTERNAL_BACKTEST_EXECUTION_QUEUE, {
      // @ts-ignore ioredis type mismatch with BullMQ expected connection type
      connection: redis,
    });
  }
  return internalBacktestExecutionQueue;
}

const defaultRunExecution: RunExecutionFn = async (execution) => {
  const output = await runInternalBacktestExecutionService({
    executionId: execution.executionId,
    strategyRuleVersionId: execution.strategyRuleVersionId,
    inputSnapshotJson: execution.inputSnapshotJson,
    engineVersion: execution.engineVersion,
  });
  return {
    resultSummary: output.resultSummary as unknown as Prisma.InputJsonValue,
    artifactPointer: output.artifactPointer as unknown as Prisma.InputJsonValue,
    artifactPayload: output.artifactPayload as unknown as Prisma.InputJsonValue,
    inputSnapshot: output.inputSnapshot as unknown as Prisma.InputJsonValue,
    dataSourceFetchObservation: output.dataSourceFetchObservation,
  };
};

export async function enqueueInternalBacktestExecution(executionId: string) {
  return getInternalBacktestExecutionQueue().add(
    RUN_INTERNAL_BACKTEST_EXECUTION_JOB,
    { executionId },
    {
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  );
}

export async function processInternalBacktestExecution(
  jobData: InternalBacktestExecutionJobData,
  deps: ProcessExecutionDeps = {},
) {
  const db = deps.db ?? prisma;
  const now = deps.now ?? (() => new Date());
  const runExecution: RunExecutionFn = deps.runExecution ?? defaultRunExecution;

  const execution = await db.internalBacktestExecution.findUnique({
    where: { id: jobData.executionId },
  });

  if (!execution) {
    throw new Error('internal_backtest_execution_not_found');
  }

  if (execution.status !== 'queued') {
    return {
      execution_id: execution.id,
      status: execution.status,
      skipped: true,
    };
  }

  await db.internalBacktestExecution.update({
    where: { id: execution.id },
    data: {
      status: 'running',
      startedAt: now(),
      errorCode: null,
      errorMessage: null,
    },
  });

  const executionContext = extractExecutionTargetContext(execution.inputSnapshotJson);
  const startedMs = Date.now();
  try {
    const runInput: RunExecutionServiceInput = {
      executionId: execution.id,
      strategyRuleVersionId: execution.strategyRuleVersionId,
      inputSnapshotJson: execution.inputSnapshotJson,
      engineVersion: execution.engineVersion,
    };
    const output = await runExecution(runInput);
    const validatedSummary = validateResultSummarySchema(output.resultSummary as unknown);
    const validatedArtifactPointer = validateArtifactPointerSchema(output.artifactPointer as unknown);

    const succeeded = await db.internalBacktestExecution.update({
      where: { id: execution.id },
      data: {
        status: 'succeeded',
        finishedAt: now(),
        inputSnapshotJson: (output.inputSnapshot ?? execution.inputSnapshotJson) as Prisma.InputJsonValue,
        resultSummaryJson: validatedSummary as unknown as Prisma.InputJsonValue,
        artifactPointerJson: validatedArtifactPointer as unknown as Prisma.InputJsonValue,
        errorCode: null,
        errorMessage: null,
      },
    });

    if (
      output.artifactPayload &&
      typeof output.artifactPayload === 'object' &&
      output.artifactPointer &&
      typeof output.artifactPointer === 'object' &&
      'path' in (output.artifactPointer as Record<string, unknown>) &&
      typeof (output.artifactPointer as Record<string, unknown>).path === 'string'
    ) {
      const artifactPath = (output.artifactPointer as Record<string, unknown>).path as string;
      await db.internalBacktestExecutionArtifact.upsert({
        where: {
          executionId_kind: {
            executionId: execution.id,
            kind: 'engine_actual_trades_and_equity',
          },
        },
        create: {
          executionId: execution.id,
          kind: 'engine_actual_trades_and_equity',
          path: artifactPath,
          payloadJson: output.artifactPayload as Prisma.InputJsonValue,
        },
        update: {
          path: artifactPath,
          payloadJson: output.artifactPayload as Prisma.InputJsonValue,
        },
      });
    }

    if (output.dataSourceFetchObservation?.retryAttempted) {
      await recordInternalBacktestDataSourceRetryOutcomeEvent(
        {
          occurredAt: now(),
          executionId: execution.id,
          providerName: output.dataSourceFetchObservation.providerName,
          internalReasonCode: output.dataSourceFetchObservation.internalReasonCode,
          symbol: executionContext.symbol,
          market: executionContext.market,
          timeframe: executionContext.timeframe,
          from: executionContext.from,
          to: executionContext.to,
          elapsedMs: Date.now() - startedMs,
          httpStatus: output.dataSourceFetchObservation.httpStatus,
          endpointKind: output.dataSourceFetchObservation.endpointKind,
          retryTarget: output.dataSourceFetchObservation.retryTarget,
          retryAttempted: output.dataSourceFetchObservation.retryAttempted,
          retryAttempts: output.dataSourceFetchObservation.retryAttempts,
          outcome: 'retried_and_succeeded',
        },
        { db: db as never },
      );
    }

    return {
      execution_id: succeeded.id,
      status: succeeded.status,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'internal_backtest_execution_failed';
    const errorCode =
      isDataSourceUnavailableError(error)
        ? INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE
        : !!error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code?: string }).code === INVALID_EXECUTION_TARGET_CODE
          ? INVALID_EXECUTION_TARGET_CODE
        : errorMessage.includes('result_summary') ||
            errorMessage.includes('artifact_pointer') ||
            errorMessage.includes('data_source_snapshot') ||
            errorMessage.includes('schema_version') ||
            errorMessage.includes('input_snapshot')
          ? INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID_CODE
          : INTERNAL_BACKTEST_EXECUTION_FAILED_CODE;

    const dataSourceMeta = isDataSourceUnavailableError(error)
      ? extractDataSourceUnavailableMeta(error)
      : {
          internalReasonCode: null,
          providerName: null,
          httpStatus: null,
          endpointKind: null,
          retryAttempted: null,
          retryAttempts: null,
          retryTarget: null,
        };

    const elapsedMs = Date.now() - startedMs;
    if (isDataSourceUnavailableError(error)) {
      await recordInternalBacktestDataSourceUnavailableEvent({
        occurredAt: now(),
        executionId: execution.id,
        providerName: dataSourceMeta.providerName,
        internalReasonCode: dataSourceMeta.internalReasonCode,
        symbol: executionContext.symbol,
        market: executionContext.market,
        timeframe: executionContext.timeframe,
        from: executionContext.from,
        to: executionContext.to,
        elapsedMs,
        httpStatus: dataSourceMeta.httpStatus,
        endpointKind: dataSourceMeta.endpointKind,
      }, { db: db as never });
      await recordInternalBacktestDataSourceRetryOutcomeEvent(
        {
          occurredAt: now(),
          executionId: execution.id,
          providerName: dataSourceMeta.providerName,
          internalReasonCode: dataSourceMeta.internalReasonCode,
          symbol: executionContext.symbol,
          market: executionContext.market,
          timeframe: executionContext.timeframe,
          from: executionContext.from,
          to: executionContext.to,
          elapsedMs,
          httpStatus: dataSourceMeta.httpStatus,
          endpointKind: dataSourceMeta.endpointKind,
          retryTarget: dataSourceMeta.retryTarget ?? false,
          retryAttempted: dataSourceMeta.retryAttempted ?? false,
          retryAttempts: dataSourceMeta.retryAttempts ?? 1,
          outcome:
            dataSourceMeta.retryAttempted === true
              ? 'retried_and_failed'
              : 'not_retried_failed',
        },
        { db: db as never },
      );
    }

    const failed = await db.internalBacktestExecution.update({
      where: { id: execution.id },
      data: {
        status: 'failed',
        finishedAt: now(),
        errorCode,
        errorMessage,
      },
    });

    return {
      execution_id: failed.id,
      status: failed.status,
      error_code: failed.errorCode,
      error_message: failed.errorMessage,
      internal_reason_code: dataSourceMeta.internalReasonCode,
      provider_name: dataSourceMeta.providerName,
      symbol: executionContext.symbol,
      market: executionContext.market,
      timeframe: executionContext.timeframe,
      from: executionContext.from,
      to: executionContext.to,
      elapsed_ms: elapsedMs,
      http_status: dataSourceMeta.httpStatus,
      endpoint_kind: dataSourceMeta.endpointKind,
      retry_attempted: dataSourceMeta.retryAttempted,
      retry_attempts: dataSourceMeta.retryAttempts,
      retry_target: dataSourceMeta.retryTarget,
    };
  }
}

export function setupInternalBacktestWorker(logger: WorkerLogger, deps: SetupWorkerDeps = {}) {
  const worker = new Worker(
    INTERNAL_BACKTEST_EXECUTION_QUEUE,
    async (job: Job<InternalBacktestExecutionJobData>) => {
      logger.info({
        event: 'internal_backtest_worker_job_received',
        queue: INTERNAL_BACKTEST_EXECUTION_QUEUE,
        job_id: job.id,
        job_name: job.name,
        execution_id: job.data?.executionId,
      });

      if (job.name !== RUN_INTERNAL_BACKTEST_EXECUTION_JOB) {
        logger.warn({
          event: 'internal_backtest_worker_unknown_job',
          queue: INTERNAL_BACKTEST_EXECUTION_QUEUE,
          job_id: job.id,
          job_name: job.name,
        });
        return { status: 'skipped_unknown' };
      }

      const result = await processInternalBacktestExecution(job.data, {
        db: deps.db,
        now: deps.now,
        runExecution: deps.runExecution,
      });
      if (
        result &&
        typeof result === 'object' &&
        'status' in result &&
        (result as { status?: string }).status === 'failed' &&
        'error_code' in result &&
        (result as { error_code?: string }).error_code === INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE
      ) {
        logger.error({
          event: 'internal_backtest_data_source_unavailable',
          execution_id: (result as { execution_id?: string }).execution_id,
          error_code: (result as { error_code?: string }).error_code,
          provider_name: (result as { provider_name?: string | null }).provider_name,
          internal_reason_code: (result as { internal_reason_code?: string | null }).internal_reason_code,
          symbol: (result as { symbol?: string | null }).symbol,
          market: (result as { market?: string | null }).market,
          timeframe: (result as { timeframe?: string | null }).timeframe,
          from: (result as { from?: string | null }).from,
          to: (result as { to?: string | null }).to,
          elapsed_ms: (result as { elapsed_ms?: number | null }).elapsed_ms,
          http_status: (result as { http_status?: number | null }).http_status,
          endpoint_kind: (result as { endpoint_kind?: string | null }).endpoint_kind,
          retry_attempted: (result as { retry_attempted?: boolean | null }).retry_attempted,
          retry_attempts: (result as { retry_attempts?: number | null }).retry_attempts,
          retry_target: (result as { retry_target?: boolean | null }).retry_target,
        });
      }
      return result;
    },
    {
      // @ts-ignore ioredis type mismatch with BullMQ expected connection type
      connection: deps.queueConnection ?? redis,
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    logger.info({
      event: 'internal_backtest_worker_job_completed',
      queue: INTERNAL_BACKTEST_EXECUTION_QUEUE,
      job_id: job.id,
      job_name: job.name,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error({
      event: 'internal_backtest_worker_job_failed',
      queue: INTERNAL_BACKTEST_EXECUTION_QUEUE,
      job_id: job?.id,
      job_name: job?.name,
      error: err.message,
    });
  });

  return worker;
}
