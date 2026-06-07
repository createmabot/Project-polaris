export type InternalBacktestBar = {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type InternalBacktestTrade = {
  entry_time: string;
  entry_price: number;
  exit_time: string;
  exit_price: number;
  quantity: number;
  pnl: number;
  return_percent: number;
  bars_held: number;
  exit_reason: 'exit_signal' | 'stop_loss' | 'take_profit' | 'final_close';
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
  trades: InternalBacktestTrade[];
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
