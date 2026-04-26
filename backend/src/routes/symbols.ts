import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { getCurrentSnapshotForSymbol } from '../market/snapshot';
import { HomeAiService } from '../ai/home-ai-service';

type JsonObject = Record<string, unknown>;
type SymbolSummaryScope = 'thesis' | 'latest';

type SymbolSummaryView = {
  summary_id: string | null;
  title: string | null;
  body_markdown: string | null;
  structured_json: Record<string, unknown> | null;
  generated_at: string | null;
  status: 'available' | 'unavailable';
  insufficient_context: boolean;
  scope: SymbolSummaryScope;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSymbolSummaryScope(input?: string): SymbolSummaryScope {
  const normalized = (input ?? 'thesis').trim().toLowerCase();
  if (normalized === '' || normalized === 'thesis') {
    return 'thesis';
  }
  if (normalized === 'latest') {
    return 'latest';
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'scope must be one of thesis|latest');
}

function toSymbolSummaryView(summary: any | null, scope: SymbolSummaryScope): SymbolSummaryView {
  if (!summary) {
    return {
      summary_id: null,
      title: null,
      body_markdown: null,
      structured_json: null,
      generated_at: null,
      status: 'unavailable',
      insufficient_context: true,
      scope,
    };
  }
  const structured = isObject(summary.structuredJson) ? summary.structuredJson : null;
  const insufficient =
    structured && typeof structured.insufficient_context === 'boolean'
      ? structured.insufficient_context
      : false;

  return {
    summary_id: summary.id,
    title: summary.title ?? null,
    body_markdown: summary.bodyMarkdown ?? null,
    structured_json: structured,
    generated_at: summary.generatedAt ? new Date(summary.generatedAt).toISOString() : null,
    status: 'available',
    insufficient_context: insufficient,
    scope,
  };
}

async function resolveSymbolSummary(symbolId: string, scope: SymbolSummaryScope): Promise<SymbolSummaryView> {
  const summary = await prisma.aiSummary.findFirst({
    where: {
      targetEntityType: 'symbol',
      targetEntityId: symbolId,
      summaryScope: 'thesis',
    },
    orderBy: { generatedAt: 'desc' },
  });
  return toSymbolSummaryView(summary, scope);
}

async function generateSymbolSummaryWithJob(
  symbolId: string,
  params: { scope: SymbolSummaryScope; referenceIds: string[]; forceRegenerate: boolean },
  logger: FastifyInstance['log'],
): Promise<{ jobId: string; summary: SymbolSummaryView }> {
  const symbol = await prisma.symbol.findUnique({
    where: { id: symbolId },
  });
  if (!symbol) {
    throw new AppError(404, 'NOT_FOUND', 'The specified symbol was not found.');
  }

  const selectedReferences = params.referenceIds.length > 0
    ? await prisma.externalReference.findMany({
        where: {
          id: { in: params.referenceIds },
          symbolId,
        },
        select: {
          id: true,
          title: true,
          referenceType: true,
          summaryText: true,
          publishedAt: true,
          updatedAt: true,
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      })
    : [];

  const latestActiveNote = await prisma.researchNote.findFirst({
    where: {
      symbolId,
      status: 'active',
    },
    orderBy: { updatedAt: 'desc' },
  });

  const snapshot = await getCurrentSnapshotForSymbol(
    {
      id: symbol.id,
      symbol: symbol.symbol,
      symbolCode: symbol.symbolCode,
      marketCode: symbol.marketCode,
      tradingviewSymbol: symbol.tradingviewSymbol,
    },
    logger,
  );

  const summaryJob = await prisma.aiJob.create({
    data: {
      jobType: 'generate_symbol_thesis_summary',
      targetEntityType: 'symbol',
      targetEntityId: symbolId,
      requestPayload: {
        symbol_id: symbolId,
        scope: params.scope,
        reference_ids: params.referenceIds,
        force_regenerate: params.forceRegenerate,
      } as any,
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
    const inputSnapshot = JSON.stringify({
      symbolId,
      scope: params.scope,
      references: selectedReferences
        .map((reference) => ({
          id: reference.id,
          title: reference.title,
          reference_type: reference.referenceType,
          summary_text: reference.summaryText,
          published_at: reference.publishedAt ? reference.publishedAt.toISOString() : null,
          updated_at: reference.updatedAt.toISOString(),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      snapshot: snapshot
        ? {
            last_price: snapshot.last_price,
            change_percent: snapshot.change_percent,
            as_of: snapshot.as_of,
          }
        : null,
      note: latestActiveNote
        ? {
            id: latestActiveNote.id,
            title: latestActiveNote.title,
            thesis_text: latestActiveNote.thesisText ?? null,
            updated_at: latestActiveNote.updatedAt.toISOString(),
          }
        : null,
    });
    const inputSnapshotHash = crypto.createHash('sha256').update(inputSnapshot).digest('hex');

    const existing = await prisma.aiSummary.findFirst({
      where: {
        targetEntityType: 'symbol',
        targetEntityId: symbolId,
        summaryScope: 'thesis',
        inputSnapshotHash,
      },
      orderBy: { generatedAt: 'desc' },
    });
    if (existing && !params.forceRegenerate) {
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
      return { jobId: summaryJob.id, summary: toSymbolSummaryView(existing, params.scope) };
    }

    const homeAiService = new HomeAiService();
    const { output, log } = await homeAiService.generateSymbolThesisSummary({
      scope: params.scope,
      symbol: {
        id: symbol.id,
        symbol: symbol.symbol,
        symbolCode: symbol.symbolCode,
        displayName: symbol.displayName,
        marketCode: symbol.marketCode,
        tradingviewSymbol: symbol.tradingviewSymbol,
      },
      referenceIds: selectedReferences.map((reference) => reference.id),
      references: selectedReferences.map((reference) => ({
        id: reference.id,
        title: reference.title,
        referenceType: reference.referenceType,
        summaryText: reference.summaryText,
        publishedAt: reference.publishedAt ? reference.publishedAt.toISOString() : null,
      })),
      snapshot: snapshot
        ? {
            lastPrice: snapshot.last_price,
            changePercent: snapshot.change_percent,
            asOf: snapshot.as_of,
          }
        : null,
      latestNoteSummary: latestActiveNote
        ? {
            noteId: latestActiveNote.id,
            title: latestActiveNote.title,
            thesisText: latestActiveNote.thesisText ?? null,
            updatedAt: latestActiveNote.updatedAt.toISOString(),
          }
        : null,
    });

    const generatedAt = new Date();
    const created = await prisma.aiSummary.create({
      data: {
        aiJobId: summaryJob.id,
        userId: latestActiveNote?.userId ?? null,
        summaryScope: 'thesis',
        targetEntityType: 'symbol',
        targetEntityId: symbolId,
        title: output.title,
        bodyMarkdown: output.bodyMarkdown,
        structuredJson: output.structuredJson as any,
        modelName: output.modelName,
        promptVersion: output.promptVersion,
        generatedAt,
        inputSnapshotHash,
        generationContextJson: {
          scope: params.scope,
          reference_count: selectedReferences.length,
          provider: log.provider,
          fallback_to_stub: log.fallbackToStub,
          has_snapshot: !!snapshot,
          has_note: !!latestActiveNote,
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

    return {
      jobId: summaryJob.id,
      summary: toSymbolSummaryView(created, params.scope),
    };
  } catch (error) {
    await prisma.aiJob.update({
      where: { id: summaryJob.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

function getAlertSummaryPoints(summary: { bodyMarkdown: string; structuredJson: unknown } | null): string[] {
  if (!summary) {
    return [];
  }

  const points: string[] = [];
  const structured = summary.structuredJson;
  const payload = isObject(structured) && isObject(structured.payload) ? structured.payload : null;

  const appendPoint = (value: unknown) => {
    if (typeof value === 'string') {
      const text = value.trim();
      if (text) {
        points.push(text);
      }
      return;
    }
    if (isObject(value) && typeof value.text === 'string') {
      const text = value.text.trim();
      if (text) {
        points.push(text);
      }
    }
  };

  if (payload) {
    const candidateKeys = [
      'what_happened',
      'highlights',
      'reasons',
      'key_points',
      'fact_points',
      'watch_points',
      'next_actions',
      'reason_hypotheses',
      'bullish_points',
      'bearish_points',
    ];

    for (const key of candidateKeys) {
      const candidate = payload[key];
      if (typeof candidate === 'string') {
        appendPoint(candidate);
        continue;
      }
      if (Array.isArray(candidate)) {
        candidate.forEach(appendPoint);
      }
    }
  }

  if (points.length === 0) {
    const fallback = summary.bodyMarkdown
      .split('\n')
      .map((line) => line
        .replace(/^[-*#>]\s*/, '')
        .replace(/\*\*/g, '')
        .trim())
      .filter((line) => line.length > 0)
      .slice(0, 3);
    points.push(...fallback);
  }

  return [...new Set(points)].slice(0, 3);
}

export async function symbolRoutes(fastify: FastifyInstance) {
  fastify.get('/:symbolId/ai-summary', async (
    request: FastifyRequest<{ Params: { symbolId: string }; Querystring: { scope?: string } }>,
    reply: FastifyReply,
  ) => {
    const { symbolId } = request.params;
    const scope = normalizeSymbolSummaryScope(request.query.scope);

    const symbol = await prisma.symbol.findUnique({
      where: { id: symbolId },
      select: { id: true },
    });
    if (!symbol) {
      throw new AppError(404, 'NOT_FOUND', 'The specified symbol was not found.');
    }

    const summary = await resolveSymbolSummary(symbolId, scope);
    return reply.status(200).send(formatSuccess(request, {
      symbol_id: symbolId,
      scope,
      summary,
    }));
  });

  fastify.post('/:symbolId/ai-summary/generate', async (
    request: FastifyRequest<{
      Params: { symbolId: string };
      Body: { scope?: string; reference_ids?: unknown; force_regenerate?: unknown };
    }>,
    reply: FastifyReply,
  ) => {
    const { symbolId } = request.params;
    const scope = normalizeSymbolSummaryScope(request.body?.scope);
    if (scope === 'latest') {
      throw new AppError(400, 'VALIDATION_ERROR', 'scope must be thesis for generation');
    }
    const referenceIdsRaw = request.body?.reference_ids;
    if (!Array.isArray(referenceIdsRaw)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'reference_ids must be an array');
    }
    const referenceIds = referenceIdsRaw
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    const forceRegenerateRaw = request.body?.force_regenerate;
    const forceRegenerate = forceRegenerateRaw === true;

    const result = await generateSymbolSummaryWithJob(
      symbolId,
      { scope, referenceIds, forceRegenerate },
      fastify.log,
    );

    return reply.status(200).send(formatSuccess(request, {
      symbol_id: symbolId,
      scope,
      job_id: result.jobId,
      status: 'queued',
      summary: result.summary,
    }));
  });

  fastify.get('/:symbolId', async (
    request: FastifyRequest<{ Params: { symbolId: string } }>,
    reply: FastifyReply
  ) => {
    const { symbolId } = request.params;

    const symbol = await prisma.symbol.findUnique({
      where: { id: symbolId },
    });

    if (!symbol) {
      throw new AppError(404, 'NOT_FOUND', 'The specified symbol was not found.');
    }

    const currentSnapshot = await getCurrentSnapshotForSymbol(
      {
        id: symbol.id,
        symbol: symbol.symbol,
        symbolCode: symbol.symbolCode,
        marketCode: symbol.marketCode,
        tradingviewSymbol: symbol.tradingviewSymbol,
      },
      fastify.log
    );

    const recentAlertsRaw = await prisma.alertEvent.findMany({
      where: { symbolId },
      take: 5,
      orderBy: [
        { triggeredAt: 'desc' },
        { receivedAt: 'desc' },
      ],
    });

    const alertIds = recentAlertsRaw.map((alert) => alert.id);

    const alertSummariesRaw = alertIds.length > 0
      ? await prisma.aiSummary.findMany({
          where: {
            targetEntityType: 'alert_event',
            targetEntityId: { in: alertIds },
            summaryScope: 'alert_reason',
          },
          orderBy: { generatedAt: 'desc' },
        })
      : [];

    const alertSummaryMap = new Map<string, (typeof alertSummariesRaw)[number]>();
    for (const summary of alertSummariesRaw) {
      if (!alertSummaryMap.has(summary.targetEntityId)) {
        alertSummaryMap.set(summary.targetEntityId, summary);
      }
    }

    const relatedReferencesRaw = await prisma.externalReference.findMany({
      where: { symbolId },
      orderBy: [
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 20,
    });

    const latestAiThesisSummaryRaw = await prisma.aiSummary.findFirst({
      where: {
        targetEntityType: 'symbol',
        targetEntityId: symbolId,
        summaryScope: 'thesis',
      },
      orderBy: { generatedAt: 'desc' },
    });

    const latestActiveNote = await prisma.researchNote.findFirst({
      where: {
        symbolId,
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
    });

    const recentAlerts = recentAlertsRaw.map((alert) => {
      const summary = alertSummaryMap.get(alert.id) ?? null;
      const keyPoints = getAlertSummaryPoints(
        summary
          ? {
              bodyMarkdown: summary.bodyMarkdown,
              structuredJson: summary.structuredJson,
            }
          : null
      );

      return {
        id: alert.id,
        alert_name: alert.alertName,
        alert_type: alert.alertType,
        timeframe: alert.timeframe,
        trigger_price: alert.triggerPrice,
        triggered_at: alert.triggeredAt,
        received_at: alert.receivedAt,
        processing_status: alert.processingStatus,
        related_ai_summary: summary
          ? {
              id: summary.id,
              title: summary.title,
              generated_at: summary.generatedAt,
              key_points: keyPoints,
            }
          : null,
      };
    });

    const latestThesisPayload =
      latestAiThesisSummaryRaw && isObject(latestAiThesisSummaryRaw.structuredJson) && isObject(latestAiThesisSummaryRaw.structuredJson.payload)
        ? latestAiThesisSummaryRaw.structuredJson.payload
        : null;

    const data = {
      symbol: {
        id: symbol.id,
        symbol: symbol.symbol,
        symbol_code: symbol.symbolCode,
        display_name: symbol.displayName,
        market_code: symbol.marketCode,
        tradingview_symbol: symbol.tradingviewSymbol,
      },
      current_snapshot: currentSnapshot,
      tradingview_symbol: symbol.tradingviewSymbol,
      chart: {
        widget_symbol: symbol.tradingviewSymbol || null,
        default_interval: "D"
      },
      recent_alerts: recentAlerts,
      latest_ai_thesis_summary: latestAiThesisSummaryRaw
        ? {
            id: latestAiThesisSummaryRaw.id,
            title: latestAiThesisSummaryRaw.title,
            body_markdown: latestAiThesisSummaryRaw.bodyMarkdown,
            generated_at: latestAiThesisSummaryRaw.generatedAt,
            overall_view: latestThesisPayload && typeof latestThesisPayload.overall_view === 'string'
              ? latestThesisPayload.overall_view
              : null,
            structured_json: latestAiThesisSummaryRaw.structuredJson,
          }
        : null,
      related_references: relatedReferencesRaw.map((reference) => ({
        id: reference.id,
        alert_event_id: reference.alertEventId,
        reference_type: reference.referenceType,
        title: reference.title,
        source_name: reference.sourceName,
        source_url: reference.sourceUrl,
        published_at: reference.publishedAt,
        summary_text: reference.summaryText,
      })),
      latest_active_note: latestActiveNote,
      latest_processing_status: recentAlertsRaw[0]?.processingStatus ?? 'idle',
    };

    return reply.status(200).send(formatSuccess(request, data));
  });
}
