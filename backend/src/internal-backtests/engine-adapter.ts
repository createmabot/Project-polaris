import type {
  InternalBacktestActualArtifactPayload,
  InternalBacktestDataSourceSnapshot,
  InternalBacktestExecutionInput,
} from './contracts';
import {
  StubInternalBacktestDataSourceAdapter,
  type InternalBacktestDataSourceFetchObservation,
  type InternalBacktestDataSourceAdapter,
} from './data-source-adapter';
import { createInternalBacktestMarketDataProvider } from './market-data-provider';
import {
  ENGINE_ACTUAL_RULE_KINDS,
  normalizeEngineActualRuleSet,
  type EngineActualRule,
} from './engine-actual-rules';

type EngineMetrics = {
  bar_count: number;
  first_close: number;
  last_close: number;
  price_change: number;
  price_change_percent: number;
  period_high: number;
  period_low: number;
  range_percent: number;
  trade_count?: number;
  win_rate?: number;
  total_return_percent?: number;
  max_drawdown_percent?: number;
  average_trade_return_percent?: number;
  profit_factor?: number;
  fee_rate_bps?: number;
  slippage_bps?: number;
  holding_period_avg_bars?: number;
  first_trade_at?: string | null;
  last_trade_at?: string | null;
};

export type InternalBacktestEngineRunResult = {
  summary_kind?: 'scaffold_deterministic' | 'engine_estimated' | 'engine_actual';
  metrics?: Partial<EngineMetrics>;
  notes?: string;
  data_source_snapshot?: InternalBacktestDataSourceSnapshot;
  data_source_fetch_observation?: InternalBacktestDataSourceFetchObservation;
  artifact_path_suffix?: string;
  artifact_payload?: InternalBacktestActualArtifactPayload;
};

export type InternalBacktestEngineAdapter = (args: {
  executionId: string;
  engineVersion: string;
  input: InternalBacktestExecutionInput;
}) => Promise<InternalBacktestEngineRunResult>;

type EngineBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type ActualTrade = {
  entry_at: string;
  exit_at: string;
  entry_price: number;
  exit_price: number;
  return_percent: number;
  holding_bars: number;
  exit_reason: 'signal_exit' | 'take_profit' | 'stop_loss' | 'max_holding_bars' | 'end_of_period';
};

type ActualSimulationResult = {
  metrics: EngineMetrics;
  artifactPayload: InternalBacktestActualArtifactPayload;
};

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

function parsePercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function parseNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function resolveActualCostBps(engineConfig: Record<string, unknown>): {
  feeRateBps: number;
  slippageBps: number;
} {
  const costs = asObject(engineConfig.costs);
  const legacyCommissionPercent = parsePercent(engineConfig.commission_percent);
  const legacyCommission = parsePercent(engineConfig.commission);
  const legacySlippagePercent = parsePercent(engineConfig.slippage_percent);
  const legacySlippage = parsePercent(engineConfig.slippage);
  const feeRateBps =
    parseNonNegativeNumber(costs?.fee_rate_bps) ??
    parseNonNegativeNumber(engineConfig.fee_rate_bps) ??
    (legacyCommissionPercent !== null ? legacyCommissionPercent * 100 : null) ??
    (legacyCommission !== null ? legacyCommission * 100 : null) ??
    0;
  const slippageBps =
    parseNonNegativeNumber(costs?.slippage_bps) ??
    parseNonNegativeNumber(engineConfig.slippage_bps) ??
    (legacySlippagePercent !== null ? legacySlippagePercent * 100 : null) ??
    (legacySlippage !== null ? legacySlippage * 100 : null) ??
    0;
  return {
    feeRateBps: roundTo(feeRateBps, 4),
    slippageBps: roundTo(slippageBps, 4),
  };
}

