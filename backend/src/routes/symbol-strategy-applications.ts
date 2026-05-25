import { Prisma } from '@prisma/client';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { enqueueCsvImportBacktestSummary } from '../backtests/ai-summary';
import { parseTradingViewSummaryCsv } from '../backtests/csv';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';

type CsvImportBody = {
  file_name?: unknown;
  content_type?: unknown;
  csv_text?: unknown;
  title?: unknown;
};

type ApplicationHistoryQuery = {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  order?: unknown;
  run_type?: unknown;
  run_status?: unknown;
  execution_source?: unknown;
  status?: unknown;
  with_metrics?: unknown;
};

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is required`);
  }
  return value.trim();
}

function normalizeOptionalString(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(value: unknown, fieldName: string, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(parsed) || Number(parsed) < 1) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a positive integer`);
  }
  return Number(parsed);
}

function parseEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
  defaultValue: T | null,
): T | null {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is invalid`);
  }
  return value as T;
}

function parseOptionalStringQuery(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a string`);
  }
  return value;
}

function parseBooleanQuery(value: unknown, fieldName: string, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be true or false`);
}

function buildPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    has_next: page * limit < total,
    has_prev: page > 1,
  };
}

function buildStrategySnapshot(application: {
  strategyRuleVersion: {
    id: string;
    strategyRuleId: string;
    naturalLanguageRule: string;
    generatedPine: string | null;
    market: string;
    timeframe: string;
    warningsJson: unknown;
    assumptionsJson: unknown;
  };
}) {
  const version = application.strategyRuleVersion;
  return {
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
}

function toCsvImportResponse(payload: {
  applicationId: string;
  run: {
    id: string;
    runType: string;
    status: string;
    backtestId: string | null;
    backtestImportId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  backtest: {
    id: string;
    title: string;
    status: string;
    executionSource: string;
    market: string;
    timeframe: string;
    createdAt: Date;
    updatedAt: Date;
  };
  backtestImport: {
    id: string;
    backtestId: string;
    fileName: string;
    fileSize: number;
    contentType: string | null;
    parseStatus: string;
    parseError: string | null;
    parsedSummaryJson: unknown;
    createdAt: Date;
    updatedAt: Date;
  };
}) {
  return {
    application_id: payload.applicationId,
    run: {
      id: payload.run.id,
      run_type: payload.run.runType,
      status: payload.run.status,
      backtest_id: payload.run.backtestId,
      backtest_import_id: payload.run.backtestImportId,
      created_at: payload.run.createdAt,
      updated_at: payload.run.updatedAt,
    },
    backtest: {
      id: payload.backtest.id,
      title: payload.backtest.title,
      status: payload.backtest.status,
      execution_source: payload.backtest.executionSource,
      market: payload.backtest.market,
      timeframe: payload.backtest.timeframe,
      created_at: payload.backtest.createdAt,
      updated_at: payload.backtest.updatedAt,
    },
    import: {
      id: payload.backtestImport.id,
      backtest_id: payload.backtestImport.backtestId,
      file_name: payload.backtestImport.fileName,
      file_size: payload.backtestImport.fileSize,
      content_type: payload.backtestImport.contentType,
      parse_status: payload.backtestImport.parseStatus,
      parse_error: payload.backtestImport.parseError,
      parsed_summary: payload.backtestImport.parsedSummaryJson,
      created_at: payload.backtestImport.createdAt,
      updated_at: payload.backtestImport.updatedAt,
    },
  };
}

function toApplicationSummary(application: {
  id: string;
  status: string;
  source: string;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
  symbol: {
    id: string;
    symbol: string;
    symbolCode: string | null;
    displayName: string | null;
  };
  strategyRule: {
    id: string;
    title: string;
    status: string;
  };
  strategyRuleVersion: {
    id: string;
    market: string;
    timeframe: string;
    status: string;
  };
}) {
  return {
    id: application.id,
    status: application.status,
    source: application.source,
    memo: application.memo,
    symbol: {
      id: application.symbol.id,
      symbol: application.symbol.symbol,
      symbol_code: application.symbol.symbolCode,
      display_name: application.symbol.displayName,
    },
    strategy: {
      id: application.strategyRule.id,
      title: application.strategyRule.title,
      status: application.strategyRule.status,
    },
    strategy_version: {
      id: application.strategyRuleVersion.id,
      market: application.strategyRuleVersion.market,
      timeframe: application.strategyRuleVersion.timeframe,
      status: application.strategyRuleVersion.status,
    },
    created_at: application.createdAt,
    updated_at: application.updatedAt,
  };
}

function toLinkedBacktest(backtest: {
  id: string;
  title: string;
  status: string;
  executionSource: string;
  market: string;
  timeframe: string;
  createdAt: Date;
  updatedAt: Date;
} | null) {
  if (!backtest) return null;
  return toBacktestReportResponse(backtest);
}

function toLinkedBacktestImport(backtestImport: {
  id: string;
  backtestId: string;
  fileName: string;
  parseStatus: string;
  parseError: string | null;
  createdAt: Date;
  updatedAt: Date;
} | null) {
  if (!backtestImport) return null;
  return {
    id: backtestImport.id,
    backtest_id: backtestImport.backtestId,
    file_name: backtestImport.fileName,
    parse_status: backtestImport.parseStatus,
    parse_error: backtestImport.parseError,
    created_at: backtestImport.createdAt,
    updated_at: backtestImport.updatedAt,
  };
}

function toApplicationHistoryRun(run: {
  id: string;
  runType: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  backtest: Parameters<typeof toLinkedBacktest>[0];
  backtestImport: Parameters<typeof toLinkedBacktestImport>[0];
}) {
  return {
    id: run.id,
    run_type: run.runType,
    status: run.status,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    error_code: run.errorCode,
    error_message: run.errorMessage,
    linked_backtest: toLinkedBacktest(run.backtest),
    linked_backtest_import: toLinkedBacktestImport(run.backtestImport),
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function emptyMetricsSummary(source: string) {
  return {
    period_from: null,
    period_to: null,
    trade_count: null,
    total_return_percent: null,
    price_change_percent: null,
    max_drawdown_percent: null,
    profit_factor: null,
    win_rate: null,
    source,
  };
}

function buildCsvMetricsSummary(parsedSummary: unknown) {
  if (!isRecord(parsedSummary)) return emptyMetricsSummary('backtest_import.parsed_summary_json');
  return {
    period_from: stringOrNull(parsedSummary.periodFrom),
    period_to: stringOrNull(parsedSummary.periodTo),
    trade_count: numberOrNull(parsedSummary.totalTrades),
    total_return_percent: null,
    price_change_percent: null,
    max_drawdown_percent: numberOrNull(parsedSummary.maxDrawdown),
    profit_factor: numberOrNull(parsedSummary.profitFactor),
    win_rate: numberOrNull(parsedSummary.winRate),
    source: 'backtest_import.parsed_summary_json',
  };
}

function buildInternalMetricsSummary(strategySnapshot: unknown) {
  const snapshot = isRecord(strategySnapshot) ? strategySnapshot : null;
  const resultSummary = isRecord(snapshot?.result_summary) ? snapshot.result_summary : null;
  const period = isRecord(resultSummary?.period) ? resultSummary.period : null;
  const metrics = isRecord(resultSummary?.metrics) ? resultSummary.metrics : null;
  if (!metrics) return emptyMetricsSummary('backtest.strategy_snapshot_json.result_summary');
  return {
    period_from: stringOrNull(period?.from),
    period_to: stringOrNull(period?.to),
    trade_count: numberOrNull(metrics.trade_count),
    total_return_percent: numberOrNull(metrics.total_return_percent ?? metrics.total_return),
    price_change_percent: numberOrNull(metrics.price_change_percent),
    max_drawdown_percent: numberOrNull(metrics.max_drawdown_percent ?? metrics.max_drawdown),
    profit_factor: numberOrNull(metrics.profit_factor),
    win_rate: numberOrNull(metrics.win_rate),
    source: 'backtest.strategy_snapshot_json.result_summary',
  };
}

function buildReportMetricsSummary(backtest: {
  executionSource: string;
  strategySnapshotJson: unknown;
}, backtestImport: { parsedSummaryJson: unknown } | null) {
  if (backtest.executionSource === 'internal_backtest') {
    return buildInternalMetricsSummary(backtest.strategySnapshotJson);
  }
  return buildCsvMetricsSummary(backtestImport?.parsedSummaryJson ?? null);
}

function toApplicationReport(run: {
  id: string;
  runType: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  backtest: {
    id: string;
    title: string;
    status: string;
    executionSource: string;
    market: string;
    timeframe: string;
    strategySnapshotJson: unknown;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  backtestImport: {
    parsedSummaryJson: unknown;
  } | null;
}, withMetrics: boolean) {
  if (!run.backtest) return null;
  const reportOrigin = run.runType === 'internal_backtest' ? 'internal_backtest' : 'csv_import';
  return {
    id: run.backtest.id,
    title: run.backtest.title,
    status: run.backtest.status,
    execution_source: run.backtest.executionSource,
    report_origin: reportOrigin,
    market: run.backtest.market,
    timeframe: run.backtest.timeframe,
    created_at: run.backtest.createdAt,
    updated_at: run.backtest.updatedAt,
    linked_run: {
      id: run.id,
      run_type: run.runType,
      status: run.status,
      created_at: run.createdAt,
      updated_at: run.updatedAt,
      started_at: run.startedAt,
      finished_at: run.finishedAt,
    },
    metrics: withMetrics ? buildReportMetricsSummary(run.backtest, run.backtestImport) : null,
    importless_report: run.runType === 'internal_backtest',
    backtest_detail_link: {
      path: `/backtests/${run.backtest.id}`,
      label: 'BacktestDetail',
    },
  };
}

function toBacktestReportResponse(backtest: {
  id: string;
  title: string;
  status: string;
  executionSource: string;
  market: string;
  timeframe: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: backtest.id,
    title: backtest.title,
    status: backtest.status,
    execution_source: backtest.executionSource,
    market: backtest.market,
    timeframe: backtest.timeframe,
    created_at: backtest.createdAt,
    updated_at: backtest.updatedAt,
  };
}

function toApplicationMutationResponse(application: {
  id: string;
  status: string;
  source: string;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
  symbol: {
    id: string;
    symbol: string;
    symbolCode: string | null;
    displayName: string | null;
  };
  strategyRule: {
    id: string;
    title: string;
    status: string;
  };
  strategyRuleVersion: {
    id: string;
    market: string;
    timeframe: string;
    status: string;
  };
  _count?: {
    runs?: number;
  };
}) {
  return {
    application: {
      id: application.id,
      status: application.status,
      source: application.source,
      memo: application.memo,
      created_at: application.createdAt,
      updated_at: application.updatedAt,
      symbol: {
        id: application.symbol.id,
        symbol: application.symbol.symbol,
        symbol_code: application.symbol.symbolCode,
        display_name: application.symbol.displayName,
      },
      strategy: {
        id: application.strategyRule.id,
        title: application.strategyRule.title,
        status: application.strategyRule.status,
      },
      strategy_version: {
        id: application.strategyRuleVersion.id,
        market: application.strategyRuleVersion.market,
        timeframe: application.strategyRuleVersion.timeframe,
        status: application.strategyRuleVersion.status,
      },
      run_count: application._count?.runs ?? 0,
    },
  };
}

export async function symbolStrategyApplicationRoutes(fastify: FastifyInstance) {
  fastify.get('/:applicationId/runs', async (
    request: FastifyRequest<{
      Params: { applicationId: string };
      Querystring: ApplicationHistoryQuery;
    }>,
    reply: FastifyReply,
  ) => {
    const { applicationId } = request.params;
    const query = request.query ?? {};
    const page = parsePositiveInteger(query.page, 'page', 1);
    const limit = parsePositiveInteger(query.limit, 'limit', 20);
    if (limit > 50) {
      throw new AppError(400, 'VALIDATION_ERROR', 'limit must be 50 or less');
    }
    const sort = parseEnum(query.sort, 'sort', ['created_at', 'updated_at'] as const, 'created_at') ?? 'created_at';
    const order = parseEnum(query.order, 'order', ['asc', 'desc'] as const, 'desc') ?? 'desc';
    const runType = parseEnum(query.run_type, 'run_type', ['csv_import', 'internal_backtest'] as const, null);
    const runStatus = parseEnum(
      query.run_status,
      'run_status',
      ['queued', 'running', 'succeeded', 'failed', 'canceled'] as const,
      null,
    );

    const application = await prisma.symbolStrategyApplication.findUnique({
      where: { id: applicationId },
      include: {
        symbol: { select: { id: true, symbol: true, symbolCode: true, displayName: true } },
        strategyRule: { select: { id: true, title: true, status: true } },
        strategyRuleVersion: { select: { id: true, market: true, timeframe: true, status: true } },
      },
    });
    if (!application) {
      throw new AppError(404, 'NOT_FOUND', 'The specified symbol strategy application was not found.');
    }

    const where: Prisma.SymbolStrategyApplicationRunWhereInput = {
      applicationId,
      ...(runType ? { runType } : {}),
      ...(runStatus ? { status: runStatus } : {}),
    };
    const [runCount, total, runs] = await Promise.all([
      prisma.symbolStrategyApplicationRun.count({ where: { applicationId } }),
      prisma.symbolStrategyApplicationRun.count({ where }),
      prisma.symbolStrategyApplicationRun.findMany({
        where,
        orderBy: sort === 'updated_at' ? { updatedAt: order } : { createdAt: order },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          backtest: true,
          backtestImport: true,
        },
      }),
    ]);

    return reply.status(200).send(formatSuccess(request, {
      application: {
        ...toApplicationSummary(application),
        run_count: runCount,
      },
      query: {
        run_type: runType,
        run_status: runStatus,
        sort,
        order,
      },
      pagination: buildPagination(page, limit, total),
      runs: (runs as any[]).map(toApplicationHistoryRun),
    }));
  });

  fastify.get('/:applicationId/reports', async (
    request: FastifyRequest<{
      Params: { applicationId: string };
      Querystring: ApplicationHistoryQuery;
    }>,
    reply: FastifyReply,
  ) => {
    const { applicationId } = request.params;
    const query = request.query ?? {};
    const page = parsePositiveInteger(query.page, 'page', 1);
    const limit = parsePositiveInteger(query.limit, 'limit', 20);
    if (limit > 50) {
      throw new AppError(400, 'VALIDATION_ERROR', 'limit must be 50 or less');
    }
    const sort = parseEnum(query.sort, 'sort', ['created_at', 'updated_at'] as const, 'created_at') ?? 'created_at';
    const order = parseEnum(query.order, 'order', ['asc', 'desc'] as const, 'desc') ?? 'desc';
    const executionSource = parseEnum(
      query.execution_source,
      'execution_source',
      ['tradingview', 'internal_backtest'] as const,
      null,
    );
    const runType = parseEnum(query.run_type, 'run_type', ['csv_import', 'internal_backtest'] as const, null);
    const status = parseOptionalStringQuery(query.status, 'status');
    const withMetrics = parseBooleanQuery(query.with_metrics, 'with_metrics', true);

    const application = await prisma.symbolStrategyApplication.findUnique({
      where: { id: applicationId },
      include: {
        symbol: { select: { id: true, symbol: true, symbolCode: true, displayName: true } },
        strategyRule: { select: { id: true, title: true, status: true } },
        strategyRuleVersion: { select: { id: true, market: true, timeframe: true, status: true } },
      },
    });
    if (!application) {
      throw new AppError(404, 'NOT_FOUND', 'The specified symbol strategy application was not found.');
    }

    const where: Prisma.SymbolStrategyApplicationRunWhereInput = {
      applicationId,
      backtestId: { not: null },
      ...(runType ? { runType } : {}),
      ...(executionSource || status
        ? {
            backtest: {
              is: {
                ...(executionSource ? { executionSource } : {}),
                ...(status ? { status } : {}),
              },
            },
          }
        : {}),
    };
    const allRuns = await prisma.symbolStrategyApplicationRun.findMany({
      where,
      include: {
        backtest: true,
        backtestImport: true,
      },
    });
    const sortedRuns = allRuns
      .filter((run) => run.backtest)
      .sort((a, b) => {
        const aDate = sort === 'updated_at' ? a.backtest!.updatedAt : a.backtest!.createdAt;
        const bDate = sort === 'updated_at' ? b.backtest!.updatedAt : b.backtest!.createdAt;
        const diff = aDate.getTime() - bDate.getTime();
        return order === 'asc' ? diff : -diff;
      });
    const reportCount = await prisma.symbolStrategyApplicationRun.count({
      where: { applicationId, backtestId: { not: null } },
    });
    const paginatedRuns = sortedRuns.slice((page - 1) * limit, page * limit);

    return reply.status(200).send(formatSuccess(request, {
      application: {
        ...toApplicationSummary(application),
        report_count: reportCount,
      },
      query: {
        execution_source: executionSource,
        run_type: runType,
        status,
        with_metrics: withMetrics,
        sort,
        order,
      },
      pagination: buildPagination(page, limit, sortedRuns.length),
      reports: paginatedRuns
        .map((run) => toApplicationReport(run, withMetrics))
        .filter((report): report is NonNullable<typeof report> => report !== null),
    }));
  });

  fastify.patch('/:applicationId/archive', async (
    request: FastifyRequest<{ Params: { applicationId: string } }>,
    reply: FastifyReply,
  ) => {
    const { applicationId } = request.params;
    const existing = await prisma.symbolStrategyApplication.findUnique({
      where: { id: applicationId },
    });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'The specified symbol strategy application was not found.');
    }

    const application = await prisma.symbolStrategyApplication.update({
      where: { id: applicationId },
      data: { status: 'archived' },
      include: {
        symbol: {
          select: {
            id: true,
            symbol: true,
            symbolCode: true,
            displayName: true,
          },
        },
        strategyRule: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        strategyRuleVersion: {
          select: {
            id: true,
            market: true,
            timeframe: true,
            status: true,
          },
        },
        _count: {
          select: {
            runs: true,
          },
        },
      },
    });

    return reply.status(200).send(formatSuccess(request, toApplicationMutationResponse(application)));
  });

  fastify.patch('/:applicationId/restore', async (
    request: FastifyRequest<{ Params: { applicationId: string } }>,
    reply: FastifyReply,
  ) => {
    const { applicationId } = request.params;
    const existing = await prisma.symbolStrategyApplication.findUnique({
      where: { id: applicationId },
    });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'The specified symbol strategy application was not found.');
    }

    if (existing.status !== 'active') {
      const duplicate = await prisma.symbolStrategyApplication.findFirst({
        where: {
          id: { not: applicationId },
          symbolId: existing.symbolId,
          strategyRuleVersionId: existing.strategyRuleVersionId,
          status: 'active',
        },
      });
      if (duplicate) {
        throw new AppError(409, 'CONFLICT', 'active application already exists for this symbol and strategy version.');
      }
    }

    const application = await prisma.symbolStrategyApplication.update({
      where: { id: applicationId },
      data: { status: 'active' },
      include: {
        symbol: {
          select: {
            id: true,
            symbol: true,
            symbolCode: true,
            displayName: true,
          },
        },
        strategyRule: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        strategyRuleVersion: {
          select: {
            id: true,
            market: true,
            timeframe: true,
            status: true,
          },
        },
        _count: {
          select: {
            runs: true,
          },
        },
      },
    });

    return reply.status(200).send(formatSuccess(request, toApplicationMutationResponse(application)));
  });

  fastify.post('/:applicationId/csv-import', async (
    request: FastifyRequest<{
      Params: { applicationId: string };
      Body: CsvImportBody;
    }>,
    reply: FastifyReply,
  ) => {
    const { applicationId } = request.params;
    const fileName = normalizeRequiredString(request.body?.file_name, 'file_name');
    const csvText = normalizeRequiredString(request.body?.csv_text, 'csv_text');
    const contentType = normalizeOptionalString(request.body?.content_type, 'content_type');
    const title = normalizeOptionalString(request.body?.title, 'title');

    const application = await prisma.symbolStrategyApplication.findUnique({
      where: { id: applicationId },
      include: {
        symbol: {
          select: {
            id: true,
            symbol: true,
            displayName: true,
          },
        },
        strategyRule: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        strategyRuleVersion: {
          select: {
            id: true,
            strategyRuleId: true,
            naturalLanguageRule: true,
            generatedPine: true,
            warningsJson: true,
            assumptionsJson: true,
            market: true,
            timeframe: true,
            status: true,
          },
        },
      },
    });

    if (!application) {
      throw new AppError(404, 'NOT_FOUND', 'The specified symbol strategy application was not found.');
    }
    if (application.status !== 'active') {
      throw new AppError(400, 'VALIDATION_ERROR', 'only active application can import CSV.');
    }

    const parseResult = parseTradingViewSummaryCsv(csvText);
    const parseStatus = parseResult.ok ? 'parsed' : 'failed';
    const backtestStatus = parseResult.ok ? 'imported' : 'import_failed';
    const runStatus = parseResult.ok ? 'succeeded' : 'failed';
    const parseError = parseResult.ok ? null : parseResult.error;
    const startedAt = new Date();
    const finishedAt = new Date();
    const defaultTitle = `${application.symbol.displayName || application.symbol.symbol} / ${application.strategyRule.title} / CSV import`;
    const strategySnapshot = buildStrategySnapshot(application);

    const result = await prisma.$transaction(async (tx) => {
      const backtest = await tx.backtest.create({
        data: {
          strategyRuleVersionId: application.strategyRuleVersionId,
          strategySnapshotJson: strategySnapshot as Prisma.InputJsonValue,
          title: title ?? defaultTitle,
          executionSource: 'tradingview',
          market: application.strategyRuleVersion.market,
          timeframe: application.strategyRuleVersion.timeframe,
          status: 'pending',
        },
      });

      const backtestImport = await tx.backtestImport.create({
        data: {
          backtestId: backtest.id,
          fileName,
          fileSize: Buffer.byteLength(csvText, 'utf8'),
          contentType,
          rawCsvText: csvText,
          parseStatus,
          parseError,
          parsedSummaryJson: parseResult.ok ? (parseResult.summary as Prisma.InputJsonValue) : undefined,
        },
      });

      const updatedBacktest = await tx.backtest.update({
        where: { id: backtest.id },
        data: { status: backtestStatus },
      });

      const run = await tx.symbolStrategyApplicationRun.create({
        data: {
          applicationId: application.id,
          runType: 'csv_import',
          status: runStatus,
          backtestId: updatedBacktest.id,
          backtestImportId: backtestImport.id,
          startedAt,
          finishedAt,
          errorCode: parseResult.ok ? null : 'CSV_PARSE_FAILED',
          errorMessage: parseError,
        },
      });

      return { run, backtest: updatedBacktest, backtestImport };
    });

    if (parseResult.ok) {
      void enqueueCsvImportBacktestSummary(result.backtest.id, result.backtestImport.id).catch((error) => {
        request.log.warn(
          {
            err: error instanceof Error ? { name: error.name } : { name: 'UnknownError' },
            backtest_id: result.backtest.id,
            import_id: result.backtestImport.id,
            application_id: application.id,
          },
          'application_csv_import_ai_summary_enqueue_failed',
        );
      });
    }

    return reply.status(201).send(formatSuccess(request, toCsvImportResponse({
      applicationId: application.id,
      run: result.run,
      backtest: result.backtest,
      backtestImport: result.backtestImport,
    })));
  });

}
