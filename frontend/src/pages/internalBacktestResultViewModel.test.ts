import { describe, expect, it } from 'vitest';
import {
  buildEngineActualRestorePayloadFromInputSnapshot,
  buildEngineActualSummaryDisplay,
  buildEngineActualPayload,
  buildInternalBacktestResultViewModel,
  getInternalBacktestResultViewModel,
  interpretInternalBacktestResult,
  validateEngineActualForm,
} from './internalBacktestResultViewModel';

describe('internalBacktestResultViewModel', () => {
  it('success_with_data when succeeded and bar_count > 0', () => {
    const interpretation = interpretInternalBacktestResult({
      status: 'succeeded',
      summaryKind: 'engine_estimated',
      metricsBarCount: 10,
    });
    expect(interpretation).toBe('success_with_data');
    const vm = buildInternalBacktestResultViewModel(interpretation);
    expect(vm.isError).toBe(false);
    expect(vm.isEmpty).toBe(false);
    expect(vm.canShowMetrics).toBe(true);
  });

  it('success_no_data when succeeded and bar_count = 0', () => {
    const vm = getInternalBacktestResultViewModel({
      status: 'succeeded',
      summaryKind: 'engine_estimated',
      metricsBarCount: 0,
      snapshotBarCount: 0,
    });
    expect(vm.interpretation).toBe('success_no_data');
    expect(vm.isError).toBe(false);
    expect(vm.isEmpty).toBe(true);
    expect(vm.recommendedMessageKey).toBe('internal_backtest.result.success_no_data');
  });

  it('data_source_unavailable when failed with DATA_SOURCE_UNAVAILABLE', () => {
    const vm = getInternalBacktestResultViewModel({
      status: 'failed',
      errorCode: 'DATA_SOURCE_UNAVAILABLE',
    });
    expect(vm.interpretation).toBe('data_source_unavailable');
    expect(vm.isError).toBe(true);
    expect(vm.shouldPromptRetry).toBe(true);
  });

  it('not_ready for queued/running', () => {
    expect(getInternalBacktestResultViewModel({ status: 'queued' }).interpretation).toBe('not_ready');
    expect(getInternalBacktestResultViewModel({ status: 'running' }).interpretation).toBe('not_ready');
  });

  it('internal_failure for canceled', () => {
    const vm = getInternalBacktestResultViewModel({ status: 'canceled' });
    expect(vm.interpretation).toBe('internal_failure');
    expect(vm.isError).toBe(true);
  });
});

