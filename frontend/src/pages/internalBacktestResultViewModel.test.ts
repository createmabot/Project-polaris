import { describe, expect, it } from 'vitest';
import {
  buildInternalBacktestResultViewModel,
  getInternalBacktestResultViewModel,
  interpretInternalBacktestResult,
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
