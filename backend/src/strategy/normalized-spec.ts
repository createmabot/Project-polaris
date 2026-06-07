import { normalizeTimeframeAlias } from './timeframe';

export type NormalizedStrategySpec = {
  schema_name: 'normalized_strategy_spec';
  schema_version: '1.0';
  source: {
    strategy_version_id: string;
    generated_from: 'natural_language_rule';
    generated_at: string;
    provider?: 'local_llm' | 'openai_api' | 'deterministic';
    provider_task?: 'strategy_spec_normalization';
    fallback_used?: boolean;
    requested_provider?: 'local_llm' | 'openai_api' | 'deterministic';
  };
  market: string;
  timeframe: string;
  side: 'long_only';
  strategy_family: string;
  indicators: Array<Record<string, unknown>>;
  entry: {
    logic: 'all';
    conditions: Array<Record<string, unknown>>;
  };
  exit: {
    logic: 'any';
    conditions: Array<Record<string, unknown>>;
  };
  risk: Record<string, unknown>;
  filters: Array<Record<string, unknown>>;
  validation: {
    supported_for_internal_backtest: false;
    unsupported_features: string[];
    warnings: string[];
    assumptions: string[];
  };
  warnings: string[];
  assumptions: string[];
};

type StrategyVersionInput = {
  id: string;
  naturalLanguageRule: string;
  market: string;
  timeframe: string;
};

export type StrategySpecProviderName = 'local_llm' | 'openai_api' | 'deterministic';

export type NormalizedStrategySpecMetadata = {
  provider: StrategySpecProviderName;
  requestedProvider?: StrategySpecProviderName;
  fallbackUsed: boolean;
  generatedAt?: string;
};

export type NormalizedStrategySpecValidationResult = {
  spec: NormalizedStrategySpec;
  warnings: string[];
  assumptions: string[];
};

const ALLOWED_OPERATORS = new Set(['>', '>=', '<', '<=', '==', 'crosses_above', 'crosses_below']);
const KNOWN_STRATEGY_FAMILIES = new Set([
  'trend_momentum',
  'mean_reversion',
  'breakout',
  'ma_rsi_volume_momentum',
  'risk_management',
  'other',
]);

