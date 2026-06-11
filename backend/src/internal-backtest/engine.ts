import { buildIndicatorSeries, readNumericSeriesValue } from './indicators';
import { compileInternalBacktestSpec } from './spec';
import type { CompiledInternalBacktestSpec } from './spec';
import type { NormalizedStrategySpec } from '../strategy/normalized-spec';
import type {
  InternalBacktestBar,
  InternalBacktestConditionDebug,
  InternalBacktestEquityPoint,
  InternalBacktestResultSummary,
  InternalBacktestTrade,
  InternalBacktestTradeDebug,
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
  entryDebug?: InternalBacktestTradeDebug;
};

type Condition = CompiledInternalBacktestSpec['entryConditions'][number];

type SeriesMap = Map<string, Array<number | null>>;

type PendingEntry = {
  signalIndex: number;
  debug: InternalBacktestTradeDebug;
};

type PendingExit = {
  signalIndex: number;
  reason: 'exit_signal' | 'time_exit';
  debug: InternalBacktestTradeDebug;
};

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
  return evaluateConditionDebug(condition, bars, series, index).result;
}

function conditionLabel(condition: Condition): string {
  const right = condition.rightIndicator
    ? `${condition.rightIndicator}${condition.multiplier !== 1 ? ` * ${condition.multiplier}` : ''}`
    : typeof condition.value === 'number'
      ? String(condition.value)
      : condition.indicator ?? 'value';
  const left = condition.type === 'price_vs_indicator'
    ? condition.left
    : condition.type === 'volume_filter'
      ? 'volume'
      : condition.indicator ?? condition.left;
  return `${left} ${condition.operator} ${right}`;
}

function evaluateConditionDebug(
  condition: Condition,
  bars: InternalBacktestBar[],
  series: SeriesMap,
  index: number,
): InternalBacktestConditionDebug {
  const left = resolveValue(condition, bars, series, index, 'left');
  const right = condition.type === 'price_vs_indicator'
    ? readNumericSeriesValue(series, condition.indicator ?? '', index)
    : resolveValue(condition, bars, series, index, 'right');
  if (left === null || right === null) {
    return {
      id: condition.id,
      label: conditionLabel(condition),
      result: false,
      left_value: left === null ? null : round(left, 4),
      operator: condition.operator,
      right_value: right === null ? null : round(right, 4),
    };
  }

  const previousLeft = index > 0 ? resolveValue(condition, bars, series, index - 1, 'left') : null;
  const previousRight = index > 0
    ? condition.type === 'price_vs_indicator'
      ? readNumericSeriesValue(series, condition.indicator ?? '', index - 1)
      : resolveValue(condition, bars, series, index - 1, 'right')
    : null;
  return {
    id: condition.id,
    label: conditionLabel(condition),
    result: compare(left, condition.operator, right, previousLeft, previousRight),
    left_value: round(left, 4),
    operator: condition.operator,
    right_value: round(right, 4),
  };
}

function evaluateAll(conditions: Condition[], bars: InternalBacktestBar[], series: SeriesMap, index: number): boolean {
  return conditions.length > 0 && conditions.every((condition) => evaluateCondition(condition, bars, series, index));
}

function evaluateAny(conditions: Condition[], bars: InternalBacktestBar[], series: SeriesMap, index: number): boolean {
  return conditions.length > 0 && conditions.some((condition) => evaluateCondition(condition, bars, series, index));
}

function evaluateAllDebug(
  conditions: Condition[],
  bars: InternalBacktestBar[],
  series: SeriesMap,
  index: number,
): { result: boolean; details: InternalBacktestConditionDebug[] } {
  const details = conditions.map((condition) => evaluateConditionDebug(condition, bars, series, index));
  return {
    result: details.length > 0 && details.every((detail) => detail.result),
    details,
  };
}

