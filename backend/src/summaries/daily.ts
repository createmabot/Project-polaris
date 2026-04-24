import { AppError } from '../utils/response';
import { HomeAiService } from '../ai/home-ai-service';

export type DailySummaryType = 'latest' | 'morning' | 'evening';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type DailySummaryView = {
  id: string | null;
  title: string | null;
  body_markdown: string | null;
  structured_json: Record<string, unknown> | null;
  generated_at: string | null;
  status: 'available' | 'unavailable';
  insufficient_context: boolean;
  summary_type: DailySummaryType;
  date: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeSummaryType(input?: string): DailySummaryType {
  const normalized = (input ?? 'latest').trim().toLowerCase();
  if (normalized === '' || normalized === 'latest') {
    return 'latest';
  }
  if (normalized === 'morning' || normalized === 'evening') {
    return normalized;
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'summary_type must be one of latest|morning|evening');
}

export function normalizeDailyQueryType(input?: string): DailySummaryType {
  const normalized = (input ?? 'latest').trim().toLowerCase();
  if (normalized === '' || normalized === 'latest') return 'latest';
  if (normalized === 'morning' || normalized === 'evening') return normalized;
  throw new AppError(400, 'VALIDATION_ERROR', 'type must be one of latest|morning|evening');
}

export function normalizeDate(input?: string): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!DATE_ONLY_PATTERN.test(trimmed)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'date must be YYYY-MM-DD');
  }
  const [yearText, monthText, dayText] = trimmed.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const isSameDate =
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day;
  if (!isSameDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'date must be YYYY-MM-DD');
  }
  return trimmed;
}

export function buildJstDayRange(date: string): { gte: Date; lt: Date } {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start, lt: end };
}

function inferDailySummaryType(summary: { generationContextJson?: unknown; generatedAt?: Date | string | null }): DailySummaryType {
  const context = isRecord(summary.generationContextJson)
    ? summary.generationContextJson
    : null;
  const candidates = [
    context?.summary_type,
    context?.summaryType,
    context?.time_of_day,
    context?.timeOfDay,
    context?.slot,
    context?.summary_slot,
  ];

  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim().toLowerCase() : '';
    if (normalized === 'morning' || normalized === 'evening' || normalized === 'latest') {
      return normalized as DailySummaryType;
    }
  }

  const generatedAt =
    summary.generatedAt instanceof Date
      ? summary.generatedAt
      : summary.generatedAt
        ? new Date(summary.generatedAt)
        : null;
  if (generatedAt && !Number.isNaN(generatedAt.getTime())) {
    const hourInJst = Number(
      generatedAt.toLocaleString('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Asia/Tokyo',
      }),
    );
    return hourInJst < 15 ? 'morning' : 'evening';
  }

  return 'latest';
}

function selectDailySummary(
  summaries: Array<{ generationContextJson?: unknown; generatedAt?: Date | string | null }>,
  summaryType: DailySummaryType,
) {
  if (summaries.length === 0) {
    return null;
  }
  if (summaryType === 'latest') {
    return summaries[0] ?? null;
  }
  return summaries.find((summary) => inferDailySummaryType(summary) === summaryType) ?? null;
}

async function detectInsufficientContext(
  prismaAny: any,
  dateRange: { gte: Date; lt: Date },
): Promise<boolean> {
  const counts = await collectDailyMaterialCounts(prismaAny, dateRange);
  return counts.snapshotCount === 0 || counts.alertCount === 0 || counts.referenceCount === 0;
}

async function collectDailyMaterialCounts(
  prismaAny: any,
  dateRange: { gte: Date; lt: Date },
): Promise<{ snapshotCount: number; alertCount: number; referenceCount: number }> {
  const [snapshotCount, alertCount, referenceCount] = await Promise.all([
    prismaAny.marketSnapshot.count({
      where: {
        asOf: {
          gte: dateRange.gte,
          lt: dateRange.lt,
        },
      },
    }),
    prismaAny.alertEvent.count({
      where: {
        OR: [
          { triggeredAt: { gte: dateRange.gte, lt: dateRange.lt } },
          { receivedAt: { gte: dateRange.gte, lt: dateRange.lt } },
        ],
      },
    }),
    prismaAny.externalReference.count({
      where: {
        OR: [
          { publishedAt: { gte: dateRange.gte, lt: dateRange.lt } },
          { createdAt: { gte: dateRange.gte, lt: dateRange.lt } },
        ],
      },
    }),
  ]);

  return { snapshotCount, alertCount, referenceCount };
}