function calculateDeterministicMetrics(input: InternalBacktestExecutionInput): EngineMetrics {
  const timeframeKey = input.timeframe.trim().toUpperCase();
  const canonicalTimeframe = TIMEFRAME_CANONICAL[timeframeKey] ?? timeframeKey;
  const barsPerDay = TIMEFRAME_BARS_PER_DAY[canonicalTimeframe] ?? 1;
  const periodDays = daysBetweenInclusive(input.dataRange.from, input.dataRange.to);
  const barCount = Math.max(1, periodDays * barsPerDay);

  const seedText = `${input.executionTarget.symbol}|${input.market}|${canonicalTimeframe}|${input.dataRange.from}|${input.dataRange.to}|${input.strategyRuleVersionId}`;
  const seed = stableHash(seedText);
  const firstClose = roundTo(900 + (seed % 700) / 10, 2);
  const trendPercent = ((seed % 900) - 450) / 1000;
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

function buildPriceSummaryFromBars(bars: EngineBar[]): EngineMetrics {
  if (bars.length === 0) {
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

function computeMaxDrawdownPercent(equitySeries: number[]): number {
  let peak = equitySeries[0] ?? 100;
  let maxDrawdown = 0;
  for (const equity of equitySeries) {
    if (equity > peak) peak = equity;
    const drawdown = peak <= 0 ? 0 : ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  return roundTo(maxDrawdown, 4);
}

function buildActualMetricsFromBars(args: {
  bars: EngineBar[];
  engineConfig: Record<string, unknown>;
}): ActualSimulationResult {
  const bars = args.bars;
  const priceSummary = buildPriceSummaryFromBars(bars);
  const costs = resolveActualCostBps(args.engineConfig);
  const feeRate = costs.feeRateBps / 10000;
  const slippageRate = costs.slippageBps / 10000;
  const ruleSet = normalizeEngineActualRuleSet(args.engineConfig);

  if (bars.length === 0) {
    return {
      metrics: {
        ...priceSummary,
        trade_count: 0,
        win_rate: 0,
        total_return_percent: 0,
        max_drawdown_percent: 0,
        average_trade_return_percent: 0,
        profit_factor: 0,
        fee_rate_bps: costs.feeRateBps,
        slippage_bps: costs.slippageBps,
        holding_period_avg_bars: 0,
        first_trade_at: null,
        last_trade_at: null,
      },
      artifactPayload: {
        trades: [],
        equity_curve: [],
      },
    };
  }

  const trades: ActualTrade[] = [];
  const equitySeries: number[] = [100];
  const equityCurve: InternalBacktestActualArtifactPayload['equity_curve'] = [
    { at: bars[0]!.timestamp, equity_index: 100 },
  ];
  let equity = 100;
  let openPosition:
    | {
        entryIndex: number;
        entryAt: string;
        entryPrice: number;
      }
    | undefined;

  function evaluateSmaClose(index: number, period: number): number | null {
    if (index < period - 1) return null;
    let sum = 0;
    const start = index - period + 1;
    for (let j = start; j <= index; j += 1) {
      sum += bars[j]!.close;
    }
    return sum / period;
  }

  function isRuleMatched(index: number, rule: EngineActualRule): boolean {
    const currentBar = bars[index];
    if (!currentBar) return false;

    switch (rule.kind) {
      case ENGINE_ACTUAL_RULE_KINDS.CLOSE_ABOVE_PREVIOUS_CLOSE: {
        const previousBar = bars[index - 1];
        if (!previousBar) return false;
        return currentBar.close > previousBar.close;
      }
      case ENGINE_ACTUAL_RULE_KINDS.CLOSE_BELOW_PREVIOUS_CLOSE: {
        const previousBar = bars[index - 1];
        if (!previousBar) return false;
        return currentBar.close < previousBar.close;
      }
      case ENGINE_ACTUAL_RULE_KINDS.PRICE_ABOVE_SMA: {
        const sma = evaluateSmaClose(index, rule.period);
        if (sma === null) return false;
        return currentBar.close > sma;
      }
      case ENGINE_ACTUAL_RULE_KINDS.PRICE_BELOW_SMA: {
        const sma = evaluateSmaClose(index, rule.period);
        if (sma === null) return false;
        return currentBar.close < sma;
      }
      case ENGINE_ACTUAL_RULE_KINDS.PRICE_ABOVE_THRESHOLD:
        return currentBar.close > rule.threshold;
      case ENGINE_ACTUAL_RULE_KINDS.PRICE_BELOW_THRESHOLD:
        return currentBar.close < rule.threshold;
      default:
        return false;
    }
  }

  function calculateCurrentNetReturnPercent(index: number, entryPrice: number): number | null {
    const currentBar = bars[index];
    if (!currentBar || entryPrice <= 0) {
      return null;
    }
    const markToMarketExitPrice = roundTo(currentBar.close * (1 - slippageRate), 6);
    const grossReturnRate = (markToMarketExitPrice - entryPrice) / entryPrice;
    const netReturnRate = grossReturnRate - feeRate * 2;
    return roundTo(netReturnRate * 100, 4);
  }

  function resolveExitReason(index: number): ActualTrade['exit_reason'] | null {
    if (!openPosition) {
      return null;
    }
    const currentNetReturnPercent = calculateCurrentNetReturnPercent(index, openPosition.entryPrice);

    if (
      ruleSet.exitOverrides.stopLossPercent !== undefined &&
      currentNetReturnPercent !== null &&
      currentNetReturnPercent <= -ruleSet.exitOverrides.stopLossPercent
    ) {
      return 'stop_loss';
    }

    if (
      ruleSet.exitOverrides.takeProfitPercent !== undefined &&
      currentNetReturnPercent !== null &&
      currentNetReturnPercent >= ruleSet.exitOverrides.takeProfitPercent
    ) {
      return 'take_profit';
    }

    if (ruleSet.exitOverrides.maxHoldingBars !== undefined) {
      const holdingBarsCandidate = Math.max(1, index + 1 - openPosition.entryIndex + 1);
      if (holdingBarsCandidate >= ruleSet.exitOverrides.maxHoldingBars) {
        return 'max_holding_bars';
      }
    }

    if (isRuleMatched(index, ruleSet.exitRule)) {
      return 'signal_exit';
    }

    return null;
  }

  for (let i = 1; i < bars.length - 1; i += 1) {
    const nextBar = bars[i + 1]!;

    if (!openPosition) {
      if (isRuleMatched(i, ruleSet.entryRule)) {
        openPosition = {
          entryIndex: i + 1,
          entryAt: nextBar.timestamp,
          entryPrice: roundTo(nextBar.open * (1 + slippageRate), 6),
        };
      }
      continue;
    }

    const exitReason = resolveExitReason(i);
    if (exitReason) {
      const exitPrice = roundTo(nextBar.open * (1 - slippageRate), 6);
      const grossReturnRate = (exitPrice - openPosition.entryPrice) / openPosition.entryPrice;
      const netReturnRate = grossReturnRate - feeRate * 2;
      const holdingBars = Math.max(1, i + 1 - openPosition.entryIndex + 1);
      const returnPercent = roundTo(netReturnRate * 100, 4);
      equity = roundTo(equity * (1 + netReturnRate), 6);
      equitySeries.push(equity);
      equityCurve.push({
        at: nextBar.timestamp,
        equity_index: roundTo(equity, 6),
      });
      trades.push({
        entry_at: openPosition.entryAt,
        exit_at: nextBar.timestamp,
        entry_price: roundTo(openPosition.entryPrice, 6),
        exit_price: roundTo(exitPrice, 6),
        return_percent: returnPercent,
        holding_bars: holdingBars,
        exit_reason: exitReason,
      });
      openPosition = undefined;
    }
  }

  if (openPosition) {
    const lastBar = bars[bars.length - 1]!;
    const exitPrice = roundTo(lastBar.close * (1 - slippageRate), 6);
    const grossReturnRate = (exitPrice - openPosition.entryPrice) / openPosition.entryPrice;
    const netReturnRate = grossReturnRate - feeRate * 2;
    const holdingBars = Math.max(1, bars.length - openPosition.entryIndex);
    const returnPercent = roundTo(netReturnRate * 100, 4);
    equity = roundTo(equity * (1 + netReturnRate), 6);
    equitySeries.push(equity);
    equityCurve.push({
      at: lastBar.timestamp,
      equity_index: roundTo(equity, 6),
    });
    trades.push({
      entry_at: openPosition.entryAt,
      exit_at: lastBar.timestamp,
      entry_price: roundTo(openPosition.entryPrice, 6),
      exit_price: roundTo(exitPrice, 6),
      return_percent: returnPercent,
      holding_bars: holdingBars,
      exit_reason: 'end_of_period',
    });
  }

  const tradeCount = trades.length;
  const wins = trades.filter((trade) => trade.return_percent > 0).length;
  const winRate = tradeCount === 0 ? 0 : roundTo((wins / tradeCount) * 100, 4);
  const totalReturnPercent = roundTo(equity - 100, 4);
  const maxDrawdownPercent = computeMaxDrawdownPercent(equitySeries);
  const averageTradeReturnPercent =
    tradeCount === 0
      ? 0
      : roundTo(
          trades.reduce((sum, trade) => sum + trade.return_percent, 0) / tradeCount,
          4,
        );
  const grossProfit = roundTo(
    trades
      .filter((trade) => trade.return_percent > 0)
      .reduce((sum, trade) => sum + trade.return_percent, 0),
    6,
  );
  const grossLossAbs = roundTo(
    trades
      .filter((trade) => trade.return_percent < 0)
      .reduce((sum, trade) => sum + Math.abs(trade.return_percent), 0),
    6,
  );
  const profitFactor =
    tradeCount === 0
      ? 0
      : grossLossAbs === 0
        ? roundTo(grossProfit, 4)
        : roundTo(grossProfit / grossLossAbs, 4);
  const holdingPeriodAvgBars =
    tradeCount === 0
      ? 0
      : roundTo(
          trades.reduce((sum, trade) => sum + trade.holding_bars, 0) / tradeCount,
          4,
        );

  return {
    metrics: {
      ...priceSummary,
      trade_count: tradeCount,
      win_rate: winRate,
      total_return_percent: totalReturnPercent,
      max_drawdown_percent: maxDrawdownPercent,
      average_trade_return_percent: averageTradeReturnPercent,
      profit_factor: profitFactor,
      fee_rate_bps: costs.feeRateBps,
      slippage_bps: costs.slippageBps,
      holding_period_avg_bars: holdingPeriodAvgBars,
      first_trade_at: tradeCount > 0 ? trades[0]!.entry_at : null,
      last_trade_at: tradeCount > 0 ? trades[tradeCount - 1]!.exit_at : null,
    },
    artifactPayload: {
      trades: trades.map((trade) => ({
        entry_at: trade.entry_at,
        entry_price: trade.entry_price,
        exit_at: trade.exit_at,
        exit_price: trade.exit_price,
        return_percent: trade.return_percent,
        holding_bars: trade.holding_bars,
      })),
      equity_curve: equityCurve,
    },
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
    const useActual = requestedSummaryMode === 'engine_actual';
    const summaryKind: InternalBacktestEngineRunResult['summary_kind'] = useActual
      ? 'engine_actual'
      : useEstimated
        ? 'engine_estimated'
        : 'scaffold_deterministic';

    let dataSourceSnapshot: InternalBacktestDataSourceSnapshot | undefined;
    let dataSourceFetchObservation: InternalBacktestDataSourceFetchObservation | undefined;
    let artifactPathSuffix: string | undefined;
    let artifactPayload: InternalBacktestActualArtifactPayload | undefined;
    let metrics = calculateDeterministicMetrics(input);

    if (useEstimated || useActual) {
      const dataSourceResult = await dataSourceAdapter.fetchDailyOhlcv({
        symbol: input.executionTarget.symbol,
        market: input.market,
        timeframe: input.timeframe,
        from: input.dataRange.from,
        to: input.dataRange.to,
        source_kind: 'daily_ohlcv',
      });
      const bars = dataSourceResult.bars as EngineBar[];
      if (useActual) {
        const actualResult = buildActualMetricsFromBars({
          bars,
          engineConfig: input.engineConfig,
        });
        metrics = actualResult.metrics;
        artifactPayload = actualResult.artifactPayload;
      } else {
        metrics = buildPriceSummaryFromBars(bars);
      }
      dataSourceSnapshot = dataSourceResult.snapshot;
      dataSourceFetchObservation = dataSourceResult.fetchObservation;
      if (useActual) {
        artifactPathSuffix = '/artifacts/engine_actual/trades-and-equity';
      }
    }

    const notes = useActual
      ? 'internal backtest worker actual-stage result with minimal JP_STOCK/D long-only single-position simulation'
      : useEstimated
        ? 'internal backtest worker estimated-stage result with daily_ohlcv JP_STOCK/D adapter'
        : 'deterministic scaffold metrics derived from execution input';

    return {
      summary_kind: summaryKind,
      metrics,
      notes,
      data_source_snapshot: dataSourceSnapshot,
      data_source_fetch_observation: dataSourceFetchObservation,
      artifact_path_suffix: artifactPathSuffix,
      artifact_payload: artifactPayload,
    };
  };
}

export const runDummyInternalBacktestEngine = createDummyInternalBacktestEngineAdapter();
