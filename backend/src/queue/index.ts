import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../redis';
import { createQueueJobHandlers } from './handlers';

export const WEBHOOK_PROCESS_QUEUE = 'webhook_process_queue';

export const webhookQueue = new Queue(WEBHOOK_PROCESS_QUEUE, {
  // @ts-ignore ioredis type mismatch with BullMQ expected connection type
  connection: redis,
});

export const setupWorker = (logger: any) => {
  const handlers = createQueueJobHandlers({ queue: webhookQueue });

  const worker = new Worker(
    WEBHOOK_PROCESS_QUEUE,
    async (job: Job) => {
      logger.info({
        event: 'worker_job_received',
        job_id: job.id,
        job_name: job.name,
        data: job.data,
      });

      if (job.name === 'collect_references_for_alert') {
        return await handlers.handleCollectReferences(job, logger);
      }

      if (job.name === 'process_alert_event') {
        return await handlers.handleGenerateAlertSummary(job, logger);
      }

      logger.warn({ event: 'worker_unknown_job', job_name: job.name });
      return { status: 'skipped_unknown' };
    },
    {
      // @ts-ignore ioredis type mismatch
      connection: redis,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ event: 'ai_job_bullmq_completed', job_id: job.id, job_name: job.name });
  });

  worker.on('failed', (job, err) => {
    logger.error({ event: 'ai_job_bullmq_failed', job_id: job?.id, job_name: job?.name, error: err.message });
  });

  return worker;
};
