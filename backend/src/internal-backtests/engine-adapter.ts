import type { InternalBacktestExecutionInput } from './contracts';

export type InternalBacktestEngineRunResult = {
  metrics?: Partial<{
    total_trades: number;
    win_rate: number;
    net_profit: number;
    profit_factor: number | null;
    max_drawdown_percent: number | null;
  }>;
  notes?: string;
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
  const barsPerDay = TIMEFRAME_BARS_PER_DAY[input.timeframe.toUpperCase()] ?? 1;
  const periodDays = daysBetweenInclusive(input.dataRange.from, input.dataRange.to);
  const estimatedBars = periodDays * barsPerDay;

  const seedText = `${input.strategyRuleVersionId}|${input.market}|${input.timeframe}|${input.dataRange.from}|${input.dataRange.to}`;
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

export const runDummyInternalBacktestEngine: InternalBacktestEngineAdapter = async ({ input }) => {
  const simulateFailure = input.engineConfig.simulate_failure === true;
  if (simulateFailure) {
    throw new Error('simulated_internal_backtest_failure');
  }

  const metrics = calculateDeterministicMetrics(input);

  return {
    metrics,
    notes: 'deterministic scaffold metrics derived from execution input',
  };
};
