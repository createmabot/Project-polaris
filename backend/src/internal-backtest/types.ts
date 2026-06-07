export type InternalBacktestBar = {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type InternalBacktestTrade = {
  trade_no: number;
  entry_at: string;
  entry_bar_time: string | null;
  entry_time: string;
  entry_price: number;
  entry_reason: 'entry_signal';
  exit_at: string;
  exit_bar_time: string | null;
  exit_time: string;
  exit_price: number;
  quantity: number;
  gross_profit: number;
  net_profit: number;
  pnl: number;
  return_percent: number;
  bars_held: number;
  exit_reason: 'exit_signal' | 'stop_loss' | 'take_profit' | 'time_exit' | 'final_close';
};

export type InternalBacktestEquityPoint = {
  time: string;
  equity: number;
  drawdown_percent: number;
  position: 'flat' | 'long';
};

export type InternalBacktestResultSummary = {
  summary_kind: 'internal_backtest_v1';
  period: {
    from: string;
    to: string;
    bar_count: number;
  };
  trade_period: {
    first_entry_at: string | null;
    last_exit_at: string | null;
    first_trade_at: string | null;
    last_trade_at: string | null;
  };
  metrics: {
    initial_capital: number;
    final_equity: number;
    net_profit: number;
    total_return_percent: number;
    price_change_percent: number | null;
    total_trades: number;
    trade_count: number;
    win_rate: number;
    gross_profit: number;
    gross_loss: number;
    average_trade: number | null;
    profit_factor: number | null;
    max_drawdown: number;
    max_drawdown_percent: number;
  };
  trade_summary: {
    trade_count: number;
    first_entry_at: string | null;
    last_exit_at: string | null;
    exit_reason_counts: Array<{
      exit_reason: InternalBacktestTrade['exit_reason'];
      count: number;
    }>;
  };
  trades: InternalBacktestTrade[];
  trades_truncated: boolean;
  equity_curve: InternalBacktestEquityPoint[];
  assumptions: string[];
  warnings: string[];
  ignored_unsupported_features: string[];
};

export class InternalBacktestValidationError extends Error {
  constructor(
    message: string,
    public readonly reason: 'missing_spec' | 'unsupported_spec' | 'missing_market_bars',
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'InternalBacktestValidationError';
  }
}
