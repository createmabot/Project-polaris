import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { buildAlertSummaryContext } from '../ai/context-builder';
import { HomeAiService } from '../ai/home-ai-service';
import {
  getReferenceCountFromGenerationContext,
  normalizeInsufficientContext,
  withNormalizedInsufficientContext,
} from '../ai/insufficient-context';

type AlertSummaryView = {
  id: string | null;
  title: string | null;
  body_markdown: string | null;
  structured_json: Record<string, unknown> | null;
  generated_at: string | null;
  status: 'available' | 'unavailable';
  insufficient_context: boolean;
};

/**
 * AIジョブの運用追跡用ビュー。
 *
 * 注意: requestPayload（プロンプト全文）/ responsePayload（LLM出力詳細）は
 * 意図的に含めない。運用者が job_id と失敗理由を追えることが目的。
 */
type AlertJobView = {
  job_id: string;
  job_type: string;
  status: string;
  /** 失敗時のエラーメッセージ（短文）。secret・API key 等は含まれない。 */
  error_message: string | null;
  /** 最終採用モデル名。プロバイダー情報を追えるようにする。 */
  model_name: string | null;
  retry_count: number;
  created_at: string;
  completed_at: string | null;
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
  const referenceCount = getReferenceCountFromGenerationContext(summary.generationContextJson);
  const structured = withNormalizedInsufficientContext(summary.structuredJson, referenceCount);
  const insufficient = normalizeInsufficientContext(summary.structuredJson, referenceCount);
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

/**
 * API レスポンスにエラーメッセージを返す前にサニタイズを行う。
 * DB (ai_jobs.errorMessage) の内容はそのまま維持する。
 */
export function sanitizeErrorMessage(msg: string | null): string | null {
  if (!msg) return null;
  let sanitized = msg;

  // 1. sk- 形式のAPIキー（OpenAI / Stripeなど）
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9_-]{10,}/g, '[REDACTED]');
  
  // 2. Bearer トークン
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/ig, 'Bearer [REDACTED]');
  
  // 3. 一般的な秘匿情報のキーバリューパターン
  const secretKeys = ['api_key', 'token', 'shared_secret', 'password'];
  for (const key of secretKeys) {
    // Matches: key=value, key: value, "key":"value", 'key': 'value'
    const regex = new RegExp(`(["']?${key}["']?\\s*[:=]\\s*["']?)([^\\s"']+)`, 'ig');
    sanitized = sanitized.replace(regex, '$1[REDACTED]');
  }

  // 4. 文字数制限（長すぎるエラーメッセージによる情報漏洩やレイアウト崩れを防ぐ）
  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 500) + '...';
  }

  return sanitized;
}

/**
 * ai_jobs レコードから運用追跡用の最小ビューを構築する。
 *
 * 意図的に除外するフィールド:
 * - requestPayload: プロンプト全文が含まれる可能性がある
 * - responsePayload: LLM の生成物の詳細が含まれる
 * これらは DB または内部ログから確認すること。
 */
function buildLatestJobView(job: any | null): AlertJobView | null {
  if (!job) return null;
  return {
    job_id: job.id,
    job_type: job.jobType,
    status: job.status,
    error_message: sanitizeErrorMessage(job.errorMessage ?? null),
    model_name: job.modelName ?? job.finalModel ?? null,
    retry_count: job.retryCount ?? 0,
    created_at: new Date(job.createdAt).toISOString(),
    completed_at: job.completedAt ? new Date(job.completedAt).toISOString() : null,
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
    const normalizedStructuredJson = withNormalizedInsufficientContext(output.structuredJson, context.referenceIds.length);

    const created = await prisma.aiSummary.create({
      data: {
        aiJobId: summaryJob.id,
        userId: alertEvent.userId,
        summaryScope: 'alert_reason',
        targetEntityType: 'alert_event',
        targetEntityId: alertId,
        title: output.title,
        bodyMarkdown: output.bodyMarkdown,
        structuredJson: normalizedStructuredJson as any,
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

    // generate_alert_summary の最新ジョブ情報を返す（運用追跡用）
    // requestPayload / responsePayload は含めない（prompt全文・LLM出力詳細の漏洩防止）
    const latestJob = await prisma.aiJob.findFirst({
      where: {
        targetEntityType: 'alert_event',
        targetEntityId: alertId,
        jobType: 'generate_alert_summary',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        jobType: true,
        status: true,
        errorMessage: true,
        modelName: true,
        finalModel: true,
        retryCount: true,
        createdAt: true,
        completedAt: true,
        // requestPayload / responsePayload は意図的に除外
      },
    });

    return reply.status(200).send(formatSuccess(request, {
      alert_id: alertId,
      summary: toAlertSummaryView(summary),
      // failed 時に運用者が job_id と失敗理由を追えるようにする
      // summary が available の場合も含めることで一貫性を保つ
      latest_job: buildLatestJobView(latestJob),
    }));
  });
}

