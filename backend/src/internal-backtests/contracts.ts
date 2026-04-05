type PlainObject = Record<string, unknown>;

export type CreateExecutionRequestInput = {
  strategy_rule_version_id?: unknown;
  market?: unknown;
  timeframe?: unknown;
  execution_target?: unknown;
  data_range?: unknown;
  engine_config?: unknown;
};

export type NormalizedCreateExecutionRequest = {
  strategyRuleVersionId: string;
  market: string | null;
  timeframe: string | null;
  dataRange: {
    from: string;
    to: string;
  };
  executionTarget: {
    symbol: string | null;
    sourceKind: 'daily_ohlcv';
  };
  engineConfig: PlainObject;
};

export type InternalBacktestExecutionTarget = {
  symbol: string;
  source_kind: 'daily_ohlcv';
};

export type InternalBacktestInputSnapshot = {
  strategy_rule_version_id: string;
  market: string;
  timeframe: string;
  execution_target: InternalBacktestExecutionTarget;
  data_range: {
    from: string;
    to: string;
  };
  engine_config: PlainObject;
  strategy_snapshot: {
    natural_language_rule: string;
    generated_pine: string | null;
    market: string;
    timeframe: string;
  };
  data_source_snapshot?: InternalBacktestDataSourceSnapshot;
};

export type InternalBacktestDataSourceSnapshot = {
  source_kind: string;
  market: string;
  timeframe: string;
  from: string;
  to: string;
  fetched_at: string;
  data_revision: string;
  bar_count: number;
};

export type InternalBacktestResultSummary = {
  schema_version: '1.0';
  summary_kind: 'scaffold_deterministic' | 'engine_estimated' | 'engine_actual';
  market: string;
  timeframe: string;
  period: {
    from: string;
    to: string;
  };
  metrics: {
    bar_count: number;
    first_close: number;
    last_close: number;
    price_change: number;
    price_change_percent: number;
    period_high: number;
    period_low: number;
    range_percent: number;
    trade_count?: number;
    win_rate?: number;
    total_return_percent?: number;
    max_drawdown_percent?: number;
    holding_period_avg_bars?: number;
    first_trade_at?: string | null;
    last_trade_at?: string | null;
  };
  engine: {
    version: string;
  };
  notes: string;
};

export type InternalBacktestExecutionInput = {
  strategyRuleVersionId: string;
  market: string;
  timeframe: string;
  executionTarget: {
    symbol: string;
    sourceKind: 'daily_ohlcv';
  };
  dataRange: {
    from: string;
    to: string;
  };
  engineConfig: PlainObject;
  strategySnapshot: {
    naturalLanguageRule: string;
    generatedPine: string | null;
    market: string;
    timeframe: string;
  };
};

