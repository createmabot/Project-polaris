import { normalizeTimeframeAlias } from './timeframe';

export type NormalizedStrategySpec = {
  schema_name: 'normalized_strategy_spec';
  schema_version: '1.0';
  source: {
    strategy_version_id: string;
    generated_from: 'natural_language_rule';
    generated_at: string;
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
  if (/MACD|ＭＡＣＤ|macd|ヒストグラム/i.test(text)) return 'momentum_macd';
  if (/RSI/i.test(text)) return 'momentum_rsi';
  if (/移動平均|SMA|EMA|crossover|クロス/i.test(text)) return 'trend_following_ma';
  if (/ブレイク|breakout/i.test(text)) return 'breakout';
  return 'rule_based_long';
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

export function buildNormalizedStrategySpec(version: StrategyVersionInput): NormalizedStrategySpec {
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
    risk.stop_loss = { type: 'percent', value: stopLossPercent, basis: 'entry_price' };
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

  return {
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
}

export function isNormalizedStrategySpec(value: unknown): value is NormalizedStrategySpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schema_name === 'normalized_strategy_spec' && record.schema_version === '1.0';
}