const UNSAFE_TEXT_PATTERNS: RegExp[] = [
  /https?:\/\/\S+/gi,
  /\b(?:endpoint|url|model|token|secret|api[_-]?key|password|credential)\s*[:=]\s*[^\s,;]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]+/gi,
  /[A-Za-z]:\\[^\s"'<>]+/g,
  /\/(?:Users|home|var|tmp|mnt|workspace|app)\/[^\s"'<>]+/g,
  /\b(?:raw prompt|raw provider response|raw response|stack trace|Traceback)\b/gi,
];

function sanitizeSpecText(value: unknown, maxLength = 260): string | null {
  if (typeof value !== 'string') return null;
  let text = value.replace(/\r\n/g, '\n').replace(/[ \t\u3000]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return null;
  for (const pattern of UNSAFE_TEXT_PATTERNS) {
    text = text.replace(pattern, '[redacted]');
  }
  if (text.length > maxLength) {
    text = text.slice(0, maxLength).trim();
  }
  return text || null;
}

function sanitizeStringArray(value: unknown, limit = 12, maxLength = 220): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeSpecText(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
}

function normalizeOperator(value: unknown): string | null {
  const raw = sanitizeSpecText(value, 40);
  if (!raw) return null;
  const normalized = raw
    .replace(/=>/g, '>=')
    .replace(/=<|≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/＞/g, '>')
    .replace(/＜/g, '<')
    .replace(/以上/g, '>=')
    .replace(/以下/g, '<=')
    .replace(/上回る|より大きい/g, '>')
    .replace(/下回る|より小さい/g, '<')
    .replace(/cross(?:es)? above|cross_over|crossover|クロスアップ/gi, 'crosses_above')
    .replace(/cross(?:es)? below|cross_under|crossunder|クロスダウン/gi, 'crosses_below')
    .trim();
  return ALLOWED_OPERATORS.has(normalized) ? normalized : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/%/g, '').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeStrategyFamily(value: unknown, fallbackText: string): string {
  const raw = sanitizeSpecText(value, 100);
  const normalized = (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (KNOWN_STRATEGY_FAMILIES.has(normalized)) return normalized;
  const source = `${normalized} ${fallbackText}`.toLowerCase();
  if (/rsi/.test(source) && /(sma|ma_|moving|移動平均)/.test(source) && /(volume|出来高)/.test(source)) {
    return 'ma_rsi_volume_momentum';
  }
  if (/macd|momentum|モメンタム|trend|トレンド/.test(source)) return 'trend_momentum';
  if (/mean_reversion|reversion|逆張り|反転/.test(source)) return 'mean_reversion';
  if (/breakout|ブレイク/.test(source)) return 'breakout';
  if (/risk|stop|loss|損切|連敗/.test(source)) return 'risk_management';
  return 'other';
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeId(value: unknown, fallback: string): string {
  const raw = sanitizeSpecText(value, 80);
  if (!raw) return fallback;
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function normalizeIndicator(input: unknown, index: number): Record<string, unknown> | null {
  const record = normalizeRecord(input);
  if (!record) return null;
  const type = sanitizeSpecText(record.type, 40)?.toUpperCase().replace('VOLUME_SMA', 'VOLUME_SMA') ?? null;
  if (!type || !['SMA', 'EMA', 'RSI', 'MACD', 'ATR', 'VOLUME_SMA'].includes(type)) return null;
  const length = normalizeNumber(record.length);
  const id = normalizeId(record.id, `${type.toLowerCase()}_${length ?? index + 1}`);
  const output: Record<string, unknown> = { id, type };
  if (length !== null) output.length = length;
  for (const key of ['fast', 'slow', 'signal']) {
    const numeric = normalizeNumber(record[key]);
    if (numeric !== null) output[key] = numeric;
  }
  const source = sanitizeSpecText(record.source, 40);
  if (source) output.source = source;
  return output;
}

function normalizeCondition(input: unknown, fallbackPrefix: string, index: number): Record<string, unknown> | null {
  const record = normalizeRecord(input);
  if (!record) return null;
  const type = sanitizeSpecText(record.type, 80) ?? 'condition';
  const id = normalizeId(record.id, `${fallbackPrefix}_${index + 1}`);
  const output: Record<string, unknown> = { id, type };
  for (const key of ['indicator', 'left', 'right', 'basis', 'rule']) {
    const text = sanitizeSpecText(record[key], key === 'rule' ? 220 : 80);
    if (text) output[key] = text;
  }
  const rightRecord = normalizeRecord(record.right);
  if (rightRecord) {
    const right: Record<string, unknown> = {};
    const indicator = sanitizeSpecText(rightRecord.indicator, 80);
    const source = sanitizeSpecText(rightRecord.source, 80);
    const multiplier = normalizeNumber(rightRecord.multiplier);
    if (indicator) right.indicator = indicator;
    if (source) right.source = source;
    if (multiplier !== null) right.multiplier = multiplier;
    if (Object.keys(right).length > 0) output.right = right;
  }
  const operator = normalizeOperator(record.operator);
  if (operator) output.operator = operator;
  for (const key of ['value', 'multiplier', 'bars']) {
    const numeric = normalizeNumber(record[key]);
    if (numeric !== null) output[key] = numeric;
  }
  return output;
}

function normalizeRisk(input: unknown): Record<string, unknown> {
  const record = normalizeRecord(input);
  if (!record) return {};
  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(record)) {
    const riskRecord = normalizeRecord(rawValue);
    if (riskRecord) {
      const normalized: Record<string, unknown> = {};
      for (const [riskKey, riskValue] of Object.entries(riskRecord)) {
        if (typeof riskValue === 'boolean') {
          normalized[riskKey] = riskValue;
          continue;
        }
        const numeric = normalizeNumber(riskValue);
        if (numeric !== null) {
          normalized[riskKey] = numeric;
          continue;
        }
        const text = sanitizeSpecText(riskValue, 160);
        if (text) normalized[riskKey] = text;
      }
      if (Object.keys(normalized).length > 0) output[normalizeId(key, key)] = normalized;
      continue;
    }
    const text = sanitizeSpecText(rawValue, 180);
    if (text) output[normalizeId(key, key)] = { supported: false, rule: text };
  }
  const stopLoss = normalizeRecord(output.stop_loss);
  if (stopLoss && stopLoss.type === 'percent') {
    const value = normalizeNumber(stopLoss.value);
    if (value !== null) {
      stopLoss.value = Math.abs(value);
      stopLoss.basis = sanitizeSpecText(stopLoss.basis, 80) ?? 'entry_price';
      if (!stopLoss.direction) stopLoss.direction = 'below_entry';
      if (!stopLoss.side) stopLoss.side = 'long_stop_loss';
    }
  }
  return output;
}

function withSourceMetadata(
  spec: NormalizedStrategySpec,
  metadata: NormalizedStrategySpecMetadata,
): NormalizedStrategySpec {
  return {
    ...spec,
    source: {
      strategy_version_id: spec.source.strategy_version_id,
      generated_from: 'natural_language_rule',
      generated_at: metadata.generatedAt ?? new Date().toISOString(),
      provider: metadata.provider,
      provider_task: 'strategy_spec_normalization',
      fallback_used: metadata.fallbackUsed,
      requested_provider: metadata.requestedProvider ?? metadata.provider,
    },
  };
}

function compactRuleText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

function uniqueByKey<T extends Record<string, unknown>>(items: T[], key: keyof T): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = String(item[key] ?? '');
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function firstNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const raw = match?.[1] ?? match?.[2];
    if (!raw) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function detectStrategyFamily(text: string): string {
  if (/RSI/i.test(text) && /出来高|volume/i.test(text) && /移動平均|SMA|EMA/i.test(text)) return 'ma_rsi_volume_momentum';
  if (/MACD|ＭＡＣＤ|macd|ヒストグラム/i.test(text)) return 'trend_momentum';
  if (/RSI/i.test(text)) return 'trend_momentum';
  if (/移動平均|SMA|EMA|crossover|クロス/i.test(text)) return 'trend_momentum';
  if (/ブレイク|breakout/i.test(text)) return 'breakout';
  return 'other';
}

function detectUnsupportedFeatures(text: string, timeframe: string): string[] {
  const unsupported: string[] = [];
  const normalizedTimeframe = normalizeTimeframeAlias(timeframe);
  if (normalizedTimeframe !== 'D') unsupported.push('timeframe_not_supported_for_mvp');
  if (/short|ショート|空売り|売り建て/i.test(text)) unsupported.push('short_entry');
  if (/pyramid|pyramiding|ナンピン|増し玉/i.test(text)) unsupported.push('pyramiding');
  if (/request\.security|上位足|複数時間足|multi[-\s]?timeframe/i.test(text)) unsupported.push('multi_timeframe_or_request_security');
  if (/複数銘柄|multi[-\s]?symbol|ペアトレード|pair trade/i.test(text)) unsupported.push('multi_symbol');
  if (/option|オプション|future|先物/i.test(text)) unsupported.push('options_or_futures');
  if (/裁量|雰囲気|なんとなく|強そう|弱そう|過熱感/i.test(text)) unsupported.push('discretionary_or_vague_condition');
  return Array.from(new Set(unsupported));
}

export function buildNormalizedStrategySpec(
  version: StrategyVersionInput,
  metadata: Partial<NormalizedStrategySpecMetadata> = {},
): NormalizedStrategySpec {
  const text = compactRuleText(version.naturalLanguageRule);
  const normalizedTimeframe = normalizeTimeframeAlias(version.timeframe);
  const warnings: string[] = [];
  const assumptions: string[] = ['MVPでは long_only として解釈します。'];
  const indicators: Array<Record<string, unknown>> = [];
  const entryConditions: Array<Record<string, unknown>> = [];
  const exitConditions: Array<Record<string, unknown>> = [];
  const filters: Array<Record<string, unknown>> = [];
  const risk: Record<string, unknown> = {};

  if (!['JP_STOCK', 'US_STOCK'].includes(version.market)) {
    warnings.push(`market ${version.market} はnormalized spec v1 MVPの主対象外です。`);
  }
  if (normalizedTimeframe !== 'D') {
    warnings.push(`timeframe ${version.timeframe} はnormalized spec v1 MVPでは内部バックテスト対象外です。`);
  }

  const smaLength = firstNumber(text, [
    /(\d{1,3})\s*日\s*(?:SMA|移動平均)/i,
    /SMA\s*\(?\s*(\d{1,3})\s*\)?/i,
    /移動平均\s*\(?\s*(\d{1,3})\s*\)?/i,
  ]);
  const emaLength = firstNumber(text, [
    /(\d{1,3})\s*日\s*EMA/i,
    /EMA\s*\(?\s*(\d{1,3})\s*\)?/i,
  ]);
  const rsiLength = firstNumber(text, [/RSI\s*\(?\s*(\d{1,3})\s*\)?/i]) ?? 14;
  const atrLength = firstNumber(text, [/ATR\s*\(?\s*(\d{1,3})\s*\)?/i]) ?? 14;
  const volumeAverageLength = /出来高|volume/i.test(text)
    ? firstNumber(text, [/出来高.*?(\d{1,3})\s*日平均/i, /volume.*?(\d{1,3})\s*(?:day|period|bar)/i]) ?? 20
    : null;

  if (/MACD|ＭＡＣＤ|macd|ヒストグラム/i.test(text)) {
    indicators.push({ id: 'macd_12_26_9', type: 'MACD', fast: 12, slow: 26, signal: 9 });
    entryConditions.push({
      id: 'entry_macd_histogram_momentum',
      type: 'indicator',
      indicator: 'macd_12_26_9',
      rule: 'MACDヒストグラムがプラス圏、または前日比で増加する',
    });
    exitConditions.push({
      id: 'exit_macd_histogram_weaken',
      type: 'indicator',
      indicator: 'macd_12_26_9',
      rule: 'MACDヒストグラムが減少、またはマイナス圏に転じる',
    });
  }

  if (smaLength) {
    const id = `sma_${smaLength}`;
    indicators.push({ id, type: 'SMA', length: smaLength, source: 'close' });
    entryConditions.push({
      id: `entry_close_above_${id}`,
      type: 'price_vs_indicator',
      indicator: id,
      operator: '>',
      left: 'close',
      rule: `終値が${smaLength}期間SMAを上回る`,
    });
    exitConditions.push({
      id: `exit_close_below_${id}`,
      type: 'price_vs_indicator',
      indicator: id,
      operator: '<',
      left: 'close',
      rule: `終値が${smaLength}期間SMAを下回る`,
    });
  }

  if (emaLength) {
    const id = `ema_${emaLength}`;
    indicators.push({ id, type: 'EMA', length: emaLength, source: 'close' });
    entryConditions.push({
      id: `entry_close_above_${id}`,
      type: 'price_vs_indicator',
      indicator: id,
      operator: '>',
      left: 'close',
      rule: `終値が${emaLength}期間EMAを上回る`,
    });
  }

  if (/RSI/i.test(text)) {
    const threshold = firstNumber(text, [/RSI.*?(\d{2,3})\s*以上/i, /RSI.*?>=?\s*(\d{2,3})/i]) ?? 50;
    const id = `rsi_${rsiLength}`;
    indicators.push({ id, type: 'RSI', length: rsiLength, source: 'close' });
    entryConditions.push({
      id: `entry_${id}_gte_${threshold}`,
      type: 'indicator_threshold',
      indicator: id,
      operator: '>=',
      value: threshold,
      rule: `RSI(${rsiLength})が${threshold}以上`,
    });
  }

  if (/ATR/i.test(text)) {
    indicators.push({ id: `atr_${atrLength}`, type: 'ATR', length: atrLength });
  }

  if (volumeAverageLength) {
    const id = `volume_sma_${volumeAverageLength}`;
    indicators.push({ id, type: 'VOLUME_SMA', length: volumeAverageLength, source: 'volume' });
    filters.push({
      id: `filter_volume_above_${id}`,
      type: 'volume_filter',
      indicator: id,
      operator: '>=',
      left: 'volume',
      rule: `出来高が${volumeAverageLength}期間平均以上`,
    });
  }

  const stopLossPercent = firstNumber(text, [
    /(\d+(?:\.\d+)?)\s*%\s*(?:損切り|stop\s*loss|stop)/i,
    /(?:損切り|stop\s*loss|stop).*?(\d+(?:\.\d+)?)\s*%/i,
  ]);
  if (stopLossPercent !== null) {
    risk.stop_loss = { type: 'percent', value: Math.abs(stopLossPercent), basis: 'entry_price', direction: 'below_entry', side: 'long_stop_loss' };
  }

  const takeProfitPercent = firstNumber(text, [
    /(\d+(?:\.\d+)?)\s*%\s*(?:利確|take\s*profit)/i,
    /(?:利確|take\s*profit).*?(\d+(?:\.\d+)?)\s*%/i,
  ]);
  if (takeProfitPercent !== null) {
    risk.take_profit = { type: 'percent', value: takeProfitPercent, basis: 'entry_price' };
  }

  const timeExitBars = firstNumber(text, [
    /(\d{1,3})\s*(?:日|本|bar|bars)\s*(?:保有|holding|time\s*exit)/i,
    /(?:保有期間|time\s*exit).*?(\d{1,3})\s*(?:日|本|bar|bars)?/i,
  ]);
  if (timeExitBars !== null) {
    risk.time_exit = { type: 'bars', bars: timeExitBars };
    exitConditions.push({
      id: `exit_time_${timeExitBars}_bars`,
      type: 'time_exit',
      bars: timeExitBars,
      rule: `${timeExitBars}本経過で手仕舞い`,
    });
  }

  if (entryConditions.length === 0) {
    warnings.push('測定可能なentry条件を十分に抽出できませんでした。');
  }
  if (exitConditions.length === 0) {
    warnings.push('測定可能なexit条件を十分に抽出できませんでした。');
  }

  const unsupportedFeatures = detectUnsupportedFeatures(text, version.timeframe);
  if (unsupportedFeatures.length > 0) {
    warnings.push('一部条件はnormalized spec v1 MVPの内部バックテスト対象外です。');
  }

  const uniqueIndicators = uniqueByKey(indicators, 'id');
  const uniqueEntry = uniqueByKey(entryConditions, 'id');
  const uniqueExit = uniqueByKey(exitConditions, 'id');
  const uniqueFilters = uniqueByKey(filters, 'id');

  const spec: NormalizedStrategySpec = {
    schema_name: 'normalized_strategy_spec',
    schema_version: '1.0',
    source: {
      strategy_version_id: version.id,
      generated_from: 'natural_language_rule',
      generated_at: new Date().toISOString(),
    },
    market: version.market,
    timeframe: normalizedTimeframe,
    side: 'long_only',
    strategy_family: detectStrategyFamily(text),
    indicators: uniqueIndicators,
    entry: {
      logic: 'all',
      conditions: uniqueEntry,
    },
    exit: {
      logic: 'any',
      conditions: uniqueExit,
    },
    risk,
    filters: uniqueFilters,
    validation: {
      supported_for_internal_backtest: false,
      unsupported_features: unsupportedFeatures,
      warnings,
      assumptions,
    },
    warnings,
    assumptions,
  };
  return withSourceMetadata(spec, {
    provider: metadata.provider ?? 'deterministic',
    requestedProvider: metadata.requestedProvider ?? metadata.provider ?? 'deterministic',
    fallbackUsed: metadata.fallbackUsed ?? false,
    generatedAt: metadata.generatedAt,
  });
}

export function isNormalizedStrategySpec(value: unknown): value is NormalizedStrategySpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schema_name === 'normalized_strategy_spec' && record.schema_version === '1.0';
}

export function validateAndNormalizeStrategySpec(
  value: unknown,
  version: StrategyVersionInput,
  metadata: NormalizedStrategySpecMetadata,
): NormalizedStrategySpecValidationResult {
  const record = normalizeRecord(value);
  if (!record) {
    throw new Error('normalized strategy spec must be an object');
  }
  if (record.schema_name !== 'normalized_strategy_spec' || record.schema_version !== '1.0') {
    throw new Error('normalized strategy spec schema metadata is invalid');
  }

  const normalizedTimeframe = normalizeTimeframeAlias(version.timeframe);
  const side = sanitizeSpecText(record.side, 40);
  if (side && side !== 'long_only') {
    throw new Error('normalized strategy spec side must be long_only');
  }

  const indicators = (Array.isArray(record.indicators) ? record.indicators : [])
    .map((item, index) => normalizeIndicator(item, index))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const entryRecord = normalizeRecord(record.entry);
  const exitRecord = normalizeRecord(record.exit);
  const entryConditions = (Array.isArray(entryRecord?.conditions) ? entryRecord.conditions : [])
    .map((item, index) => normalizeCondition(item, 'entry', index))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const exitConditions = (Array.isArray(exitRecord?.conditions) ? exitRecord.conditions : [])
    .map((item, index) => normalizeCondition(item, 'exit', index))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const filters = (Array.isArray(record.filters) ? record.filters : [])
    .map((item, index) => normalizeCondition(item, 'filter', index))
    .filter((item): item is Record<string, unknown> => Boolean(item));

  if (indicators.length === 0 || entryConditions.length === 0 || exitConditions.length === 0) {
    throw new Error('normalized strategy spec must include indicators, entry, and exit conditions');
  }

  const validationRecord = normalizeRecord(record.validation);
  const unsupportedFeatures = sanitizeStringArray(validationRecord?.unsupported_features, 16, 120);
  const warnings = sanitizeStringArray(record.warnings, 16, 180).concat(
    sanitizeStringArray(validationRecord?.warnings, 16, 180),
  );
  const assumptions = sanitizeStringArray(record.assumptions, 16, 180).concat(
    sanitizeStringArray(validationRecord?.assumptions, 16, 180),
  );

  const spec: NormalizedStrategySpec = {
    schema_name: 'normalized_strategy_spec',
    schema_version: '1.0',
    source: {
      strategy_version_id: version.id,
      generated_from: 'natural_language_rule',
      generated_at: metadata.generatedAt ?? new Date().toISOString(),
    },
    market: sanitizeSpecText(record.market, 40) ?? version.market,
    timeframe: normalizedTimeframe,
    side: 'long_only',
    strategy_family: normalizeStrategyFamily(record.strategy_family, version.naturalLanguageRule),
    indicators: uniqueByKey(indicators, 'id'),
    entry: {
      logic: entryRecord?.logic === 'any' ? 'all' : 'all',
      conditions: uniqueByKey(entryConditions, 'id'),
    },
    exit: {
      logic: exitRecord?.logic === 'all' ? 'any' : 'any',
      conditions: uniqueByKey(exitConditions, 'id'),
    },
    risk: normalizeRisk(record.risk),
    filters: uniqueByKey(filters, 'id'),
    validation: {
      supported_for_internal_backtest: false,
      unsupported_features: unsupportedFeatures,
      warnings: Array.from(new Set(warnings)),
      assumptions: Array.from(new Set(assumptions)),
    },
    warnings: Array.from(new Set(warnings)),
    assumptions: Array.from(new Set(assumptions)),
  };

  return {
    spec: withSourceMetadata(spec, metadata),
    warnings: spec.warnings,
    assumptions: spec.assumptions,
  };
}

