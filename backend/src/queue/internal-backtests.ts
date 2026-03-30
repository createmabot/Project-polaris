import { Job, Queue, Worker } from 'bullmq';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { redis } from '../redis';
import {
  createDefaultResultSummary,
  validateResultSummarySchema,
  type InternalBacktestInputSnapshot,
} from '../internal-backtests/contracts';

export const INTERNAL_BACKTEST_EXECUTION_QUEUE = 'internal_backtest_execution_queue';
export const RUN_INTERNAL_BACKTEST_EXECUTION_JOB = 'run_internal_backtest_execution';
export const INTERNAL_BACKTEST_EXECUTION_FAILED_CODE = 'INTERNAL_BACKTEST_EXECUTION_FAILED';
export const INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID_CODE = 'INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID';

export type InternalBacktestExecutionJobData = {
  executionId: string;
};

type ExecutionOutput = {
  resultSummary: Prisma.InputJsonValue;
  artifactPointer?: Prisma.InputJsonValue | null;
};

type RunExecutionFn = (execution: {
  id: string;
  strategyRuleVersionId: string;
  inputSnapshotJson: unknown;
}) => Promise<ExecutionOutput>;

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
  const inputSnapshot =
    execution.inputSnapshotJson && typeof execution.inputSnapshotJson === 'object' && !Array.isArray(execution.inputSnapshotJson)
      ? (execution.inputSnapshotJson as InternalBacktestInputSnapshot)
      : null;
  if (!inputSnapshot) {
    throw new Error('input_snapshot_invalid');
  }
  const engineConfig =
    inputSnapshot.engine_config && typeof inputSnapshot.engine_config === 'object' && !Array.isArray(inputSnapshot.engine_config)
      ? (inputSnapshot.engine_config as Record<string, unknown>)
      : {};

  if (engineConfig.simulate_failure === true) {
    throw new Error('simulated_internal_backtest_failure');
  }

  return {
    resultSummary: createDefaultResultSummary({
      inputSnapshot,
      engineVersion: 'ibtx-v0',
    }),
    artifactPointer: {
      type: 'internal_backtest_execution',
      execution_id: execution.id,
      path: `/internal-backtests/executions/${execution.id}`,
    },
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

  try {
    const output = await runExecution({
      id: execution.id,
      strategyRuleVersionId: execution.strategyRuleVersionId,
      inputSnapshotJson: execution.inputSnapshotJson,
    });
    const validatedResultSummary = validateResultSummarySchema(output.resultSummary);

    const succeeded = await db.internalBacktestExecution.update({
      where: { id: execution.id },
      data: {
        status: 'succeeded',
        finishedAt: now(),
        resultSummaryJson: validatedResultSummary,
        artifactPointerJson: output.artifactPointer ?? Prisma.DbNull,
        errorCode: null,
        errorMessage: null,
      },
    });

    return {
      execution_id: succeeded.id,
      status: succeeded.status,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'internal_backtest_execution_failed';
    const errorCode =
      errorMessage.includes('result_summary') || errorMessage.includes('schema_version')
        ? INTERNAL_BACKTEST_RESULT_SCHEMA_INVALID_CODE
        : INTERNAL_BACKTEST_EXECUTION_FAILED_CODE;

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

      return processInternalBacktestExecution(job.data, {
        db: deps.db,
        now: deps.now,
        runExecution: deps.runExecution,
      });
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
