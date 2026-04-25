export type PineGenerationInput = {
  naturalLanguageSpec: string;
  normalizedRuleJson: Record<string, unknown> | null;
  targetMarket: string;
  targetTimeframe: string;
};

export type PineGenerationOutput = {
  normalizedRuleJson: Record<string, unknown>;
  generatedScript: string | null;
  warnings: string[];
  assumptions: string[];
  status: 'generated' | 'failed';
};

export type PineValidationResult = {
  warnings: string[];
  failureReason: string | null;
};

const SUPPORTED_MARKETS = new Set(['JP_STOCK']);
const SUPPORTED_TIMEFRAMES = new Set(['D']);

function toConditionText(lines: string[]): string {
  if (lines.length === 0) return 'false';
  if (lines.length === 1) return lines[0];
  return lines.map((line) => `(${line})`).join(' and ');
}

export function validateGeneratedPineScript(script: string | null): PineValidationResult {
  if (!script || !script.trim()) {
    return {
      warnings: [],
      failureReason: 'Generated script is empty.',
    };
  }

  const trimmed = script.trim();
  const warnings: string[] = [];

  const hasVersion = /@version=\d+/i.test(trimmed);
  if (!hasVersion) {
    warnings.push('Missing //@version declaration.');
  }

  const hasEntryPoint = /\b(strategy|indicator)\s*\(/i.test(trimmed);
  if (!hasEntryPoint) {
    return {
      warnings,
      failureReason: 'Script must contain strategy(...) or indicator(...).',
    };
  }

  if (!hasVersion) {
    return {
      warnings,
      failureReason: 'Script is not valid Pine format because version declaration is missing.',
    };
  }

  return {
    warnings,
    failureReason: null,
  };
}

export function generatePineDeterministic(input: PineGenerationInput): PineGenerationOutput {
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const nl = input.naturalLanguageSpec.trim();

  if (nl.length === 0) {
    return {
      normalizedRuleJson: {
        strategy_type: 'long_only',
        entry_conditions: [],
        exit_conditions: [],
        unsupported_clauses: ['empty_rule'],
      },
      generatedScript: null,
      warnings: ['natural_language_spec must not be empty'],
      assumptions,
      status: 'failed',
    };
  }

  if (!SUPPORTED_MARKETS.has(input.targetMarket)) {
    warnings.push(`market=${input.targetMarket} is outside MVP scope. Fallback assumes JP_STOCK.`);
    assumptions.push('target_market is interpreted as JP_STOCK');
  }

  if (!SUPPORTED_TIMEFRAMES.has(input.targetTimeframe)) {
    warnings.push(`timeframe=${input.targetTimeframe} is outside MVP scope. Fallback assumes D.`);
    assumptions.push('target_timeframe is interpreted as D');
  }

  const unsupportedPatterns = [
    { regex: /short/i, warning: 'short conditions are not supported in MVP (long_only).' },
    {
      regex: /trailing|nanpin|pyramiding/i,
      warning: 'position sizing and advanced execution controls are outside MVP scope.',
    },
  ];

  const unsupportedClauses: string[] = [];
  for (const pattern of unsupportedPatterns) {
    if (pattern.regex.test(nl)) {
      warnings.push(pattern.warning);
      unsupportedClauses.push(pattern.warning);
    }
  }

  const entryConditions: string[] = [];
  const exitConditions: string[] = [];

  if (/25日|移動平均|ma25|sma\(25\)/i.test(nl)) {
    entryConditions.push('close > ma25');
    assumptions.push('moving average period defaults to 25');
  }

  if (/rsi/i.test(nl)) {
    entryConditions.push('rsi14 >= 50');
    assumptions.push('RSI length defaults to 14 and threshold defaults to 50');
  }

  if (/出来高|volume/i.test(nl)) {
    entryConditions.push('volume >= volMa20 * 1.5');
    assumptions.push('volume condition defaults to 20-day average * 1.5');
  }

  if (/終値|close\s*</i.test(nl) && /25日|移動平均|ma25|sma\(25\)/i.test(nl)) {
    exitConditions.push('close < ma25');
  }

  if (entryConditions.length === 0) {
    warnings.push('entry conditions were not detected from supported MVP pattern set.');
  }

  if (exitConditions.length === 0) {
    warnings.push('exit conditions were not detected from supported MVP pattern set.');
  }

  const normalizedRuleJson: Record<string, unknown> = {
    strategy_type: 'long_only',
    entry_conditions: entryConditions,
    exit_conditions: exitConditions,
    unsupported_clauses: unsupportedClauses,
  };

  if (entryConditions.length === 0 || exitConditions.length === 0) {
    return {
      normalizedRuleJson,
      generatedScript: null,
      warnings,
      assumptions: [...new Set(assumptions)],
      status: 'failed',
    };
  }

  const entryConditionText = toConditionText(entryConditions);
  const exitConditionText = toConditionText(exitConditions);

  const generatedScript = `//@version=6
strategy("Hokkyokusei Generated Strategy", overlay=true)

ma25 = ta.sma(close, 25)
rsi14 = ta.rsi(close, 14)
volMa20 = ta.sma(volume, 20)

entryCondition = ${entryConditionText}
exitCondition = ${exitConditionText}

if entryCondition and strategy.position_size == 0
    strategy.entry("Long", strategy.long, alert_message = "entry_long")

if exitCondition and strategy.position_size > 0
    strategy.close("Long", alert_message = "exit_long")

plot(ma25)
`;

  return {
    normalizedRuleJson,
    generatedScript,
    warnings,
    assumptions: [...new Set(assumptions)],
    status: 'generated',
  };
}
