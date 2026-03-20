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

const MIN_COMPARE_SYMBOLS = 2;
const MAX_COMPARE_SYMBOLS = 4;
const RECENT_ALERT_LIMIT = 3;
const RECENT_REFERENCE_LIMIT = 5;

function normalizeSymbolIds(symbolIds: unknown): string[] {
  if (!Array.isArray(symbolIds)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'symbol_ids must be an array.');
  }

  const normalized = symbolIds
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);

  const unique = [...new Set(normalized)];

  if (unique.length < MIN_COMPARE_SYMBOLS || unique.length > MAX_COMPARE_SYMBOLS) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `symbol_ids must include between ${MIN_COMPARE_SYMBOLS} and ${MAX_COMPARE_SYMBOLS} symbols.`
    );
  }

  return unique;
}

function normalizeName(name: unknown, fallback: string): string {
  if (typeof name !== 'string') {
    return fallback;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export async function comparisonRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (
    request: FastifyRequest<{ Body: { name?: string; symbol_ids?: string[] } }>,
    reply: FastifyReply
  ) => {
    const symbolIds = normalizeSymbolIds(request.body?.symbol_ids);

    const symbols = await prisma.symbol.findMany({
      where: { id: { in: symbolIds } },
      select: {
        id: true,
        symbol: true,
        symbolCode: true,
        displayName: true,
      },
    });

    const symbolMap = new Map(symbols.map((symbol) => [symbol.id, symbol]));
    const missingSymbolIds = symbolIds.filter((symbolId) => !symbolMap.has(symbolId));
    if (missingSymbolIds.length > 0) {
      throw new AppError(404, 'NOT_FOUND', 'Some symbols were not found.', {
        missing_symbol_ids: missingSymbolIds,
      });
    }

    const orderedSymbols = symbolIds.map((symbolId) => symbolMap.get(symbolId)!);
    const fallbackName = orderedSymbols
      .map((symbol) => symbol.displayName ?? symbol.symbolCode ?? symbol.symbol)
      .join(' vs ');

    const comparisonName = normalizeName(request.body?.name, fallbackName);

    const session = await prisma.comparisonSession.create({
      data: {
        name: comparisonName,
        comparisonType: 'symbol',
        status: 'ready',
        comparisonSymbols: {
          create: symbolIds.map((symbolId, index) => ({
            symbolId,
            sortOrder: index,
          })),
        },
      },
      include: {
        comparisonSymbols: {
          orderBy: { sortOrder: 'asc' },
          select: {
            symbolId: true,
            sortOrder: true,
          },
        },
      },
    });

    const data = {
      comparison_session: {
        id: session.id,
        name: session.name,
        comparison_type: session.comparisonType,
        status: session.status,
        created_at: session.createdAt,
      },
      comparison_symbols: session.comparisonSymbols.map((item) => ({
        symbol_id: item.symbolId,
        sort_order: item.sortOrder,
      })),
    };

    return reply.status(201).send(formatSuccess(request, data));
  });

  fastify.get('/:comparisonId', async (
    request: FastifyRequest<{ Params: { comparisonId: string } }>,
    reply: FastifyReply
  ) => {
    const { comparisonId } = request.params;

    const session = await prisma.comparisonSession.findUnique({
      where: { id: comparisonId },
      include: {
        comparisonSymbols: {
          orderBy: { sortOrder: 'asc' },
          include: {
            symbol: true,
          },
        },
      },
    });

    if (!session) {
      throw new AppError(404, 'NOT_FOUND', 'The specified comparison session was not found.');
    }

    if (session.comparisonSymbols.length === 0) {
      return reply.status(200).send(formatSuccess(request, {
        comparison_header: {
          comparison_id: session.id,
          name: session.name,
          comparison_type: session.comparisonType,
          status: session.status,
          created_at: session.createdAt,
          updated_at: session.updatedAt,
          symbol_count: 0,
        },
        symbols: [],
      }));
    }

    const symbolIds = session.comparisonSymbols.map((item) => item.symbolId);

    const [alertsRaw, thesisRaw, notesRaw, referencesRaw] = await Promise.all([
      prisma.alertEvent.findMany({
        where: { symbolId: { in: symbolIds } },
        orderBy: [{ triggeredAt: 'desc' }, { receivedAt: 'desc' }],
      }),
      prisma.aiSummary.findMany({
        where: {
          targetEntityType: 'symbol',
          targetEntityId: { in: symbolIds },
          summaryScope: 'thesis',
        },
        orderBy: { generatedAt: 'desc' },
      }),
      prisma.researchNote.findMany({
        where: {
          symbolId: { in: symbolIds },
          status: 'active',
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.externalReference.findMany({
        where: { symbolId: { in: symbolIds } },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const alertsBySymbol = new Map<string, typeof alertsRaw>();
    for (const alert of alertsRaw) {
      const key = alert.symbolId ?? '';
      const bucket = alertsBySymbol.get(key) ?? [];
      if (bucket.length < RECENT_ALERT_LIMIT) {
        bucket.push(alert);
      }
      alertsBySymbol.set(key, bucket);
    }

    const alertIds = alertsRaw.map((alert) => alert.id);
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

    const thesisBySymbol = new Map<string, (typeof thesisRaw)[number]>();
    for (const summary of thesisRaw) {
      if (!thesisBySymbol.has(summary.targetEntityId)) {
        thesisBySymbol.set(summary.targetEntityId, summary);
      }
    }

    const notesBySymbol = new Map<string, (typeof notesRaw)[number]>();
    for (const note of notesRaw) {
      if (!notesBySymbol.has(note.symbolId)) {
        notesBySymbol.set(note.symbolId, note);
      }
    }

    const referencesBySymbol = new Map<string, typeof referencesRaw>();
    for (const reference of referencesRaw) {
      const key = reference.symbolId ?? '';
      const bucket = referencesBySymbol.get(key) ?? [];
      if (bucket.length < RECENT_REFERENCE_LIMIT) {
        bucket.push(reference);
      }
      referencesBySymbol.set(key, bucket);
    }

    const symbols = session.comparisonSymbols.map((item) => {
      const symbol = item.symbol;
      const recentAlerts = (alertsBySymbol.get(symbol.id) ?? []).map((alert) => {
        const summary = alertSummaryMap.get(alert.id) ?? null;

        return {
          id: alert.id,
          alert_name: alert.alertName,
          alert_type: alert.alertType,
          timeframe: alert.timeframe,
          triggered_at: alert.triggeredAt,
          received_at: alert.receivedAt,
          processing_status: alert.processingStatus,
          related_ai_summary: summary
            ? {
                id: summary.id,
                title: summary.title,
                generated_at: summary.generatedAt,
                key_points: getAlertSummaryPoints({
                  bodyMarkdown: summary.bodyMarkdown,
                  structuredJson: summary.structuredJson,
                }),
              }
            : null,
        };
      });

      const latestThesisSummary = thesisBySymbol.get(symbol.id) ?? null;
      const latestActiveNote = notesBySymbol.get(symbol.id) ?? null;
      const recentReferences = (referencesBySymbol.get(symbol.id) ?? []).map((reference) => ({
        id: reference.id,
        reference_type: reference.referenceType,
        title: reference.title,
        source_name: reference.sourceName,
        source_url: reference.sourceUrl,
        published_at: reference.publishedAt,
        summary_text: reference.summaryText,
      }));

      return {
        symbol: {
          id: symbol.id,
          symbol: symbol.symbol,
          symbol_code: symbol.symbolCode,
          display_name: symbol.displayName,
          market_code: symbol.marketCode,
          tradingview_symbol: symbol.tradingviewSymbol,
        },
        latest_ai_thesis_summary: latestThesisSummary
          ? {
              id: latestThesisSummary.id,
              title: latestThesisSummary.title,
              body_markdown: latestThesisSummary.bodyMarkdown,
              generated_at: latestThesisSummary.generatedAt,
              structured_json: latestThesisSummary.structuredJson,
            }
          : null,
        latest_active_note: latestActiveNote,
        recent_alerts: recentAlerts,
        related_references: recentReferences,
        latest_processing_status: recentAlerts[0]?.processing_status ?? 'idle',
      };
    });

    const data = {
      comparison_header: {
        comparison_id: session.id,
        name: session.name,
        comparison_type: session.comparisonType,
        status: session.status,
        created_at: session.createdAt,
        updated_at: session.updatedAt,
        symbol_count: symbols.length,
      },
      symbols,
    };

    return reply.status(200).send(formatSuccess(request, data));
  });
}
