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
    });
    expect(result.actual_rules).toBeUndefined();
  });

  it('sma_cross returns entry price_above_sma / exit price_below_sma with period', () => {
    const result = buildEngineActualPayload({
      presetId: 'sma_cross',
      smaPeriod: '25',
      thresholdValue: '',
    });
    expect(result.actual_rules).toEqual({
      entry_rule: { kind: 'price_above_sma', period: 25 },
      exit_rule: { kind: 'price_below_sma', period: 25 },
    });
  });

  it('threshold_cross returns entry price_above_threshold / exit price_below_threshold with threshold', () => {
    const result = buildEngineActualPayload({
      presetId: 'threshold_cross',
      smaPeriod: '',
      thresholdValue: '500',
    });
    expect(result.actual_rules).toEqual({
      entry_rule: { kind: 'price_above_threshold', threshold: 500 },
      exit_rule: { kind: 'price_below_threshold', threshold: 500 },
    });
  });
});

describe('validateEngineActualForm', () => {
  it('default_previous_close is always valid with no params', () => {
    expect(
      validateEngineActualForm({ presetId: 'default_previous_close', smaPeriod: '', thresholdValue: '' }),
    ).toBeNull();
  });

  it('sma_cross with empty period returns error message', () => {
    const error = validateEngineActualForm({ presetId: 'sma_cross', smaPeriod: '', thresholdValue: '' });
    expect(error).not.toBeNull();
    expect(error).toContain('period');
  });

  it('sma_cross with period = 1 (out of range) returns error message', () => {
    const error = validateEngineActualForm({ presetId: 'sma_cross', smaPeriod: '1', thresholdValue: '' });
    expect(error).not.toBeNull();
    expect(error).toContain('2');
  });

  it('sma_cross with valid period 25 is valid', () => {
    expect(
      validateEngineActualForm({ presetId: 'sma_cross', smaPeriod: '25', thresholdValue: '' }),
    ).toBeNull();
  });

  it('threshold_cross with empty threshold returns error message', () => {
    const error = validateEngineActualForm({ presetId: 'threshold_cross', smaPeriod: '', thresholdValue: '' });
    expect(error).not.toBeNull();
    expect(error).toContain('threshold');
  });

  it('threshold_cross with threshold = 0 returns error message', () => {
    const error = validateEngineActualForm({ presetId: 'threshold_cross', smaPeriod: '', thresholdValue: '0' });
    expect(error).not.toBeNull();
  });

  it('threshold_cross with valid threshold 500 is valid', () => {
    expect(
      validateEngineActualForm({ presetId: 'threshold_cross', smaPeriod: '', thresholdValue: '500' }),
    ).toBeNull();
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

