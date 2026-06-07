import { buildIndicatorSeries, readNumericSeriesValue } from './indicators';
import { compileInternalBacktestSpec } from './spec';
import type { CompiledInternalBacktestSpec } from './spec';
import type { NormalizedStrategySpec } from '../strategy/normalized-spec';
import type {
  InternalBacktestBar,
  InternalBacktestEquityPoint,
  InternalBacktestResultSummary,
  InternalBacktestTrade,
} from './types';

const DEFAULT_INITIAL_CAPITAL = 1_000_000;
const MAX_PERSISTED_TRADES = 500;

type Position = {
  entryIndex: number;
  entryTime: Date;
  entrySignalTime: Date | null;
  entryPrice: number;
  quantity: number;
  atrStopDistance: number | null;
};

type Condition = CompiledInternalBacktestSpec['entryConditions'][number];

type SeriesMap = Map<string, Array<number | null>>;

function round(value: number, precision = 6): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function iso(date: Date): string {
  return date.toISOString();
}

function compare(left: number, operator: string, right: number, previousLeft?: number | null, previousRight?: number | null): boolean {
  switch (operator) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '==':
      return left === right;
    case 'crosses_above':
      return previousLeft !== null && previousRight !== null && previousLeft !== undefined && previousRight !== undefined
        && previousLeft <= previousRight && left > right;
    case 'crosses_below':
      return previousLeft !== null && previousRight !== null && previousLeft !== undefined && previousRight !== undefined
        && previousLeft >= previousRight && left < right;
    default:
      return false;
  }
}

function barValue(bar: InternalBacktestBar, source: string): number | null {
  switch (source) {
    case 'open':
      return bar.open;
    case 'high':
      return bar.high;
    case 'low':
      return bar.low;
    case 'volume':
      return bar.volume;
    case 'close':
    default:
      return bar.close;
  }
}

function resolveValue(condition: Condition, bars: InternalBacktestBar[], series: SeriesMap, index: number, side: 'left' | 'right'): number | null {
  const bar = bars[index];
  if (side === 'right') {
    if (condition.rightIndicator) {
      const value = readNumericSeriesValue(series, condition.rightIndicator, index);
      return value === null ? null : value * condition.multiplier;
    }
    if (typeof condition.value === 'number') return condition.value;
    return null;
  }

  if (condition.type === 'price_vs_indicator') {
    return barValue(bar, condition.left);
  }
  if (condition.type === 'volume_filter') {
    return barValue(bar, 'volume');
  }
  const indicator = condition.indicator ?? condition.left;
  const indicatorValue = readNumericSeriesValue(series, indicator, index);
  if (indicatorValue !== null) return indicatorValue;
  return barValue(bar, condition.left);
}

function evaluateCondition(condition: Condition, bars: InternalBacktestBar[], series: SeriesMap, index: number): boolean {
  const left = resolveValue(condition, bars, series, index, 'left');
  const right = condition.type === 'price_vs_indicator'
    ? readNumericSeriesValue(series, condition.indicator ?? '', index)
    : resolveValue(condition, bars, series, index, 'right');
  if (left === null || right === null) return false;

  const previousLeft = index > 0 ? resolveValue(condition, bars, series, index - 1, 'left') : null;
  const previousRight = index > 0
    ? condition.type === 'price_vs_indicator'
      ? readNumericSeriesValue(series, condition.indicator ?? '', index - 1)
      : resolveValue(condition, bars, series, index - 1, 'right')
    : null;
  return compare(left, condition.operator, right, previousLeft, previousRight);
}

function evaluateAll(conditions: Condition[], bars: InternalBacktestBar[], series: SeriesMap, index: number): boolean {
  return conditions.length > 0 && conditions.every((condition) => evaluateCondition(condition, bars, series, index));
}

function evaluateAny(conditions: Condition[], bars: InternalBacktestBar[], series: SeriesMap, index: number): boolean {
  return conditions.length > 0 && conditions.some((condition) => evaluateCondition(condition, bars, series, index));
}

function drawdownPercent(equity: number, peak: number): number {
  if (peak <= 0) return 0;
  return Math.max(0, ((peak - equity) / peak) * 100);
}

