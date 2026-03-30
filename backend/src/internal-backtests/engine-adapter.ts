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

export const runDummyInternalBacktestEngine: InternalBacktestEngineAdapter = async ({ input }) => {
  const simulateFailure = input.engineConfig.simulate_failure === true;
  if (simulateFailure) {
    throw new Error('simulated_internal_backtest_failure');
  }

  return {
    metrics: {
      total_trades: 0,
      win_rate: 0,
      net_profit: 0,
      profit_factor: null,
      max_drawdown_percent: null,
    },
    notes: 'internal backtest worker scaffold result',
  };
};