export type InternalBacktestArtifactPointer = {
  type: string;
  execution_id: string;
  path: string;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requireTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const JP_STOCK_CANONICAL_SYMBOL_PATTERN = /^\d{4}$/;

function normalizeMarketForValidation(market: string): string {
  return market.trim().toUpperCase();
}

function normalizeExecutionTargetSymbolByMarket(args: {
  symbol: string;
  market: string;
}): string {
  const market = normalizeMarketForValidation(args.market);
  let symbol = args.symbol.trim();
  if (!symbol) {
    throw new Error('execution_target.symbol must be a non-empty string.');
  }

  if (market === 'JP_STOCK') {
    const prefixedMatch = symbol.match(/^([A-Za-z]+):(.*)$/);
    if (prefixedMatch) {
      const prefix = prefixedMatch[1]?.toUpperCase();
      const body = prefixedMatch[2]?.trim() ?? '';
      if (prefix !== 'TYO') {
        throw new Error(
          'execution_target.symbol for JP_STOCK supports optional TYO: prefix only (e.g. TYO:7203).',
        );
      }
      symbol = body;
    }

    if (!JP_STOCK_CANONICAL_SYMBOL_PATTERN.test(symbol)) {
      throw new Error('execution_target.symbol for JP_STOCK must be 4 digits (e.g. 7203 or TYO:7203).');
    }
    return symbol;
  }

  return symbol;
}

export function normalizeExecutionTarget(args: {
  strategyRuleVersionId: string;
  market: string;
  executionTarget: {
    symbol: string | null;
    sourceKind: 'daily_ohlcv';
  };
  allowLegacyFallback?: boolean;
  allowUserProvidedLegacySymbol?: boolean;
}): {
  symbol: string;
  sourceKind: 'daily_ohlcv';
} {
  const symbolRaw = args.executionTarget.symbol;
  if (symbolRaw === null) {
    if (args.allowLegacyFallback === true) {
      return {
        symbol: `legacy:${args.strategyRuleVersionId}`,
        sourceKind: 'daily_ohlcv',
      };
    }
    throw new Error('execution_target.symbol is required.');
  }

  if (symbolRaw.startsWith('legacy:')) {
    if (args.allowUserProvidedLegacySymbol !== true) {
      throw new Error('execution_target.symbol cannot start with legacy: for request input.');
    }
    return {
      symbol: symbolRaw,
      sourceKind: 'daily_ohlcv',
    };
  }

  return {
    symbol: normalizeExecutionTargetSymbolByMarket({
      symbol: symbolRaw,
      market: args.market,
    }),
    sourceKind: 'daily_ohlcv',
  };
}

function getOptionalStringIfPresent(
  input: Record<string, unknown>,
  key: string,
  label: string,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(input, key)) {
    return null;
  }

  const value = requireTrimmedString(input[key]);
  if (!value) {
    throw new Error(`${label} must be a non-empty string when provided.`);
  }

  return value;
}

function asPlainObject(value: unknown): PlainObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as PlainObject;
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function assertFiniteNumber(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
}

function assertNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function isValidIsoDateTime(value: string): boolean {
  const ISO_DATETIME_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+\-]\d{2}:\d{2})$/;
  if (!ISO_DATETIME_PATTERN.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

export function normalizeCreateExecutionRequest(input: CreateExecutionRequestInput): NormalizedCreateExecutionRequest {
  const strategyRuleVersionId = requireTrimmedString(input.strategy_rule_version_id);
  const inputObject = input as Record<string, unknown>;
  const market = getOptionalStringIfPresent(inputObject, 'market', 'market');
  const timeframe = getOptionalStringIfPresent(inputObject, 'timeframe', 'timeframe');
  const executionTargetRaw = asPlainObject(input.execution_target);
  const targetSymbol = requireTrimmedString(executionTargetRaw?.symbol);
  const targetSourceKindRaw = requireTrimmedString(executionTargetRaw?.source_kind);
  const sourceKind = targetSourceKindRaw ?? 'daily_ohlcv';
  const dataRangeRaw = asPlainObject(input.data_range);
  const rangeFrom = requireTrimmedString(dataRangeRaw?.from);
  const rangeTo = requireTrimmedString(dataRangeRaw?.to);
  const engineConfig = asPlainObject(input.engine_config) ?? {};

  if (!strategyRuleVersionId || !rangeFrom || !rangeTo) {
    throw new Error('strategy_rule_version_id, data_range.from, data_range.to are required.');
  }

  if (!isValidIsoDate(rangeFrom) || !isValidIsoDate(rangeTo)) {
    throw new Error('data_range.from and data_range.to must be ISO date format (YYYY-MM-DD).');
  }

  if (rangeFrom > rangeTo) {
    throw new Error('data_range.from must be less than or equal to data_range.to.');
  }
  if (targetSourceKindRaw !== null && sourceKind !== 'daily_ohlcv') {
    throw new Error('execution_target.source_kind must be "daily_ohlcv" when provided.');
  }

  return {
    strategyRuleVersionId,
    market: market ?? null,
    timeframe: timeframe ?? null,
    executionTarget: {
      symbol: targetSymbol ?? null,
      sourceKind: 'daily_ohlcv',
    },
    dataRange: {
      from: rangeFrom,
      to: rangeTo,
    },
    engineConfig,
  };
}

export function resolveExecutionInput(args: {
  request: NormalizedCreateExecutionRequest;
  strategyVersion: { market: string; timeframe: string };
}): Pick<InternalBacktestExecutionInput, 'market' | 'timeframe' | 'executionTarget' | 'dataRange' | 'engineConfig'> {
  const resolvedMarket = args.request.market ?? args.strategyVersion.market;
  const resolvedExecutionTarget = normalizeExecutionTarget({
    strategyRuleVersionId: args.request.strategyRuleVersionId,
    market: resolvedMarket,
    executionTarget: args.request.executionTarget,
    allowLegacyFallback: true,
    allowUserProvidedLegacySymbol: false,
  });

  return {
    market: resolvedMarket,
    timeframe: args.request.timeframe ?? args.strategyVersion.timeframe,
    executionTarget: resolvedExecutionTarget,
    dataRange: args.request.dataRange,
    engineConfig: args.request.engineConfig,
  };
}

export function buildExecutionInputSnapshot(args: {
  strategyRuleVersionId: string;
  market: string;
  timeframe: string;
  executionTarget: {
    symbol: string;
    sourceKind: 'daily_ohlcv';
  };
  dataRange: { from: string; to: string };
  engineConfig: PlainObject;
  strategySnapshot: {
    naturalLanguageRule: string;
    generatedPine: string | null;
    market: string;
    timeframe: string;
  };
  dataSourceSnapshot?: InternalBacktestDataSourceSnapshot;
}): InternalBacktestInputSnapshot {
  const snapshot: InternalBacktestInputSnapshot = {
    strategy_rule_version_id: args.strategyRuleVersionId,
    market: args.market,
    timeframe: args.timeframe,
    execution_target: {
      symbol: args.executionTarget.symbol,
      source_kind: args.executionTarget.sourceKind,
    },
    data_range: {
      from: args.dataRange.from,
      to: args.dataRange.to,
    },
    engine_config: args.engineConfig,
    strategy_snapshot: {
      natural_language_rule: args.strategySnapshot.naturalLanguageRule,
      generated_pine: args.strategySnapshot.generatedPine,
      market: args.strategySnapshot.market,
      timeframe: args.strategySnapshot.timeframe,
    },
  };
  if (args.dataSourceSnapshot) {
    snapshot.data_source_snapshot = args.dataSourceSnapshot;
  }
  return snapshot;
}

export function normalizeExecutionInputSnapshot(
  input: unknown,
): InternalBacktestExecutionInput {
  const snapshot = asPlainObject(input);
  if (!snapshot) {
    throw new Error('input_snapshot must be an object');
  }

  const strategyRuleVersionId = requireTrimmedString(snapshot.strategy_rule_version_id);
  const executionTarget = asPlainObject(snapshot.execution_target);
  const dataRange = asPlainObject(snapshot.data_range);
  const strategySnapshot = asPlainObject(snapshot.strategy_snapshot);

  const strategySnapshotMarket = requireTrimmedString(strategySnapshot?.market);
  const strategySnapshotTimeframe = requireTrimmedString(strategySnapshot?.timeframe);

  const market = requireTrimmedString(snapshot.market) ?? strategySnapshotMarket;
  const timeframe = requireTrimmedString(snapshot.timeframe) ?? strategySnapshotTimeframe;
  const targetSymbol = requireTrimmedString(executionTarget?.symbol) ?? null;
  const targetSourceKindRaw = requireTrimmedString(executionTarget?.source_kind);
  const targetSourceKind = targetSourceKindRaw ?? 'daily_ohlcv';
  const rangeFrom = requireTrimmedString(dataRange?.from);
  const rangeTo = requireTrimmedString(dataRange?.to);
  const engineConfig = asPlainObject(snapshot.engine_config) ?? {};

  if (!strategyRuleVersionId || !market || !timeframe || !rangeFrom || !rangeTo) {
    throw new Error('input_snapshot.strategy_rule_version_id, market, timeframe, data_range.from, data_range.to are required');
  }
  if (targetSourceKind !== 'daily_ohlcv') {
    throw new Error('input_snapshot.execution_target.source_kind must be daily_ohlcv');
  }
  if (!isValidIsoDate(rangeFrom) || !isValidIsoDate(rangeTo) || rangeFrom > rangeTo) {
    throw new Error('input_snapshot.data_range.from/to must be valid ISO dates and from<=to');
  }

  const normalizedExecutionTarget = normalizeExecutionTarget({
    strategyRuleVersionId,
    market,
    executionTarget: {
      symbol: targetSymbol,
      sourceKind: 'daily_ohlcv',
    },
    allowLegacyFallback: true,
    allowUserProvidedLegacySymbol: true,
  });

  const naturalLanguageRule = requireTrimmedString(strategySnapshot?.natural_language_rule) ?? '';
  const generatedPineRaw = strategySnapshot?.generated_pine;
  const generatedPine =
    typeof generatedPineRaw === 'string'
      ? generatedPineRaw
      : generatedPineRaw === null
        ? null
        : null;

  return {
    strategyRuleVersionId,
    market,
    timeframe,
    executionTarget: normalizedExecutionTarget,
    dataRange: {
      from: rangeFrom,
      to: rangeTo,
    },
    engineConfig,
    strategySnapshot: {
      naturalLanguageRule,
      generatedPine,
      market: strategySnapshotMarket ?? market,
      timeframe: strategySnapshotTimeframe ?? timeframe,
    },
  };
}

export function createDefaultResultSummary(args: {
  inputSnapshot: Pick<InternalBacktestExecutionInput, 'market' | 'timeframe' | 'dataRange'>;
  engineVersion: string;
}): InternalBacktestResultSummary {
  return {
    schema_version: '1.0',
    summary_kind: 'scaffold_deterministic',
    market: args.inputSnapshot.market,
    timeframe: args.inputSnapshot.timeframe,
    period: {
      from: args.inputSnapshot.dataRange.from,
      to: args.inputSnapshot.dataRange.to,
    },
    metrics: {
      bar_count: 0,
      first_close: 0,
      last_close: 0,
      price_change: 0,
      price_change_percent: 0,
      period_high: 0,
      period_low: 0,
      range_percent: 0,
    },
    engine: {
      version: args.engineVersion,
    },
    notes: 'internal backtest worker scaffold result',
  };
}

export function createExecutionArtifactPointer(args: {
  executionId: string;
  pathSuffix?: string;
}): InternalBacktestArtifactPointer {
  const pathSuffix =
    typeof args.pathSuffix === 'string' && args.pathSuffix.trim().length > 0
      ? args.pathSuffix.trim()
      : '';
  return {
    type: 'internal_backtest_execution',
    execution_id: args.executionId,
    path: `/internal-backtests/executions/${args.executionId}${pathSuffix}`,
  };
}

export function validateResultSummarySchema(input: unknown): InternalBacktestResultSummary {
  const root = asPlainObject(input);
  if (!root) {
    throw new Error('result_summary must be an object');
  }

  if (root.schema_version !== '1.0') {
    throw new Error('result_summary.schema_version must be "1.0"');
  }
  const summaryKind = requireTrimmedString(root.summary_kind);
  const allowedSummaryKinds = new Set(['scaffold_deterministic', 'engine_estimated', 'engine_actual']);
  if (!summaryKind || !allowedSummaryKinds.has(summaryKind)) {
    throw new Error(
      'result_summary.summary_kind must be one of scaffold_deterministic, engine_estimated, engine_actual.',
    );
  }

  const market = requireTrimmedString(root.market);
  const timeframe = requireTrimmedString(root.timeframe);
  if (!market || !timeframe) {
    throw new Error('result_summary.market and result_summary.timeframe are required.');
  }

  const period = asPlainObject(root.period);
  const from = requireTrimmedString(period?.from);
  const to = requireTrimmedString(period?.to);
  if (!from || !to || !isValidIsoDate(from) || !isValidIsoDate(to) || from > to) {
    throw new Error('result_summary.period must contain valid from/to ISO dates (YYYY-MM-DD).');
  }

  const metrics = asPlainObject(root.metrics);
  if (!metrics) {
    throw new Error('result_summary.metrics must be an object');
  }
  const barCount = assertNonNegativeInteger(metrics.bar_count, 'result_summary.metrics.bar_count');
  assertFiniteNumber(metrics.first_close, 'result_summary.metrics.first_close');
  assertFiniteNumber(metrics.last_close, 'result_summary.metrics.last_close');
  assertFiniteNumber(metrics.price_change, 'result_summary.metrics.price_change');
  assertFiniteNumber(metrics.price_change_percent, 'result_summary.metrics.price_change_percent');
  assertFiniteNumber(metrics.period_high, 'result_summary.metrics.period_high');
  assertFiniteNumber(metrics.period_low, 'result_summary.metrics.period_low');
  assertFiniteNumber(metrics.range_percent, 'result_summary.metrics.range_percent');
  const optionalTradeCount =
    metrics.trade_count === undefined
      ? undefined
      : assertNonNegativeInteger(metrics.trade_count, 'result_summary.metrics.trade_count');
  const optionalWinRate =
    metrics.win_rate === undefined
      ? undefined
      : (() => {
          assertFiniteNumber(metrics.win_rate, 'result_summary.metrics.win_rate');
          return metrics.win_rate as number;
        })();
  const optionalTotalReturnPercent =
    metrics.total_return_percent === undefined
      ? undefined
      : (() => {
          assertFiniteNumber(
            metrics.total_return_percent,
            'result_summary.metrics.total_return_percent',
          );
          return metrics.total_return_percent as number;
        })();
  const optionalMaxDrawdownPercent =
    metrics.max_drawdown_percent === undefined
      ? undefined
      : (() => {
          assertFiniteNumber(
            metrics.max_drawdown_percent,
            'result_summary.metrics.max_drawdown_percent',
          );
          return metrics.max_drawdown_percent as number;
        })();
  const optionalHoldingPeriodAvgBars =
    metrics.holding_period_avg_bars === undefined
      ? undefined
      : (() => {
          assertFiniteNumber(
            metrics.holding_period_avg_bars,
            'result_summary.metrics.holding_period_avg_bars',
          );
          return metrics.holding_period_avg_bars as number;
        })();
  const optionalFirstTradeAtRaw = metrics.first_trade_at;
  const optionalLastTradeAtRaw = metrics.last_trade_at;
  const optionalFirstTradeAt =
    optionalFirstTradeAtRaw === undefined || optionalFirstTradeAtRaw === null
      ? optionalFirstTradeAtRaw ?? undefined
      : requireTrimmedString(optionalFirstTradeAtRaw);
  const optionalLastTradeAt =
    optionalLastTradeAtRaw === undefined || optionalLastTradeAtRaw === null
      ? optionalLastTradeAtRaw ?? undefined
      : requireTrimmedString(optionalLastTradeAtRaw);
  if (optionalFirstTradeAt && !isValidIsoDateTime(optionalFirstTradeAt)) {
    throw new Error('result_summary.metrics.first_trade_at must be valid ISO datetime or null.');
  }
  if (optionalLastTradeAt && !isValidIsoDateTime(optionalLastTradeAt)) {
    throw new Error('result_summary.metrics.last_trade_at must be valid ISO datetime or null.');
  }

  const engine = asPlainObject(root.engine);
  const engineVersion = requireTrimmedString(engine?.version);
  if (!engineVersion) {
    throw new Error('result_summary.engine.version is required.');
  }

  const notes = requireTrimmedString(root.notes) ?? '';

  return {
    schema_version: '1.0',
    summary_kind: summaryKind as InternalBacktestResultSummary['summary_kind'],
    market,
    timeframe,
    period: { from, to },
    metrics: {
      bar_count: barCount,
      first_close: metrics.first_close as number,
      last_close: metrics.last_close as number,
      price_change: metrics.price_change as number,
      price_change_percent: metrics.price_change_percent as number,
      period_high: metrics.period_high as number,
      period_low: metrics.period_low as number,
      range_percent: metrics.range_percent as number,
      ...(optionalTradeCount !== undefined ? { trade_count: optionalTradeCount } : {}),
      ...(optionalWinRate !== undefined ? { win_rate: optionalWinRate } : {}),
      ...(optionalTotalReturnPercent !== undefined
        ? { total_return_percent: optionalTotalReturnPercent }
        : {}),
      ...(optionalMaxDrawdownPercent !== undefined
        ? { max_drawdown_percent: optionalMaxDrawdownPercent }
        : {}),
      ...(optionalHoldingPeriodAvgBars !== undefined
        ? { holding_period_avg_bars: optionalHoldingPeriodAvgBars }
        : {}),
      ...(optionalFirstTradeAtRaw !== undefined ? { first_trade_at: optionalFirstTradeAt ?? null } : {}),
      ...(optionalLastTradeAtRaw !== undefined ? { last_trade_at: optionalLastTradeAt ?? null } : {}),
    },
    engine: {
      version: engineVersion,
    },
    notes,
  };
}

export function validateArtifactPointerSchema(input: unknown): InternalBacktestArtifactPointer {
  const root = asPlainObject(input);
  if (!root) {
    throw new Error('artifact_pointer must be an object');
  }

  const type = requireTrimmedString(root.type);
  const executionId = requireTrimmedString(root.execution_id);
  const path = requireTrimmedString(root.path);

  if (!type || !executionId || !path) {
    throw new Error('artifact_pointer.type, artifact_pointer.execution_id, artifact_pointer.path are required.');
  }

  return {
    type,
    execution_id: executionId,
    path,
  };
}

export function validateDataSourceSnapshotSchema(input: unknown): InternalBacktestDataSourceSnapshot {
  const root = asPlainObject(input);
  if (!root) {
    throw new Error('data_source_snapshot must be an object');
  }

  const sourceKind = requireTrimmedString(root.source_kind);
  const market = requireTrimmedString(root.market);
  const timeframe = requireTrimmedString(root.timeframe);
  const from = requireTrimmedString(root.from);
  const to = requireTrimmedString(root.to);
  const fetchedAt = requireTrimmedString(root.fetched_at);
  const dataRevision = requireTrimmedString(root.data_revision);
  const barCount = root.bar_count;

  if (!sourceKind || !market || !timeframe || !from || !to || !fetchedAt || !dataRevision) {
    throw new Error(
      'data_source_snapshot.source_kind/market/timeframe/from/to/fetched_at/data_revision are required.',
    );
  }
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) {
    throw new Error('data_source_snapshot.from/to must be valid ISO dates and from<=to.');
  }
  if (!isValidIsoDateTime(fetchedAt)) {
    throw new Error('data_source_snapshot.fetched_at must be valid ISO datetime.');
  }
  if (typeof barCount !== 'number' || !Number.isInteger(barCount) || barCount < 0) {
    throw new Error('data_source_snapshot.bar_count must be a non-negative integer.');
  }

  return {
    source_kind: sourceKind,
    market,
    timeframe,
    from,
    to,
    fetched_at: fetchedAt,
    data_revision: dataRevision,
    bar_count: barCount,
  };
}