describe('buildEngineActualPayload', () => {
  it('default_previous_close returns undefined actual_rules (backend applies default)', () => {
    const result = buildEngineActualPayload({
      presetId: 'default_previous_close',
      smaPeriod: '',
      thresholdValue: '',
      feeRateBps: '0',
      slippageBps: '0',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
    expect(result.actual_rules).toBeUndefined();
    expect(result.costs).toEqual({ fee_rate_bps: 0, slippage_bps: 0 });
  });

  it('sma_cross returns entry price_above_sma / exit price_below_sma with period', () => {
    const result = buildEngineActualPayload({
      presetId: 'sma_cross',
      smaPeriod: '25',
      thresholdValue: '',
      feeRateBps: '10',
      slippageBps: '5',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
    expect(result.actual_rules).toEqual({
      entry_rule: { kind: 'price_above_sma', period: 25 },
      exit_rule: { kind: 'price_below_sma', period: 25 },
    });
    expect(result.costs).toEqual({ fee_rate_bps: 10, slippage_bps: 5 });
  });

  it('threshold_cross returns entry price_above_threshold / exit price_below_threshold with threshold', () => {
    const result = buildEngineActualPayload({
      presetId: 'threshold_cross',
      smaPeriod: '',
      thresholdValue: '500',
      feeRateBps: '0',
      slippageBps: '2.5',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
    expect(result.actual_rules).toEqual({
      entry_rule: { kind: 'price_above_threshold', threshold: 500 },
      exit_rule: { kind: 'price_below_threshold', threshold: 500 },
    });
    expect(result.costs).toEqual({ fee_rate_bps: 0, slippage_bps: 2.5 });
  });

  it('adds exit_overrides when optional exit settings are provided', () => {
    const result = buildEngineActualPayload({
      presetId: 'sma_cross',
      smaPeriod: '20',
      thresholdValue: '',
      feeRateBps: '0',
      slippageBps: '0',
      maxHoldingBars: '15',
      takeProfitPercent: '8',
      stopLossPercent: '4',
    });
    expect(result.actual_rules).toEqual({
      entry_rule: { kind: 'price_above_sma', period: 20 },
      exit_rule: { kind: 'price_below_sma', period: 20 },
      exit_overrides: {
        max_holding_bars: 15,
        take_profit_percent: 8,
        stop_loss_percent: 4,
      },
    });
  });
});

describe('validateEngineActualForm', () => {
  it('default_previous_close is always valid with no params', () => {
    expect(
      validateEngineActualForm({
        presetId: 'default_previous_close',
        smaPeriod: '',
        thresholdValue: '',
        feeRateBps: '0',
        slippageBps: '0',
        maxHoldingBars: '',
        takeProfitPercent: '',
        stopLossPercent: '',
      }),
    ).toBeNull();
  });

  it('sma_cross with empty period returns error message', () => {
    const error = validateEngineActualForm({
      presetId: 'sma_cross',
      smaPeriod: '',
      thresholdValue: '',
      feeRateBps: '0',
      slippageBps: '0',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
    expect(error).not.toBeNull();
    expect(error).toContain('period');
  });

  it('sma_cross with period = 1 (out of range) returns error message', () => {
    const error = validateEngineActualForm({
      presetId: 'sma_cross',
      smaPeriod: '1',
      thresholdValue: '',
      feeRateBps: '0',
      slippageBps: '0',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
    expect(error).not.toBeNull();
    expect(error).toContain('2');
  });

  it('sma_cross with valid period 25 is valid', () => {
    expect(
      validateEngineActualForm({
        presetId: 'sma_cross',
        smaPeriod: '25',
        thresholdValue: '',
        feeRateBps: '0',
        slippageBps: '0',
        maxHoldingBars: '',
        takeProfitPercent: '',
        stopLossPercent: '',
      }),
    ).toBeNull();
  });

  it('threshold_cross with empty threshold returns error message', () => {
    const error = validateEngineActualForm({
      presetId: 'threshold_cross',
      smaPeriod: '',
      thresholdValue: '',
      feeRateBps: '0',
      slippageBps: '0',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
    expect(error).not.toBeNull();
    expect(error).toContain('threshold');
  });

  it('threshold_cross with threshold = 0 returns error message', () => {
    const error = validateEngineActualForm({
      presetId: 'threshold_cross',
      smaPeriod: '',
      thresholdValue: '0',
      feeRateBps: '0',
      slippageBps: '0',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
    expect(error).not.toBeNull();
  });

  it('threshold_cross with valid threshold 500 is valid', () => {
    expect(
      validateEngineActualForm({
        presetId: 'threshold_cross',
        smaPeriod: '',
        thresholdValue: '500',
        feeRateBps: '0',
        slippageBps: '0',
        maxHoldingBars: '',
        takeProfitPercent: '',
        stopLossPercent: '',
      }),
    ).toBeNull();
  });

  it('returns error when fee/slippage bps is invalid', () => {
    expect(
      validateEngineActualForm({
        presetId: 'default_previous_close',
        smaPeriod: '',
        thresholdValue: '',
        feeRateBps: '-1',
        slippageBps: '0',
        maxHoldingBars: '',
        takeProfitPercent: '',
        stopLossPercent: '',
      }),
    ).toContain('fee rate');
    expect(
      validateEngineActualForm({
        presetId: 'default_previous_close',
        smaPeriod: '',
        thresholdValue: '',
        feeRateBps: '0',
        slippageBps: '-2',
        maxHoldingBars: '',
        takeProfitPercent: '',
        stopLossPercent: '',
      }),
    ).toContain('slippage');
  });

  it('returns error when optional exit override fields are invalid', () => {
    expect(
      validateEngineActualForm({
        presetId: 'default_previous_close',
        smaPeriod: '',
        thresholdValue: '',
        feeRateBps: '0',
        slippageBps: '0',
        maxHoldingBars: '0',
        takeProfitPercent: '',
        stopLossPercent: '',
      }),
    ).toContain('max_holding_bars');
    expect(
      validateEngineActualForm({
        presetId: 'default_previous_close',
        smaPeriod: '',
        thresholdValue: '',
        feeRateBps: '0',
        slippageBps: '0',
        maxHoldingBars: '',
        takeProfitPercent: '-1',
        stopLossPercent: '',
      }),
    ).toContain('take_profit_percent');
    expect(
      validateEngineActualForm({
        presetId: 'default_previous_close',
        smaPeriod: '',
        thresholdValue: '',
        feeRateBps: '0',
        slippageBps: '0',
        maxHoldingBars: '',
        takeProfitPercent: '',
        stopLossPercent: '0',
      }),
    ).toContain('stop_loss_percent');
  });
});

describe('buildEngineActualRestorePayloadFromInputSnapshot', () => {
  it('restores default_previous_close when actual_rules is absent', () => {
    const restored = buildEngineActualRestorePayloadFromInputSnapshot({
      execution_target: { symbol: '7203' },
      data_range: { from: '2024-01-01', to: '2024-12-31' },
      engine_config: { summary_mode: 'engine_actual' },
    });
    expect(restored).not.toBeNull();
    expect(restored?.summaryMode).toBe('engine_actual');
    expect(restored?.form.presetId).toBe('default_previous_close');
    expect(restored?.form.feeRateBps).toBe('0');
    expect(restored?.form.slippageBps).toBe('0');
    expect(restored?.symbol).toBe('7203');
    expect(restored?.dataRange).toEqual({ from: '2024-01-01', to: '2024-12-31' });
  });

  it('restores sma_cross with period from actual_rules', () => {
    const restored = buildEngineActualRestorePayloadFromInputSnapshot({
      execution_target: { symbol: '7203' },
      data_range: { from: '2024-01-01', to: '2024-12-31' },
      engine_config: {
        summary_mode: 'engine_actual',
        actual_rules: {
          entry_rule: { kind: 'price_above_sma', period: 25 },
          exit_rule: { kind: 'price_below_sma', period: 25 },
        },
      },
    });
    expect(restored).not.toBeNull();
    expect(restored?.form).toEqual({
      presetId: 'sma_cross',
      smaPeriod: '25',
      thresholdValue: '',
      feeRateBps: '0',
      slippageBps: '0',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
  });

  it('restores threshold_cross with threshold from actual_rules', () => {
    const restored = buildEngineActualRestorePayloadFromInputSnapshot({
      execution_target: { symbol: '7203' },
      data_range: { from: '2024-01-01', to: '2024-12-31' },
      engine_config: {
        summary_mode: 'engine_actual',
        actual_rules: {
          entry_rule: { kind: 'price_above_threshold', threshold: 500 },
          exit_rule: { kind: 'price_below_threshold', threshold: 500 },
        },
      },
    });
    expect(restored).not.toBeNull();
    expect(restored?.form).toEqual({
      presetId: 'threshold_cross',
      smaPeriod: '',
      thresholdValue: '500',
      feeRateBps: '0',
      slippageBps: '0',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
  });

  it('returns null when actual_rules cannot be mapped to supported preset', () => {
    const restored = buildEngineActualRestorePayloadFromInputSnapshot({
      execution_target: { symbol: '7203' },
      data_range: { from: '2024-01-01', to: '2024-12-31' },
      engine_config: {
        summary_mode: 'engine_actual',
        actual_rules: {
          entry_rule: { kind: 'price_above_sma', period: 25 },
          exit_rule: { kind: 'price_below_threshold', threshold: 500 },
        },
      },
    });
    expect(restored).toBeNull();
  });

  it('restores fee/slippage bps from engine_config.costs', () => {
    const restored = buildEngineActualRestorePayloadFromInputSnapshot({
      execution_target: { symbol: '7203' },
      data_range: { from: '2024-01-01', to: '2024-12-31' },
      engine_config: {
        summary_mode: 'engine_actual',
        costs: {
          fee_rate_bps: 12,
          slippage_bps: 7.5,
        },
      },
    });
    expect(restored).not.toBeNull();
    expect(restored?.form.feeRateBps).toBe('12');
    expect(restored?.form.slippageBps).toBe('7.5');
  });

  it('restores exit_overrides from input_snapshot.engine_config.actual_rules', () => {
    const restored = buildEngineActualRestorePayloadFromInputSnapshot({
      execution_target: { symbol: '7203' },
      data_range: { from: '2024-01-01', to: '2024-12-31' },
      engine_config: {
        summary_mode: 'engine_actual',
        actual_rules: {
          entry_rule: { kind: 'price_above_sma', period: 25 },
          exit_rule: { kind: 'price_below_sma', period: 25 },
          exit_overrides: {
            max_holding_bars: 12,
            take_profit_percent: 7.5,
            stop_loss_percent: 3.2,
          },
        },
      },
    });
    expect(restored).not.toBeNull();
    expect(restored?.form.maxHoldingBars).toBe('12');
    expect(restored?.form.takeProfitPercent).toBe('7.5');
    expect(restored?.form.stopLossPercent).toBe('3.2');
  });
});

describe('buildEngineActualSummaryDisplay', () => {
  it('formats average_trade_return_percent and profit_factor for compare UI', () => {
    const summary = buildEngineActualSummaryDisplay(
      {
        trade_count: 4,
        win_rate: 50,
        total_return_percent: 3.21,
        max_drawdown_percent: -1.9,
        average_trade_return_percent: 0.8123,
        profit_factor: 1.4567,
      },
      [{ kind: 'price_above_sma', period: 25 }],
    );

    expect(summary.tradeCount).toBe(4);
    expect(summary.winRatePct).toBe('50.0%');
    expect(summary.totalReturnPct).toBe('+3.21%');
    expect(summary.maxDrawdownPct).toBe('-1.90%');
    expect(summary.averageTradeReturnPct).toBe('+0.81%');
    expect(summary.profitFactor).toBe('1.46');
  });

  it('keeps new metrics safe for no-trade values', () => {
    const summary = buildEngineActualSummaryDisplay(
      {
        trade_count: 0,
        win_rate: 0,
        total_return_percent: 0,
        max_drawdown_percent: 0,
        average_trade_return_percent: 0,
        profit_factor: 0,
      },
      null,
    );

    expect(summary.tradeCount).toBe(0);
    expect(summary.averageTradeReturnPct).toBe('+0.00%');
    expect(summary.profitFactor).toBe('0.00');
  });
});