function evaluateAnyDebug(
  conditions: Condition[],
  bars: InternalBacktestBar[],
  series: SeriesMap,
  index: number,
): { result: boolean; details: InternalBacktestConditionDebug[]; triggered: string[] } {
  const details = conditions.map((condition) => evaluateConditionDebug(condition, bars, series, index));
  return {
    result: details.length > 0 && details.some((detail) => detail.result),
    details,
    triggered: details.filter((detail) => detail.result).map((detail) => detail.id),
  };
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
  exitDebug?: InternalBacktestTradeDebug,
): InternalBacktestTrade {
  const pnl = (exitPrice - position.entryPrice) * position.quantity;
  const roundedPnl = round(pnl);
  const entryAt = iso(position.entryTime);
  const exitAt = iso(bar.time);
  const entrySignalAt = position.entrySignalTime ? iso(position.entrySignalTime) : null;
  const exitSignalAt = exitSignalTime ? iso(exitSignalTime) : null;
  return {
    trade_no: tradeNo,
    entry_at: entryAt,
    entry_signal_at: entrySignalAt,
    entry_fill_at: entryAt,
    entry_signal_bar_time: entrySignalAt,
    entry_fill_bar_time: entryAt,
    entry_bar_time: entrySignalAt,
    entry_time: iso(position.entryTime),
    entry_price: round(position.entryPrice),
    entry_reason: 'entry_signal',
    exit_at: exitAt,
    exit_signal_at: exitSignalAt,
    exit_fill_at: exitAt,
    exit_signal_bar_time: exitSignalAt,
    exit_fill_bar_time: exitAt,
    exit_bar_time: exitSignalAt,
    exit_time: exitAt,
    exit_price: round(exitPrice),
    quantity: round(position.quantity),
    gross_profit: roundedPnl,
    net_profit: roundedPnl,
    pnl: roundedPnl,
    return_percent: round(((exitPrice - position.entryPrice) / position.entryPrice) * 100),
    bars_held: exitIndex - position.entryIndex + 1,
    exit_reason: exitReason,
    ...(position.entryDebug ? { entry_debug: position.entryDebug } : {}),
    ...(exitDebug ? { exit_debug: exitDebug } : {}),
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
  warnings: string[],
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
      'quantity is calculated as floor(cash / entry_price) to avoid fractional shares.',
      'Japanese 100-share trading units are not supported in this MVP.',
      'commission and slippage are assumed to be zero.',
      'entry and exit signals are evaluated on bar close and filled at the next bar open.',
      'same-bar stop_loss and take_profit checks use conservative stop-first ordering.',
      ...spec.assumptions,
    ])),
    warnings,
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
  const warnings = [...spec.warnings];
  let cash = initialCapital;
  let position: Position | null = null;
  let pendingEntry: PendingEntry | null = null;
  let pendingExit: PendingExit | null = null;
  let peakEquity = initialCapital;

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    let exitedThisBar = false;

    if (pendingExit && position) {
      const exitSignalTime = bars[pendingExit.signalIndex]?.time ?? null;
      const trade = closeTrade(trades.length + 1, position, bar, index, bar.open, pendingExit.reason, exitSignalTime, pendingExit.debug);
      trades.push(trade);
      cash += position.quantity * bar.open;
      position = null;
      exitedThisBar = true;
    }
    pendingExit = null;

    if (pendingEntry !== null && !position) {
      const quantity = Math.floor(cash / bar.open);
      if (quantity <= 0) {
        warnings.push(`entry signal on ${iso(bars[pendingEntry.signalIndex]?.time ?? bar.time)} was skipped because floor(cash / entry_price) quantity is 0.`);
        pendingEntry = null;
      } else {
      const atrStopValue = spec.stopLossAtrIndicator
        ? readNumericSeriesValue(series, spec.stopLossAtrIndicator, index)
        : null;
      position = {
        entryIndex: index,
        entryTime: bar.time,
        entrySignalTime: bars[pendingEntry.signalIndex]?.time ?? null,
        entryPrice: bar.open,
        quantity,
        atrStopDistance: atrStopValue !== null && spec.stopLossAtrMultiplier !== null
          ? atrStopValue * spec.stopLossAtrMultiplier
          : null,
        entryDebug: pendingEntry.debug,
      };
        cash -= quantity * bar.open;
      }
    }
    pendingEntry = null;

    if (position) {
      const stopPrice = position.atrStopDistance !== null
        ? position.entryPrice - position.atrStopDistance
        : spec.stopLossPercent === null
          ? null
          : position.entryPrice * (1 - spec.stopLossPercent / 100);
      const takeProfitPrice = spec.takeProfitPercent === null ? null : position.entryPrice * (1 + spec.takeProfitPercent / 100);
      if (stopPrice !== null && bar.low <= stopPrice) {
        const trade = closeTrade(trades.length + 1, position, bar, index, stopPrice, 'stop_loss', bar.time, {
          conditions: [{
            id: 'stop_loss',
            label: 'low <= stop_loss_price',
            result: true,
            left_value: round(bar.low, 4),
            operator: '<=',
            right_value: round(stopPrice, 4),
          }],
          triggered: ['stop_loss'],
        });
        trades.push(trade);
        cash += position.quantity * stopPrice;
        position = null;
        exitedThisBar = true;
      } else if (takeProfitPrice !== null && bar.high >= takeProfitPrice) {
        const trade = closeTrade(trades.length + 1, position, bar, index, takeProfitPrice, 'take_profit', bar.time, {
          conditions: [{
            id: 'take_profit',
            label: 'high >= take_profit_price',
            result: true,
            left_value: round(bar.high, 4),
            operator: '>=',
            right_value: round(takeProfitPrice, 4),
          }],
          triggered: ['take_profit'],
        });
        trades.push(trade);
        cash += position.quantity * takeProfitPrice;
        position = null;
        exitedThisBar = true;
      }
    }

    if (position) {
      const timeExit = spec.timeExitBars !== null && index - position.entryIndex + 1 >= spec.timeExitBars;
      const signalExit = evaluateAnyDebug(spec.exitConditions, bars, series, index);
      if ((timeExit || signalExit.result) && index < bars.length - 1) {
        pendingExit = timeExit
          ? {
            signalIndex: index,
            reason: 'time_exit',
            debug: {
              conditions: [{
                id: 'time_exit',
                label: 'bars_held >= time_exit_bars',
                result: true,
                left_value: index - position.entryIndex + 1,
                operator: '>=',
                right_value: spec.timeExitBars,
              }],
              triggered: ['time_exit'],
            },
          }
          : { signalIndex: index, reason: 'exit_signal', debug: { conditions: signalExit.details, triggered: signalExit.triggered } };
      }
    } else if (!exitedThisBar && index < bars.length - 1) {
      const filterEvaluation = evaluateAllDebug(spec.filterConditions, bars, series, index);
      const entryEvaluation = evaluateAllDebug(spec.entryConditions, bars, series, index);
      const filtersPass = spec.filterConditions.length === 0 || filterEvaluation.result;
      if (filtersPass && entryEvaluation.result) {
        pendingEntry = {
          signalIndex: index,
          debug: {
            conditions: entryEvaluation.details,
            filters: filterEvaluation.details,
          },
        };
      }
    }

    const equity = position ? cash + position.quantity * bar.close : cash;
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
    const trade = closeTrade(trades.length + 1, position, finalBar, finalIndex, finalBar.close, 'final_close', finalBar.time, {
      conditions: [{
        id: 'final_close',
        label: 'final bar close',
        result: true,
        left_value: round(finalBar.close, 4),
        operator: '==',
        right_value: round(finalBar.close, 4),
      }],
      triggered: ['final_close'],
    });
    trades.push(trade);
    cash += position.quantity * finalBar.close;
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

  return summarize(spec, bars, trades, equityCurve, cash, initialCapital, warnings);
}
