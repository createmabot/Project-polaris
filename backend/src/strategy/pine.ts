export type PineGenerationResult = {
  normalizedRuleJson: Record<string, unknown>;
  generatedPine: string | null;
  warnings: string[];
  assumptions: string[];
  status: 'generated' | 'failed';
};

type RuleInput = {
  naturalLanguageRule: string;
  market: string;
  timeframe: string;
};

const SUPPORTED_MARKETS = new Set(['JP_STOCK']);
const SUPPORTED_TIMEFRAMES = new Set(['D']);

function toConditionText(lines: string[]): string {
  if (lines.length === 0) return 'false';
  if (lines.length === 1) return lines[0];
  return lines.map((line) => `(${line})`).join(' and ');
}

export function generatePineFromNaturalLanguage(input: RuleInput): PineGenerationResult {
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const nl = input.naturalLanguageRule.trim();

  if (nl.length === 0) {
    return {
      normalizedRuleJson: {
        strategy_type: 'long_only',
        entry_conditions: [],
        exit_conditions: [],
        unsupported_clauses: ['empty_rule'],
      },
      generatedPine: null,
      warnings: ['ルール本文が空です。自然言語ルールを入力してください。'],
      assumptions,
      status: 'failed',
    };
  }

  if (!SUPPORTED_MARKETS.has(input.market)) {
    warnings.push(`market=${input.market} はMVP対象外です。JP_STOCKとして扱います。`);
    assumptions.push('market は JP_STOCK として解釈した。');
  }

  if (!SUPPORTED_TIMEFRAMES.has(input.timeframe)) {
    warnings.push(`timeframe=${input.timeframe} はMVP対象外です。日足(D)前提で生成します。`);
    assumptions.push('timeframe は D(日足)として解釈した。');
  }

  const unsupportedPatterns = [
    { regex: /空売り|ショート|short/i, warning: '空売り/ショート条件はMVP対象外です。long_onlyで解釈します。' },
    { regex: /分割利確|トレーリング|ナンピン|ピラミッディング/, warning: '高度なポジション管理はMVP対象外です。' },
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

  if (/25日.*移動平均|25日線|sma\(25\)/i.test(nl)) {
    entryConditions.push('close > ma25');
    assumptions.push('移動平均期間は25を採用した。');
  }

  if (/rsi/i.test(nl)) {
    entryConditions.push('rsi14 >= 50');
    assumptions.push('RSI lengthは14、閾値は50を採用した。');
  }

  if (/出来高|volume/i.test(nl)) {
    entryConditions.push('volume >= volMa20 * 1.5');
    assumptions.push('出来高条件は20日平均の1.5倍を採用した。');
  }

  if (/下回|割れ|close\s*</i.test(nl) && /25日|移動平均|ma25|sma\(25\)/i.test(nl)) {
    exitConditions.push('close < ma25');
  }

  if (entryConditions.length === 0) {
    warnings.push('entry 条件を特定できませんでした。MVP対応条件（移動平均/RSI/出来高）で記述してください。');
  }

  if (exitConditions.length === 0) {
    warnings.push('exit 条件を特定できませんでした。終値が移動平均を下回る等の基本条件を追記してください。');
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
      generatedPine: null,
      warnings,
      assumptions: [...new Set(assumptions)],
      status: 'failed',
    };
  }

  const entryConditionText = toConditionText(entryConditions);
  const exitConditionText = toConditionText(exitConditions);

  const generatedPine = `//@version=6
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
    generatedPine,
    warnings,
    assumptions: [...new Set(assumptions)],
    status: 'generated',
  };
}