function closeTrade(
  tradeNo: number,
  position: Position,
  bar: InternalBacktestBar,
  exitIndex: number,
  exitPrice: number,
  exitReason: InternalBacktestTrade['exit_reason'],
  exitSignalTime: Date | null,
): InternalBacktestTrade {
  const pnl = (exitPrice - position.entryPrice) * position.quantity;
  const roundedPnl = round(pnl);
  const entryAt = iso(position.entryTime);
  const exitAt = iso(bar.time);
  return {
    trade_no: tradeNo,
    entry_at: entryAt,
    entry_bar_time: position.entrySignalTime ? iso(position.entrySignalTime) : null,
    entry_time: iso(position.entryTime),
    entry_price: round(position.entryPrice),
    entry_reason: 'entry_signal',
    exit_at: exitAt,
    exit_bar_time: exitSignalTime ? iso(exitSignalTime) : null,
    exit_time: exitAt,
    exit_price: round(exitPrice),
    quantity: round(position.quantity),
    gross_profit: roundedPnl,
    net_profit: roundedPnl,
    pnl: roundedPnl,
    return_percent: round(((exitPrice - position.entryPrice) / position.entryPrice) * 100),
    bars_held: exitIndex - position.entryIndex + 1,
    exit_reason: exitReason,
  };
}

