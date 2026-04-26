import crypto from 'crypto';
import type { Job } from 'bullmq';
import { prisma as defaultPrisma } from '../db';
import { HomeAiService } from '../ai/home-ai-service';
import { buildAlertSummaryContext as defaultBuildAlertSummaryContext } from '../ai/context-builder';
import {
  referenceCollector as defaultReferenceCollector,
  buildDedupeKey,
  type AlertReferenceCollectionContext,
  type CollectedReference,
} from '../references/collector';

export type LoggerLike = {
  info: (payload: unknown) => void;
  warn: (payload: unknown) => void;
  error: (payload: unknown) => void;
};

export type QueueLike = {
  add: (name: string, data: unknown) => Promise<unknown>;
};

export type PrismaLike = {
  aiJob: {
    update: (args: any) => Promise<any>;
    findFirst?: (args: any) => Promise<any>;
    create?: (args: any) => Promise<any>;
  };
  alertEvent: {
    findUniqueOrThrow: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
    create?: (args: any) => Promise<any>;
  };
  externalReference: {
    create: (args: any) => Promise<any>;
    findUnique: (args: any) => Promise<any>;
  };
  aiSummary: {
    findFirst: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
  };
};

export type ReferenceCollectorLike = {
  collectForAlert: (ctx: AlertReferenceCollectionContext) => Promise<CollectedReference[]>;
};

export type BuildAlertSummaryContextLike = (alertEventId: string) => Promise<any>;

export type HomeAiServiceLike = {
  generateAlertSummary: (context: any) => Promise<{ output: any; log: any }>;
};

export type QueueHandlerDeps = {
  prisma: PrismaLike;
  referenceCollector: ReferenceCollectorLike;
  buildAlertSummaryContext: BuildAlertSummaryContextLike;
  createHomeAiService: () => HomeAiServiceLike;
  queue: QueueLike;
};

const defaultDeps: QueueHandlerDeps = {
  prisma: defaultPrisma as unknown as PrismaLike,
  referenceCollector: defaultReferenceCollector,
  buildAlertSummaryContext: defaultBuildAlertSummaryContext,
  createHomeAiService: () => new HomeAiService(),
  queue: {
    add: async () => {
      throw new Error('queue_not_initialized');
    },
  },
};

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function enqueueSummaryJobFromNextJob(nextJob: any, queue: QueueLike, logger: LoggerLike, payload: Record<string, unknown>) {
  if (nextJob?.name === 'process_alert_event' && nextJob.ai_job_id) {
    await queue.add('process_alert_event', {
      alert_event_id: nextJob.alert_event_id,
      ai_job_id: nextJob.ai_job_id,
    });
    logger.info(payload);
    return true;
  }

  return false;
}

