import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { parseTradingViewSummaryCsv } from '../backtests/csv';
import { enqueueCsvImportBacktestSummary, generateBacktestSummaryWithJob } from '../backtests/ai-summary';

type CreateBacktestBody = {
  strategy_version_id?: string;
  title?: string;
  execution_source?: string;
  market?: string;
  timeframe?: string;
};

type CreateImportBody = {
  file_name?: string;
  content_type?: string;
  csv_text?: string;
};

type GenerateBacktestSummaryBody = {
  force?: unknown;
};

type BacktestStrategySnapshot = {
  strategy_id: string;
  strategy_version_id: string;
  natural_language_rule: string;
  generated_pine: string | null;
  market: string;
  timeframe: string;
  warnings: string[];
  assumptions: string[];
  captured_at: string;
  execution_source?: string | null;
  internal_backtest_execution_id?: string | null;
  result_summary?: Record<string, unknown> | null;
  artifact_pointer?: Record<string, unknown> | null;
  reported_at?: string | null;
};

type ParsedImportSummary = {
  totalTrades: number | null;
  winRate: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  netProfit: number | null;
  periodFrom: string | null;
  periodTo: string | null;
};

type BacktestTradeSummaryInput = {
  parsedImportCount: number;
  averageTotalTrades: number | null;
  averageWinRate: number | null;
  averageProfitFactor: number | null;
  averageNetProfit: number | null;
  bestNetProfit: number | null;
  worstNetProfit: number | null;
};

type BacktestComparisonDiffInput = {
  baseImportId: string;
  targetImportId: string;
  totalTradesDiff: number | null;
  winRateDiffPt: number | null;
  profitFactorDiff: number | null;
  maxDrawdownDiff: number | null;
  netProfitDiff: number | null;
};

type ParsedImportForAi = ParsedImportSummary & {
  importId: string;
  fileName: string;
  createdAt: string;
};

type ReportMetricsSummary = {
  period_from: string | null;
  period_to: string | null;
  trade_count: number | null;
  total_return_percent: number | null;
  price_change_percent: number | null;
  max_drawdown_percent: number | null;
  profit_factor: number | null;
  win_rate: number | null;
};

type BacktestAiReviewView = {
  summary_id: string | null;
  title: string | null;
  body_markdown: string | null;
  structured_json: Record<string, unknown> | null;
  generated_at: string | null;
  status: 'available' | 'unavailable';
  insufficient_context: boolean;
};

type BacktestAiSummaryJobView = {
  job_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | string;
  trigger: string | null;
  error_message: string | null;
  duration_ms: number | null;
  estimated_cost_usd: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseParsedImportSummary(value: unknown): ParsedImportSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    totalTrades: typeof value.totalTrades === 'number' ? value.totalTrades : null,
    winRate: typeof value.winRate === 'number' ? value.winRate : null,
    profitFactor: typeof value.profitFactor === 'number' ? value.profitFactor : null,
    maxDrawdown: typeof value.maxDrawdown === 'number' ? value.maxDrawdown : null,
    netProfit: typeof value.netProfit === 'number' ? value.netProfit : null,
    periodFrom: typeof value.periodFrom === 'string' ? value.periodFrom : null,
    periodTo: typeof value.periodTo === 'string' ? value.periodTo : null,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function emptyReportMetricsSummary(): ReportMetricsSummary {
  return {
    period_from: null,
    period_to: null,
    trade_count: null,
    total_return_percent: null,
    price_change_percent: null,
    max_drawdown_percent: null,
    profit_factor: null,
    win_rate: null,
  };
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function average(values: Array<number | null>, digits = 2): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (valid.length === 0) return null;
  return round(valid.reduce((acc, value) => acc + value, 0) / valid.length, digits);
}

function buildParsedImportsForAi(imports: Array<{
  id: string;
  fileName: string;
  createdAt: Date;
  parsedSummaryJson: unknown;
}>): ParsedImportForAi[] {
  return imports
    .map((item) => {
      const parsed = parseParsedImportSummary(item.parsedSummaryJson);
      if (!parsed) return null;
      return {
        importId: item.id,
        fileName: item.fileName,
        createdAt: item.createdAt.toISOString(),
        ...parsed,
      };
    })
    .filter((item): item is ParsedImportForAi => item !== null);
}

function buildTradeSummaryForAi(parsedImports: ParsedImportForAi[]): BacktestTradeSummaryInput | null {
  if (parsedImports.length === 0) return null;
  const netProfits = parsedImports
    .map((item) => item.netProfit)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    parsedImportCount: parsedImports.length,
    averageTotalTrades: average(parsedImports.map((item) => item.totalTrades), 1),
    averageWinRate: average(parsedImports.map((item) => item.winRate), 2),
    averageProfitFactor: average(parsedImports.map((item) => item.profitFactor), 2),
    averageNetProfit: average(parsedImports.map((item) => item.netProfit), 0),
    bestNetProfit: netProfits.length > 0 ? Math.max(...netProfits) : null,
    worstNetProfit: netProfits.length > 0 ? Math.min(...netProfits) : null,
  };
}

