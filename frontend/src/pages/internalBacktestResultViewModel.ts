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
  /** 片道手数料（bps）。空文字は 0 扱い */
  feeRateBps: string;
  /** 片道スリッページ（bps）。空文字は 0 扱い */
  slippageBps: string;
  /** 最大保有バー数（正の整数）。空文字 = 未指定 */
  maxHoldingBars: string;
  /** 利確ライン（%）。正の数。空文字 = 未指定 */
  takeProfitPercent: string;
  /** 損切りライン（%）。正の数。空文字 = 未指定 */
  stopLossPercent: string;
};

export type EngineActualRestorePayload = {
  summaryMode: 'engine_actual';
  form: EngineActualFormState;
  symbol: string | null;
  dataRange: {
    from: string;
    to: string;
  } | null;
};

export function createDefaultEngineActualFormState(): EngineActualFormState {
  return {
    presetId: 'default_previous_close',
    smaPeriod: '',
    thresholdValue: '',
    feeRateBps: '0',
    slippageBps: '0',
    maxHoldingBars: '',
    takeProfitPercent: '',
    stopLossPercent: '',
  };
}

function parseBpsInput(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number.NaN;
  }
  return parsed;
}

/**
 * engine_actual フォームのバリデーションを行う。
 * @returns エラーメッセージ文字列（null = valid）
 */
export function validateEngineActualForm(form: EngineActualFormState): string | null {
  const feeRateBps = parseBpsInput(form.feeRateBps);
  if (!Number.isFinite(feeRateBps)) {
    return 'fee rate (bps) は 0 以上の数値で入力してください。';
  }
  const slippageBps = parseBpsInput(form.slippageBps);
  if (!Number.isFinite(slippageBps)) {
    return 'slippage (bps) は 0 以上の数値で入力してください。';
  }
  if (form.maxHoldingBars.trim() !== '') {
    const maxHoldingBars = Number(form.maxHoldingBars);
    if (!Number.isInteger(maxHoldingBars) || maxHoldingBars <= 0) {
      return 'max_holding_bars は 1 以上の整数で入力してください。';
    }
  }
  if (form.takeProfitPercent.trim() !== '') {
    const takeProfitPercent = Number(form.takeProfitPercent);
    if (!Number.isFinite(takeProfitPercent) || takeProfitPercent <= 0) {
      return 'take_profit_percent は 0 より大きい数値で入力してください。';
    }
  }
  if (form.stopLossPercent.trim() !== '') {
    const stopLossPercent = Number(form.stopLossPercent);
    if (!Number.isFinite(stopLossPercent) || stopLossPercent <= 0) {
      return 'stop_loss_percent は 0 より大きい数値で入力してください。';
    }
  }
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
  exit_overrides?: {
    max_holding_bars?: number;
    take_profit_percent?: number;
    stop_loss_percent?: number;
  };
};

/**
 * engine_actual フォームの状態から engine_config.actual_rules payload を組み立てる。
 * default_previous_close の場合は undefined を返す（backend がデフォルトを適用する）。
 */