export function createQueueJobHandlers(partialDeps: Partial<QueueHandlerDeps>) {
  const deps = { ...defaultDeps, ...partialDeps };

  async function handleCollectReferences(job: Job, logger: LoggerLike) {
    const { alert_event_id, ai_job_id } = job.data as {
      alert_event_id: string;
      ai_job_id: string;
    };

    await deps.prisma.aiJob.update({
      where: { id: ai_job_id },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      const alertEvent = await deps.prisma.alertEvent.findUniqueOrThrow({
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

      const collected = await deps.referenceCollector.collectForAlert(ctx);
      const sourceBreakdown = collected.reduce((acc: Record<string, number>, ref) => {
        acc[ref.sourceType] = (acc[ref.sourceType] ?? 0) + 1;
        return acc;
      }, {});

      logger.info({
        event: 'references_collected',
        alert_event_id,
        count: collected.length,
        source_breakdown: sourceBreakdown,
      });

      let savedCount = 0;
      let skippedCount = 0;
      const savedRefIds: string[] = [];

      for (const ref of collected) {
        const dedupeKey = buildDedupeKey({
          symbolId: alertEvent.symbolId,
          sourceName: ref.sourceName,
          sourceUrl: ref.sourceUrl,
          referenceType: ref.referenceType,
          title: ref.title,
          publishedAt: ref.publishedAt,
        });

        const metadataJson = {
          ...(ref.metadataJson ?? {}),
          source_type: ref.sourceType,
          category: ref.category ?? null,
          relevance_hint: ref.relevanceHint ?? null,
          raw_payload: ref.rawPayloadJson ?? null,
        };

        try {
          const saved = await deps.prisma.externalReference.create({
            data: {
              symbolId: alertEvent.symbolId,
              alertEventId: alert_event_id,
              referenceType: ref.referenceType,
              title: ref.title,
              sourceName: ref.sourceName,
              sourceUrl: ref.sourceUrl,
              publishedAt: ref.publishedAt,
              summaryText: ref.summaryText,
              metadataJson: metadataJson as any,
              dedupeKey,
              relevanceScore: ref.relevanceScore,
            },
          });
          savedRefIds.push(saved.id);
          savedCount++;
        } catch (e: any) {
          if (e.code === 'P2002') {
            skippedCount++;
            const existing = await deps.prisma.externalReference.findUnique({ where: { dedupeKey } });
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

      await deps.prisma.aiJob.update({
        where: { id: ai_job_id },
        data: {
          status: 'succeeded',
          completedAt: new Date(),
          responsePayload: { saved_count: savedCount, skipped_count: skippedCount, ref_ids: savedRefIds } as any,
        },
      });

      const nextJob = (job.data as any).next_job;
      await enqueueSummaryJobFromNextJob(nextJob, deps.queue, logger, {
        event: 'summary_job_enqueued',
        alert_event_id,
        ai_job_id: nextJob?.ai_job_id,
      });

      return { status: 'success', saved_count: savedCount, ref_ids: savedRefIds };
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      logger.error({ event: 'references_collection_failed', alert_event_id, error: errorMessage });

      await deps.prisma.aiJob.update({
        where: { id: ai_job_id },
        data: { status: 'failed', completedAt: new Date(), errorMessage },
      });

      const nextJob = (job.data as any).next_job;
      const enqueued = await enqueueSummaryJobFromNextJob(nextJob, deps.queue, logger, {
        event: 'summary_job_enqueued_after_collect_failure',
        alert_event_id,
        collect_error: errorMessage,
        summary_ai_job_id: nextJob?.ai_job_id,
      });

      if (!enqueued) {
        logger.error({
          event: 'collect_failed_no_summary_job_found',
          alert_event_id,
          note: 'summary ai_job may be orphaned - investigate',
        });
      }

      return { status: 'collect_failed_summary_proceeding', error: errorMessage };
    }
  }

  async function handleGenerateAlertSummary(job: Job, logger: LoggerLike) {
    const { alert_event_id, ai_job_id } = job.data as {
      alert_event_id: string;
      ai_job_id: string;
    };

    await deps.prisma.aiJob.update({
      where: { id: ai_job_id },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      const context = await deps.buildAlertSummaryContext(alert_event_id);
      const inputSnapshot = JSON.stringify({
        alertEventId: context.alertEventId,
        alertName: context.alertName,
        alertType: context.alertType,
        timeframe: context.timeframe,
        triggerPrice: context.triggerPrice,
        triggeredAt: context.triggeredAt?.toISOString(),
        symbolId: context.symbol?.id ?? null,
        referenceIds: context.referenceIds,
      });
      const inputSnapshotHash = crypto.createHash('sha256').update(inputSnapshot).digest('hex');

      const existing = await deps.prisma.aiSummary.findFirst({
        where: { targetEntityId: alert_event_id, targetEntityType: 'alert_event', inputSnapshotHash },
      });
      if (existing) {
        logger.info({ event: 'ai_summary_already_exists', alert_event_id, summary_id: existing.id });
        await deps.prisma.aiJob.update({
          where: { id: ai_job_id },
          data: {
            status: 'succeeded',
            completedAt: new Date(),
            responsePayload: { skipped: 'duplicate', summary_id: existing.id } as any,
          },
        });
        await deps.prisma.alertEvent.update({ where: { id: alert_event_id }, data: { processingStatus: 'completed' } });
        return { status: 'skipped_duplicate' };
      }

      const homeAiService = deps.createHomeAiService();
      const { output, log } = await homeAiService.generateAlertSummary(context);
      const generatedAt = new Date();

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

      const aiSummary = await deps.prisma.aiSummary.create({
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
            provider: log.provider,
            fallbackToStub: log.fallbackToStub,
            escalated: log.escalated,
            escalationReason: log.escalationReason,
          } as any,
        },
      });

      await deps.prisma.aiJob.update({
        where: { id: ai_job_id },
        data: {
          status: 'succeeded',
          completedAt: generatedAt,
          modelName: log.finalModel,
          promptVersion: output.promptVersion,
          initialModel: log.initialModel,
          finalModel: log.finalModel,
          escalated: log.escalated,
          escalationReason: log.escalationReason,
          retryCount: log.retryCount,
          durationMs: log.durationMs,
          estimatedTokens: log.estimatedTokens,
          estimatedCostUsd: log.estimatedCostUsd,
          responsePayload: { summary_id: aiSummary.id } as any,
        },
      });

      await deps.prisma.alertEvent.update({
        where: { id: alert_event_id },
        data: { processingStatus: 'completed' },
      });

      return { status: 'success', summary_id: aiSummary.id };
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      // 失敗理由を構造化ログで記録（job_id / job_type / target / error）
      // provider や secret は含めない
      logger.error({
        event: 'ai_summary_generation_failed',
        job_type: 'generate_alert_summary',
        ai_job_id,
        alert_event_id,
        error: errorMessage,
      });

      await deps.prisma.aiJob.update({
        where: { id: ai_job_id },
        data: { status: 'failed', completedAt: new Date(), errorMessage },
      });
      await deps.prisma.alertEvent.update({ where: { id: alert_event_id }, data: { processingStatus: 'failed' } });

      throw err;
    }
  }

  return {
    handleCollectReferences,
    handleGenerateAlertSummary,
  };
}

export const { handleCollectReferences, handleGenerateAlertSummary } = createQueueJobHandlers({});
