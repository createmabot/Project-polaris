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
};

const DEFAULT_ENGINE_ACTUAL_RULE_SET: EngineActualRuleSet = {
  entryRule: { kind: ENGINE_ACTUAL_RULE_KINDS.CLOSE_ABOVE_PREVIOUS_CLOSE },
  exitRule: { kind: ENGINE_ACTUAL_RULE_KINDS.CLOSE_BELOW_PREVIOUS_CLOSE },
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
  const actualRulesRaw = asObject(engineConfig.actual_rules);
  if (!actualRulesRaw) {
    return DEFAULT_ENGINE_ACTUAL_RULE_SET;
  }

  const entryRule = parseRule(actualRulesRaw.entry_rule, 'engine_config.actual_rules.entry_rule');
  const exitRule = parseRule(actualRulesRaw.exit_rule, 'engine_config.actual_rules.exit_rule');
  return {
    entryRule,
    exitRule,
  };
}
