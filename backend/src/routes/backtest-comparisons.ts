import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';

type ParsedImportSummary = {
  totalTrades: number | null;
  winRate: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  netProfit: number | null;
  periodFrom: string | null;
  periodTo: string | null;
};

type CreateBacktestComparisonBody = {
  base_import_id?: string;
  target_import_id?: string;
  include_ai_summary?: boolean;
};

function parseParsedImportSummary(value: unknown): ParsedImportSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  return {
    totalTrades: typeof row.totalTrades === 'number' ? row.totalTrades : null,
    winRate: typeof row.winRate === 'number' ? row.winRate : null,
    profitFactor: typeof row.profitFactor === 'number' ? row.profitFactor : null,
    maxDrawdown: typeof row.maxDrawdown === 'number' ? row.maxDrawdown : null,
    netProfit: typeof row.netProfit === 'number' ? row.netProfit : null,
    periodFrom: typeof row.periodFrom === 'string' ? row.periodFrom : null,
    periodTo: typeof row.periodTo === 'string' ? row.periodTo : null,
  };
}

function toNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value);
}

function buildMetricsDiff(base: ParsedImportSummary, target: ParsedImportSummary) {
  const totalTradesDiff = toNumber(target.totalTrades) !== null && toNumber(base.totalTrades) !== null
    ? Number((target.totalTrades! - base.totalTrades!).toFixed(2))
    : null;
  const winRateDiffPt = toNumber(target.winRate) !== null && toNumber(base.winRate) !== null
    ? Number((target.winRate! - base.winRate!).toFixed(2))
    : null;
  const profitFactorDiff = toNumber(target.profitFactor) !== null && toNumber(base.profitFactor) !== null
    ? Number((target.profitFactor! - base.profitFactor!).toFixed(2))
    : null;
  const maxDrawdownDiff = toNumber(target.maxDrawdown) !== null && toNumber(base.maxDrawdown) !== null
    ? Number((target.maxDrawdown! - base.maxDrawdown!).toFixed(2))
    : null;
  const netProfitDiff = toNumber(target.netProfit) !== null && toNumber(base.netProfit) !== null
    ? Number((target.netProfit! - base.netProfit!).toFixed(2))
    : null;

  return {
    schema_version: '1.0',
    total_trades_diff: totalTradesDiff,
    win_rate_diff_pt: winRateDiffPt,
    profit_factor_diff: profitFactorDiff,
    max_drawdown_diff: maxDrawdownDiff,
    net_profit_diff: netProfitDiff,
  };
}

function signText(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const fixed = Number(value).toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

function buildTradeoffSummary(diff: ReturnType<typeof buildMetricsDiff>): string {
  const lines = [
    `- 総取引数差分: ${signText(diff.total_trades_diff, 0)}`,
    `- 勝率差分(pt): ${signText(diff.win_rate_diff_pt, 2)}`,
    `- Profit Factor差分: ${signText(diff.profit_factor_diff, 2)}`,
    `- 最大ドローダウン差分: ${signText(diff.max_drawdown_diff, 2)}`,
    `- 純利益差分: ${signText(diff.net_profit_diff, 2)}`,
  ];
  return lines.join('\n');
}

function buildAiSummary(
  baseBacktestTitle: string,
  targetBacktestTitle: string,
  diff: ReturnType<typeof buildMetricsDiff>,
): string {
  const winRateDirection = (diff.win_rate_diff_pt ?? 0) > 0 ? '改善' : (diff.win_rate_diff_pt ?? 0) < 0 ? '低下' : '同水準';
  const profitDirection = (diff.net_profit_diff ?? 0) > 0 ? '増加' : (diff.net_profit_diff ?? 0) < 0 ? '減少' : '同水準';
  const ddDirection = (diff.max_drawdown_diff ?? 0) < 0 ? '改善（ドローダウン縮小）' : (diff.max_drawdown_diff ?? 0) > 0 ? '悪化（ドローダウン拡大）' : '同水準';

  return [
    `比較元「${baseBacktestTitle}」と比較先「${targetBacktestTitle}」の差分要約です。`,
    `- 勝率は ${winRateDirection}（${signText(diff.win_rate_diff_pt, 2)}pt）`,
    `- 純利益は ${profitDirection}（${signText(diff.net_profit_diff, 2)}）`,
    `- 最大ドローダウンは ${ddDirection}（${signText(diff.max_drawdown_diff, 2)}）`,
  ].join('\n');
}

export const backtestComparisonRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateBacktestComparisonBody }>('/', async (request, reply) => {
    const baseImportId = typeof request.body?.base_import_id === 'string' ? request.body.base_import_id.trim() : '';
    const targetImportId = typeof request.body?.target_import_id === 'string' ? request.body.target_import_id.trim() : '';
    const includeAiSummary = request.body?.include_ai_summary !== false;

    if (!baseImportId || !targetImportId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'base_import_id and target_import_id are required.');
    }
    if (baseImportId === targetImportId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'base_import_id and target_import_id must be different.');
    }

    const [baseImport, targetImport] = await Promise.all([
      prisma.backtestImport.findUnique({ where: { id: baseImportId }, include: { backtest: true } }),
      prisma.backtestImport.findUnique({ where: { id: targetImportId }, include: { backtest: true } }),
    ]);

    if (!baseImport || !targetImport) {
      throw new AppError(404, 'NOT_FOUND', 'comparison target imports were not found.');
    }

    const baseSummary = parseParsedImportSummary(baseImport.parsedSummaryJson);
    const targetSummary = parseParsedImportSummary(targetImport.parsedSummaryJson);
    if (!baseSummary || !targetSummary) {
      throw new AppError(400, 'VALIDATION_ERROR', 'both imports must have parsed_summary.');
    }

    const metricsDiff = buildMetricsDiff(baseSummary, targetSummary);
    const tradeoffSummary = buildTradeoffSummary(metricsDiff);
    const aiSummary = includeAiSummary
      ? buildAiSummary(baseImport.backtest.title, targetImport.backtest.title, metricsDiff)
      : null;

    const created = await prisma.backtestComparison.create({
      data: {
        baseBacktestId: baseImport.backtestId,
        baseImportId: baseImport.id,
        targetBacktestId: targetImport.backtestId,
        targetImportId: targetImport.id,
        metricsDiffJson: metricsDiff,
        tradeoffSummary,
        aiSummary,
      },
    });

    return reply.status(201).send(formatSuccess(request, {
      comparison: {
        comparison_id: created.id,
        base_backtest_id: created.baseBacktestId,
        base_import_id: created.baseImportId,
        target_backtest_id: created.targetBacktestId,
        target_import_id: created.targetImportId,
        metrics_diff: created.metricsDiffJson,
        tradeoff_summary: created.tradeoffSummary,
        ai_summary: created.aiSummary,
        created_at: created.createdAt,
      },
    }));
  });

  fastify.get<{ Params: { comparisonId: string } }>('/:comparisonId', async (request, reply) => {
    const { comparisonId } = request.params;
    const row = await prisma.backtestComparison.findUnique({
      where: { id: comparisonId },
    });
    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'backtest comparison was not found.');
    }

    return reply.status(200).send(formatSuccess(request, {
      comparison: {
        comparison_id: row.id,
        base_backtest_id: row.baseBacktestId,
        base_import_id: row.baseImportId,
        target_backtest_id: row.targetBacktestId,
        target_import_id: row.targetImportId,
        metrics_diff: row.metricsDiffJson,
        tradeoff_summary: row.tradeoffSummary,
        ai_summary: row.aiSummary,
        created_at: row.createdAt,
      },
    }));
  });
};

