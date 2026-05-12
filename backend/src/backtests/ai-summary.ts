import crypto from 'crypto';
import { prisma } from '../db';
import { HomeAiService } from '../ai/home-ai-service';
import { AppError } from '../utils/response';

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

type BacktestAiReviewView = {
  summary_id: string | null;
  title: string | null;
  body_markdown: string | null;
  structured_json: Record<string, unknown> | null;
  generated_at: string | null;
  status: 'available' | 'unavailable';
  insufficient_context: boolean;
};

type BacktestSummaryJobTrigger = 'manual' | 'csv_import_auto';

type BacktestSummaryInput = {
  backtest: any;
  latestImport: any | null;
  metrics: ParsedImportSummary | null;
  parsedImportsForAi: ParsedImportForAi[];
  tradeSummary: BacktestTradeSummaryInput | null;
  comparisonDiff: BacktestComparisonDiffInput | null;
  snapshot: BacktestStrategySnapshot | null;
  internalBacktestContext: ReturnType<typeof buildInternalBacktestContext>;
  strategyVersion: any | null;
  importFiles: Array<{
    id: string;
    fileName: string;
    parseStatus: string;
    parseError: string | null;
    createdAt: string;
  }>;
  inputSnapshotHash: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseParsedImportSummary(value: unknown): ParsedImportSummary | null {
  if (!isRecord(value)) return null;
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

function normalizeBacktestStrategySnapshot(value: unknown): BacktestStrategySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const strategyId = typeof row.strategy_id === 'string' ? row.strategy_id : '';
  const strategyVersionId = typeof row.strategy_version_id === 'string' ? row.strategy_version_id : '';
  const naturalLanguageRule = typeof row.natural_language_rule === 'string' ? row.natural_language_rule : '';
  const market = typeof row.market === 'string' ? row.market : '';
  const timeframe = typeof row.timeframe === 'string' ? row.timeframe : '';
  if (!strategyId || !strategyVersionId || !naturalLanguageRule || !market || !timeframe) return null;

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
  if (executionSource !== 'internal_backtest' && snapshot?.execution_source !== 'internal_backtest') return null;
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

async function buildBacktestSummaryInput(backtestId: string): Promise<BacktestSummaryInput> {
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
  const parsedImportsForAi = buildParsedImportsForAi(backtest.imports).slice(0, 3);
  const tradeSummary = buildTradeSummaryForAi(parsedImportsForAi);
  const comparisonDiff = buildComparisonDiffForAi(parsedImportsForAi);
  const snapshot = normalizeBacktestStrategySnapshot(backtest.strategySnapshotJson);
  const internalBacktestContext = buildInternalBacktestContext(snapshot, backtest.executionSource);
  const strategyVersion = backtest.strategyRuleVersion;
  const importFiles = backtest.imports.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    parseStatus: item.parseStatus,
    parseError: item.parseError,
    createdAt: item.createdAt.toISOString(),
  }));

  const inputSnapshot = JSON.stringify({
    backtest_id: backtest.id,
    title: backtest.title,
    market: backtest.market,
    timeframe: backtest.timeframe,
    execution_source: backtest.executionSource,
    status: backtest.status,
    metrics,
    trade_summary: tradeSummary,
    import_files: importFiles.map((item) => ({
      id: item.id,
      file_name: item.fileName,
      parse_status: item.parseStatus,
    })),
    import_parsed_summaries: parsedImportsForAi,
    comparison_diff: comparisonDiff,
    report_context_type: internalBacktestContext ? 'internal_backtest' : 'csv_import',
    internal_backtest_context: internalBacktestContext
      ? {
          execution_source: internalBacktestContext.executionSource,
          internal_backtest_execution_id: internalBacktestContext.internalBacktestExecutionId,
          summary_kind: internalBacktestContext.summaryKind,
          period: internalBacktestContext.period,
          metrics: internalBacktestContext.metrics,
          artifact_pointer: internalBacktestContext.artifactPointer,
        }
      : null,
    strategy: {
      strategy_id: strategyVersion?.strategyRuleId ?? snapshot?.strategy_id ?? null,
      strategy_version_id: strategyVersion?.id ?? snapshot?.strategy_version_id ?? null,
      natural_language_rule: strategyVersion?.naturalLanguageRule ?? snapshot?.natural_language_rule ?? null,
      generated_pine: strategyVersion?.generatedPine ?? snapshot?.generated_pine ?? null,
    },
  });
  const inputSnapshotHash = crypto.createHash('sha256').update(inputSnapshot).digest('hex');

  return {
    backtest,
    latestImport,
    metrics,
    parsedImportsForAi,
    tradeSummary,
    comparisonDiff,
    snapshot,
    internalBacktestContext,
    strategyVersion,
    importFiles,
    inputSnapshotHash,
  };
}

