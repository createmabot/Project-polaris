type PlainObject = Record<string, unknown>;

export const ENGINE_ACTUAL_RULE_KINDS = {
  CLOSE_ABOVE_PREVIOUS_CLOSE: 'close_above_previous_close',
  CLOSE_BELOW_PREVIOUS_CLOSE: 'close_below_previous_close',
  PRICE_ABOVE_SMA: 'price_above_sma',
  PRICE_BELOW_SMA: 'price_below_sma',
  PRICE_ABOVE_THRESHOLD: 'price_above_threshold',
  PRICE_BELOW_THRESHOLD: 'price_below_threshold',
} as const;

export type EngineActualRuleKind =
  (typeof ENGINE_ACTUAL_RULE_KINDS)[keyof typeof ENGINE_ACTUAL_RULE_KINDS];

export type EngineActualRule =
  | { kind: 'close_above_previous_close' }
  | { kind: 'close_below_previous_close' }
  | { kind: 'price_above_sma'; period: number }
  | { kind: 'price_below_sma'; period: number }
  | { kind: 'price_above_threshold'; threshold: number }
  | { kind: 'price_below_threshold'; threshold: number };

export type EngineActualRuleSet = {
  entryRule: EngineActualRule;
  exitRule: EngineActualRule;
  exitOverrides: {
    maxHoldingBars?: number;
    takeProfitPercent?: number;
    stopLossPercent?: number;
  };
};

const DEFAULT_ENGINE_ACTUAL_RULE_SET: EngineActualRuleSet = {
  entryRule: { kind: ENGINE_ACTUAL_RULE_KINDS.CLOSE_ABOVE_PREVIOUS_CLOSE },
  exitRule: { kind: ENGINE_ACTUAL_RULE_KINDS.CLOSE_BELOW_PREVIOUS_CLOSE },
  exitOverrides: {},
};

function asObject(input: unknown): PlainObject | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as PlainObject;
}

function parsePositiveFiniteNumber(
  value: unknown,
  fieldName: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
  return value;
}

function parseSmaPeriod(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 2 ||
    value > 200
  ) {
    throw new Error(`${fieldName} must be an integer between 2 and 200.`);
  }
  return value;
}

function parsePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return value;
}

function parseRule(
  input: unknown,
  fieldName: string,
): EngineActualRule {
  const rule = asObject(input);
  if (!rule) {
    throw new Error(`${fieldName} must be an object.`);
  }

  const kindRaw = rule.kind;
  if (typeof kindRaw !== 'string' || kindRaw.trim().length === 0) {
    throw new Error(`${fieldName}.kind is required.`);
  }
  const kind = kindRaw.trim().toLowerCase() as EngineActualRuleKind;

  switch (kind) {
    case ENGINE_ACTUAL_RULE_KINDS.CLOSE_ABOVE_PREVIOUS_CLOSE:
      return { kind };
    case ENGINE_ACTUAL_RULE_KINDS.CLOSE_BELOW_PREVIOUS_CLOSE:
      return { kind };
    case ENGINE_ACTUAL_RULE_KINDS.PRICE_ABOVE_SMA:
      return {
        kind,
        period: parseSmaPeriod(rule.period, `${fieldName}.period`),
      };
    case ENGINE_ACTUAL_RULE_KINDS.PRICE_BELOW_SMA:
      return {
        kind,
        period: parseSmaPeriod(rule.period, `${fieldName}.period`),
      };
    case ENGINE_ACTUAL_RULE_KINDS.PRICE_ABOVE_THRESHOLD:
      return {
        kind,
        threshold: parsePositiveFiniteNumber(
          rule.threshold,
          `${fieldName}.threshold`,
        ),
      };
    case ENGINE_ACTUAL_RULE_KINDS.PRICE_BELOW_THRESHOLD:
      return {
        kind,
        threshold: parsePositiveFiniteNumber(
          rule.threshold,
          `${fieldName}.threshold`,
        ),
      };
    default:
      throw new Error(
        `${fieldName}.kind must be one of: ${Object.values(
          ENGINE_ACTUAL_RULE_KINDS,
        ).join(', ')}.`,
      );
  }
}

export function normalizeEngineActualRuleSet(
  engineConfig: PlainObject,
): EngineActualRuleSet {
  const hasActualRules = Object.prototype.hasOwnProperty.call(engineConfig, 'actual_rules');
  const actualRulesRaw = asObject(engineConfig.actual_rules);
  if (hasActualRules && !actualRulesRaw) {
    throw new Error('engine_config.actual_rules must be an object.');
  }
  if (!actualRulesRaw) {
    return DEFAULT_ENGINE_ACTUAL_RULE_SET;
  }

  const entryRule = parseRule(actualRulesRaw.entry_rule, 'engine_config.actual_rules.entry_rule');
  const exitRule = parseRule(actualRulesRaw.exit_rule, 'engine_config.actual_rules.exit_rule');
  const parsedExitOverrides =
    actualRulesRaw.exit_overrides === undefined
      ? {}
      : asObject(actualRulesRaw.exit_overrides);
  if (actualRulesRaw.exit_overrides !== undefined && !parsedExitOverrides) {
    throw new Error('engine_config.actual_rules.exit_overrides must be an object when provided.');
  }
  const exitOverridesRaw = (parsedExitOverrides ?? {}) as PlainObject;
  const maxHoldingBars =
    exitOverridesRaw.max_holding_bars === undefined
      ? undefined
      : parsePositiveInteger(
          exitOverridesRaw.max_holding_bars,
          'engine_config.actual_rules.exit_overrides.max_holding_bars',
        );
  const takeProfitPercent =
    exitOverridesRaw.take_profit_percent === undefined
      ? undefined
      : parsePositiveFiniteNumber(
          exitOverridesRaw.take_profit_percent,
          'engine_config.actual_rules.exit_overrides.take_profit_percent',
        );
  const stopLossPercent =
    exitOverridesRaw.stop_loss_percent === undefined
      ? undefined
      : parsePositiveFiniteNumber(
          exitOverridesRaw.stop_loss_percent,
          'engine_config.actual_rules.exit_overrides.stop_loss_percent',
        );
  return {
    entryRule,
    exitRule,
    exitOverrides: {
      ...(maxHoldingBars !== undefined ? { maxHoldingBars } : {}),
      ...(takeProfitPercent !== undefined ? { takeProfitPercent } : {}),
      ...(stopLossPercent !== undefined ? { stopLossPercent } : {}),
    },
  };
}
