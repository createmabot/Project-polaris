import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { parseTradingViewSummaryCsv } from '../backtests/csv';
import { HomeAiService } from '../ai/home-ai-service';

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

type BacktestAiReviewView = {
  summary_id: string | null;
  title: string | null;
  body_markdown: string | null;
  structured_json: Record<string, unknown> | null;
  generated_at: string | null;
  status: 'available' | 'unavailable';
  insufficient_context: boolean;
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
  };
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

async function generateBacktestSummaryWithJob(backtestId: string): Promise<{ jobId: string; summary: BacktestAiReviewView }> {
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

  const latestImport = backtest.imports[0] ?? null;
  const metrics = parseParsedImportSummary(latestImport?.parsedSummaryJson ?? null);
  const snapshot = normalizeBacktestStrategySnapshot(backtest.strategySnapshotJson);
  const strategyVersion = backtest.strategyRuleVersion;
  const importFiles = backtest.imports.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    parseStatus: item.parseStatus,
    parseError: item.parseError,
    createdAt: item.createdAt.toISOString(),
  }));

  const job = await prisma.aiJob.create({
    data: {
      jobType: 'generate_backtest_review_summary',
      targetEntityType: 'backtest',
      targetEntityId: backtestId,
      requestPayload: {
        backtest_id: backtestId,
        latest_import_id: latestImport?.id ?? null,
      } as any,
      status: 'queued',
    },
  });

  await prisma.aiJob.update({
    where: { id: job.id },
    data: {
      status: 'running',
      startedAt: new Date(),
    },
  });

  try {
    const inputSnapshot = JSON.stringify({
      backtest_id: backtest.id,
      title: backtest.title,
      market: backtest.market,
      timeframe: backtest.timeframe,
      execution_source: backtest.executionSource,
      status: backtest.status,
      metrics,
      import_files: importFiles.map((item) => ({
        id: item.id,
        file_name: item.fileName,
        parse_status: item.parseStatus,
      })),
      strategy: {
        strategy_id: strategyVersion?.strategyRuleId ?? snapshot?.strategy_id ?? null,
        strategy_version_id: strategyVersion?.id ?? snapshot?.strategy_version_id ?? null,
        natural_language_rule: strategyVersion?.naturalLanguageRule ?? snapshot?.natural_language_rule ?? null,
        generated_pine: strategyVersion?.generatedPine ?? snapshot?.generated_pine ?? null,
      },
    });
    const inputSnapshotHash = crypto.createHash('sha256').update(inputSnapshot).digest('hex');

    const existing = await prisma.aiSummary.findFirst({
      where: {
        targetEntityType: 'backtest',
        targetEntityId: backtestId,
        summaryScope: 'backtest_review',
        inputSnapshotHash,
      },
      orderBy: { generatedAt: 'desc' },
    });
    if (existing) {
      await prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: 'succeeded',
          completedAt: new Date(),
          responsePayload: { summary_id: existing.id, skipped: 'duplicate' } as any,
          modelName: existing.modelName,
          promptVersion: existing.promptVersion,
        },
      });
      return { jobId: job.id, summary: toBacktestAiReviewView(existing) };
    }

    const homeAiService = new HomeAiService();
    const { output, log } = await homeAiService.generateBacktestSummary({
      backtestId: backtest.id,
      title: backtest.title,
      executionSource: backtest.executionSource,
      market: backtest.market,
      timeframe: backtest.timeframe,
      status: backtest.status,
      metrics,
      importFiles,
      strategy: {
        strategyId: strategyVersion?.strategyRuleId ?? snapshot?.strategy_id ?? null,
        strategyVersionId: strategyVersion?.id ?? snapshot?.strategy_version_id ?? null,
        naturalLanguageRule: strategyVersion?.naturalLanguageRule ?? snapshot?.natural_language_rule ?? null,
        generatedPine: strategyVersion?.generatedPine ?? snapshot?.generated_pine ?? null,
      },
    });

    const generatedAt = new Date();
    const created = await prisma.aiSummary.create({
      data: {
        aiJobId: job.id,
        userId: null,
        summaryScope: 'backtest_review',
        targetEntityType: 'backtest',
        targetEntityId: backtestId,
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
          has_metrics: !!metrics,
          import_count: importFiles.length,
          market: backtest.market,
          timeframe: backtest.timeframe,
        } as any,
      },
    });

    await prisma.aiJob.update({
      where: { id: job.id },
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

    return { jobId: job.id, summary: toBacktestAiReviewView(created) };
  } catch (error) {
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
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

  fastify.post<{ Params: { backtestId: string } }>('/:backtestId/summary/generate', async (request, reply) => {
    const { backtestId } = request.params;
    const result = await generateBacktestSummaryWithJob(backtestId);
    return reply.status(200).send(formatSuccess(request, {
      backtest_id: backtestId,
      job_id: result.jobId,
      status: 'queued',
      summary: result.summary,
    }));
  });

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
