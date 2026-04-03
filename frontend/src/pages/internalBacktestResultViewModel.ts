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

export type InternalBacktestResultViewModel = {
  interpretation: InternalBacktestResultInterpretation;
  stateLabel:
    | 'success'
    | 'success_no_data'
    | 'error_data_source_unavailable'
    | 'error_internal'
    | 'not_ready';
  isError: boolean;
  isEmpty: boolean;
  canShowMetrics: boolean;
  recommendedMessageKey:
    | 'internal_backtest.result.success'
    | 'internal_backtest.result.success_no_data'
    | 'internal_backtest.result.data_source_unavailable'
    | 'internal_backtest.result.internal_failure'
    | 'internal_backtest.result.not_ready';
  shouldPromptRetry: boolean;
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
  if (
    input.status === 'not_ready' ||
    input.status === 'queued' ||
    input.status === 'running' ||
    input.status === 'canceled'
  ) {
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
        stateLabel: 'success',
        isError: false,
        isEmpty: false,
        canShowMetrics: true,
        recommendedMessageKey: 'internal_backtest.result.success',
        shouldPromptRetry: false,
      };
    case 'success_no_data':
      return {
        interpretation,
        stateLabel: 'success_no_data',
        isError: false,
        isEmpty: true,
        canShowMetrics: false,
        recommendedMessageKey: 'internal_backtest.result.success_no_data',
        shouldPromptRetry: false,
      };
    case 'data_source_unavailable':
      return {
        interpretation,
        stateLabel: 'error_data_source_unavailable',
        isError: true,
        isEmpty: false,
        canShowMetrics: false,
        recommendedMessageKey: 'internal_backtest.result.data_source_unavailable',
        shouldPromptRetry: true,
      };
    case 'not_ready':
      return {
        interpretation,
        stateLabel: 'not_ready',
        isError: false,
        isEmpty: false,
        canShowMetrics: false,
        recommendedMessageKey: 'internal_backtest.result.not_ready',
        shouldPromptRetry: false,
      };
    case 'internal_failure':
    default:
      return {
        interpretation: 'internal_failure',
        stateLabel: 'error_internal',
        isError: true,
        isEmpty: false,
        canShowMetrics: false,
        recommendedMessageKey: 'internal_backtest.result.internal_failure',
        shouldPromptRetry: true,
      };
  }
}

export function getInternalBacktestResultViewModel(
  input: InternalBacktestResultInterpretationInput,
): InternalBacktestResultViewModel {
  return buildInternalBacktestResultViewModel(interpretInternalBacktestResult(input));
}

export function getInternalBacktestMessageText(
  key: InternalBacktestResultViewModel['recommendedMessageKey'],
): string {
  switch (key) {
    case 'internal_backtest.result.success':
      return '内製バックテスト結果を表示できます。';
    case 'internal_backtest.result.success_no_data':
      return '対象期間のデータがありません。条件を見直してください。';
    case 'internal_backtest.result.data_source_unavailable':
      return 'データ取得に失敗しました。時間をおいて再実行してください。';
    case 'internal_backtest.result.internal_failure':
      return '内部エラーが発生しました。実行条件を確認して再試行してください。';
    case 'internal_backtest.result.not_ready':
    default:
      return '実行中です。完了までお待ちください。';
  }
}
