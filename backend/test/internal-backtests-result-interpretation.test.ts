import { describe, expect, it } from 'vitest';
import {
  buildInternalBacktestResultViewModel,
  getInternalBacktestResultViewModel,
  interpretInternalBacktestResult,
  resolveInternalBacktestBarCountForInterpretation,
} from '../src/internal-backtests/result-interpretation';

describe('internal backtest result interpretation helper', () => {
  it('returns success_with_data for succeeded engine_estimated with bar_count > 0', () => {
    const interpretation = interpretInternalBacktestResult({
      status: 'succeeded',
      summaryKind: 'engine_estimated',
      metricsBarCount: 12,
      snapshotBarCount: 12,
    });
    expect(interpretation).toBe('success_with_data');
  });

  it('returns success_no_data for succeeded engine_estimated with bar_count = 0', () => {
    const interpretation = interpretInternalBacktestResult({
      status: 'succeeded',
      summaryKind: 'engine_estimated',
      metricsBarCount: 0,
      snapshotBarCount: 0,
    });
    expect(interpretation).toBe('success_no_data');
  });

  it('returns data_source_unavailable for failed DATA_SOURCE_UNAVAILABLE', () => {
    const interpretation = interpretInternalBacktestResult({
      status: 'failed',
      errorCode: 'DATA_SOURCE_UNAVAILABLE',
    });
    expect(interpretation).toBe('data_source_unavailable');
  });

  it('returns internal_failure for failed non DATA_SOURCE_UNAVAILABLE', () => {
    const interpretation = interpretInternalBacktestResult({
      status: 'failed',
      errorCode: 'INTERNAL_ENGINE_ERROR',
    });
    expect(interpretation).toBe('internal_failure');
  });

  it('treats scaffold_deterministic as success_with_data when succeeded', () => {
    const interpretation = interpretInternalBacktestResult({
      status: 'succeeded',
      summaryKind: 'scaffold_deterministic',
      metricsBarCount: 31,
    });
    expect(interpretation).toBe('success_with_data');
  });

  it('returns not_ready for queued/running/canceled', () => {
    expect(
      interpretInternalBacktestResult({
        status: 'queued',
      }),
    ).toBe('not_ready');
    expect(
      interpretInternalBacktestResult({
        status: 'running',
      }),
    ).toBe('not_ready');
    expect(
      interpretInternalBacktestResult({
        status: 'canceled',
      }),
    ).toBe('not_ready');
  });

  it('prefers metrics.bar_count over snapshot.bar_count when both exist', () => {
    expect(
      resolveInternalBacktestBarCountForInterpretation({
        metricsBarCount: 5,
        snapshotBarCount: 8,
      }),
    ).toBe(5);
  });

  it('falls back to snapshot.bar_count when metrics.bar_count is absent', () => {
    expect(
      resolveInternalBacktestBarCountForInterpretation({
        snapshotBarCount: 7,
      }),
    ).toBe(7);
  });

  it('maps success_with_data to metrics-visible non-error view model', () => {
    const vm = buildInternalBacktestResultViewModel('success_with_data');
    expect(vm).toMatchObject({
      state_label: 'success',
      is_error: false,
      is_empty: false,
      can_show_metrics: true,
      recommended_message_key: 'internal_backtest.result.success',
    });
  });

  it('maps success_no_data to empty-state view model', () => {
    const vm = buildInternalBacktestResultViewModel('success_no_data');
    expect(vm).toMatchObject({
      state_label: 'success_no_data',
      is_error: false,
      is_empty: true,
      can_show_metrics: false,
      recommended_message_key: 'internal_backtest.result.success_no_data',
      show_zero_data_note: true,
    });
  });

  it('maps data_source_unavailable to retryable data-source error view model', () => {
    const vm = buildInternalBacktestResultViewModel('data_source_unavailable');
    expect(vm).toMatchObject({
      state_label: 'error_data_source_unavailable',
      is_error: true,
      can_show_metrics: false,
      recommended_message_key: 'internal_backtest.result.data_source_unavailable',
      should_prompt_retry: true,
      show_data_source_hint: true,
    });
  });

  it('maps internal_failure to retryable generic error view model', () => {
    const vm = buildInternalBacktestResultViewModel('internal_failure');
    expect(vm).toMatchObject({
      state_label: 'error_internal',
      is_error: true,
      can_show_metrics: false,
      recommended_message_key: 'internal_backtest.result.internal_failure',
      should_prompt_retry: true,
    });
  });

  it('maps not_ready to waiting view model', () => {
    const vm = buildInternalBacktestResultViewModel('not_ready');
    expect(vm).toMatchObject({
      state_label: 'not_ready',
      is_error: false,
      can_show_metrics: false,
      recommended_message_key: 'internal_backtest.result.not_ready',
      should_prompt_retry: false,
    });
  });

  it('builds view model directly from raw interpretation input', () => {
    const vm = getInternalBacktestResultViewModel({
      status: 'succeeded',
      summaryKind: 'engine_estimated',
      metricsBarCount: 0,
      snapshotBarCount: 0,
    });
    expect(vm.interpretation).toBe('success_no_data');
    expect(vm.state_label).toBe('success_no_data');
  });
});
