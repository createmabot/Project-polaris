import { AppError } from '../utils/response';

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

  return snapshotCount === 0 || alertCount === 0 || referenceCount === 0;
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

