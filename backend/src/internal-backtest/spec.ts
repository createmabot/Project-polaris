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
  takeProfitPercent: number | null;
  timeExitBars: number | null;
  assumptions: string[];
  warnings: string[];
  ignoredUnsupportedFeatures: string[];
  normalizedSpec: NormalizedStrategySpec;
};

const SUPPORTED_INDICATORS = new Set(['SMA', 'EMA', 'RSI', 'MACD', 'ATR', 'VOLUME_SMA']);
const SUPPORTED_OPERATORS = new Set(['>', '>=', '<', '<=', '==', 'crosses_above', 'crosses_below']);
const IGNORED_UNSUPPORTED_FEATURES = new Set(['consecutive_loss_skip']);

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

function compileCondition(input: Record<string, unknown>, fallbackId: string): CompiledCondition {
  const rawType = stringFrom(input.type) ?? '';
  if (!['price_vs_indicator', 'indicator_threshold', 'volume_filter'].includes(rawType)) {
    throw new InternalBacktestValidationError(
      'normalized strategy spec contains an unsupported condition type for internal backtest v1.',
      'unsupported_spec',
      { condition_type: rawType || null },
    );
  }
  const operator = normalizeOperator(input.operator) ?? '>=';
  const id = stringFrom(input.id) ?? fallbackId;
  const right = isRecord(input.right) ? input.right : null;
  const rightIndicator = stringFrom(right?.indicator) ?? null;
  const indicator = stringFrom(input.indicator) ?? rightIndicator ?? undefined;
  const multiplier = numberFrom(input.multiplier) ?? numberFrom(right?.multiplier) ?? 1;
  const value = numberFrom(input.value);
  const left = stringFrom(input.left) ?? (rawType === 'volume_filter' ? 'volume' : indicator ?? 'close');

  if (rawType === 'price_vs_indicator' && !indicator) {
    throw new InternalBacktestValidationError('price_vs_indicator requires an indicator.', 'unsupported_spec', { condition_id: id });
  }
  if (rawType === 'indicator_threshold' && !indicator && !left) {
    throw new InternalBacktestValidationError('indicator_threshold requires an indicator.', 'unsupported_spec', { condition_id: id });
  }
  if (rawType === 'indicator_threshold' && value === null && !rightIndicator) {
    throw new InternalBacktestValidationError('indicator_threshold requires a numeric value or right indicator.', 'unsupported_spec', { condition_id: id });
  }
  if (rawType === 'volume_filter' && !indicator && !rightIndicator) {
    throw new InternalBacktestValidationError('volume_filter requires a volume average indicator.', 'unsupported_spec', { condition_id: id });
  }

  return {
    id,
    type: rawType as CompiledCondition['type'],
    left,
    operator,
    indicator,
    value: value ?? undefined,
    rightIndicator: rightIndicator ?? indicator,
    multiplier,
  };
}

function compileConditions(items: Array<Record<string, unknown>>, prefix: string): CompiledCondition[] {
  return items.map((item, index) => compileCondition(item, `${prefix}_${index + 1}`));
}

function riskRecord(risk: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return isRecord(risk[key]) ? risk[key] : null;
}

function percentRiskValue(record: Record<string, unknown> | null, key: string): number | null {
  if (!record) return null;
  const type = stringFrom(record.type);
  if (type && type !== 'percent') return null;
  const value = numberFrom(record.value);
  return value !== null && value > 0 ? Math.abs(value) : null;
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
  const exitRaw = value.exit.conditions.filter(isRecord).filter((condition) => stringFrom(condition.type) !== 'time_exit');
  const filterRaw = value.filters.filter(isRecord);
  if (entryRaw.length === 0) {
    throw new InternalBacktestValidationError('normalized strategy spec requires at least one entry condition.', 'unsupported_spec');
  }

  const risk = isRecord(value.risk) ? value.risk : {};
  const stopLoss = riskRecord(risk, 'stop_loss');
  if (stopLoss) {
    const direction = stringFrom(stopLoss.direction) ?? 'below_entry';
    if (direction !== 'below_entry') {
      throw new InternalBacktestValidationError('internal backtest v1 supports percent stop_loss below_entry only.', 'unsupported_spec');
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
    entryConditions: compileConditions(entryRaw, 'entry'),
    exitConditions: compileConditions(exitRaw, 'exit'),
    filterConditions: compileConditions(filterRaw, 'filter'),
    stopLossPercent: percentRiskValue(stopLoss, 'stop_loss'),
    takeProfitPercent: percentRiskValue(riskRecord(risk, 'take_profit'), 'take_profit'),
    timeExitBars: timeExitBars !== null && timeExitBars > 0 ? Math.floor(timeExitBars) : null,
    assumptions: Array.from(new Set([...collectStringArray(value.assumptions), ...collectStringArray(value.validation?.assumptions)])),
    warnings: Array.from(new Set(warnings)),
    ignoredUnsupportedFeatures: ignored,
    normalizedSpec: value,
  };
}