export function buildEngineActualPayload(form: EngineActualFormState): {
  actual_rules: ActualRulesPayload | undefined;
  costs: {
    fee_rate_bps: number;
    slippage_bps: number;
  };
} {
  const maxHoldingBars =
    form.maxHoldingBars.trim() === '' ? undefined : parseInt(form.maxHoldingBars, 10);
  const takeProfitPercent =
    form.takeProfitPercent.trim() === '' ? undefined : parseFloat(form.takeProfitPercent);
  const stopLossPercent =
    form.stopLossPercent.trim() === '' ? undefined : parseFloat(form.stopLossPercent);
  const exitOverrides: ActualRulesPayload['exit_overrides'] = {
    ...(maxHoldingBars !== undefined ? { max_holding_bars: maxHoldingBars } : {}),
    ...(takeProfitPercent !== undefined ? { take_profit_percent: takeProfitPercent } : {}),
    ...(stopLossPercent !== undefined ? { stop_loss_percent: stopLossPercent } : {}),
  };

  const costs = {
    fee_rate_bps: parseBpsInput(form.feeRateBps),
    slippage_bps: parseBpsInput(form.slippageBps),
  };
  switch (form.presetId) {
    case 'default_previous_close':
      return {
        actual_rules:
          Object.keys(exitOverrides).length > 0
            ? {
                entry_rule: { kind: 'close_above_previous_close' },
                exit_rule: { kind: 'close_below_previous_close' },
                exit_overrides: exitOverrides,
              }
            : undefined,
        costs,
      };

    case 'sma_cross': {
      const period = parseInt(form.smaPeriod, 10);
      return {
        actual_rules: {
          entry_rule: { kind: 'price_above_sma', period },
          exit_rule: { kind: 'price_below_sma', period },
          ...(Object.keys(exitOverrides).length > 0 ? { exit_overrides: exitOverrides } : {}),
        },
        costs,
      };
    }

    case 'threshold_cross': {
      const threshold = parseFloat(form.thresholdValue);
      return {
        actual_rules: {
          entry_rule: { kind: 'price_above_threshold', threshold },
          exit_rule: { kind: 'price_below_threshold', threshold },
          ...(Object.keys(exitOverrides).length > 0 ? { exit_overrides: exitOverrides } : {}),
        },
        costs,
      };
    }

    default:
      return { actual_rules: undefined, costs };
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asRule(value: unknown): ActualRule | null {
  const obj = asObject(value);
  if (!obj || typeof obj.kind !== 'string') return null;
  return obj as ActualRule;
}

function extractRulesFromInputSnapshot(
  inputSnapshot: unknown,
): { entryRule: ActualRule | null; exitRule: ActualRule | null } {
  const snapshot = asObject(inputSnapshot);
  if (!snapshot) {
    return { entryRule: null, exitRule: null };
  }

  const engineConfig = asObject(snapshot.engine_config);
  const actualRulesObject = asObject(engineConfig?.actual_rules);
  const entryRule = asRule(actualRulesObject?.entry_rule);
  const exitRule = asRule(actualRulesObject?.exit_rule);
  if (entryRule || exitRule) {
    return { entryRule, exitRule };
  }

  // Backward compatibility for older frontend-only fixtures.
  const fallbackRules = Array.isArray(snapshot.actual_rules)
    ? (snapshot.actual_rules as unknown[])
    : null;
  if (fallbackRules && fallbackRules.length > 0) {
    return {
      entryRule: asRule(fallbackRules[0]),
      exitRule: asRule(fallbackRules[1]),
    };
  }

  return { entryRule: null, exitRule: null };
}

function buildPresetStateFromRules(
  entryRule: ActualRule | null,
  exitRule: ActualRule | null,
  exitOverrides: {
    maxHoldingBars?: number;
    takeProfitPercent?: number;
    stopLossPercent?: number;
  },
  costs?: { feeRateBps: string; slippageBps: string },
): EngineActualFormState | null {
  const withCosts = (state: EngineActualFormState): EngineActualFormState => ({
    ...state,
    feeRateBps: costs?.feeRateBps ?? '0',
    slippageBps: costs?.slippageBps ?? '0',
    maxHoldingBars:
      exitOverrides.maxHoldingBars !== undefined ? String(exitOverrides.maxHoldingBars) : '',
    takeProfitPercent:
      exitOverrides.takeProfitPercent !== undefined ? String(exitOverrides.takeProfitPercent) : '',
    stopLossPercent:
      exitOverrides.stopLossPercent !== undefined ? String(exitOverrides.stopLossPercent) : '',
  });
  if (!entryRule && !exitRule) {
    return withCosts(createDefaultEngineActualFormState());
  }

  const entryKind = entryRule?.kind ?? null;
  const exitKind = exitRule?.kind ?? null;

  if (entryKind === 'close_above_previous_close' && exitKind === 'close_below_previous_close') {
    return withCosts(createDefaultEngineActualFormState());
  }
  if (entryKind === 'price_above_sma' && exitKind === 'price_below_sma') {
    const period = typeof entryRule?.period === 'number' ? entryRule.period : null;
    if (!period || !Number.isInteger(period) || period < 2 || period > 200) {
      return null;
    }
    return withCosts({
      presetId: 'sma_cross',
      smaPeriod: String(period),
      thresholdValue: '',
      feeRateBps: '0',
      slippageBps: '0',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
  }
  if (entryKind === 'price_above_threshold' && exitKind === 'price_below_threshold') {
    const threshold = typeof entryRule?.threshold === 'number' ? entryRule.threshold : null;
    if (!threshold || !Number.isFinite(threshold) || threshold <= 0) {
      return null;
    }
    return withCosts({
      presetId: 'threshold_cross',
      smaPeriod: '',
      thresholdValue: String(threshold),
      feeRateBps: '0',
      slippageBps: '0',
      maxHoldingBars: '',
      takeProfitPercent: '',
      stopLossPercent: '',
    });
  }

  return null;
}

function extractExecutionTargetSymbol(inputSnapshot: unknown): string | null {
  const snapshot = asObject(inputSnapshot);
  const executionTarget = asObject(snapshot?.execution_target);
  const symbol = typeof executionTarget?.symbol === 'string' ? executionTarget.symbol.trim() : '';
  return symbol.length > 0 ? symbol : null;
}

function extractDataRange(inputSnapshot: unknown): { from: string; to: string } | null {
  const snapshot = asObject(inputSnapshot);
  const dataRange = asObject(snapshot?.data_range);
  const from = typeof dataRange?.from === 'string' ? dataRange.from.trim() : '';
  const to = typeof dataRange?.to === 'string' ? dataRange.to.trim() : '';
  if (!from || !to) {
    return null;
  }
  return { from, to };
}

function extractExitOverrides(inputSnapshot: unknown): {
  maxHoldingBars?: number;
  takeProfitPercent?: number;
  stopLossPercent?: number;
} {
  const snapshot = asObject(inputSnapshot);
  const engineConfig = asObject(snapshot?.engine_config);
  const actualRules = asObject(engineConfig?.actual_rules);
  const exitOverrides = asObject(actualRules?.exit_overrides);

  const maxHoldingBars =
    typeof exitOverrides?.max_holding_bars === 'number' && Number.isInteger(exitOverrides.max_holding_bars)
      ? exitOverrides.max_holding_bars
      : undefined;
  const takeProfitPercent =
    typeof exitOverrides?.take_profit_percent === 'number' && Number.isFinite(exitOverrides.take_profit_percent)
      ? exitOverrides.take_profit_percent
      : undefined;
  const stopLossPercent =
    typeof exitOverrides?.stop_loss_percent === 'number' && Number.isFinite(exitOverrides.stop_loss_percent)
      ? exitOverrides.stop_loss_percent
      : undefined;

  return {
    ...(maxHoldingBars !== undefined ? { maxHoldingBars } : {}),
    ...(takeProfitPercent !== undefined ? { takeProfitPercent } : {}),
    ...(stopLossPercent !== undefined ? { stopLossPercent } : {}),
  };
}

function extractEngineActualCosts(inputSnapshot: unknown): { feeRateBps: string; slippageBps: string } {
  const snapshot = asObject(inputSnapshot);
  const engineConfig = asObject(snapshot?.engine_config);
  const costs = asObject(engineConfig?.costs);

  const feeRateBpsRaw =
    typeof costs?.fee_rate_bps === 'number'
      ? costs.fee_rate_bps
      : typeof engineConfig?.commission_percent === 'number'
        ? engineConfig.commission_percent * 100
        : typeof engineConfig?.commission === 'number'
          ? engineConfig.commission * 100
          : 0;

  const slippageBpsRaw =
    typeof costs?.slippage_bps === 'number'
      ? costs.slippage_bps
      : typeof engineConfig?.slippage_percent === 'number'
        ? engineConfig.slippage_percent * 100
        : typeof engineConfig?.slippage === 'number'
          ? engineConfig.slippage * 100
          : 0;

  return {
    feeRateBps:
      Number.isFinite(feeRateBpsRaw) && feeRateBpsRaw >= 0 ? String(feeRateBpsRaw) : '0',
    slippageBps:
      Number.isFinite(slippageBpsRaw) && slippageBpsRaw >= 0 ? String(slippageBpsRaw) : '0',
  };
}

export function buildEngineActualRestorePayloadFromInputSnapshot(
  inputSnapshot: unknown,
): EngineActualRestorePayload | null {
  const { entryRule, exitRule } = extractRulesFromInputSnapshot(inputSnapshot);
  const exitOverrides = extractExitOverrides(inputSnapshot);
  const form = buildPresetStateFromRules(
    entryRule,
    exitRule,
    exitOverrides,
    extractEngineActualCosts(inputSnapshot),
  );
  if (!form) {
    return null;
  }
  return {
    summaryMode: 'engine_actual',
    form,
    symbol: extractExecutionTargetSymbol(inputSnapshot),
    dataRange: extractDataRange(inputSnapshot),
  };
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
  /** 例: "+0.42%" */
  averageTradeReturnPct: string | null;
  /** 例: "1.35" */
  profitFactor: string | null;
  feeRateBps: number | null;
  slippageBps: number | null;
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
  average_trade_return_percent?: number | null;
  profit_factor?: number | null;
  fee_rate_bps?: number | null;
  slippage_bps?: number | null;
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

function formatFixed(value: number | null | undefined, digits: number): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return value.toFixed(digits);
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
    averageTradeReturnPct: formatSignedPct(metrics?.average_trade_return_percent),
    profitFactor: formatFixed(metrics?.profit_factor, 2),
    feeRateBps:
      typeof metrics?.fee_rate_bps === 'number' && Number.isFinite(metrics.fee_rate_bps)
        ? metrics.fee_rate_bps
        : null,
    slippageBps:
      typeof metrics?.slippage_bps === 'number' && Number.isFinite(metrics.slippage_bps)
        ? metrics.slippage_bps
        : null,
    holdingAvgBars:
      typeof metrics?.holding_period_avg_bars === 'number' && Number.isFinite(metrics.holding_period_avg_bars)
        ? metrics.holding_period_avg_bars
        : null,
    firstTradeAt: metrics?.first_trade_at ?? null,
    lastTradeAt: metrics?.last_trade_at ?? null,
    rulePatternLabel: buildRulePatternLabel(actualRules),
  };
}
