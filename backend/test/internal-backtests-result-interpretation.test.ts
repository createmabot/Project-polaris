import { describe, expect, it } from 'vitest';
import {
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
});