function diffValue(target: number | null, base: number | null, digits = 2): number | null {
  if (typeof target !== 'number' || typeof base !== 'number') return null;
  return round(target - base, digits);
}

function buildComparisonDiffForAi(parsedImports: ParsedImportForAi[]): BacktestComparisonDiffInput | null {
  if (parsedImports.length < 2) return null;
  const target = parsedImports[0];
  const base = parsedImports[1];
  return {
    baseImportId: base.importId,
    targetImportId: target.importId,
    totalTradesDiff: diffValue(target.totalTrades, base.totalTrades, 0),
    winRateDiffPt: diffValue(target.winRate, base.winRate, 2),
    profitFactorDiff: diffValue(target.profitFactor, base.profitFactor, 2),
    maxDrawdownDiff: diffValue(target.maxDrawdown, base.maxDrawdown, 2),
    netProfitDiff: diffValue(target.netProfit, base.netProfit, 0),
  };
}

function toBacktestAiReviewView(summary: any | null): BacktestAiReviewView {
  if (!summary) {
    return {
      summary_id: null,
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
    summary_id: summary.id,
    title: summary.title ?? null,
    body_markdown: summary.bodyMarkdown ?? null,
    structured_json: structured,
    generated_at: summary.generatedAt ? new Date(summary.generatedAt).toISOString() : null,
    status: 'available',
    insufficient_context: insufficient,
  };
}

function sanitizeAiJobErrorMessage(message: string | null): string | null {
  if (!message) return null;
  let sanitized = message;
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9_-]{10,}/g, '[REDACTED]');
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, 'Bearer [REDACTED]');
  for (const key of ['api_key', 'token', 'shared_secret', 'password']) {
    const regex = new RegExp(`(["']?${key}["']?\\s*[:=]\\s*["']?)([^\\s"']+)`, 'gi');
    sanitized = sanitized.replace(regex, '$1[REDACTED]');
  }
  sanitized = sanitized.replace(/[A-Za-z]:\\[^\s"']+/g, '[REDACTED_PATH]');
  sanitized = sanitized.replace(/\/(?:Users|home|var|tmp|workspace)\/[^\s"']+/g, '[REDACTED_PATH]');
  if (sanitized.length > 240) {
    sanitized = `${sanitized.slice(0, 240)}...`;
  }
  return sanitized;
}

function toIsoStringOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildLatestBacktestAiSummaryJobView(job: any | null): BacktestAiSummaryJobView | null {
  if (!job) return null;
  const requestPayload = isRecord(job.requestPayload) ? job.requestPayload : null;
  const trigger = typeof requestPayload?.trigger === 'string' ? requestPayload.trigger : null;
  return {
    job_id: job.id,
    status: job.status,
    trigger,
    error_message: sanitizeAiJobErrorMessage(job.errorMessage ?? null),
    duration_ms: typeof job.durationMs === 'number' ? job.durationMs : null,
    estimated_cost_usd: typeof job.estimatedCostUsd === 'number' ? job.estimatedCostUsd : null,
    created_at: toIsoStringOrNull(job.createdAt) ?? new Date(0).toISOString(),
    started_at: toIsoStringOrNull(job.startedAt),
    completed_at: toIsoStringOrNull(job.completedAt),
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

function normalizeBacktestStrategySnapshot(value: unknown): BacktestStrategySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const strategyId = typeof row.strategy_id === 'string' ? row.strategy_id : '';
  const strategyVersionId = typeof row.strategy_version_id === 'string' ? row.strategy_version_id : '';
  const naturalLanguageRule = typeof row.natural_language_rule === 'string' ? row.natural_language_rule : '';
  const market = typeof row.market === 'string' ? row.market : '';
  const timeframe = typeof row.timeframe === 'string' ? row.timeframe : '';

  if (!strategyId || !strategyVersionId || !naturalLanguageRule || !market || !timeframe) {
    return null;
  }

  return {
    strategy_id: strategyId,
    strategy_version_id: strategyVersionId,
    natural_language_rule: naturalLanguageRule,
    generated_pine: typeof row.generated_pine === 'string' ? row.generated_pine : null,
    market,
    timeframe,
    warnings: toStringArray(row.warnings),
    assumptions: toStringArray(row.assumptions),
    captured_at: typeof row.captured_at === 'string' ? row.captured_at : '',
    execution_source: typeof row.execution_source === 'string' ? row.execution_source : null,
    internal_backtest_execution_id:
      typeof row.internal_backtest_execution_id === 'string' ? row.internal_backtest_execution_id : null,
    result_summary: isRecord(row.result_summary) ? row.result_summary : null,
    artifact_pointer: isRecord(row.artifact_pointer) ? row.artifact_pointer : null,
    reported_at: typeof row.reported_at === 'string' ? row.reported_at : null,
  };
}

function buildInternalBacktestContext(snapshot: BacktestStrategySnapshot | null, executionSource: string) {
  if (executionSource !== 'internal_backtest' && snapshot?.execution_source !== 'internal_backtest') {
    return null;
  }
  const resultSummary = snapshot?.result_summary ?? null;
  const period = isRecord(resultSummary?.period) ? resultSummary.period : null;
  const metrics = isRecord(resultSummary?.metrics) ? resultSummary.metrics : null;
  const summaryKind =
    typeof resultSummary?.summary_kind === 'string'
      ? resultSummary.summary_kind
      : typeof resultSummary?.kind === 'string'
        ? resultSummary.kind
        : null;

  return {
    executionSource: 'internal_backtest' as const,
    internalBacktestExecutionId: snapshot?.internal_backtest_execution_id ?? null,
    summaryKind,
    period,
    metrics,
    artifactPointer: snapshot?.artifact_pointer ?? null,
    resultSummary,
  };
}

function buildCsvReportMetricsSummary(imports: Array<{ parsedSummaryJson: unknown }>): ReportMetricsSummary {
  const parsed = parseParsedImportSummary(imports[0]?.parsedSummaryJson ?? null);
  if (!parsed) return emptyReportMetricsSummary();
  return {
    period_from: parsed.periodFrom,
    period_to: parsed.periodTo,
    trade_count: parsed.totalTrades,
    total_return_percent: null,
    price_change_percent: null,
    max_drawdown_percent: parsed.maxDrawdown,
    profit_factor: parsed.profitFactor,
    win_rate: parsed.winRate,
  };
}

function buildInternalReportMetricsSummary(snapshot: BacktestStrategySnapshot | null): ReportMetricsSummary {
  const resultSummary = snapshot?.result_summary ?? null;
  const period = isRecord(resultSummary?.period) ? resultSummary.period : null;
  const metrics = isRecord(resultSummary?.metrics) ? resultSummary.metrics : null;
  if (!resultSummary || !metrics) return emptyReportMetricsSummary();

  return {
    period_from: stringOrNull(period?.from),
    period_to: stringOrNull(period?.to),
    trade_count: numberOrNull(metrics.trade_count),
    total_return_percent: numberOrNull(metrics.total_return_percent ?? metrics.total_return),
    price_change_percent: numberOrNull(metrics.price_change_percent),
    max_drawdown_percent: numberOrNull(metrics.max_drawdown_percent ?? metrics.max_drawdown),
    profit_factor: numberOrNull(metrics.profit_factor),
    win_rate: numberOrNull(metrics.win_rate),
  };
}

function buildReportMetricsSummary(backtest: {
  executionSource: string;
  strategySnapshotJson: unknown;
  imports?: Array<{ parsedSummaryJson: unknown }>;
}): ReportMetricsSummary {
  const snapshot = normalizeBacktestStrategySnapshot(backtest.strategySnapshotJson);
  if (backtest.executionSource === 'internal_backtest' || snapshot?.execution_source === 'internal_backtest') {
    return buildInternalReportMetricsSummary(snapshot);
  }
  return buildCsvReportMetricsSummary(backtest.imports ?? []);
}

async function resolveLatestBacktestAiReview(backtestId: string, importIds: string[]) {
  const summary = await prisma.aiSummary.findFirst({
    where: {
      summaryScope: 'backtest_review',
      OR: [
        {
          targetEntityType: 'backtest',
          targetEntityId: backtestId,
        },
        ...(importIds.length > 0
          ? [
              {
                targetEntityType: 'backtest_run',
                targetEntityId: {
                  in: importIds,
                },
              },
            ]
          : []),
      ],
    },
    orderBy: [{ generatedAt: 'desc' }, { createdAt: 'desc' }],
  });
  return toBacktestAiReviewView(summary);
}

async function resolveLatestBacktestAiSummaryJob(backtestId: string): Promise<BacktestAiSummaryJobView | null> {
  const job = await prisma.aiJob.findFirst({
    where: {
      jobType: 'generate_backtest_review_summary',
      targetEntityType: 'backtest',
      targetEntityId: backtestId,
    },
    orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
  });
  return buildLatestBacktestAiSummaryJobView(job);
}

async function resolveBacktestSymbolStrategyApplication(backtestId: string) {
  const run = await prisma.symbolStrategyApplicationRun.findFirst({
    where: {
      backtestId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      backtest: {
        include: {
          imports: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      },
      application: {
        include: {
          symbol: {
            select: {
              id: true,
              symbol: true,
              symbolCode: true,
              marketCode: true,
              tradingviewSymbol: true,
              displayName: true,
            },
          },
          strategyRule: {
            select: {
              id: true,
              title: true,
            },
          },
          strategyRuleVersion: {
            select: {
              id: true,
              market: true,
              timeframe: true,
            },
          },
        },
      },
    },
  });

  if (!run) {
    return null;
  }

  const relatedRuns = await prisma.symbolStrategyApplicationRun.findMany({
    where: {
      applicationId: run.applicationId,
      backtestId: {
        not: null,
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 10,
    include: {
      backtest: {
        include: {
          imports: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      },
    },
  });

  const resolveRunAiReview = async (targetRun: typeof run | (typeof relatedRuns)[number]) => {
    if (!targetRun.backtest) return toBacktestAiReviewView(null);
    return resolveLatestBacktestAiReview(
      targetRun.backtest.id,
      targetRun.backtest.imports.map((item) => item.id),
    );
  };

  const toRelatedReport = async (relatedRun: (typeof relatedRuns)[number]) => {
    if (!relatedRun.backtest) return null;
    return {
      backtest_id: relatedRun.backtest.id,
      title: relatedRun.backtest.title,
      execution_source: relatedRun.backtest.executionSource,
      status: relatedRun.backtest.status,
      run_type: relatedRun.runType,
      run_status: relatedRun.status,
      updated_at: relatedRun.backtest.updatedAt,
      metrics: buildReportMetricsSummary(relatedRun.backtest),
      ai_review: await resolveRunAiReview(relatedRun),
    };
  };

  const relatedReports = await Promise.all(
    relatedRuns
      .filter((relatedRun) => relatedRun.backtest && relatedRun.backtestId !== backtestId)
      .map(toRelatedReport),
  );

  return {
    application_id: run.application.id,
    application_status: run.application.status,
    application_source: run.application.source,
    application_memo: run.application.memo,
    application_created_at: run.application.createdAt,
    application_updated_at: run.application.updatedAt,
    run_id: run.id,
    run_type: run.runType,
    run_status: run.status,
    run_created_at: run.createdAt,
    run_updated_at: run.updatedAt,
    symbol: {
      id: run.application.symbol.id,
      symbol: run.application.symbol.symbol,
      symbol_code: run.application.symbol.symbolCode,
      market_code: run.application.symbol.marketCode,
      tradingview_symbol: run.application.symbol.tradingviewSymbol,
      display_name: run.application.symbol.displayName,
    },
    strategy: {
      id: run.application.strategyRule.id,
      title: run.application.strategyRule.title,
    },
    strategy_version: {
      id: run.application.strategyRuleVersion.id,
      market: run.application.strategyRuleVersion.market,
      timeframe: run.application.strategyRuleVersion.timeframe,
    },
    current_report: run.backtest
      ? {
          backtest_id: run.backtest.id,
          title: run.backtest.title,
          execution_source: run.backtest.executionSource,
          status: run.backtest.status,
          run_type: run.runType,
          run_status: run.status,
          updated_at: run.backtest.updatedAt,
          metrics: buildReportMetricsSummary(run.backtest),
          ai_review: await resolveRunAiReview(run),
        }
      : null,
    related_reports: relatedReports
      .filter((report): report is NonNullable<Awaited<ReturnType<typeof toRelatedReport>>> => report !== null),
  };
}

export const backtestRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { page?: string; limit?: string; q?: string; status?: string; sort?: string; order?: string };
  }>('/', async (request, reply) => {
    const parsedPage = Number(request.query.page ?? 1);
    const parsedLimit = Number(request.query.limit ?? 20);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : NaN;
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50 ? parsedLimit : NaN;
    const q = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const status = typeof request.query.status === 'string' ? request.query.status.trim() : '';
    const sort = typeof request.query.sort === 'string' ? request.query.sort.trim() : 'created_at';
    const order = typeof request.query.order === 'string' ? request.query.order.trim().toLowerCase() : 'desc';

    if (!Number.isFinite(page) || !Number.isFinite(limit)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'page and limit must be positive integers. limit must be <= 50.');
    }
    if (sort && sort !== 'created_at' && sort !== 'updated_at') {
      throw new AppError(400, 'VALIDATION_ERROR', 'sort must be one of: created_at, updated_at.');
    }
    if (order !== 'asc' && order !== 'desc') {
      throw new AppError(400, 'VALIDATION_ERROR', 'order must be one of: asc, desc.');
    }

    const where: Prisma.BacktestWhereInput = {
      ...(q
        ? {
            title: {
              contains: q,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(status ? { status } : {}),
    };

    const orderBy =
      sort === 'updated_at'
        ? { updatedAt: order as 'asc' | 'desc' }
        : { createdAt: order as 'asc' | 'desc' };

    const skip = (page - 1) * limit;
    const total = await prisma.backtest.count({ where });
    const backtests = await prisma.backtest.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        imports: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return reply.status(200).send(formatSuccess(request, {
      backtests: backtests.map((item) => ({
        strategy_id: normalizeBacktestStrategySnapshot(item.strategySnapshotJson)?.strategy_id ?? null,
        id: item.id,
        strategy_version_id: item.strategyRuleVersionId,
        title: item.title,
        execution_source: item.executionSource,
        market: item.market,
        timeframe: item.timeframe,
        status: item.status,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
        latest_import: item.imports[0]
          ? {
              id: item.imports[0].id,
              parse_status: item.imports[0].parseStatus,
              parse_error: item.imports[0].parseError,
              created_at: item.imports[0].createdAt,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        q,
        status,
        sort,
        order,
        total,
        has_next: skip + backtests.length < total,
        has_prev: page > 1,
      },
    }));
  });

  fastify.post<{ Body: CreateBacktestBody }>('/', async (request, reply) => {
    const strategyVersionId = typeof request.body.strategy_version_id === 'string'
      ? request.body.strategy_version_id.trim()
      : '';
    const title = typeof request.body.title === 'string' ? request.body.title.trim() : '';
    const executionSource = typeof request.body.execution_source === 'string'
      ? request.body.execution_source.trim()
      : 'tradingview';
    const market = typeof request.body.market === 'string' ? request.body.market.trim() : '';
    const timeframe = typeof request.body.timeframe === 'string' ? request.body.timeframe.trim() : '';

    if (!strategyVersionId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'strategy_version_id is required.');
    }
    if (!title) {
      throw new AppError(400, 'VALIDATION_ERROR', 'title is required.');
    }
    if (!market) {
      throw new AppError(400, 'VALIDATION_ERROR', 'market is required.');
    }
    if (!timeframe) {
      throw new AppError(400, 'VALIDATION_ERROR', 'timeframe is required.');
    }

    const version = await prisma.strategyRuleVersion.findUnique({ where: { id: strategyVersionId } });
    if (!version) {
      throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
    }

    const strategySnapshot: BacktestStrategySnapshot = {
      strategy_id: version.strategyRuleId,
      strategy_version_id: version.id,
      natural_language_rule: version.naturalLanguageRule,
      generated_pine: version.generatedPine,
      market: version.market,
      timeframe: version.timeframe,
      warnings: toStringArray(version.warningsJson),
      assumptions: toStringArray(version.assumptionsJson),
      captured_at: new Date().toISOString(),
    };

    let backtest;
    try {
      backtest = await prisma.backtest.create({
        data: {
          strategyRuleVersionId: strategyVersionId,
          strategySnapshotJson: strategySnapshot as Prisma.InputJsonValue,
          title,
          executionSource,
          market,
          timeframe,
          status: 'pending',
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2022' || error?.code === 'P2021') {
        throw new AppError(
          500,
          'DB_SCHEMA_MISMATCH',
          'Database schema is outdated. Run prisma migrate deploy and restart backend.',
        );
      }
      throw error;
    }

    return reply.status(201).send(formatSuccess(request, {
      backtest: {
        id: backtest.id,
        strategy_version_id: backtest.strategyRuleVersionId,
        title: backtest.title,
        execution_source: backtest.executionSource,
        market: backtest.market,
        timeframe: backtest.timeframe,
        status: backtest.status,
        created_at: backtest.createdAt,
        updated_at: backtest.updatedAt,
      },
    }));
  });

  fastify.post<{ Params: { backtestId: string }; Body: CreateImportBody }>('/:backtestId/imports', async (request, reply) => {
    const { backtestId } = request.params;
    const fileName = typeof request.body.file_name === 'string' ? request.body.file_name.trim() : '';
    const contentType = typeof request.body.content_type === 'string' ? request.body.content_type.trim() : '';
    const csvText = typeof request.body.csv_text === 'string' ? request.body.csv_text : '';

    if (!fileName) {
      throw new AppError(400, 'VALIDATION_ERROR', 'file_name is required.');
    }
    if (!csvText.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'csv_text is required.');
    }

    const backtest = await prisma.backtest.findUnique({ where: { id: backtestId } });
    if (!backtest) {
      throw new AppError(404, 'NOT_FOUND', 'backtest was not found.');
    }

    let parseStatus: 'pending' | 'parsed' | 'failed' = 'pending';
    let parseError: string | null = null;
    let parsedSummaryJson: Prisma.InputJsonValue | undefined;

    const parseResult = parseTradingViewSummaryCsv(csvText);
    if (parseResult.ok) {
      parseStatus = 'parsed';
      parsedSummaryJson = parseResult.summary as Prisma.InputJsonValue;
    } else {
      parseStatus = 'failed';
      parseError = parseResult.error;
    }

    const createdImport = await prisma.backtestImport.create({
      data: {
        backtestId: backtest.id,
        fileName,
        fileSize: Buffer.byteLength(csvText, 'utf8'),
        contentType: contentType || null,
        rawCsvText: csvText,
        parseStatus,
        parseError,
        parsedSummaryJson,
      },
    });

    const nextBacktestStatus = parseStatus === 'parsed' ? 'imported' : 'import_failed';
    await prisma.backtest.update({
      where: { id: backtest.id },
      data: { status: nextBacktestStatus },
    });

    if (parseStatus === 'parsed') {
      void enqueueCsvImportBacktestSummary(backtest.id, createdImport.id).catch((error) => {
        request.log.warn(
          {
            err: error instanceof Error ? { name: error.name } : { name: 'UnknownError' },
            backtest_id: backtest.id,
            import_id: createdImport.id,
          },
          'csv_import_ai_summary_enqueue_failed',
        );
      });
    }

    return reply.status(201).send(formatSuccess(request, {
      import: {
        id: createdImport.id,
        backtest_id: createdImport.backtestId,
        file_name: createdImport.fileName,
        file_size: createdImport.fileSize,
        content_type: createdImport.contentType,
        parse_status: createdImport.parseStatus,
        parse_error: createdImport.parseError,
        parsed_summary: createdImport.parsedSummaryJson,
        created_at: createdImport.createdAt,
        updated_at: createdImport.updatedAt,
      },
    }));
  });

  fastify.post<{ Params: { backtestId: string }; Body: GenerateBacktestSummaryBody }>(
    '/:backtestId/summary/generate',
    async (request, reply) => {
      const { backtestId } = request.params;
      const forceRegenerate = request.body?.force === true;
      const result = await generateBacktestSummaryWithJob(backtestId, { forceRegenerate });
      return reply.status(200).send(formatSuccess(request, {
        backtest_id: backtestId,
        job_id: result.jobId,
        status: 'queued',
        summary: result.summary,
      }));
    },
  );

  fastify.get<{ Params: { backtestId: string } }>('/:backtestId', async (request, reply) => {
    const { backtestId } = request.params;
    const backtest = await prisma.backtest.findUnique({
      where: { id: backtestId },
      include: {
        strategyRuleVersion: true,
        imports: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!backtest) {
      throw new AppError(404, 'NOT_FOUND', 'backtest was not found.');
    }

    const backtestRunIds = backtest.imports.map((item) => item.id);
    const aiReview = await resolveLatestBacktestAiReview(backtest.id, backtestRunIds);
    const latestAiSummaryJob = await resolveLatestBacktestAiSummaryJob(backtest.id);
    const symbolStrategyApplication = await resolveBacktestSymbolStrategyApplication(backtest.id);

    const snapshot = normalizeBacktestStrategySnapshot(backtest.strategySnapshotJson);
    const strategyVersion = backtest.strategyRuleVersion;

    return reply.status(200).send(formatSuccess(request, {
      backtest: {
        id: backtest.id,
        strategy_version_id: backtest.strategyRuleVersionId,
        title: backtest.title,
        execution_source: backtest.executionSource,
        market: backtest.market,
        timeframe: backtest.timeframe,
        status: backtest.status,
        created_at: backtest.createdAt,
        updated_at: backtest.updatedAt,
      },
      used_strategy: {
        strategy_id: strategyVersion?.strategyRuleId ?? snapshot?.strategy_id ?? null,
        strategy_version_id: strategyVersion?.id ?? snapshot?.strategy_version_id ?? null,
        snapshot: snapshot
          ? {
              strategy_id: snapshot.strategy_id,
              strategy_version_id: snapshot.strategy_version_id,
              natural_language_rule: snapshot.natural_language_rule,
              generated_pine: snapshot.generated_pine,
              market: snapshot.market,
              timeframe: snapshot.timeframe,
              warnings: snapshot.warnings,
              assumptions: snapshot.assumptions,
              captured_at: snapshot.captured_at || backtest.createdAt.toISOString(),
              execution_source: snapshot.execution_source,
              internal_backtest_execution_id: snapshot.internal_backtest_execution_id,
              result_summary: snapshot.result_summary,
              artifact_pointer: snapshot.artifact_pointer,
              reported_at: snapshot.reported_at,
            }
          : null,
      },
      latest_import: backtest.imports[0]
        ? {
            id: backtest.imports[0].id,
            file_name: backtest.imports[0].fileName,
            file_size: backtest.imports[0].fileSize,
            content_type: backtest.imports[0].contentType,
            parse_status: backtest.imports[0].parseStatus,
            parse_error: backtest.imports[0].parseError,
            parsed_summary: backtest.imports[0].parsedSummaryJson,
            created_at: backtest.imports[0].createdAt,
            updated_at: backtest.imports[0].updatedAt,
          }
        : null,
      imports: backtest.imports.map((item) => ({
        id: item.id,
        file_name: item.fileName,
        file_size: item.fileSize,
        content_type: item.contentType,
        parse_status: item.parseStatus,
        parse_error: item.parseError,
        parsed_summary: item.parsedSummaryJson,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      })),
      ai_review: aiReview,
      latest_ai_summary_job: latestAiSummaryJob,
      symbol_strategy_application: symbolStrategyApplication,
    }));
  });

  fastify.get<{ Params: { backtestId: string } }>('/:backtestId/imports', async (request, reply) => {
    const { backtestId } = request.params;
    const backtest = await prisma.backtest.findUnique({ where: { id: backtestId } });
    if (!backtest) {
      throw new AppError(404, 'NOT_FOUND', 'backtest was not found.');
    }

    const imports = await prisma.backtestImport.findMany({
      where: { backtestId },
      orderBy: { createdAt: 'desc' },
    });

    return reply.status(200).send(formatSuccess(request, {
      imports: imports.map((item) => ({
        id: item.id,
        backtest_id: item.backtestId,
        file_name: item.fileName,
        file_size: item.fileSize,
        content_type: item.contentType,
        parse_status: item.parseStatus,
        parse_error: item.parseError,
        parsed_summary: item.parsedSummaryJson,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      })),
    }));
  });
};