function buildExitReasonCounts(trades: InternalBacktestTrade[]) {
  const counts = new Map<InternalBacktestTrade['exit_reason'], number>();
  for (const trade of trades) {
    counts.set(trade.exit_reason, (counts.get(trade.exit_reason) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([exit_reason, count]) => ({ exit_reason, count }));
}

function summarize(
  spec: CompiledInternalBacktestSpec,
  bars: InternalBacktestBar[],
  trades: InternalBacktestTrade[],
  equityCurve: InternalBacktestEquityPoint[],
  finalEquity: number,
  initialCapital: number,
): InternalBacktestResultSummary {
  const grossProfit = trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0);
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const maxDrawdownPercent = equityCurve.reduce((max, point) => Math.max(max, point.drawdown_percent), 0);
  let peakEquity = initialCapital;
  const maxDrawdown = equityCurve.reduce((max, point) => {
    peakEquity = Math.max(peakEquity, point.equity);
    return Math.max(max, peakEquity - point.equity);
  }, 0);
  const firstClose = bars[0]?.close ?? null;
  const lastClose = bars[bars.length - 1]?.close ?? null;
  const priceChangePercent = firstClose && lastClose ? ((lastClose - firstClose) / firstClose) * 100 : null;
  const firstTrade = trades[0] ?? null;
  const lastTrade = trades[trades.length - 1] ?? null;
  const persistedTrades = trades.slice(0, MAX_PERSISTED_TRADES);

  return {
    summary_kind: 'internal_backtest_v1',
    period: {
      from: iso(bars[0].time),
      to: iso(bars[bars.length - 1].time),
      bar_count: bars.length,
    },
    trade_period: {
      first_entry_at: firstTrade?.entry_at ?? null,
      last_exit_at: lastTrade?.exit_at ?? null,
      first_trade_at: firstTrade?.entry_at ?? null,
      last_trade_at: lastTrade?.exit_at ?? null,
    },
    metrics: {
      initial_capital: round(initialCapital),
      final_equity: round(finalEquity),
      net_profit: round(finalEquity - initialCapital),
      total_return_percent: round(((finalEquity - initialCapital) / initialCapital) * 100),
      price_change_percent: priceChangePercent === null ? null : round(priceChangePercent),
      total_trades: trades.length,
      trade_count: trades.length,
      win_rate: trades.length === 0 ? 0 : round((wins / trades.length) * 100),
      gross_profit: round(grossProfit),
      gross_loss: round(grossLoss),
      average_trade: trades.length === 0 ? null : round((grossProfit + grossLoss) / trades.length),
      profit_factor: grossLoss < 0 ? round(grossProfit / Math.abs(grossLoss)) : null,
      max_drawdown: round(maxDrawdown),
      max_drawdown_percent: round(maxDrawdownPercent),
    },
    trade_summary: {
      trade_count: trades.length,
      first_entry_at: firstTrade?.entry_at ?? null,
      last_exit_at: lastTrade?.exit_at ?? null,
      exit_reason_counts: buildExitReasonCounts(trades),
    },
    trades: persistedTrades,
    trades_truncated: trades.length > persistedTrades.length,
    equity_curve: equityCurve,
    assumptions: Array.from(new Set([
      `initial_capital is ${round(initialCapital)}.`,
      '100% of current equity is allocated to each long entry.',
      'commission and slippage are assumed to be zero.',
      'entry and exit signals are evaluated on bar close and filled at the next bar open.',
      'same-bar stop_loss and take_profit checks use conservative stop-first ordering.',
      ...spec.assumptions,
    ])),
    warnings: spec.warnings,
    ignored_unsupported_features: spec.ignoredUnsupportedFeatures,
  };
}

export function executeInternalBacktest(input: {
  spec: NormalizedStrategySpec;
  bars: InternalBacktestBar[];
  initialCapital?: number;
}): InternalBacktestResultSummary {
  const spec = compileInternalBacktestSpec(input.spec);
  const bars = input.bars;
  const initialCapital = Number.isFinite(input.initialCapital) && (input.initialCapital ?? 0) > 0
    ? input.initialCapital!
    : DEFAULT_INITIAL_CAPITAL;
  const series = buildIndicatorSeries(spec.indicators, bars);
  const trades: InternalBacktestTrade[] = [];
  const equityCurve: InternalBacktestEquityPoint[] = [];
  let cash = initialCapital;
  let position: Position | null = null;
  let pendingEntrySignalIndex: number | null = null;
  let pendingExit: { signalIndex: number; reason: 'exit_signal' | 'time_exit' } | null = null;
  let peakEquity = initialCapital;

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    let exitedThisBar = false;

    if (pendingExit && position) {
      const exitSignalTime = bars[pendingExit.signalIndex]?.time ?? null;
      const trade = closeTrade(trades.length + 1, position, bar, index, bar.open, pendingExit.reason, exitSignalTime);
      trades.push(trade);
      cash = position.quantity * bar.open;
      position = null;
      exitedThisBar = true;
    }
    pendingExit = null;

    if (pendingEntrySignalIndex !== null && !position) {
      const quantity = cash / bar.open;
      const atrStopValue = spec.stopLossAtrIndicator
        ? readNumericSeriesValue(series, spec.stopLossAtrIndicator, index)
        : null;
      position = {
        entryIndex: index,
        entryTime: bar.time,
        entrySignalTime: bars[pendingEntrySignalIndex]?.time ?? null,
        entryPrice: bar.open,
        quantity,
        atrStopDistance: atrStopValue !== null && spec.stopLossAtrMultiplier !== null
          ? atrStopValue * spec.stopLossAtrMultiplier
          : null,
      };
      cash = 0;
    }
    pendingEntrySignalIndex = null;

    if (position) {
      const stopPrice = position.atrStopDistance !== null
        ? position.entryPrice - position.atrStopDistance
        : spec.stopLossPercent === null
          ? null
          : position.entryPrice * (1 - spec.stopLossPercent / 100);
      const takeProfitPrice = spec.takeProfitPercent === null ? null : position.entryPrice * (1 + spec.takeProfitPercent / 100);
      if (stopPrice !== null && bar.low <= stopPrice) {
        const trade = closeTrade(trades.length + 1, position, bar, index, stopPrice, 'stop_loss', bar.time);
        trades.push(trade);
        cash = position.quantity * stopPrice;
        position = null;
        exitedThisBar = true;
      } else if (takeProfitPrice !== null && bar.high >= takeProfitPrice) {
        const trade = closeTrade(trades.length + 1, position, bar, index, takeProfitPrice, 'take_profit', bar.time);
        trades.push(trade);
        cash = position.quantity * takeProfitPrice;
        position = null;
        exitedThisBar = true;
      }
    }

    if (position) {
      const timeExit = spec.timeExitBars !== null && index - position.entryIndex + 1 >= spec.timeExitBars;
      const signalExit = evaluateAny(spec.exitConditions, bars, series, index);
      if ((timeExit || signalExit) && index < bars.length - 1) {
        pendingExit = { signalIndex: index, reason: timeExit ? 'time_exit' : 'exit_signal' };
      }
    } else if (!exitedThisBar && index < bars.length - 1 && evaluateAll([...spec.filterConditions, ...spec.entryConditions], bars, series, index)) {
      pendingEntrySignalIndex = index;
    }

    const equity = position ? position.quantity * bar.close : cash;
    peakEquity = Math.max(peakEquity, equity);
    equityCurve.push({
      time: iso(bar.time),
      equity: round(equity),
      drawdown_percent: round(drawdownPercent(equity, peakEquity)),
      position: position ? 'long' : 'flat',
    });
  }

  if (position) {
    const finalIndex = bars.length - 1;
    const finalBar = bars[finalIndex];
    const trade = closeTrade(trades.length + 1, position, finalBar, finalIndex, finalBar.close, 'final_close', finalBar.time);
    trades.push(trade);
    cash = position.quantity * finalBar.close;
    position = null;
    const equity = cash;
    peakEquity = Math.max(peakEquity, equity);
    equityCurve[equityCurve.length - 1] = {
      time: iso(finalBar.time),
      equity: round(equity),
      drawdown_percent: round(drawdownPercent(equity, peakEquity)),
      position: 'flat',
    };
  }

  return summarize(spec, bars, trades, equityCurve, cash, initialCapital);
}
