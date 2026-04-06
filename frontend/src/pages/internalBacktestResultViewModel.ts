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
  if (input.status === 'not_ready' || input.status === 'queued' || input.status === 'running') {
    return 'not_ready';
  }
  if (input.status === 'canceled') {
    return 'internal_failure';
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

// ──────────────────────────────────────────────────
// engine_actual rule preset 選択 UI ヘルパー
// ──────────────────────────────────────────────────

export type EngineActualPresetId =
  | 'default_previous_close'
  | 'sma_cross'
  | 'threshold_cross';

export const ENGINE_ACTUAL_PRESETS: ReadonlyArray<{
  id: EngineActualPresetId;
  label: string;
  description: string;
  needsPeriod: boolean;
  needsThreshold: boolean;
}> = [
  {
    id: 'default_previous_close',
    label: 'デフォルト（前日比）',
    description: '前日終値より上昇で entry、下落で exit。パラメータ不要。',
    needsPeriod: false,
    needsThreshold: false,
  },
  {
    id: 'sma_cross',
    label: 'SMA クロス',
    description: '終値が SMA（単純移動平均）を上抜けで entry、下抜けで exit。period (2〜200) を指定。',
    needsPeriod: true,
    needsThreshold: false,
  },
  {
    id: 'threshold_cross',
    label: '価格閾値クロス',
    description: '終値が閾値を上抜けで entry、下抜けで exit。threshold（正の数）を指定。',
    needsPeriod: false,
    needsThreshold: true,
  },
] as const;

export type EngineActualFormState = {
  presetId: EngineActualPresetId;
  /** sma_cross 時の SMA period（数値文字列）。空文字 = 未入力 */
  smaPeriod: string;
  /** threshold_cross 時の threshold（数値文字列）。空文字 = 未入力 */
  thresholdValue: string;
};

export function createDefaultEngineActualFormState(): EngineActualFormState {
  return {
    presetId: 'default_previous_close',
    smaPeriod: '',
    thresholdValue: '',
  };
}

/**
 * engine_actual フォームのバリデーションを行う。
 * @returns エラーメッセージ文字列（null = valid）
 */
export function validateEngineActualForm(form: EngineActualFormState): string | null {
  if (form.presetId === 'sma_cross') {
    const period = Number(form.smaPeriod);
    if (form.smaPeriod.trim() === '') {
      return 'SMA period を入力してください。';
    }
    if (!Number.isInteger(period) || period < 2 || period > 200) {
      return 'SMA period は 2〜200 の整数で入力してください。';
    }
  }
  if (form.presetId === 'threshold_cross') {
    const threshold = Number(form.thresholdValue);
    if (form.thresholdValue.trim() === '') {
      return 'threshold を入力してください。';
    }
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return 'threshold は 0 より大きい数値で入力してください。';
    }
  }
  return null;
}

type ActualRulesPayload = {
  entry_rule: { kind: string; period?: number; threshold?: number };
  exit_rule: { kind: string; period?: number; threshold?: number };
};

/**
 * engine_actual フォームの状態から engine_config.actual_rules payload を組み立てる。
 * default_previous_close の場合は undefined を返す（backend がデフォルトを適用する）。
 */
export function buildEngineActualPayload(form: EngineActualFormState): {
  actual_rules: ActualRulesPayload | undefined;
} {
  switch (form.presetId) {
    case 'default_previous_close':
      return { actual_rules: undefined };

    case 'sma_cross': {
      const period = parseInt(form.smaPeriod, 10);
      return {
        actual_rules: {
          entry_rule: { kind: 'price_above_sma', period },
          exit_rule: { kind: 'price_below_sma', period },
        },
      };
    }

    case 'threshold_cross': {
      const threshold = parseFloat(form.thresholdValue);
      return {
        actual_rules: {
          entry_rule: { kind: 'price_above_threshold', threshold },
          exit_rule: { kind: 'price_below_threshold', threshold },
        },
      };
    }

    default:
      return { actual_rules: undefined };
  }
}


// ──────────────────────────────────────────────────

export type EngineActualSummaryDisplay = {
  tradeCount: number | null;
  /** 例: "62.5%" */
  winRatePct: string | null;
  /** 例: "+8.30%" または "-3.10%" */
  totalReturnPct: string | null;
  /** 例: "-5.20%" */
  maxDrawdownPct: string | null;
  holdingAvgBars: number | null;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  /** 例: "price_above_sma (period=25)" / "price_above_threshold (threshold=500)" / "default (close_above_previous_close)" / "default" */
  rulePatternLabel: string;
};

type EngineActualMetrics = {
  trade_count?: number | null;
  win_rate?: number | null;
  total_return_percent?: number | null;
  max_drawdown_percent?: number | null;
  holding_period_avg_bars?: number | null;
  first_trade_at?: string | null;
  last_trade_at?: string | null;
};

type ActualRule = {
  kind: string;
  [key: string]: unknown;
};

function formatSignedPct(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatPct(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return `${value.toFixed(1)}%`;
}

const KNOWN_DEFAULT_RULE_KINDS: ReadonlySet<string> = new Set([
  'close_above_previous_close',
  'close_below_previous_close',
]);

function buildRulePatternLabel(actualRules: ActualRule[] | null | undefined): string {
  if (!actualRules || actualRules.length === 0) {
    return 'default';
  }

  const labels = actualRules.map((rule) => {
    const kind = typeof rule.kind === 'string' ? rule.kind : 'unknown';

    if (KNOWN_DEFAULT_RULE_KINDS.has(kind)) {
      return `default (${kind})`;
    }

    // パラメータ付きルール種別
    if (kind === 'price_above_sma' || kind === 'price_below_sma') {
      const period = typeof rule.period === 'number' ? rule.period : null;
      return period !== null ? `${kind} (period=${period})` : kind;
    }
    if (kind === 'price_above_threshold' || kind === 'price_below_threshold') {
      const threshold = typeof rule.threshold === 'number' ? rule.threshold : null;
      return threshold !== null ? `${kind} (threshold=${threshold})` : kind;
    }

    return kind;
  });

  return labels.join(' / ');
}

/**
 * engine_actual result_summary.metrics と input_snapshot.actual_rules から
 * UI 表示用のサマリーオブジェクトを最小整形して返す。
 *
 * - null / undefined のフィールドは null として返す
 * - パーセント値は文字列整形済み（例: "+8.30%"）
 * - rulePatternLabel は生 JSON ではなく readable な形式
 */
export function buildEngineActualSummaryDisplay(
  metrics: EngineActualMetrics | null | undefined,
  actualRules: ActualRule[] | null | undefined,
): EngineActualSummaryDisplay {
  return {
    tradeCount: metrics?.trade_count ?? null,
    winRatePct: formatPct(metrics?.win_rate),
    totalReturnPct: formatSignedPct(metrics?.total_return_percent),
    maxDrawdownPct: formatSignedPct(metrics?.max_drawdown_percent),
    holdingAvgBars:
      typeof metrics?.holding_period_avg_bars === 'number' && Number.isFinite(metrics.holding_period_avg_bars)
        ? metrics.holding_period_avg_bars
        : null,
    firstTradeAt: metrics?.first_trade_at ?? null,
    lastTradeAt: metrics?.last_trade_at ?? null,
    rulePatternLabel: buildRulePatternLabel(actualRules),
  };
}
