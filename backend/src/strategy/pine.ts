import { isCanonicalPineTimeframe, normalizeTimeframeAlias } from './timeframe';

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

export type PineInvalidReasonCode =
  | 'empty_output'
  | 'missing_version_declaration'
  | 'missing_strategy_or_indicator_declaration'
  | 'markdown_code_fence_pollution'
  | 'explanatory_text_pollution';

export type PineAssessmentResult = {
  normalizedScript: string | null;
  warnings: string[];
  failureReason: string | null;
  retryable: boolean;
  invalidReasonCodes: PineInvalidReasonCode[];
};

const SUPPORTED_MARKETS = new Set(['JP_STOCK', 'US_STOCK']);

function toConditionText(lines: string[]): string {
  if (lines.length === 0) return 'false';
  if (lines.length === 1) return lines[0];
  return lines.map((line) => `(${line})`).join(' and ');
}

export function validateGeneratedPineScript(script: string | null): PineValidationResult {
  const assessed = assessGeneratedPineScript(script);
  return {
    warnings: assessed.warnings,
    failureReason: assessed.failureReason,
  };
}

function stripMarkdownCodeFence(script: string): { script: string; hadFence: boolean } {
  if (!/```/i.test(script)) {
    return { script, hadFence: false };
  }
  const withoutFence = script.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '').trim();
  return { script: withoutFence, hadFence: true };
}

function stripExplanatoryNoise(script: string): { script: string; removed: boolean } {
  const lines = script.split(/\r?\n/);
  if (lines.length === 0) {
    return { script, removed: false };
  }

  let startIndex = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    if (line.startsWith('//@version=')) {
      startIndex = i;
      break;
    }
    if (/^(strategy|indicator)\s*\(/i.test(line)) {
      startIndex = i;
      break;
    }
    startIndex = i + 1;
  }

  if (startIndex === 0) {
    return { script, removed: false };
  }

  return {
    script: lines.slice(startIndex).join('\n').trim(),
    removed: true,
  };
}

function detectExplanatoryNoise(script: string): boolean {
  const lines = script.split(/\r?\n/);
  return lines.some((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('//')) return false;
    return /(here(?:'s| is)|below is|pine script|explanation|説明|解説|以下|注意|note:)/i.test(trimmed);
  });
}

export function assessGeneratedPineScript(script: string | null): PineAssessmentResult {
  if (!script || !script.trim()) {
    return {
      normalizedScript: null,
      warnings: [],
      failureReason: 'Generated script is empty.',
      retryable: false,
      invalidReasonCodes: ['empty_output'],
    };
  }

  let normalizedScript = script.trim();
  const warnings: string[] = [];
  const invalidReasonCodes: PineInvalidReasonCode[] = [];

  const strippedFence = stripMarkdownCodeFence(normalizedScript);
  if (strippedFence.hadFence) {
    normalizedScript = strippedFence.script;
    warnings.push('生成結果に含まれていた Markdown code fence を削除しました。');
    invalidReasonCodes.push('markdown_code_fence_pollution');
  }

  const strippedNoise = stripExplanatoryNoise(normalizedScript);
  if (strippedNoise.removed) {
    normalizedScript = strippedNoise.script;
    warnings.push('生成結果の先頭に含まれていた説明文を削除しました。');
    invalidReasonCodes.push('explanatory_text_pollution');
  }

  if (detectExplanatoryNoise(normalizedScript)) {
    warnings.push('生成されたスクリプトに説明文が混在している可能性があります。');
    invalidReasonCodes.push('explanatory_text_pollution');
  }

  if (!normalizedScript) {
    return {
      normalizedScript: null,
      warnings,
      failureReason: 'Generated script is empty after normalization.',
      retryable: false,
      invalidReasonCodes: Array.from(new Set([...invalidReasonCodes, 'empty_output'])),
    };
  }

  const hasVersion = /@version=\d+/i.test(normalizedScript);
  if (!hasVersion) {
    warnings.push('Pine Script の //@version 宣言が見つかりません。');
    invalidReasonCodes.push('missing_version_declaration');
  }

  const hasEntryPoint = /\b(strategy|indicator)\s*\(/i.test(normalizedScript);
  if (!hasEntryPoint) {
    return {
      normalizedScript,
      warnings,
      failureReason: 'Script must contain strategy(...) or indicator(...).',
      retryable: false,
      invalidReasonCodes: Array.from(
        new Set([...invalidReasonCodes, 'missing_strategy_or_indicator_declaration']),
      ),
    };
  }

  if (!hasVersion) {
    return {
      normalizedScript,
      warnings,
      failureReason: 'Script is not valid Pine format because version declaration is missing.',
      retryable: true,
      invalidReasonCodes: Array.from(new Set(invalidReasonCodes)),
    };
  }

  return {
    normalizedScript,
    warnings,
    failureReason: null,
    retryable: false,
    invalidReasonCodes: Array.from(new Set(invalidReasonCodes)),
  };
}

export function generatePineDeterministic(input: PineGenerationInput): PineGenerationOutput {
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const nl = input.naturalLanguageSpec.trim();
  const targetTimeframe = normalizeTimeframeAlias(input.targetTimeframe);

  if (nl.length === 0) {
    return {
      normalizedRuleJson: {
        strategy_type: 'long_only',
        entry_conditions: [],
        exit_conditions: [],
        unsupported_clauses: ['empty_rule'],
      },
      generatedScript: null,
      warnings: ['自然言語ルールが空です。Pine生成には検証したい条件を入力してください。'],
      assumptions,
      status: 'failed',
    };
  }

  if (!SUPPORTED_MARKETS.has(input.targetMarket)) {
    warnings.push(`市場 ${input.targetMarket} はPine生成の初回対応範囲外です。JP_STOCK 前提として扱います。`);
    assumptions.push('対象市場は JP_STOCK として扱います。');
  } else if (input.targetMarket !== 'JP_STOCK') {
    assumptions.push(`対象市場は ${input.targetMarket} として扱います。`);
  }

  if (!isCanonicalPineTimeframe(targetTimeframe)) {
    warnings.push(`時間足 ${input.targetTimeframe} はPine生成の初回対応範囲外です。日足（D）前提として扱います。`);
    assumptions.push('対象時間足は日足（D）として扱います。');
  } else if (targetTimeframe !== 'D') {
    assumptions.push(`対象時間足は ${targetTimeframe} として扱います。`);
    assumptions.push('生成されたPineはTradingViewの表示中チャート時間足に従って検証します。');
  }

  const unsupportedPatterns = [
    {
      regex: /short|ショート|空売り/i,
      warning: 'ショート条件は初回Pine生成の対応範囲外です。long_only 前提で扱います。',
    },
    {
      regex: /trailing|トレーリング|nanpin|ナンピン|pyramiding/i,
      warning: 'トレーリング、ナンピン、pyramiding、詳細なポジションサイズ制御は初回Pine生成の対応範囲外です。',
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
    assumptions.push('移動平均の期間は25を既定値として扱います。');
  }

  if (/rsi/i.test(nl)) {
    entryConditions.push('rsi14 >= 50');
    assumptions.push('RSIは期間14、閾値50を既定値として扱います。');
  }

  if (/出来高|volume/i.test(nl)) {
    entryConditions.push('volume >= volMa20 * 1.5');
    assumptions.push('出来高条件は20本平均の1.5倍を既定値として扱います。');
  }

  if (/終値|close\s*</i.test(nl) && /25日|移動平均|ma25|sma\(25\)/i.test(nl)) {
    exitConditions.push('close < ma25');
  }

  if (entryConditions.length === 0) {
    warnings.push('初回対応パターンからエントリー条件を検出できませんでした。');
  }

  if (exitConditions.length === 0) {
    warnings.push('初回対応パターンから手仕舞い条件を検出できませんでした。');
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
