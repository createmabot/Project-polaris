import type { InternalBacktestDataSourceSnapshot, InternalBacktestExecutionInput } from './contracts';
import {
  StubInternalBacktestDataSourceAdapter,
  type InternalBacktestDataSourceAdapter,
} from './data-source-adapter';
import { createInternalBacktestMarketDataProvider } from './market-data-provider';

export type InternalBacktestEngineRunResult = {
  summary_kind?: 'scaffold_deterministic' | 'engine_estimated' | 'engine_actual';
  metrics?: Partial<{
    bar_count: number;
    first_close: number;
    last_close: number;
    price_change: number;
    price_change_percent: number;
    period_high: number;
    period_low: number;
    range_percent: number;
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
  const timeframeKey = input.timeframe.trim().toUpperCase();
  const canonicalTimeframe = TIMEFRAME_CANONICAL[timeframeKey] ?? timeframeKey;
  const barsPerDay = TIMEFRAME_BARS_PER_DAY[canonicalTimeframe] ?? 1;
  const periodDays = daysBetweenInclusive(input.dataRange.from, input.dataRange.to);
  const barCount = Math.max(1, periodDays * barsPerDay);

  const seedText = `${input.executionTarget.symbol}|${input.market}|${canonicalTimeframe}|${input.dataRange.from}|${input.dataRange.to}|${input.strategyRuleVersionId}`;
  const seed = stableHash(seedText);
  const firstClose = roundTo(900 + (seed % 700) / 10, 2);
  const trendPercent = ((seed % 900) - 450) / 1000; // -45% to +44.9%
  const lastClose = roundTo(Math.max(1, firstClose * (1 + trendPercent)), 2);
  const periodLow = roundTo(Math.min(firstClose, lastClose) * (1 - ((seed % 120) / 1000)), 2);
  const periodHigh = roundTo(Math.max(firstClose, lastClose) * (1 + ((seed % 140) / 1000)), 2);
  const priceChange = roundTo(lastClose - firstClose, 2);
  const priceChangePercent = firstClose === 0 ? 0 : roundTo((priceChange / firstClose) * 100, 4);
  const rangePercent = periodLow <= 0 ? 0 : roundTo(((periodHigh - periodLow) / periodLow) * 100, 4);

  return {
    bar_count: barCount,
    first_close: firstClose,
    last_close: lastClose,
    price_change: priceChange,
    price_change_percent: priceChangePercent,
    period_high: periodHigh,
    period_low: periodLow,
    range_percent: rangePercent,
  };
}

function buildEstimatedMetricsFromBars(
  bars: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
  }>,
) {
  if (bars.length === 0) {
    // Contract: empty bars are treated as succeeded engine_estimated with zero-valued summary metrics.
    return {
      bar_count: 0,
      first_close: 0,
      last_close: 0,
      price_change: 0,
      price_change_percent: 0,
      period_high: 0,
      period_low: 0,
      range_percent: 0,
    };
  }
  const firstClose = roundTo(bars[0]!.close, 2);
  const lastClose = roundTo(bars[bars.length - 1]!.close, 2);
  const periodHigh = roundTo(Math.max(...bars.map((bar) => bar.high)), 2);
  const periodLow = roundTo(Math.min(...bars.map((bar) => bar.low)), 2);
  const priceChange = roundTo(lastClose - firstClose, 2);
  const priceChangePercent = firstClose === 0 ? 0 : roundTo((priceChange / firstClose) * 100, 4);
  const rangePercent = periodLow <= 0 ? 0 : roundTo(((periodHigh - periodLow) / periodLow) * 100, 4);
  return {
    bar_count: bars.length,
    first_close: firstClose,
    last_close: lastClose,
    price_change: priceChange,
    price_change_percent: priceChangePercent,
    period_high: periodHigh,
    period_low: periodLow,
    range_percent: rangePercent,
  };
}

export function createDummyInternalBacktestEngineAdapter(
  dataSourceAdapter: InternalBacktestDataSourceAdapter = new StubInternalBacktestDataSourceAdapter(
    createInternalBacktestMarketDataProvider(),
  ),
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
  let metrics = calculateDeterministicMetrics(input);
  if (useEstimated) {
    const dataSourceResult = await dataSourceAdapter.fetchDailyOhlcv({
      symbol: input.executionTarget.symbol,
      market: input.market,
      timeframe: input.timeframe,
      from: input.dataRange.from,
      to: input.dataRange.to,
      source_kind: 'daily_ohlcv',
    });
    metrics = buildEstimatedMetricsFromBars(dataSourceResult.bars);
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
