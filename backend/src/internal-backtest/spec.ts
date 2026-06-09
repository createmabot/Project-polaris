import { normalizeTimeframeAlias } from '../strategy/timeframe';
import type { NormalizedStrategySpec } from '../strategy/normalized-spec';
import { InternalBacktestValidationError } from './types';

type CompiledCondition = {
  id: string;
  type: 'price_vs_indicator' | 'indicator_threshold' | 'volume_filter';
  left: string;
  operator: string;
  indicator?: string;
  value?: number;
  rightIndicator?: string;
  multiplier: number;
};

export type CompiledInternalBacktestSpec = {
  market: string;
  timeframe: 'D';
  indicators: Array<Record<string, unknown>>;
  entryConditions: CompiledCondition[];
  exitConditions: CompiledCondition[];
  filterConditions: CompiledCondition[];
  stopLossPercent: number | null;
  stopLossAtrIndicator: string | null;
  stopLossAtrMultiplier: number | null;
  takeProfitPercent: number | null;
  timeExitBars: number | null;
  assumptions: string[];
  warnings: string[];
  ignoredUnsupportedFeatures: string[];
  normalizedSpec: NormalizedStrategySpec;
};

const SUPPORTED_INDICATORS = new Set(['SMA', 'EMA', 'RSI', 'MACD', 'ATR', 'VOLUME_SMA']);
const SUPPORTED_OPERATORS = new Set(['>', '>=', '<', '<=', '==', 'crosses_above', 'crosses_below']);
const IGNORED_UNSUPPORTED_FEATURES = new Set([
  'consecutive_loss_skip',
  'complex_time_pnl_exit_logic',
  'conditional_time_exit_with_pnl_check',
  'gap_risk_slippage_management',
  'event_date_filtering',
  'earnings_gap_handling',
  'overfitting_check',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringFrom(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeOperator(value: unknown): string | null {
  const raw = stringFrom(value);
  if (!raw) return null;
  const normalized = raw
    .replace(/=>/g, '>=')
    .replace(/=<|≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/cross(?:es)? above|cross_over|crossover/gi, 'crosses_above')
    .replace(/cross(?:es)? below|cross_under|crossunder/gi, 'crosses_below');
  return SUPPORTED_OPERATORS.has(normalized) ? normalized : null;
}

function collectStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeUnsupportedFeature(value: string): string {
  const compact = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (
    compact === 'consecutive_loss_skip'
    || compact === 'consecutive_loss_skip_logic'
    || compact === 'consecutivelossskip'
    || compact === 'consecutivelossskiplogic'
  ) {
    return 'consecutive_loss_skip';
  }
  return compact || value.trim();
}

function collectNormalizedUnsupportedFeatures(value: unknown): string[] {
  return Array.from(new Set(collectStringArray(value).map(normalizeUnsupportedFeature)));
}

function indicatorMeta(indicators: Array<Record<string, unknown>>) {
  return indicators
    .map((indicator) => ({
      id: stringFrom(indicator.id),
      type: stringFrom(indicator.type)?.toUpperCase() ?? null,
      length: numberFrom(indicator.length ?? indicator.period),
    }))
    .filter((indicator): indicator is { id: string; type: string; length: number | null } => Boolean(indicator.id && indicator.type));
}

function inferRightIndicatorFromRule(input: Record<string, unknown>, indicators: Array<Record<string, unknown>>, leftIndicator: string | null): string | null {
  const rule = stringFrom(input.rule) ?? stringFrom(input.description) ?? '';
  if (!rule) return null;
  const normalizedRule = rule.toLowerCase();
  const candidates = indicatorMeta(indicators).filter((indicator) => indicator.id !== leftIndicator);
  for (const indicator of candidates) {
    if (normalizedRule.includes(indicator.id.toLowerCase())) return indicator.id;
    if (indicator.length !== null) {
      const typeLabel = indicator.type === 'VOLUME_SMA' ? '(?:volume[_\\s-]?sma|出来高|平均出来高)' : indicator.type.toLowerCase();
      const patterns = [
        new RegExp(`${indicator.length}\\s*(?:日|期間)?\\s*${typeLabel}`, 'i'),
        new RegExp(`${typeLabel}\\s*\\(?\\s*${indicator.length}\\s*\\)?`, 'i'),
      ];
      if (patterns.some((pattern) => pattern.test(rule))) return indicator.id;
    }
  }
  return null;
}

function compileCondition(input: Record<string, unknown>, fallbackId: string, indicators: Array<Record<string, unknown>>): CompiledCondition {
  const rawType = stringFrom(input.type) ?? '';
  if (!['price_vs_indicator', 'indicator_threshold', 'indicator_range', 'indicator_vs_indicator', 'volume_filter'].includes(rawType)) {
    throw new InternalBacktestValidationError(
      'normalized strategy spec contains an unsupported condition type for internal backtest v1.',
      'unsupported_spec',
      { condition_type: rawType || null },
    );
  }
  const operator = normalizeOperator(input.operator) ?? '>=';
  const id = stringFrom(input.id) ?? fallbackId;
  const right = isRecord(input.right) ? input.right : null;
  const explicitRightIndicator = stringFrom(right?.indicator)
    ?? stringFrom(input.right_indicator)
    ?? stringFrom(input.compare_indicator)
    ?? stringFrom(input.target_indicator);
  const indicator = stringFrom(input.indicator) ?? (rawType === 'volume_filter' ? explicitRightIndicator ?? undefined : undefined);
  const inferredRightIndicator = rawType === 'indicator_vs_indicator'
    ? inferRightIndicatorFromRule(input, indicators, indicator ?? null)
    : null;
  const rightIndicator = explicitRightIndicator ?? inferredRightIndicator ?? null;
  const multiplier = numberFrom(input.multiplier) ?? numberFrom(right?.multiplier) ?? 1;
  const value = numberFrom(input.value);
  const compiledType = rawType === 'indicator_range' || rawType === 'indicator_vs_indicator' ? 'indicator_threshold' : rawType;
  const left = stringFrom(input.left) ?? (compiledType === 'volume_filter' ? 'volume' : indicator ?? 'close');

  if (compiledType === 'price_vs_indicator' && !indicator) {
    throw new InternalBacktestValidationError('price_vs_indicator requires an indicator.', 'unsupported_spec', { condition_id: id });
  }
  if (compiledType === 'indicator_threshold' && !indicator && !left) {
    throw new InternalBacktestValidationError('indicator_threshold requires an indicator.', 'unsupported_spec', { condition_id: id });
  }
  if (compiledType === 'indicator_threshold' && value === null && !rightIndicator) {
    throw new InternalBacktestValidationError('indicator_threshold requires a numeric value or right indicator.', 'unsupported_spec', { condition_id: id });
  }
  if (compiledType === 'volume_filter' && !indicator && !rightIndicator) {
    throw new InternalBacktestValidationError('volume_filter requires a volume average indicator.', 'unsupported_spec', { condition_id: id });
  }

  return {
    id,
    type: compiledType as CompiledCondition['type'],
    left,
    operator,
    indicator,
    value: value ?? undefined,
    rightIndicator: compiledType === 'volume_filter' ? rightIndicator ?? indicator : rightIndicator ?? undefined,
    multiplier,
  };
}

function compileConditions(items: Array<Record<string, unknown>>, prefix: string, indicators: Array<Record<string, unknown>>): CompiledCondition[] {
  return items.map((item, index) => compileCondition(item, `${prefix}_${index + 1}`, indicators));
}

function riskRecord(risk: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return isRecord(risk[key]) ? risk[key] : null;
}

function percentRiskValue(record: Record<string, unknown> | null, key: string): number | null {
  if (!record) return null;
  const type = stringFrom(record.type);
  if (type && type !== 'percent') return null;
  const value = numberFrom(record.value);
  return value !== null && value !== 0 ? Math.abs(value) : null;
}

function atrRiskValue(record: Record<string, unknown> | null): { indicator: string; multiplier: number } | null {
  if (!record) return null;
  const type = stringFrom(record.type);
  if (type !== 'atr_multiple') return null;
  const indicator = stringFrom(record.indicator_ref) ?? stringFrom(record.indicator) ?? stringFrom(record.atr_indicator);
  const multiplier = numberFrom(record.value) ?? numberFrom(record.multiplier);
  if (!indicator || multiplier === null || multiplier <= 0) return null;
  return { indicator, multiplier };
}

function ignoredFeatureForConditionType(type: string | null): string | null {
  if (!type) return null;
  const normalized = normalizeUnsupportedFeature(type);
  if (['event_date_filter', 'event_filter', 'event_date_filtering'].includes(normalized)) return 'event_date_filtering';
  if (['earnings_gap_filter', 'earnings_filter', 'earnings_gap_handling'].includes(normalized)) return 'earnings_gap_handling';
  if (normalized === 'overfitting_check') return 'overfitting_check';
  return null;
}

export function compileInternalBacktestSpec(value: NormalizedStrategySpec): CompiledInternalBacktestSpec {
  if (value.schema_name !== 'normalized_strategy_spec' || value.schema_version !== '1.0') {
    throw new InternalBacktestValidationError('normalized strategy spec v1 is required.', 'missing_spec');
  }
  const timeframe = normalizeTimeframeAlias(value.timeframe);
  if (timeframe !== 'D') {
    throw new InternalBacktestValidationError('internal backtest v1 supports D timeframe only.', 'unsupported_spec', { timeframe });
  }
  if (value.side !== 'long_only') {
    throw new InternalBacktestValidationError('internal backtest v1 supports long_only strategies only.', 'unsupported_spec', { side: value.side });
  }
  if (value.entry?.logic !== 'all' || value.exit?.logic !== 'any') {
    throw new InternalBacktestValidationError('internal backtest v1 supports entry all and exit any logic only.', 'unsupported_spec');
  }

  const unsupportedIndicators = value.indicators
    .map((indicator) => (typeof indicator.type === 'string' ? indicator.type.toUpperCase() : ''))
    .filter((type) => !SUPPORTED_INDICATORS.has(type));
  if (unsupportedIndicators.length > 0) {
    throw new InternalBacktestValidationError('normalized strategy spec contains unsupported indicators.', 'unsupported_spec', {
      indicators: Array.from(new Set(unsupportedIndicators)),
    });
  }

  const validationUnsupported = collectNormalizedUnsupportedFeatures(value.validation?.unsupported_features);
  const ignoredUnsupportedFeatures = validationUnsupported.filter((item) => IGNORED_UNSUPPORTED_FEATURES.has(item));
  const hardUnsupported = validationUnsupported.filter((item) => !IGNORED_UNSUPPORTED_FEATURES.has(item));
  if (hardUnsupported.length > 0) {
    throw new InternalBacktestValidationError('normalized strategy spec contains unsupported features.', 'unsupported_spec', {
      unsupported_features: hardUnsupported,
    });
  }

  const entryRaw = value.entry.conditions.filter(isRecord);
  const exitRaw = value.exit.conditions.filter(isRecord).filter((condition) => {
    const type = stringFrom(condition.type);
    if (type === 'time_exit') return false;
    if (type === 'time_and_pnl') {
      ignoredUnsupportedFeatures.push('complex_time_pnl_exit_logic');
      return false;
    }
    return true;
  });
  const filterRaw = value.filters.filter(isRecord).filter((condition) => {
    const ignoredFeature = ignoredFeatureForConditionType(stringFrom(condition.type));
    if (ignoredFeature) {
      ignoredUnsupportedFeatures.push(ignoredFeature);
      return false;
    }
    return true;
  });
  if (entryRaw.length === 0) {
    throw new InternalBacktestValidationError('normalized strategy spec requires at least one entry condition.', 'unsupported_spec');
  }

  const risk = isRecord(value.risk) ? value.risk : {};
  const stopLoss = riskRecord(risk, 'stop_loss');
  const atrStopLoss = atrRiskValue(stopLoss);
  if (stopLoss) {
    const direction = stringFrom(stopLoss.direction) ?? 'below_entry';
    if (!['below_entry', 'below', 'long_stop_loss'].includes(direction)) {
      throw new InternalBacktestValidationError('internal backtest v1 supports long stop_loss below entry only.', 'unsupported_spec');
    }
    if (!atrStopLoss && percentRiskValue(stopLoss, 'stop_loss') === null) {
      throw new InternalBacktestValidationError('internal backtest v1 supports percent or ATR multiple stop_loss only.', 'unsupported_spec');
    }
  }
  const timeExitRecord = riskRecord(risk, 'time_exit');
  const timeExitBars = numberFrom(timeExitRecord?.bars);
  if (isRecord(risk.consecutive_loss_skip)) {
    ignoredUnsupportedFeatures.push('consecutive_loss_skip');
  }

  const ignored = Array.from(new Set(ignoredUnsupportedFeatures));
  const warnings = [
    ...collectStringArray(value.warnings),
    ...collectStringArray(value.validation?.warnings),
    ...ignored.map((feature) => `${feature} is ignored by internal backtest v1.`),
  ];

  return {
    market: value.market,
    timeframe: 'D',
    indicators: value.indicators,
    entryConditions: compileConditions(entryRaw, 'entry', value.indicators),
    exitConditions: compileConditions(exitRaw, 'exit', value.indicators),
    filterConditions: compileConditions(filterRaw, 'filter', value.indicators),
    stopLossPercent: percentRiskValue(stopLoss, 'stop_loss'),
    stopLossAtrIndicator: atrStopLoss?.indicator ?? null,
    stopLossAtrMultiplier: atrStopLoss?.multiplier ?? null,
    takeProfitPercent: percentRiskValue(riskRecord(risk, 'take_profit'), 'take_profit'),
    timeExitBars: timeExitBars !== null && timeExitBars > 0 ? Math.floor(timeExitBars) : null,
    assumptions: Array.from(new Set([...collectStringArray(value.assumptions), ...collectStringArray(value.validation?.assumptions)])),
    warnings: Array.from(new Set(warnings)),
    ignoredUnsupportedFeatures: ignored,
    normalizedSpec: value,
  };
}
