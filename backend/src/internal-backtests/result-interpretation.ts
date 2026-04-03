export type InternalBacktestResultInterpretation =
  | 'success_with_data'
  | 'success_no_data'
  | 'data_source_unavailable'
  | 'internal_failure'
  | 'not_ready';

export type InternalBacktestResultStateLabel =
  | 'success'
  | 'success_no_data'
  | 'error_data_source_unavailable'
  | 'error_internal'
  | 'not_ready';

export type InternalBacktestResultMessageKey =
  | 'internal_backtest.result.success'
  | 'internal_backtest.result.success_no_data'
  | 'internal_backtest.result.data_source_unavailable'
  | 'internal_backtest.result.internal_failure'
  | 'internal_backtest.result.not_ready';

export type InternalBacktestResultViewModel = {
  interpretation: InternalBacktestResultInterpretation;
  state_label: InternalBacktestResultStateLabel;
  is_error: boolean;
  is_empty: boolean;
  can_show_metrics: boolean;
  recommended_message_key: InternalBacktestResultMessageKey;
  should_prompt_retry: boolean;
  show_data_source_hint: boolean;
  show_zero_data_note: boolean;
};

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

export function buildInternalBacktestResultViewModel(
  interpretation: InternalBacktestResultInterpretation,
): InternalBacktestResultViewModel {
  switch (interpretation) {
    case 'success_with_data':
      return {
        interpretation,
        state_label: 'success',
        is_error: false,
        is_empty: false,
        can_show_metrics: true,
        recommended_message_key: 'internal_backtest.result.success',
        should_prompt_retry: false,
        show_data_source_hint: false,
        show_zero_data_note: false,
      };
    case 'success_no_data':
      return {
        interpretation,
        state_label: 'success_no_data',
        is_error: false,
        is_empty: true,
        can_show_metrics: false,
        recommended_message_key: 'internal_backtest.result.success_no_data',
        should_prompt_retry: false,
        show_data_source_hint: true,
        show_zero_data_note: true,
      };
    case 'data_source_unavailable':
      return {
        interpretation,
        state_label: 'error_data_source_unavailable',
        is_error: true,
        is_empty: false,
        can_show_metrics: false,
        recommended_message_key: 'internal_backtest.result.data_source_unavailable',
        should_prompt_retry: true,
        show_data_source_hint: true,
        show_zero_data_note: false,
      };
    case 'not_ready':
      return {
        interpretation,
        state_label: 'not_ready',
        is_error: false,
        is_empty: false,
        can_show_metrics: false,
        recommended_message_key: 'internal_backtest.result.not_ready',
        should_prompt_retry: false,
        show_data_source_hint: false,
        show_zero_data_note: false,
      };
    case 'internal_failure':
    default:
      return {
        interpretation: 'internal_failure',
        state_label: 'error_internal',
        is_error: true,
        is_empty: false,
        can_show_metrics: false,
        recommended_message_key: 'internal_backtest.result.internal_failure',
        should_prompt_retry: true,
        show_data_source_hint: false,
        show_zero_data_note: false,
      };
  }
}

export function getInternalBacktestResultViewModel(
  input: InternalBacktestResultInterpretationInput,
): InternalBacktestResultViewModel {
  return buildInternalBacktestResultViewModel(interpretInternalBacktestResult(input));
}
