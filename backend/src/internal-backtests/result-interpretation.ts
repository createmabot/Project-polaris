export type InternalBacktestResultInterpretation =
  | 'success_with_data'
  | 'success_no_data'
  | 'data_source_unavailable'
  | 'internal_failure'
  | 'not_ready';

export type InternalBacktestResultInterpretationInput = {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | string;
  errorCode?: string | null;
  summaryKind?: string | null;
  metricsBarCount?: number | null;
  snapshotBarCount?: number | null;
};

function asNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function resolveInternalBacktestBarCountForInterpretation(args: {
  metricsBarCount?: unknown;
  snapshotBarCount?: unknown;
}): number | null {
  const metricsBarCount = asNonNegativeNumber(args.metricsBarCount);
  if (metricsBarCount !== null) {
    return metricsBarCount;
  }
  return asNonNegativeNumber(args.snapshotBarCount);
}

export function interpretInternalBacktestResult(
  input: InternalBacktestResultInterpretationInput,
): InternalBacktestResultInterpretation {
  if (input.status === 'queued' || input.status === 'running' || input.status === 'canceled') {
    return 'not_ready';
  }

  if (input.status === 'failed') {
    if (input.errorCode === 'DATA_SOURCE_UNAVAILABLE') {
      return 'data_source_unavailable';
    }
    return 'internal_failure';
  }

  if (input.status === 'succeeded') {
    const barCount = resolveInternalBacktestBarCountForInterpretation({
      metricsBarCount: input.metricsBarCount,
      snapshotBarCount: input.snapshotBarCount,
    });
    if (input.summaryKind === 'engine_estimated' && barCount === 0) {
      return 'success_no_data';
    }
    return 'success_with_data';
  }

  return 'internal_failure';
}

