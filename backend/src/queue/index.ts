import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../redis';
import { prisma } from '../db';
import crypto from 'crypto';
import { AiRouter } from '../ai/router';
import { buildAlertSummaryContext } from '../ai/context-builder';
import {
  mockReferenceCollector,
  buildDedupeKey,
  AlertReferenceCollectionContext,
} from '../references/collector';

// ─── Queue Definition ──────────────────────────────────────────────────────
export const WEBHOOK_PROCESS_QUEUE = 'webhook_process_queue';

export const webhookQueue = new Queue(WEBHOOK_PROCESS_QUEUE, {
  // @ts-ignore – ioredis type mismatch with BullMQ expected connection type
  connection: redis,
});

// ─── Worker ────────────────────────────────────────────────────────────────
export const setupWorker = (logger: any) => {
  const worker = new Worker(
    WEBHOOK_PROCESS_QUEUE,
    async (job: Job) => {
      logger.info({
        event: 'worker_job_received',
        job_id: job.id,
        job_name: job.name,
        data: job.data,
      });

      // ── A. collect_references_for_alert ─────────────────────────────────
      if (job.name === 'collect_references_for_alert') {
        return await handleCollectReferences(job, logger);
      }

      // ── B. process_alert_event (AI summary generation) ───────────────────
      if (job.name === 'process_alert_event') {
        return await handleGenerateAlertSummary(job, logger);
      }

      logger.warn({ event: 'worker_unknown_job', job_name: job.name });
      return { status: 'skipped_unknown' };
    },
    {
      // @ts-ignore – ioredis type mismatch
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

// ─── Handler: collect_references_for_alert ────────────────────────────────
// docs/6 §15: アラート起点収集フロー
async function handleCollectReferences(job: Job, logger: any) {
  const { alert_event_id, ai_job_id } = job.data as {
    alert_event_id: string;
    ai_job_id: string;
  };

  // 1. Transition ai_job: queued → running
  await prisma.aiJob.update({
    where: { id: ai_job_id },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    // 2. Load alert event + symbol for context
    const alertEvent = await prisma.alertEvent.findUniqueOrThrow({
      where: { id: alert_event_id },
      include: { symbol: true },
    });

    const ctx: AlertReferenceCollectionContext = {
      alertEventId: alert_event_id,
      symbolId: alertEvent.symbolId,
      symbolCode: alertEvent.symbol?.symbolCode ?? null,
      displayName: alertEvent.symbol?.displayName ?? null,
      tradingviewSymbol: alertEvent.symbol?.tradingviewSymbol ?? null,
      alertType: alertEvent.alertType,
      alertName: alertEvent.alertName,
      triggeredAt: alertEvent.triggeredAt,
    };

    // 3. Collect references via adapter (mock now, real API later)
    const collector = mockReferenceCollector;
    const collected = await collector.collectForAlert(ctx);

    logger.info({
      event: 'references_collected',
      alert_event_id,
      count: collected.length,
    });

    // 4. Save with deduplication (docs/6 §14.3: same source_url = skip)
    let savedCount = 0;
    let skippedCount = 0;
    const savedRefIds: string[] = [];

    for (const ref of collected) {
      const dedupeKey = buildDedupeKey(
        alertEvent.symbolId,
        ref.sourceUrl,
        ref.referenceType,
        ref.title,
      );

      try {
        const saved = await prisma.externalReference.create({
          data: {
            symbolId: alertEvent.symbolId,
            alertEventId: alert_event_id,
            referenceType: ref.referenceType,
            title: ref.title,
            sourceName: ref.sourceName,
            sourceUrl: ref.sourceUrl,
            publishedAt: ref.publishedAt,
            summaryText: ref.summaryText,
            metadataJson: ref.metadataJson as any,
            dedupeKey,
            relevanceScore: ref.relevanceScore,
          },
        });
        savedRefIds.push(saved.id);
        savedCount++;
      } catch (e: any) {
        if (e.code === 'P2002') {
          // Unique constraint violation = already exists (deduplication)
          skippedCount++;
          // Still try to get the existing record's id for reference
          const existing = await prisma.externalReference.findUnique({ where: { dedupeKey } });
          if (existing) savedRefIds.push(existing.id);
          logger.info({ event: 'reference_dedupe_skip', dedupeKey });
        } else {
          throw e;
        }
      }
    }

    logger.info({
      event: 'references_saved',
      alert_event_id,
      saved_count: savedCount,
      skipped_count: skippedCount,
    });

    // 5. Transition collect job: running → succeeded
    await prisma.aiJob.update({
      where: { id: ai_job_id },
      data: {
        status: 'succeeded',
        completedAt: new Date(),
        responsePayload: { saved_count: savedCount, skipped_count: skippedCount, ref_ids: savedRefIds } as any,
      },
    });

    // 6. Chain: enqueue the summary job (passed as next_job payload from webhook)
    // docs/6 §15.4: 「alert summary AIジョブ起動」
    const nextJob = (job.data as any).next_job;
    if (nextJob?.name === 'process_alert_event' && nextJob.ai_job_id) {
      await webhookQueue.add('process_alert_event', {
        alert_event_id: nextJob.alert_event_id,
        ai_job_id: nextJob.ai_job_id,
      });
      logger.info({
        event: 'summary_job_enqueued',
        alert_event_id,
        ai_job_id: nextJob.ai_job_id,
      });
    }

    return { status: 'success', saved_count: savedCount, ref_ids: savedRefIds };

  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'references_collection_failed', alert_event_id, error: errorMessage });

    // Mark collect job as failed
    await prisma.aiJob.update({
      where: { id: ai_job_id },
      data: { status: 'failed', completedAt: new Date(), errorMessage },
    });

    // docs/6 §19.4: 「何も取れない場合でも失敗扱いにせず、根拠不足と明示したAI要約へ進める」
    // Option A: even on collect failure, ALWAYS enqueue the summary job
    // so it runs with 0 references → insufficient_context=true
    // This prevents the summary ai_job from being stranded in "queued" forever.
    const nextJob = (job.data as any).next_job;
    if (nextJob?.name === 'process_alert_event' && nextJob.ai_job_id) {
      await webhookQueue.add('process_alert_event', {
        alert_event_id: nextJob.alert_event_id,
        ai_job_id: nextJob.ai_job_id,
      });
      logger.warn({
        event: 'summary_job_enqueued_after_collect_failure',
        alert_event_id,
        collect_error: errorMessage,
        summary_ai_job_id: nextJob.ai_job_id,
      });
    } else {
      // No next_job to chain — if somehow we reach here, log clearly
      logger.error({
        event: 'collect_failed_no_summary_job_found',
        alert_event_id,
        note: 'summary ai_job may be orphaned — investigate',
      });
    }

    // Do NOT re-throw: collect failure is non-fatal (docs/6 §19.4)
    // BullMQ will mark the job as "completed" (not failed), but the ai_job DB
    // record correctly reflects status=failed. The summary will note insufficient_context.
    return { status: 'collect_failed_summary_proceeding', error: errorMessage };
  }
}


// ─── Handler: process_alert_event (AI summary) ────────────────────────────
async function handleGenerateAlertSummary(job: Job, logger: any) {
  const { alert_event_id, ai_job_id } = job.data as {
    alert_event_id: string;
    ai_job_id: string;
  };

  // 1. Transition: queued → running
  await prisma.aiJob.update({
    where: { id: ai_job_id },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    // 2. Build context from alert_event (now includes references)
    const context = await buildAlertSummaryContext(alert_event_id);

    // 3. Compute input snapshot hash for idempotency
    const inputSnapshot = JSON.stringify({
      alertEventId: context.alertEventId,
      alertName: context.alertName,
      alertType: context.alertType,
      timeframe: context.timeframe,
      triggerPrice: context.triggerPrice,
      triggeredAt: context.triggeredAt?.toISOString(),
      symbolId: context.symbol?.id ?? null,
      referenceIds: context.referenceIds, // include references in hash
    });
    const inputSnapshotHash = crypto.createHash('sha256').update(inputSnapshot).digest('hex');

    // 4. Idempotency check
    const existing = await prisma.aiSummary.findFirst({
      where: { targetEntityId: alert_event_id, targetEntityType: 'alert_event', inputSnapshotHash },
    });
    if (existing) {
      logger.info({ event: 'ai_summary_already_exists', alert_event_id, summary_id: existing.id });
      await prisma.aiJob.update({
        where: { id: ai_job_id },
        data: { status: 'succeeded', completedAt: new Date(), responsePayload: { skipped: 'duplicate', summary_id: existing.id } as any },
      });
      await prisma.alertEvent.update({ where: { id: alert_event_id }, data: { processingStatus: 'completed' } });
      return { status: 'skipped_duplicate' };
    }

    // 5. Run AI via AiRouter: Qwen3-first, GPT-5 mini on escalation (docs/28 §7)
    const router = new AiRouter();
    const { output, log } = await router.generateAlertSummary(context);
    const generatedAt = new Date();

    // Log AI execution details (docs/28 §11, docs/20 §9.5)
    logger.info({
      event: 'ai_summary_generated',
      alert_event_id,
      ai_job_id,
      initial_model: log.initialModel,
      final_model: log.finalModel,
      escalated: log.escalated,
      escalation_reason: log.escalationReason,
      retry_count: log.retryCount,
      duration_ms: log.durationMs,
      estimated_tokens: log.estimatedTokens,
      estimated_cost_usd: log.estimatedCostUsd,
      reference_count: context.referenceIds.length,
    });

    // 6. Save ai_summary with reference_ids in structured_json
    const aiSummary = await prisma.aiSummary.create({
      data: {
        aiJobId: ai_job_id,
        userId: null,
        summaryScope: 'alert_reason',
        targetEntityType: 'alert_event',
        targetEntityId: alert_event_id,
        title: output.title,
        bodyMarkdown: output.bodyMarkdown,
        structuredJson: output.structuredJson as any,
        modelName: output.modelName,
        promptVersion: output.promptVersion,
        generatedAt,
        inputSnapshotHash,
        generationContextJson: {
          alertName: context.alertName,
          alertType: context.alertType,
          timeframe: context.timeframe,
          symbolLabel: context.symbol?.displayName ?? context.symbol?.tradingviewSymbol ?? null,
          referenceCount: context.referenceIds.length,
          escalated: log.escalated,
          escalationReason: log.escalationReason,
        } as any,
      },
    });

    // 7. Transition: running → succeeded, persist execution log fields
    await prisma.aiJob.update({
      where: { id: ai_job_id },
      data: {
        status: 'succeeded',
        completedAt: generatedAt,
        modelName: log.finalModel,
        promptVersion: output.promptVersion,
        // Execution log (docs/28 §11)
        initialModel:     log.initialModel,
        finalModel:       log.finalModel,
        escalated:        log.escalated,
        escalationReason: log.escalationReason,
        retryCount:       log.retryCount,
        durationMs:       log.durationMs,
        estimatedTokens:  log.estimatedTokens,
        estimatedCostUsd: log.estimatedCostUsd,
        responsePayload: { summary_id: aiSummary.id } as any,
      },
    });

    // 8. Update alert_event
    await prisma.alertEvent.update({
      where: { id: alert_event_id },
      data: { processingStatus: 'completed' },
    });

    return { status: 'success', summary_id: aiSummary.id };

  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'ai_summary_generation_failed', ai_job_id, alert_event_id, error: errorMessage });

    await prisma.aiJob.update({
      where: { id: ai_job_id },
      data: { status: 'failed', completedAt: new Date(), errorMessage },
    });
    await prisma.alertEvent.update({ where: { id: alert_event_id }, data: { processingStatus: 'failed' } });

    throw err;
  }
}

