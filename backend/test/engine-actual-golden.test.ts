import { describe, expect, it } from 'vitest';
import { runInternalBacktestExecutionService } from '../src/internal-backtests/run-execution-service';
import { createDummyInternalBacktestEngineAdapter } from '../src/internal-backtests/engine-adapter';

type StubBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const GOLDEN_BARS: StubBar[] = [
  { timestamp: '2024-01-01T00:00:00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
  { timestamp: '2024-01-02T00:00:00.000Z', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
  { timestamp: '2024-01-03T00:00:00.000Z', open: 101, high: 104, low: 100, close: 103, volume: 1000 },
  { timestamp: '2024-01-04T00:00:00.000Z', open: 103, high: 104, low: 97, close: 99, volume: 1000 },
  { timestamp: '2024-01-05T00:00:00.000Z', open: 98, high: 99, low: 97, close: 98, volume: 1000 },
  { timestamp: '2024-01-06T00:00:00.000Z', open: 98, high: 101, low: 97, close: 100, volume: 1000 },
];

const TAKE_PROFIT_BARS: StubBar[] = [
  { timestamp: '2024-01-01T00:00:00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
  { timestamp: '2024-01-02T00:00:00.000Z', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
  { timestamp: '2024-01-03T00:00:00.000Z', open: 101, high: 104, low: 100, close: 103, volume: 1000 },
  { timestamp: '2024-01-04T00:00:00.000Z', open: 103, high: 107, low: 102, close: 106, volume: 1000 },
  { timestamp: '2024-01-05T00:00:00.000Z', open: 106, high: 107, low: 104, close: 105, volume: 1000 },
  { timestamp: '2024-01-06T00:00:00.000Z', open: 105, high: 106, low: 104, close: 105, volume: 1000 },
];

function createGoldenAdapter(bars: StubBar[] = GOLDEN_BARS) {
  return createDummyInternalBacktestEngineAdapter({
    fetchDailyOhlcv: async () => ({
      bars,
      snapshot: {
        source_kind: 'daily_ohlcv',
        market: 'JP_STOCK',
        timeframe: 'D',
        from: bars[0]!.timestamp.slice(0, 10),
        to: bars[bars.length - 1]!.timestamp.slice(0, 10),
        fetched_at: bars[bars.length - 1]!.timestamp,
        data_revision: 'golden-v1',
        bar_count: bars.length,
      },
      fetchObservation: {
        providerName: 'stub',
        internalReasonCode: null,
        retryTarget: false,
        retryAttempted: false,
        retryAttempts: 1,
        httpStatus: null,
        endpointKind: 'stub_daily_ohlcv',
      },
    }),
  });
}

async function runGoldenExecution(args: {
  executionId: string;
  actualRules?: Record<string, unknown>;
  costs?: { fee_rate_bps?: number; slippage_bps?: number };
  bars?: StubBar[];
}) {
  const bars = args.bars ?? GOLDEN_BARS;
  return runInternalBacktestExecutionService(
    {
      executionId: args.executionId,
      strategyRuleVersionId: 'ver-golden',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: {
        strategy_rule_version_id: 'ver-golden',
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: {
          symbol: '7203',
          source_kind: 'daily_ohlcv',
        },
        data_range: { from: '2024-01-01', to: '2024-01-06' },
        engine_config: {
          summary_mode: 'engine_actual',
          ...(args.actualRules ? { actual_rules: args.actualRules } : {}),
          ...(args.costs ? { costs: args.costs } : {}),
        },
        strategy_snapshot: {
          natural_language_rule: 'rule',
          generated_pine: 'strategy("x")',
          market: 'JP_STOCK',
          timeframe: 'D',
        },
      },
    },
    { engineAdapter: createGoldenAdapter(bars) },
  );
}

describe('engine_actual golden cases', () => {
  it('default preset produces fixed trade/summary/artifact outputs', async () => {
    const output = await runGoldenExecution({
      executionId: 'golden-default',
    });

    expect(output.resultSummary.summary_kind).toBe('engine_actual');
    expect(output.resultSummary.metrics.trade_count).toBe(1);
    expect(output.resultSummary.metrics.total_return_percent).toBeCloseTo(-2.9703, 4);
    expect(output.resultSummary.metrics.max_drawdown_percent).toBeCloseTo(2.9703, 4);
    expect(output.resultSummary.metrics.average_trade_return_percent).toBeCloseTo(-2.9703, 4);
    expect(output.resultSummary.metrics.profit_factor).toBeCloseTo(0, 4);
    expect(output.resultSummary.metrics.first_trade_at).toBe('2024-01-03T00:00:00.000Z');
    expect(output.resultSummary.metrics.last_trade_at).toBe('2024-01-05T00:00:00.000Z');
    expect(output.artifactPayload?.trades).toHaveLength(1);
    expect(output.artifactPayload?.equity_curve).toHaveLength(2);
    expect(output.artifactPayload?.equity_curve?.[0]).toEqual({
      at: '2024-01-01T00:00:00.000Z',
      equity_index: 100,
    });
    expect(output.artifactPayload?.equity_curve?.[1]?.at).toBe(
      '2024-01-05T00:00:00.000Z',
    );
    expect(output.artifactPayload?.equity_curve?.[1]?.equity_index).toBeCloseTo(
      97.029703,
      6,
    );
  });

  it('sma_cross preset produces fixed trade/summary outputs', async () => {
    const output = await runGoldenExecution({
      executionId: 'golden-sma',
      actualRules: {
        entry_rule: { kind: 'price_above_sma', period: 2 },
        exit_rule: { kind: 'price_below_sma', period: 2 },
      },
    });

    expect(output.resultSummary.summary_kind).toBe('engine_actual');
    expect(output.resultSummary.metrics.trade_count).toBe(1);
    expect(output.resultSummary.metrics.total_return_percent).toBeCloseTo(-2.9703, 4);
    expect(output.resultSummary.metrics.max_drawdown_percent).toBeCloseTo(2.9703, 4);
    expect(output.resultSummary.metrics.average_trade_return_percent).toBeCloseTo(-2.9703, 4);
    expect(output.resultSummary.metrics.profit_factor).toBeCloseTo(0, 4);
    expect(output.artifactPayload?.trades).toHaveLength(1);
  });

  it('threshold_cross can be fixed as no-trade case', async () => {
    const output = await runGoldenExecution({
      executionId: 'golden-threshold-no-trade',
      actualRules: {
        entry_rule: { kind: 'price_above_threshold', threshold: 1000 },
        exit_rule: { kind: 'price_below_threshold', threshold: 1 },
      },
    });

    expect(output.resultSummary.summary_kind).toBe('engine_actual');
    expect(output.resultSummary.metrics.trade_count).toBe(0);
    expect(output.resultSummary.metrics.total_return_percent).toBe(0);
    expect(output.resultSummary.metrics.max_drawdown_percent).toBe(0);
    expect(output.resultSummary.metrics.average_trade_return_percent).toBe(0);
    expect(output.resultSummary.metrics.profit_factor).toBe(0);
    expect(output.artifactPayload?.trades).toEqual([]);
    expect(output.artifactPayload?.equity_curve).toEqual([
      { at: '2024-01-01T00:00:00.000Z', equity_index: 100 },
    ]);
  });

  it('fee/slippage lowers net summary with same bars/rules', async () => {
    const base = await runGoldenExecution({
      executionId: 'golden-fee-base',
      costs: { fee_rate_bps: 0, slippage_bps: 0 },
    });
    const withCost = await runGoldenExecution({
      executionId: 'golden-fee-cost',
      costs: { fee_rate_bps: 10, slippage_bps: 10 },
    });

    expect(withCost.resultSummary.metrics.total_return_percent).toBeLessThan(
      base.resultSummary.metrics.total_return_percent ?? 0,
    );
    expect(withCost.resultSummary.metrics.average_trade_return_percent).toBeLessThan(
      base.resultSummary.metrics.average_trade_return_percent ?? 0,
    );
    expect(withCost.resultSummary.metrics.total_return_percent).toBeCloseTo(-3.3642, 4);
  });

  it('max_holding_bars override follows fixed exit timing in golden fixture', async () => {
    const output = await runGoldenExecution({
      executionId: 'golden-max-holding',
      actualRules: {
        entry_rule: { kind: 'price_above_threshold', threshold: 101 },
        exit_rule: { kind: 'price_below_threshold', threshold: 1 },
        exit_overrides: {
          max_holding_bars: 1,
        },
      },
    });

    expect(output.resultSummary.metrics.trade_count).toBe(1);
    expect(output.resultSummary.metrics.holding_period_avg_bars).toBe(2);
    expect(output.resultSummary.metrics.total_return_percent).toBeCloseTo(-4.8544, 4);
    expect(output.artifactPayload?.trades).toEqual([
      {
        entry_at: '2024-01-04T00:00:00.000Z',
        entry_price: 103,
        exit_at: '2024-01-05T00:00:00.000Z',
        exit_price: 98,
        return_percent: -4.8544,
        holding_bars: 2,
      },
    ]);
  });

  it('take_profit_percent override follows fixed exit timing in golden fixture', async () => {
    const output = await runGoldenExecution({
      executionId: 'golden-take-profit',
      bars: TAKE_PROFIT_BARS,
      actualRules: {
        entry_rule: { kind: 'price_above_threshold', threshold: 101 },
        exit_rule: { kind: 'price_below_threshold', threshold: 1 },
        exit_overrides: {
          take_profit_percent: 1.5,
        },
      },
    });

    expect(output.resultSummary.metrics.trade_count).toBeGreaterThanOrEqual(1);
    expect(output.resultSummary.metrics.total_return_percent).toBeGreaterThan(0);
    expect(
      (output.artifactPayload?.trades ?? []).some(
        (trade) =>
          trade.entry_at === '2024-01-04T00:00:00.000Z' &&
          trade.exit_at === '2024-01-05T00:00:00.000Z' &&
          trade.entry_price === 103 &&
          trade.exit_price === 106 &&
          trade.return_percent === 2.9126 &&
          trade.holding_bars === 2,
      ),
    ).toBe(true);
  });
});
