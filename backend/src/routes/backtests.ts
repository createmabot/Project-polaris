import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { parseTradingViewSummaryCsv } from '../backtests/csv';

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

export const backtestRoutes: FastifyPluginAsync = async (fastify) => {
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

    const version = await prisma.strategyRuleVersion.findUnique({
      where: { id: strategyVersionId },
    });
    if (!version) {
      throw new AppError(404, 'NOT_FOUND', 'strategy version was not found.');
    }

    const backtest = await prisma.backtest.create({
      data: {
        strategyRuleVersionId: strategyVersionId,
        title,
        executionSource,
        market,
        timeframe,
        status: 'pending',
      },
    });

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

  fastify.get<{ Params: { backtestId: string } }>('/:backtestId', async (request, reply) => {
    const { backtestId } = request.params;
    const backtest = await prisma.backtest.findUnique({
      where: { id: backtestId },
      include: {
        imports: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!backtest) {
      throw new AppError(404, 'NOT_FOUND', 'backtest was not found.');
    }

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
