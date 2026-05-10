import { Prisma } from '@prisma/client';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseTradingViewSummaryCsv } from '../backtests/csv';
import { prisma } from '../db';
import {
  createInternalBacktestExecution,
  toInternalBacktestExecutionResponse,
} from '../internal-backtests/create-execution';
import { type CreateExecutionRequestInput } from '../internal-backtests/contracts';
import { AppError, formatSuccess } from '../utils/response';

type CsvImportBody = {
  file_name?: unknown;
  content_type?: unknown;
  csv_text?: unknown;
  title?: unknown;
};

type InternalBacktestReportBody = {
  title?: unknown;
};

class BacktestReportLinkConflictError extends Error {
  constructor() {
    super('BACKTEST_REPORT_LINK_CONFLICT');
  }
}

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
    internalBacktestExecutionId: string | null;
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
      internal_backtest_execution_id: payload.run.internalBacktestExecutionId,
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

function toApplicationRunResponse(run: {
  id: string;
  runType: string;
  status: string;
  backtestId: string | null;
  backtestImportId: string | null;
  internalBacktestExecutionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: run.id,
    run_type: run.runType,
    status: run.status,
    backtest_id: run.backtestId,
    backtest_import_id: run.backtestImportId,
    internal_backtest_execution_id: run.internalBacktestExecutionId,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
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

async function findLinkedBacktestReport(runId: string) {
  const linkedRun = await prisma.symbolStrategyApplicationRun.findFirst({
    where: { id: runId },
  });
  if (!linkedRun?.backtestId) {
    return null;
  }

  const linkedBacktest = await prisma.backtest.findUnique({
    where: { id: linkedRun.backtestId },
  });
  if (!linkedBacktest) {
    throw new AppError(404, 'NOT_FOUND', 'The linked backtest report was not found.');
  }

  return { run: linkedRun, backtest: linkedBacktest };
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
          internalBacktestExecutionId: null,
          startedAt,
          finishedAt,
          errorCode: parseResult.ok ? null : 'CSV_PARSE_FAILED',
          errorMessage: parseError,
        },
      });

      return { run, backtest: updatedBacktest, backtestImport };
    });

    return reply.status(201).send(formatSuccess(request, toCsvImportResponse({
      applicationId: application.id,
      run: result.run,
      backtest: result.backtest,
      backtestImport: result.backtestImport,
    })));
  });

  fastify.post('/:applicationId/internal-backtests', async (
    request: FastifyRequest<{
      Params: { applicationId: string };
      Body: CreateExecutionRequestInput;
    }>,
    reply: FastifyReply,
  ) => {
    const { applicationId } = request.params;
    const application = await prisma.symbolStrategyApplication.findUnique({
      where: { id: applicationId },
      include: {
        symbol: {
          select: {
            id: true,
            symbol: true,
            symbolCode: true,
            tradingviewSymbol: true,
          },
        },
        strategyRuleVersion: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!application) {
      throw new AppError(404, 'NOT_FOUND', 'The specified symbol strategy application was not found.');
    }
    if (application.status !== 'active') {
      throw new AppError(400, 'VALIDATION_ERROR', 'only active application can start internal backtest.');
    }

    const executionTargetSymbol =
      application.symbol.symbolCode || application.symbol.symbol || application.symbol.tradingviewSymbol;
    const { execution } = await createInternalBacktestExecution({
      body: request.body ?? {},
      logger: request.log,
      strategyRuleVersionId: application.strategyRuleVersionId,
      executionTargetSymbol,
      forceExecutionTargetSymbol: true,
    });

    const run = await prisma.symbolStrategyApplicationRun.create({
      data: {
        applicationId: application.id,
        runType: 'internal_backtest',
        status: execution.status,
        backtestId: null,
        backtestImportId: null,
        internalBacktestExecutionId: execution.id,
        startedAt: execution.startedAt,
        finishedAt: execution.finishedAt,
        errorCode: null,
        errorMessage: null,
      },
    });

    return reply.status(201).send(formatSuccess(request, {
      application_id: application.id,
      run: toApplicationRunResponse(run),
      execution: toInternalBacktestExecutionResponse(execution),
    }));
  });

  fastify.post('/:applicationId/internal-backtests/:executionId/report', async (
    request: FastifyRequest<{
      Params: { applicationId: string; executionId: string };
      Body: InternalBacktestReportBody;
    }>,
    reply: FastifyReply,
  ) => {
    const { applicationId, executionId } = request.params;
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
            market: true,
            timeframe: true,
            warningsJson: true,
            assumptionsJson: true,
          },
        },
      },
    });

    if (!application) {
      throw new AppError(404, 'NOT_FOUND', 'The specified symbol strategy application was not found.');
    }

    const run = await prisma.symbolStrategyApplicationRun.findFirst({
      where: {
        applicationId,
        internalBacktestExecutionId: executionId,
        runType: 'internal_backtest',
      },
    });
    if (!run) {
      throw new AppError(404, 'NOT_FOUND', 'The specified internal backtest run was not found for this application.');
    }

    const execution = await prisma.internalBacktestExecution.findUnique({
      where: { id: executionId },
    });
    if (!execution) {
      throw new AppError(404, 'NOT_FOUND', 'The specified internal backtest execution was not found.');
    }
    if (execution.strategyRuleVersionId !== application.strategyRuleVersionId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'internal backtest execution does not match application strategy version.');
    }
    if (execution.status !== 'succeeded') {
      throw new AppError(409, 'CONFLICT', 'only succeeded internal backtest execution can be converted to a report.');
    }

    if (run.backtestId) {
      const existingBacktest = await prisma.backtest.findUnique({
        where: { id: run.backtestId },
      });
      if (!existingBacktest) {
        throw new AppError(404, 'NOT_FOUND', 'The linked backtest report was not found.');
      }

      return reply.status(200).send(formatSuccess(request, {
        application_id: application.id,
        run: toApplicationRunResponse(run),
        execution: toInternalBacktestExecutionResponse(execution),
        backtest: toBacktestReportResponse(existingBacktest),
      }));
    }

    const defaultTitle = `${application.symbol.displayName || application.symbol.symbol} / ${application.strategyRule.title} / internal backtest`;
    const reportedAt = new Date();
    const strategySnapshotJson: Prisma.InputJsonValue = {
      ...buildStrategySnapshot(application),
      execution_source: 'internal_backtest',
      internal_backtest_execution_id: execution.id,
      input_snapshot: execution.inputSnapshotJson as Prisma.InputJsonValue,
      result_summary: execution.resultSummaryJson as Prisma.InputJsonValue,
      artifact_pointer: execution.artifactPointerJson as Prisma.InputJsonValue,
      reported_at: reportedAt.toISOString(),
    };

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const backtest = await tx.backtest.create({
          data: {
            strategyRuleVersionId: application.strategyRuleVersionId,
            strategySnapshotJson,
            title: title ?? defaultTitle,
            executionSource: 'internal_backtest',
            market: application.strategyRuleVersion.market,
            timeframe: application.strategyRuleVersion.timeframe,
            status: 'completed',
          },
        });

        const updateResult = await tx.symbolStrategyApplicationRun.updateMany({
          where: {
            id: run.id,
            backtestId: null,
          },
          data: {
            status: 'succeeded',
            backtestId: backtest.id,
            finishedAt: execution.finishedAt ?? run.finishedAt,
            errorCode: null,
            errorMessage: null,
          },
        });
        if (updateResult.count !== 1) {
          throw new BacktestReportLinkConflictError();
        }

        const updatedRun = await tx.symbolStrategyApplicationRun.findFirst({
          where: { id: run.id },
        });
        if (!updatedRun) {
          throw new AppError(404, 'NOT_FOUND', 'The specified internal backtest run was not found for this application.');
        }

        return { backtest, run: updatedRun };
      });
    } catch (error) {
      if (error instanceof BacktestReportLinkConflictError) {
        const linked = await findLinkedBacktestReport(run.id);
        if (linked) {
          return reply.status(200).send(formatSuccess(request, {
            application_id: application.id,
            run: toApplicationRunResponse(linked.run),
            execution: toInternalBacktestExecutionResponse(execution),
            backtest: toBacktestReportResponse(linked.backtest),
          }));
        }
      }
      throw error;
    }

    return reply.status(201).send(formatSuccess(request, {
      application_id: application.id,
      run: toApplicationRunResponse(result.run),
      execution: toInternalBacktestExecutionResponse(execution),
      backtest: toBacktestReportResponse(result.backtest),
    }));
  });
}
