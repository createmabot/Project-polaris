type PlainObject = Record<string, unknown>;

export type CreateExecutionRequestInput = {
  strategy_rule_version_id?: unknown;
  market?: unknown;
  timeframe?: unknown;
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
  engineConfig: PlainObject;
};

export type InternalBacktestInputSnapshot = {
  strategy_rule_version_id: string;
  market: string;
  timeframe: string;
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
};

export type InternalBacktestResultSummary = {
  schema_version: '1.0';
  market: string;
  timeframe: string;
  period: {
    from: string;
    to: string;
  };
  metrics: {
    total_trades: number;
    win_rate: number;
    net_profit: number;
    profit_factor: number | null;
    max_drawdown_percent: number | null;
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

function assertOptionalFiniteNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  assertFiniteNumber(value, field);
  return value as number;
}

export function normalizeCreateExecutionRequest(input: CreateExecutionRequestInput): NormalizedCreateExecutionRequest {
  const strategyRuleVersionId = requireTrimmedString(input.strategy_rule_version_id);
  const inputObject = input as Record<string, unknown>;
  const market = getOptionalStringIfPresent(inputObject, 'market', 'market');
  const timeframe = getOptionalStringIfPresent(inputObject, 'timeframe', 'timeframe');
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

  return {
    strategyRuleVersionId,
    market: market ?? null,
    timeframe: timeframe ?? null,
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
}): Pick<InternalBacktestExecutionInput, 'market' | 'timeframe' | 'dataRange' | 'engineConfig'> {
  return {
    market: args.request.market ?? args.strategyVersion.market,
    timeframe: args.request.timeframe ?? args.strategyVersion.timeframe,
    dataRange: args.request.dataRange,
    engineConfig: args.request.engineConfig,
  };
}

export function buildExecutionInputSnapshot(args: {
  strategyRuleVersionId: string;
  market: string;
  timeframe: string;
  dataRange: { from: string; to: string };
  engineConfig: PlainObject;
  strategySnapshot: {
    naturalLanguageRule: string;
    generatedPine: string | null;
    market: string;
    timeframe: string;
  };
}): InternalBacktestInputSnapshot {
  return {
    strategy_rule_version_id: args.strategyRuleVersionId,
    market: args.market,
    timeframe: args.timeframe,
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
}

export function normalizeExecutionInputSnapshot(
  input: unknown,
): InternalBacktestExecutionInput {
  const snapshot = asPlainObject(input);
  if (!snapshot) {
    throw new Error('input_snapshot must be an object');
  }

  const strategyRuleVersionId = requireTrimmedString(snapshot.strategy_rule_version_id);
  const dataRange = asPlainObject(snapshot.data_range);
  const strategySnapshot = asPlainObject(snapshot.strategy_snapshot);

  const strategySnapshotMarket = requireTrimmedString(strategySnapshot?.market);
  const strategySnapshotTimeframe = requireTrimmedString(strategySnapshot?.timeframe);

  const market = requireTrimmedString(snapshot.market) ?? strategySnapshotMarket;
  const timeframe = requireTrimmedString(snapshot.timeframe) ?? strategySnapshotTimeframe;
  const rangeFrom = requireTrimmedString(dataRange?.from);
  const rangeTo = requireTrimmedString(dataRange?.to);
  const engineConfig = asPlainObject(snapshot.engine_config) ?? {};

  if (!strategyRuleVersionId || !market || !timeframe || !rangeFrom || !rangeTo) {
    throw new Error('input_snapshot.strategy_rule_version_id, market, timeframe, data_range.from, data_range.to are required');
  }
  if (!isValidIsoDate(rangeFrom) || !isValidIsoDate(rangeTo) || rangeFrom > rangeTo) {
    throw new Error('input_snapshot.data_range.from/to must be valid ISO dates and from<=to');
  }

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
    market: args.inputSnapshot.market,
    timeframe: args.inputSnapshot.timeframe,
    period: {
      from: args.inputSnapshot.dataRange.from,
      to: args.inputSnapshot.dataRange.to,
    },
    metrics: {
      total_trades: 0,
      win_rate: 0,
      net_profit: 0,
      profit_factor: null,
      max_drawdown_percent: null,
    },
    engine: {
      version: args.engineVersion,
    },
    notes: 'internal backtest worker scaffold result',
  };
}

export function createExecutionArtifactPointer(args: {
  executionId: string;
}): InternalBacktestArtifactPointer {
  return {
    type: 'internal_backtest_execution',
    execution_id: args.executionId,
    path: `/internal-backtests/executions/${args.executionId}`,
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
  assertFiniteNumber(metrics.total_trades, 'result_summary.metrics.total_trades');
  assertFiniteNumber(metrics.win_rate, 'result_summary.metrics.win_rate');
  assertFiniteNumber(metrics.net_profit, 'result_summary.metrics.net_profit');
  const profitFactor = assertOptionalFiniteNumber(metrics.profit_factor, 'result_summary.metrics.profit_factor');
  const maxDrawdown = assertOptionalFiniteNumber(
    metrics.max_drawdown_percent,
    'result_summary.metrics.max_drawdown_percent',
  );

  const engine = asPlainObject(root.engine);
  const engineVersion = requireTrimmedString(engine?.version);
  if (!engineVersion) {
    throw new Error('result_summary.engine.version is required.');
  }

  const notes = requireTrimmedString(root.notes) ?? '';

  return {
    schema_version: '1.0',
    market,
    timeframe,
    period: { from, to },
    metrics: {
      total_trades: metrics.total_trades as number,
      win_rate: metrics.win_rate as number,
      net_profit: metrics.net_profit as number,
      profit_factor: profitFactor,
      max_drawdown_percent: maxDrawdown,
    },
    engine: {
      version: engineVersion,
    },
    notes,
  };
}
