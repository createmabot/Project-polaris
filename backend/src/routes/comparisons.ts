import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { HomeAiService } from '../ai/home-ai-service';
import { CurrentSnapshot, getCurrentSnapshotsForSymbols } from '../market/snapshot';

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
  current_snapshot: CurrentSnapshot | null;
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

function normalizeSymbolInputs(symbolIds: unknown): string[] {
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

async function resolveSymbolInputsToIds(symbolInputs: string[]): Promise<{
  resolvedSymbolIds: string[];
  missingSymbolInputs: string[];
}> {
  const symbols = await prisma.symbol.findMany({
    where: {
      OR: [
        { id: { in: symbolInputs } },
        { symbolCode: { in: symbolInputs } },
        { symbol: { in: symbolInputs } },
        { tradingviewSymbol: { in: symbolInputs } },
        { displayName: { in: symbolInputs } },
      ],
    },
    select: {
      id: true,
      symbol: true,
      symbolCode: true,
      tradingviewSymbol: true,
      displayName: true,
    },
  });

  const byId = new Map<string, string>();
  const bySymbolCode = new Map<string, string>();
  const bySymbol = new Map<string, string>();
  const byTradingviewSymbol = new Map<string, string>();
  const byDisplayName = new Map<string, string>();

  for (const symbol of symbols) {
    byId.set(symbol.id, symbol.id);
    if (symbol.symbolCode) bySymbolCode.set(symbol.symbolCode, symbol.id);
    bySymbol.set(symbol.symbol, symbol.id);
    if (symbol.tradingviewSymbol) byTradingviewSymbol.set(symbol.tradingviewSymbol, symbol.id);
    if (symbol.displayName) byDisplayName.set(symbol.displayName, symbol.id);
  }

  const resolvedOrdered: string[] = [];
  const missingInputs: string[] = [];

  for (const input of symbolInputs) {
    const resolved =
      byId.get(input) ??
      bySymbolCode.get(input) ??
      bySymbol.get(input) ??
      byTradingviewSymbol.get(input) ??
      byDisplayName.get(input);

    if (!resolved) {
      missingInputs.push(input);
      continue;
    }

    if (!resolvedOrdered.includes(resolved)) {
      resolvedOrdered.push(resolved);
    }
  }

  return {
    resolvedSymbolIds: resolvedOrdered,
    missingSymbolInputs: missingInputs,
  };
}

function normalizeName(name: unknown, fallback: string): string {
  if (typeof name !== 'string') {
    return fallback;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

async function buildComparisonSymbolViews(
  symbolIds: string[],
  logger?: { warn: (obj: unknown, msg?: string) => void }
): Promise<ComparisonSymbolView[]> {
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
  const snapshotMap = await getCurrentSnapshotsForSymbols(
    symbolsRaw.map((symbol) => ({
      id: symbol.id,
      symbol: symbol.symbol,
      symbolCode: symbol.symbolCode,
      marketCode: symbol.marketCode,
      tradingviewSymbol: symbol.tradingviewSymbol,
    })),
    logger
  );

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
      current_snapshot: snapshotMap.get(symbol.id) ?? null,
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
    : [
        'last_price',
        'change',
        'change_percent',
        'thesis_presence',
        'active_note_presence',
        'recent_alert_count',
        'recent_reference_count',
        'latest_processing_status',
      ];

  const symbolMetrics = symbolViews.map((item) => ({
    symbol_id: item.symbol.id,
    display_name: item.symbol.display_name ?? item.symbol.symbol_code ?? item.symbol.symbol,
    last_price: item.current_snapshot?.last_price ?? null,
    change: item.current_snapshot?.change ?? null,
    change_percent: item.current_snapshot?.change_percent ?? null,
    volume: item.current_snapshot?.volume ?? null,
    as_of: item.current_snapshot?.as_of ?? null,
    market_status: item.current_snapshot?.market_status ?? 'unknown',
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
  const homeAiService = new HomeAiService();

  const referencePool = symbolViews
    .flatMap((item) => item.related_references.map((ref) => ({
      id: ref.id,
      referenceType: ref.reference_type,
      title: ref.title,
      sourceName: ref.source_name,
      sourceUrl: ref.source_url,
      publishedAtIso: ref.published_at ? ref.published_at.toISOString() : null,
      summaryText: ref.summary_text,
    })))
    .slice(0, 10);

  const inputSnapshot = JSON.stringify({
    comparison_id: comparisonId,
    symbols: symbolViews
      .map((item) => ({
        id: item.symbol.id,
        symbol: item.symbol.symbol,
        symbol_code: item.symbol.symbol_code,
        display_name: item.symbol.display_name,
        market_code: item.symbol.market_code,
        tradingview_symbol: item.symbol.tradingview_symbol,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    compared_metric_json: comparedMetricJson,
    references: referencePool
      .map((ref) => ({
        id: ref.id,
        reference_type: ref.referenceType,
        title: ref.title,
        published_at: ref.publishedAtIso,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  const inputSnapshotHash = crypto.createHash('sha256').update(inputSnapshot).digest('hex');

  const existingSummary = await prisma.aiSummary.findFirst({
    where: {
      targetEntityType: 'comparison_session',
      targetEntityId: comparisonId,
      summaryScope: 'comparison',
      inputSnapshotHash,
    },
    orderBy: { generatedAt: 'desc' },
  });

  if (existingSummary) {
    const existingJob = await prisma.aiJob.create({
      data: {
        jobType: 'generate_comparison_summary',
        targetEntityType: 'comparison_session',
        targetEntityId: comparisonId,
        status: 'succeeded',
        startedAt: new Date(),
        completedAt: new Date(),
        requestPayload: { compared_metric_json: comparedMetricJson } as any,
        responsePayload: {
          summary_id: existingSummary.id,
          skipped: 'duplicate',
        } as any,
        modelName: existingSummary.modelName,
        promptVersion: existingSummary.promptVersion,
      },
    });

    return {
      ai_job_id: existingJob.id,
      ai_summary_id: existingSummary.id,
      generated_at: existingSummary.generatedAt ?? new Date(),
    };
  }

  const aiJob = await prisma.aiJob.create({
    data: {
      jobType: 'generate_comparison_summary',
      targetEntityType: 'comparison_session',
      targetEntityId: comparisonId,
      status: 'queued',
      requestPayload: { compared_metric_json: comparedMetricJson } as any,
    },
  });

  await prisma.aiJob.update({
    where: { id: aiJob.id },
    data: {
      status: 'running',
      startedAt: new Date(),
    },
  });

  try {
    const symbolsForAi = symbolViews.map((item) => ({
      id: item.symbol.id,
      symbol: item.symbol.symbol,
      symbolCode: item.symbol.symbol_code,
      displayName: item.symbol.display_name,
      marketCode: item.symbol.market_code,
      tradingviewSymbol: item.symbol.tradingview_symbol,
    }));
    const metrics = Array.isArray(comparedMetricJson.metrics)
      ? comparedMetricJson.metrics.filter((metric): metric is string => typeof metric === 'string')
      : [];

    const { output, log } = await homeAiService.generateComparisonSummary({
      comparisonId,
      symbols: symbolsForAi,
      metrics,
      comparedMetricJson: comparedMetricJson as Record<string, unknown>,
      references: referencePool.map((reference) => ({
        id: reference.id,
        title: reference.title,
        referenceType: reference.referenceType,
        sourceName: reference.sourceName,
        sourceUrl: reference.sourceUrl,
        publishedAt: reference.publishedAtIso,
        summaryText: reference.summaryText,
      })),
    });

    const generatedAt = new Date();
    const aiSummary = await prisma.aiSummary.create({
      data: {
        aiJobId: aiJob.id,
        userId: null,
        summaryScope: 'comparison',
        targetEntityType: 'comparison_session',
        targetEntityId: comparisonId,
        title: output.title,
        bodyMarkdown: output.bodyMarkdown,
        structuredJson: output.structuredJson as any,
        modelName: output.modelName,
        promptVersion: output.promptVersion,
        generatedAt,
        inputSnapshotHash,
        generationContextJson: {
          provider: log.provider,
          fallback_to_stub: log.fallbackToStub,
          symbol_count: symbolsForAi.length,
          reference_count: referencePool.length,
          metrics,
        } as any,
      },
    });

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
        responsePayload: { summary_id: aiSummary.id } as any,
      },
    });

    return {
      ai_job_id: aiJob.id,
      ai_summary_id: aiSummary.id,
      generated_at: generatedAt,
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

async function resolveComparisonAiSummaryByJob(aiJobId: string | null) {
  if (!aiJobId) {
    return null;
  }
  const linkedSummary = await prisma.aiSummary.findFirst({
    where: { aiJobId },
    orderBy: { generatedAt: 'desc' },
  });
  if (linkedSummary) {
    return linkedSummary;
  }

  const aiJob = await prisma.aiJob.findUnique({
    where: { id: aiJobId },
    select: { responsePayload: true },
  });
  const payload = aiJob?.responsePayload;
  const summaryId =
    payload && typeof payload === 'object' && !Array.isArray(payload) && typeof (payload as any).summary_id === 'string'
      ? (payload as any).summary_id
      : null;
  if (!summaryId) {
    return null;
  }
  return prisma.aiSummary.findFirst({ where: { id: summaryId } });
}

function buildComparisonAiSummaryView(params: {
  aiSummary: any | null;
  legacyResult: {
    title: string | null;
    bodyMarkdown: string | null;
    structuredJson: unknown;
    modelName: string | null;
    promptVersion: string | null;
  } | null;
}) {
  if (params.aiSummary) {
    return {
      ai_summary_id: params.aiSummary.id,
      ai_summary: {
        summary_id: params.aiSummary.id,
        title: params.aiSummary.title,
        body_markdown: params.aiSummary.bodyMarkdown,
        structured_json: params.aiSummary.structuredJson,
        model_name: params.aiSummary.modelName,
        prompt_version: params.aiSummary.promptVersion,
      },
    };
  }

  if (params.legacyResult?.bodyMarkdown) {
    return {
      ai_summary_id: null,
      ai_summary: {
        summary_id: null,
        title: params.legacyResult.title,
        body_markdown: params.legacyResult.bodyMarkdown,
        structured_json: params.legacyResult.structuredJson,
        model_name: params.legacyResult.modelName,
        prompt_version: params.legacyResult.promptVersion,
      },
    };
  }

  return {
    ai_summary_id: null,
    ai_summary: null,
  };
}

export async function comparisonRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (
    request: FastifyRequest<{ Body: { name?: string; symbol_ids?: string[] } }>,
    reply: FastifyReply
  ) => {
    const symbolInputs = normalizeSymbolInputs(request.body?.symbol_ids);
    const { resolvedSymbolIds, missingSymbolInputs } = await resolveSymbolInputsToIds(symbolInputs);

    if (missingSymbolInputs.length > 0) {
      throw new AppError(404, 'NOT_FOUND', 'Some symbols were not found.', {
        missing_symbol_ids: missingSymbolInputs,
      });
    }

    if (resolvedSymbolIds.length < MIN_COMPARE_SYMBOLS || resolvedSymbolIds.length > MAX_COMPARE_SYMBOLS) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `symbol_ids must resolve to between ${MIN_COMPARE_SYMBOLS} and ${MAX_COMPARE_SYMBOLS} unique symbols.`
      );
    }

    const symbols = await prisma.symbol.findMany({
      where: { id: { in: resolvedSymbolIds } },
      select: {
        id: true,
        symbol: true,
        symbolCode: true,
        displayName: true,
      },
    });

    const symbolMap = new Map(symbols.map((symbol) => [symbol.id, symbol]));
    const missingSymbolIds = resolvedSymbolIds.filter((symbolId) => !symbolMap.has(symbolId));
    if (missingSymbolIds.length > 0) {
      throw new AppError(404, 'NOT_FOUND', 'Some symbols were not found.', {
        missing_symbol_ids: missingSymbolIds,
      });
    }

    const orderedSymbols = resolvedSymbolIds.map((symbolId) => symbolMap.get(symbolId)!);
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
          create: resolvedSymbolIds.map((symbolId, index) => ({
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
    const symbols = symbolIds.length > 0 ? await buildComparisonSymbolViews(symbolIds, fastify.log) : [];

    const latestResult = await prisma.comparisonResult.findFirst({
      where: { comparisonSessionId: comparisonId },
      orderBy: { generatedAt: 'desc' },
    });
    const aiSummary = await resolveComparisonAiSummaryByJob(latestResult?.aiJobId ?? null);
    const aiSummaryView = buildComparisonAiSummaryView({
      aiSummary,
      legacyResult: latestResult
        ? {
            title: latestResult.title,
            bodyMarkdown: latestResult.bodyMarkdown,
            structuredJson: latestResult.structuredJson,
            modelName: latestResult.modelName,
            promptVersion: latestResult.promptVersion,
          }
        : null,
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
            ai_summary_id: aiSummaryView.ai_summary_id,
            ai_summary: aiSummaryView.ai_summary,
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

    const symbolViews = await buildComparisonSymbolViews(symbolIds, fastify.log);
    const comparedMetricJson = buildComparedMetricJson(symbolViews, request.body?.metrics);

    const aiSummaryResult = includeAiSummary
      ? await runComparisonSummaryGeneration({
          comparisonId,
          symbolViews,
          comparedMetricJson,
        })
      : null;

    const generatedAt = aiSummaryResult?.generated_at ?? new Date();
    const generatedAiSummary = aiSummaryResult?.ai_summary_id
      ? await prisma.aiSummary.findFirst({ where: { id: aiSummaryResult.ai_summary_id } })
      : null;

    const latestResult = await prisma.comparisonResult.findFirst({
      where: { comparisonSessionId: comparisonId },
      orderBy: { generatedAt: 'desc' },
    });

    const saved = latestResult
      ? await prisma.comparisonResult.update({
          where: { id: latestResult.id },
          data: {
            aiJobId: aiSummaryResult?.ai_job_id ?? null,
            title: null,
            bodyMarkdown: null,
            structuredJson: undefined,
            modelName: null,
            promptVersion: null,
            comparedMetricJson: comparedMetricJson as any,
            generatedAt,
          },
        })
      : await prisma.comparisonResult.create({
          data: {
            comparisonSessionId: comparisonId,
            aiJobId: aiSummaryResult?.ai_job_id ?? null,
            title: null,
            bodyMarkdown: null,
            structuredJson: undefined,
            modelName: null,
            promptVersion: null,
            comparedMetricJson: comparedMetricJson as any,
            generatedAt,
          },
        });

    const data = {
      comparison_result_id: saved.id,
      ai_job_id: aiSummaryResult?.ai_job_id ?? null,
      ai_summary_id: generatedAiSummary?.id ?? null,
      generated_at: saved.generatedAt,
      compared_metric_json: saved.comparedMetricJson,
      ai_summary: generatedAiSummary
        ? {
            summary_id: generatedAiSummary.id,
            title: generatedAiSummary.title,
            body_markdown: generatedAiSummary.bodyMarkdown,
            structured_json: generatedAiSummary.structuredJson,
            model_name: generatedAiSummary.modelName,
            prompt_version: generatedAiSummary.promptVersion,
          }
        : null,
    };

    return reply.status(200).send(formatSuccess(request, data));
  });
}
