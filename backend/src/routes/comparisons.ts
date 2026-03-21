import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { AiRouter } from '../ai/router';

type JsonObject = Record<string, unknown>;

type ComparisonSymbolView = {
  symbol: {
    id: string;
    symbol: string;
    symbol_code: string | null;
    display_name: string | null;
    market_code: string | null;
    tradingview_symbol: string | null;
  };
  latest_ai_thesis_summary: {
    id: string;
    title: string | null;
    body_markdown: string;
    generated_at: Date | null;
    structured_json: unknown;
  } | null;
  latest_active_note: unknown;
  recent_alerts: Array<{
    id: string;
    alert_name: string;
    alert_type: string | null;
    timeframe: string | null;
    triggered_at: Date | null;
    received_at: Date;
    processing_status: string;
    related_ai_summary: {
      id: string;
      title: string | null;
      generated_at: Date | null;
      key_points: string[];
    } | null;
  }>;
  related_references: Array<{
    id: string;
    reference_type: string;
    title: string;
    source_name: string | null;
    source_url: string | null;
    published_at: Date | null;
    summary_text: string | null;
  }>;
  latest_processing_status: string;
};

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

async function buildComparisonSymbolViews(symbolIds: string[]): Promise<ComparisonSymbolView[]> {
  const [alertsRaw, thesisRaw, notesRaw, referencesRaw, symbolsRaw] = await Promise.all([
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
    prisma.symbol.findMany({
      where: { id: { in: symbolIds } },
    }),
  ]);

  const symbolMap = new Map(symbolsRaw.map((symbol) => [symbol.id, symbol]));

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

  return symbolIds.map((symbolId) => {
    const symbol = symbolMap.get(symbolId);
    if (!symbol) {
      throw new AppError(404, 'NOT_FOUND', 'Some symbols were not found.');
    }

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
}

function buildComparedMetricJson(symbolViews: ComparisonSymbolView[], requestedMetrics?: string[]) {
  const metrics = (requestedMetrics && requestedMetrics.length > 0)
    ? requestedMetrics
    : ['thesis_presence', 'active_note_presence', 'recent_alert_count', 'recent_reference_count', 'latest_processing_status'];

  const symbolMetrics = symbolViews.map((item) => ({
    symbol_id: item.symbol.id,
    display_name: item.symbol.display_name ?? item.symbol.symbol_code ?? item.symbol.symbol,
    thesis_presence: item.latest_ai_thesis_summary ? 1 : 0,
    active_note_presence: item.latest_active_note ? 1 : 0,
    recent_alert_count: item.recent_alerts.length,
    recent_reference_count: item.related_references.length,
    latest_processing_status: item.latest_processing_status,
  }));

  return {
    schema_name: 'comparison_metric_snapshot',
    schema_version: '1.0',
    metrics,
    symbol_metrics: symbolMetrics,
  };
}

async function runComparisonSummaryGeneration(params: {
  comparisonId: string;
  symbolViews: ComparisonSymbolView[];
  comparedMetricJson: ReturnType<typeof buildComparedMetricJson>;
}) {
  const { comparisonId, symbolViews, comparedMetricJson } = params;
  const router = new AiRouter();

  const referencePool = symbolViews
    .flatMap((item) => item.related_references.map((ref) => ({
      id: ref.id,
      referenceType: ref.reference_type,
      sourceType: ref.reference_type,
      title: ref.title,
      sourceName: ref.source_name,
      sourceUrl: ref.source_url,
      publishedAt: ref.published_at,
      publishedAtIso: ref.published_at ? ref.published_at.toISOString() : null,
      summaryText: ref.summary_text,
      relevanceScore: null,
    })))
    .slice(0, 10);

  const aiJob = await prisma.aiJob.create({
    data: {
      jobType: 'generate_comparison_summary',
      targetEntityType: 'comparison_session',
      targetEntityId: comparisonId,
      status: 'running',
      startedAt: new Date(),
      requestPayload: { compared_metric_json: comparedMetricJson } as any,
    },
  });

  try {
    const routerContext = {
      alertEventId: `comparison:${comparisonId}`,
      alertName: `comparison_summary_${comparisonId}`,
      alertType: 'comparison',
      timeframe: null,
      triggerPrice: null,
      triggeredAt: new Date(),
      symbol: null,
      rawPayload: { compared_metric_json: comparedMetricJson } as Record<string, unknown>,
      referenceIds: referencePool.map((ref) => ref.id),
      references: referencePool,
    };

    const { output, log } = await router.generateAlertSummary(routerContext);
    const generatedAt = new Date();
    const symbolLabels = symbolViews.map((item) => item.symbol.display_name ?? item.symbol.symbol_code ?? item.symbol.symbol);

    const structuredJson = {
      schema_name: 'comparison_summary',
      schema_version: '1.0',
      confidence: output.structuredJson.confidence,
      insufficient_context: output.structuredJson.insufficient_context,
      payload: {
        overall_view: output.structuredJson.payload.what_happened,
        key_differences: output.structuredJson.payload.fact_points,
        risk_points: output.structuredJson.payload.watch_points,
        next_actions: output.structuredJson.payload.next_actions,
        compared_symbols: symbolViews.map((item) => item.symbol.id),
        reference_ids: referencePool.map((ref) => ref.id),
      },
    };

    await prisma.aiJob.update({
      where: { id: aiJob.id },
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
      },
    });

    return {
      ai_job_id: aiJob.id,
      generated_at: generatedAt,
      title: `比較総評: ${symbolLabels.join(' vs ')}`,
      body_markdown: output.bodyMarkdown,
      structured_json: structuredJson,
      model_name: output.modelName,
      prompt_version: output.promptVersion,
    };
  } catch (error: unknown) {
    await prisma.aiJob.update({
      where: { id: aiJob.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
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
          select: { symbolId: true, sortOrder: true },
        },
      },
    });

    if (!session) {
      throw new AppError(404, 'NOT_FOUND', 'The specified comparison session was not found.');
    }

    const symbolIds = session.comparisonSymbols.map((item) => item.symbolId);
    const symbols = symbolIds.length > 0 ? await buildComparisonSymbolViews(symbolIds) : [];

    const latestResult = await prisma.comparisonResult.findFirst({
      where: { comparisonSessionId: comparisonId },
      orderBy: { generatedAt: 'desc' },
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
      latest_result: latestResult
        ? {
            id: latestResult.id,
            generated_at: latestResult.generatedAt,
            compared_metric_json: latestResult.comparedMetricJson,
            ai_summary: latestResult.bodyMarkdown
              ? {
                  title: latestResult.title,
                  body_markdown: latestResult.bodyMarkdown,
                  structured_json: latestResult.structuredJson,
                  model_name: latestResult.modelName,
                  prompt_version: latestResult.promptVersion,
                }
              : null,
          }
        : null,
    };

    return reply.status(200).send(formatSuccess(request, data));
  });

  fastify.post('/:comparisonId/generate', async (
    request: FastifyRequest<{
      Params: { comparisonId: string };
      Body?: { metrics?: string[]; include_ai_summary?: boolean };
    }>,
    reply: FastifyReply
  ) => {
    const { comparisonId } = request.params;
    const includeAiSummary = request.body?.include_ai_summary ?? true;

    const session = await prisma.comparisonSession.findUnique({
      where: { id: comparisonId },
      include: {
        comparisonSymbols: {
          orderBy: { sortOrder: 'asc' },
          select: { symbolId: true },
        },
      },
    });

    if (!session) {
      throw new AppError(404, 'NOT_FOUND', 'The specified comparison session was not found.');
    }

    const symbolIds = session.comparisonSymbols.map((item) => item.symbolId);
    if (symbolIds.length < MIN_COMPARE_SYMBOLS) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Comparison requires at least 2 symbols.');
    }

    const symbolViews = await buildComparisonSymbolViews(symbolIds);
    const comparedMetricJson = buildComparedMetricJson(symbolViews, request.body?.metrics);

    const aiSummaryResult = includeAiSummary
      ? await runComparisonSummaryGeneration({
          comparisonId,
          symbolViews,
          comparedMetricJson,
        })
      : null;

    const generatedAt = aiSummaryResult?.generated_at ?? new Date();

    const latestResult = await prisma.comparisonResult.findFirst({
      where: { comparisonSessionId: comparisonId },
      orderBy: { generatedAt: 'desc' },
    });

    const saved = latestResult
      ? await prisma.comparisonResult.update({
          where: { id: latestResult.id },
          data: {
            aiJobId: aiSummaryResult?.ai_job_id ?? null,
            title: aiSummaryResult?.title ?? null,
            bodyMarkdown: aiSummaryResult?.body_markdown ?? null,
            structuredJson: aiSummaryResult?.structured_json as any,
            modelName: aiSummaryResult?.model_name ?? null,
            promptVersion: aiSummaryResult?.prompt_version ?? null,
            comparedMetricJson: comparedMetricJson as any,
            generatedAt,
          },
        })
      : await prisma.comparisonResult.create({
          data: {
            comparisonSessionId: comparisonId,
            aiJobId: aiSummaryResult?.ai_job_id ?? null,
            title: aiSummaryResult?.title ?? null,
            bodyMarkdown: aiSummaryResult?.body_markdown ?? null,
            structuredJson: aiSummaryResult?.structured_json as any,
            modelName: aiSummaryResult?.model_name ?? null,
            promptVersion: aiSummaryResult?.prompt_version ?? null,
            comparedMetricJson: comparedMetricJson as any,
            generatedAt,
          },
        });

    const data = {
      comparison_result_id: saved.id,
      ai_job_id: aiSummaryResult?.ai_job_id ?? null,
      generated_at: saved.generatedAt,
      compared_metric_json: saved.comparedMetricJson,
      ai_summary: saved.bodyMarkdown
        ? {
            title: saved.title,
            body_markdown: saved.bodyMarkdown,
            structured_json: saved.structuredJson,
            model_name: saved.modelName,
            prompt_version: saved.promptVersion,
          }
        : null,
    };

    return reply.status(200).send(formatSuccess(request, data));
  });
}