export async function resolveDailySummary(
  prismaAny: any,
  params: { summaryType: DailySummaryType; date: string | null },
): Promise<DailySummaryView> {
  const dateRange = params.date ? buildJstDayRange(params.date) : null;
  const effectiveRange = dateRange ?? buildJstDayRange(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }));

  const dailySummaries = await prismaAny.aiSummary.findMany({
    where: {
      targetEntityType: 'market_snapshot',
      summaryScope: 'daily',
      ...(dateRange ? { generatedAt: { gte: dateRange.gte, lt: dateRange.lt } } : {}),
    },
    orderBy: { generatedAt: 'desc' },
  });

  const selected = selectDailySummary(dailySummaries, params.summaryType) as any | null;
  if (selected) {
    const structured = isRecord(selected.structuredJson) ? selected.structuredJson : null;
    const insufficient = structured && typeof structured.insufficient_context === 'boolean'
      ? structured.insufficient_context
      : false;
    return {
      id: selected.id,
      title: selected.title ?? null,
      body_markdown: selected.bodyMarkdown ?? null,
      structured_json: structured,
      generated_at: selected.generatedAt ? new Date(selected.generatedAt).toISOString() : null,
      status: 'available',
      insufficient_context: insufficient,
      summary_type: params.summaryType,
      date: params.date,
    };
  }

  const insufficientContext = await detectInsufficientContext(prismaAny, effectiveRange);
  return {
    id: null,
    title: null,
    body_markdown: null,
    structured_json: null,
    generated_at: null,
    status: 'unavailable',
    insufficient_context: insufficientContext,
    summary_type: params.summaryType,
    date: params.date,
  };
}

export async function generateDailySummaryWithJob(
  prismaAny: any,
  params: { summaryType: DailySummaryType; date: string | null },
): Promise<{ jobId: string; summary: DailySummaryView }> {
  if (params.summaryType === 'latest') {
    throw new AppError(400, 'VALIDATION_ERROR', 'type must be morning|evening for generation');
  }

  const effectiveDate =
    params.date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const dateRange = buildJstDayRange(effectiveDate);
  const counts = await collectDailyMaterialCounts(prismaAny, dateRange);

  const aiJob = await prismaAny.aiJob.create({
    data: {
      jobType: 'generate_daily_summary',
      targetEntityType: 'market_snapshot',
      targetEntityId: 'market:jp',
      requestPayload: {
        summary_type: params.summaryType,
        date: effectiveDate,
      } as any,
      status: 'queued',
    },
  });

  await prismaAny.aiJob.update({
    where: { id: aiJob.id },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    const homeAiService = new HomeAiService();
    const { output, log } = await homeAiService.generateDailySummary({
      summaryType: params.summaryType,
      date: effectiveDate,
      marketSnapshotCount: counts.snapshotCount,
      alertCount: counts.alertCount,
      referenceCount: counts.referenceCount,
    });

    const generatedAt = new Date();
    const created = await prismaAny.aiSummary.create({
      data: {
        aiJobId: aiJob.id,
        userId: null,
        summaryScope: 'daily',
        targetEntityType: 'market_snapshot',
        targetEntityId: 'market:jp',
        title: output.title,
        bodyMarkdown: output.bodyMarkdown,
        structuredJson: output.structuredJson as any,
        modelName: output.modelName,
        promptVersion: output.promptVersion,
        generatedAt,
        generationContextJson: {
          summary_type: params.summaryType,
          date: effectiveDate,
          provider: log.provider,
          fallback_to_stub: log.fallbackToStub,
          snapshot_count: counts.snapshotCount,
          alert_count: counts.alertCount,
          reference_count: counts.referenceCount,
        } as any,
      },
    });

    await prismaAny.aiJob.update({
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
        responsePayload: { summary_id: created.id } as any,
      },
    });

    const structured = isRecord(created.structuredJson) ? created.structuredJson : null;
    const insufficient =
      structured && typeof structured.insufficient_context === 'boolean'
        ? structured.insufficient_context
        : false;

    return {
      jobId: aiJob.id,
      summary: {
        id: created.id,
        title: created.title ?? null,
        body_markdown: created.bodyMarkdown ?? null,
        structured_json: structured,
        generated_at: created.generatedAt ? new Date(created.generatedAt).toISOString() : null,
        status: 'available',
        insufficient_context: insufficient,
        summary_type: params.summaryType,
        date: effectiveDate,
      },
    };
  } catch (error) {
    await prismaAny.aiJob.update({
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

