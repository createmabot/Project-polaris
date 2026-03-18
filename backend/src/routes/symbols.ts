import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
      current_snapshot: null,
      tradingview_symbol: symbol.tradingviewSymbol,
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