async function findExistingBacktestSummary(input: BacktestSummaryInput) {
  return prisma.aiSummary.findFirst({
    where: {
      targetEntityType: 'backtest',
      targetEntityId: input.backtest.id,
      summaryScope: 'backtest_review',
      inputSnapshotHash: input.inputSnapshotHash,
    },
    orderBy: { generatedAt: 'desc' },
  });
}

async function findExistingBacktestSummaryJob(input: BacktestSummaryInput, statuses: string[]) {
  return prisma.aiJob.findFirst({
    where: {
      jobType: 'generate_backtest_review_summary',
      targetEntityType: 'backtest',
      targetEntityId: input.backtest.id,
      status: { in: statuses },
      requestPayload: {
        path: ['input_snapshot_hash'],
        equals: input.inputSnapshotHash,
      } as any,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function generateBacktestSummaryWithJob(
  backtestId: string,
  options: { trigger?: BacktestSummaryJobTrigger; sourceImportId?: string | null } = {},
): Promise<{ jobId: string; summary: BacktestAiReviewView }> {
  const trigger = options.trigger ?? 'manual';
  const input = await buildBacktestSummaryInput(backtestId);
  const {
    backtest,
    latestImport,
    metrics,
    parsedImportsForAi,
    tradeSummary,
    comparisonDiff,
    snapshot,
    internalBacktestContext,
    strategyVersion,
    importFiles,
    inputSnapshotHash,
  } = input;

  const job = await prisma.aiJob.create({
    data: {
      jobType: 'generate_backtest_review_summary',
      targetEntityType: 'backtest',
      targetEntityId: backtestId,
      requestPayload: {
        backtest_id: backtestId,
        latest_import_id: latestImport?.id ?? null,
        source_import_id: options.sourceImportId ?? null,
        trigger,
        input_snapshot_hash: inputSnapshotHash,
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
    const existing = await findExistingBacktestSummary(input);
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
      tradeSummary,
      importFiles,
      importParsedSummaries: parsedImportsForAi,
      comparisonDiff,
      internalBacktestContext,
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
          has_trade_summary: !!tradeSummary,
          has_comparison_diff: !!comparisonDiff,
          has_internal_backtest_context: !!internalBacktestContext,
          internal_backtest_execution_id: internalBacktestContext?.internalBacktestExecutionId ?? null,
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage,
      },
    });
    if (errorMessage.startsWith('ai_provider_failed(')) {
      throw new AppError(502, 'AI_PROVIDER_FAILED', errorMessage);
    }
    throw error;
  }
}

export async function enqueueCsvImportBacktestSummary(backtestId: string, importId: string): Promise<void> {
  const input = await buildBacktestSummaryInput(backtestId);
  if (input.latestImport?.id !== importId) return;
  if (!input.metrics) return;

  const existingSummary = await findExistingBacktestSummary(input);
  if (existingSummary) return;

  const existingActiveJob = await findExistingBacktestSummaryJob(input, ['queued', 'running']);
  if (existingActiveJob) return;

  const existingFailedJob = await findExistingBacktestSummaryJob(input, ['failed']);
  if (existingFailedJob) return;

  await generateBacktestSummaryWithJob(backtestId, {
    trigger: 'csv_import_auto',
    sourceImportId: importId,
  });
}
