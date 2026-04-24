import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { buildAlertSummaryContext } from '../ai/context-builder';
import { HomeAiService } from '../ai/home-ai-service';

type AlertSummaryView = {
  id: string | null;
  title: string | null;
  body_markdown: string | null;
  structured_json: Record<string, unknown> | null;
  generated_at: string | null;
  status: 'available' | 'unavailable';
  insufficient_context: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toAlertSummaryView(summary: any | null): AlertSummaryView {
  if (!summary) {
    return {
      id: null,
      title: null,
      body_markdown: null,
      structured_json: null,
      generated_at: null,
      status: 'unavailable',
      insufficient_context: true,
    };
  }
  const structured = isRecord(summary.structuredJson) ? summary.structuredJson : null;
  const insufficient =
    structured && typeof structured.insufficient_context === 'boolean'
      ? structured.insufficient_context
      : false;
  return {
    id: summary.id,
    title: summary.title ?? null,
    body_markdown: summary.bodyMarkdown ?? null,
    structured_json: structured,
    generated_at: summary.generatedAt ? new Date(summary.generatedAt).toISOString() : null,
    status: 'available',
    insufficient_context: insufficient,
  };
}

async function generateAlertSummaryWithJob(alertId: string) {
  const alertEvent = await prisma.alertEvent.findUnique({
    where: { id: alertId },
    include: { externalReferences: true },
  });
  if (!alertEvent) {
    throw new AppError(404, 'ALERT_NOT_FOUND', 'The specified alert was not found.');
  }

  const collectJob = await prisma.aiJob.create({
    data: {
      jobType: 'collect_references_for_alert',
      targetEntityType: 'alert_event',
      targetEntityId: alertId,
      requestPayload: { alert_event_id: alertId } as any,
      status: 'queued',
    },
  });

  await prisma.aiJob.update({
    where: { id: collectJob.id },
    data: {
      status: 'running',
      startedAt: new Date(),
    },
  });

  await prisma.aiJob.update({
    where: { id: collectJob.id },
    data: {
      status: 'succeeded',
      completedAt: new Date(),
      responsePayload: {
        reference_count: alertEvent.externalReferences.length,
        note: 'minimal flow: existing references used',
      } as any,
    },
  });

  const summaryJob = await prisma.aiJob.create({
    data: {
      jobType: 'generate_alert_summary',
      targetEntityType: 'alert_event',
      targetEntityId: alertId,
      requestPayload: { alert_event_id: alertId } as any,
      status: 'queued',
    },
  });

  await prisma.aiJob.update({
    where: { id: summaryJob.id },
    data: {
      status: 'running',
      startedAt: new Date(),
    },
  });

  try {
    const context = await buildAlertSummaryContext(alertId);
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

    const existing = await prisma.aiSummary.findFirst({
      where: {
        targetEntityType: 'alert_event',
        targetEntityId: alertId,
        summaryScope: 'alert_reason',
        inputSnapshotHash,
      },
      orderBy: { generatedAt: 'desc' },
    });
    if (existing) {
      await prisma.aiJob.update({
        where: { id: summaryJob.id },
        data: {
          status: 'succeeded',
          completedAt: new Date(),
          responsePayload: {
            summary_id: existing.id,
            skipped: 'duplicate',
          } as any,
          modelName: existing.modelName,
          promptVersion: existing.promptVersion,
        },
      });
      return { jobId: summaryJob.id, summary: existing };
    }

    const homeAiService = new HomeAiService();
    const { output, log } = await homeAiService.generateAlertSummary(context);
    const generatedAt = new Date();

    const created = await prisma.aiSummary.create({
      data: {
        aiJobId: summaryJob.id,
        userId: alertEvent.userId,
        summaryScope: 'alert_reason',
        targetEntityType: 'alert_event',
        targetEntityId: alertId,
        title: output.title,
        bodyMarkdown: output.bodyMarkdown,
        structuredJson: output.structuredJson as any,
        modelName: output.modelName,
        promptVersion: output.promptVersion,
        generatedAt,
        inputSnapshotHash,
        generationContextJson: {
          reference_count: context.referenceIds.length,
          provider: log.provider,
          fallback_to_stub: log.fallbackToStub,
        } as any,
      },
    });

    await prisma.aiJob.update({
      where: { id: summaryJob.id },
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
        responsePayload: { summary_id: created.id } as any,
      },
    });

    await prisma.alertEvent.update({
      where: { id: alertId },
      data: { processingStatus: 'completed' },
    });

    return { jobId: summaryJob.id, summary: created };
  } catch (error) {
    await prisma.aiJob.update({
      where: { id: summaryJob.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    await prisma.alertEvent.update({
      where: { id: alertId },
      data: { processingStatus: 'failed' },
    });
    throw error;
  }
}

export async function alertRoutes(fastify: FastifyInstance) {
  fastify.get('/:alertId', async (
    request: FastifyRequest<{ Params: { alertId: string } }>,
    reply: FastifyReply,
  ) => {
    const { alertId } = request.params;

    const alertEvent = await prisma.alertEvent.findUnique({
      where: { id: alertId },
      include: {
        symbol: true,
        externalReferences: {
          orderBy: { publishedAt: 'desc' },
        },
      },
    });

    if (!alertEvent) {
      throw new AppError(404, 'ALERT_NOT_FOUND', 'The specified alert was not found.');
    }

    const relatedSummary = await prisma.aiSummary.findFirst({
      where: {
        targetEntityType: 'alert_event',
        targetEntityId: alertId,
        summaryScope: 'alert_reason',
      },
      orderBy: { generatedAt: 'desc' },
    });

    const data = {
      alert_event: alertEvent,
      symbol: alertEvent.symbol || null,
      related_references: alertEvent.externalReferences,
      related_ai_summary: relatedSummary || null,
      processing_status: alertEvent.processingStatus,
    };

    return reply.status(200).send(formatSuccess(request, data));
  });

  fastify.post('/:alertId/summary/generate', async (
    request: FastifyRequest<{ Params: { alertId: string } }>,
    reply: FastifyReply,
  ) => {
    const { alertId } = request.params;
    const result = await generateAlertSummaryWithJob(alertId);
    return reply.status(200).send(formatSuccess(request, {
      alert_id: alertId,
      job_id: result.jobId,
      summary: toAlertSummaryView(result.summary),
    }));
  });

  fastify.get('/:alertId/summary', async (
    request: FastifyRequest<{ Params: { alertId: string } }>,
    reply: FastifyReply,
  ) => {
    const { alertId } = request.params;
    const alert = await prisma.alertEvent.findUnique({
      where: { id: alertId },
      select: { id: true },
    });
    if (!alert) {
      throw new AppError(404, 'ALERT_NOT_FOUND', 'The specified alert was not found.');
    }

    const summary = await prisma.aiSummary.findFirst({
      where: {
        targetEntityType: 'alert_event',
        targetEntityId: alertId,
        summaryScope: 'alert_reason',
      },
      orderBy: { generatedAt: 'desc' },
    });

    return reply.status(200).send(formatSuccess(request, {
      alert_id: alertId,
      summary: toAlertSummaryView(summary),
    }));
  });
}

