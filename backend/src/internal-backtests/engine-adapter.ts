import type { InternalBacktestDataSourceSnapshot, InternalBacktestExecutionInput } from './contracts';
import {
  defaultInternalBacktestDataSourceAdapter,
  type InternalBacktestDataSourceAdapter,
} from './data-source-adapter';

export type InternalBacktestEngineRunResult = {
  summary_kind?: 'scaffold_deterministic' | 'engine_estimated' | 'engine_actual';
  metrics?: Partial<{
    total_trades: number;
    win_rate: number;
    net_profit: number;
    profit_factor: number | null;
    max_drawdown_percent: number | null;
  }>;
  notes?: string;
  data_source_snapshot?: InternalBacktestDataSourceSnapshot;
};

export type InternalBacktestEngineAdapter = (args: {
  executionId: string;
  engineVersion: string;
  input: InternalBacktestExecutionInput;
}) => Promise<InternalBacktestEngineRunResult>;

const TIMEFRAME_BARS_PER_DAY: Record<string, number> = {
  '1D': 1,
  D: 1,
  '4H': 6,
  '1H': 24,
  '30M': 48,
  '15M': 96,
};

const TIMEFRAME_CANONICAL: Record<string, string> = {
  '1D': '1D',
  D: '1D',
  '4H': '4H',
  '1H': '1H',
  '30M': '30M',
  '15M': '15M',
};

function stableHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return hash;
}

function daysBetweenInclusive(from: string, to: string): number {
  const fromDate = new Date(`${from}T00:00:00Z`).getTime();
  const toDate = new Date(`${to}T00:00:00Z`).getTime();
  const diffDays = Math.floor((toDate - fromDate) / 86400000) + 1;
  return Math.max(1, diffDays);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function calculateDeterministicMetrics(input: InternalBacktestExecutionInput) {
  const timeframeKey = input.timeframe.toUpperCase();
  const canonicalTimeframe = TIMEFRAME_CANONICAL[timeframeKey] ?? timeframeKey;
  const barsPerDay = TIMEFRAME_BARS_PER_DAY[timeframeKey] ?? 1;
  const periodDays = daysBetweenInclusive(input.dataRange.from, input.dataRange.to);
  const estimatedBars = periodDays * barsPerDay;

  const seedText = `${input.executionTarget.symbol}|${input.market}|${canonicalTimeframe}|${input.dataRange.from}|${input.dataRange.to}|${input.strategyRuleVersionId}`;
  const seed = stableHash(seedText);

  const totalTrades = Math.max(1, Math.floor(estimatedBars / 40) + (seed % 5));
  const winRate = roundTo(0.35 + (seed % 31) / 100, 2); // 0.35 - 0.65
  const avgTradePnl = 150 + (seed % 900); // 150 - 1049
  const direction = seed % 2 === 0 ? 1 : -1;
  const netProfit = direction * totalTrades * avgTradePnl;

  const profitFactor = roundTo(0.8 + winRate * 1.2, 2);
  const maxDrawdownPercent = -roundTo(3 + (seed % 18) + periodDays / 365, 2);

  return {
    total_trades: totalTrades,
    win_rate: winRate,
    net_profit: netProfit,
    profit_factor: profitFactor,
    max_drawdown_percent: maxDrawdownPercent,
  };
}

function calculateEstimatedMetrics(input: InternalBacktestExecutionInput) {
  const scaffold = calculateDeterministicMetrics(input);
  const periodDays = daysBetweenInclusive(input.dataRange.from, input.dataRange.to);
  const rangeFactor = Math.max(1, Math.floor(periodDays / 45));

  return {
    total_trades: scaffold.total_trades + rangeFactor,
    win_rate: roundTo(Math.min(0.95, scaffold.win_rate + 0.02), 2),
    net_profit: scaffold.net_profit + rangeFactor * 650,
    profit_factor: scaffold.profit_factor === null ? null : roundTo(scaffold.profit_factor + 0.12, 2),
    max_drawdown_percent:
      scaffold.max_drawdown_percent === null ? null : roundTo(scaffold.max_drawdown_percent - 0.6, 2),
  };
}

export function createDummyInternalBacktestEngineAdapter(
  dataSourceAdapter: InternalBacktestDataSourceAdapter = defaultInternalBacktestDataSourceAdapter,
): InternalBacktestEngineAdapter {
  return async ({ input }) => {
  const simulateFailure = input.engineConfig.simulate_failure === true;
  if (simulateFailure) {
    throw new Error('simulated_internal_backtest_failure');
  }

  const requestedSummaryMode =
    typeof input.engineConfig.summary_mode === 'string'
      ? input.engineConfig.summary_mode.trim().toLowerCase()
      : null;

  const useEstimated = requestedSummaryMode === 'engine_estimated';
  const summaryKind: InternalBacktestEngineRunResult['summary_kind'] = useEstimated
    ? 'engine_estimated'
    : 'scaffold_deterministic';
  let dataSourceSnapshot: InternalBacktestDataSourceSnapshot | undefined;
  let metrics = useEstimated ? calculateEstimatedMetrics(input) : calculateDeterministicMetrics(input);
  if (useEstimated) {
    const dataSourceResult = await dataSourceAdapter.fetchDailyOhlcv({
      symbol: input.executionTarget.symbol,
      market: input.market,
      timeframe: input.timeframe,
      from: input.dataRange.from,
      to: input.dataRange.to,
      source_kind: 'daily_ohlcv',
    });
    const barsFactor = Math.max(1, Math.floor(dataSourceResult.bars.length / 30));
    metrics = {
      ...metrics,
      total_trades: metrics.total_trades + barsFactor,
      net_profit: metrics.net_profit + barsFactor * 120,
      profit_factor:
        metrics.profit_factor === null ? null : roundTo((metrics.profit_factor ?? 1) + 0.03, 2),
    };
    dataSourceSnapshot = dataSourceResult.snapshot;
  }
  const notes = useEstimated
    ? 'internal backtest worker estimated-stage result with daily_ohlcv JP_STOCK/D adapter'
    : 'deterministic scaffold metrics derived from execution input';

  return {
    summary_kind: summaryKind,
    metrics,
    notes,
    data_source_snapshot: dataSourceSnapshot,
  };
  };
}

export const runDummyInternalBacktestEngine = createDummyInternalBacktestEngineAdapter();
