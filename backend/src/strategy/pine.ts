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
  | 'explanatory_text_pollution'
  | 'unsupported_color_namespace'
  | 'unsupported_plot_style';

export type PineAssessmentResult = {
  normalizedScript: string | null;
  warnings: string[];
  failureReason: string | null;
  retryable: boolean;
  invalidReasonCodes: PineInvalidReasonCode[];
};

export type PineReviewIssueCode =
  | 'pine_syntax_risk'
  | 'unsupported_color_alias'
  | 'unsupported_color_namespace'
  | 'unsupported_plot_style'
  | 'dmi_property_access'
  | 'unsupported_dmi_property_access'
  | 'unsupported_adx_function'
  | 'block_local_variable_scope_risk'
  | 'na_type_inference_risk'
  | 'uninitialized_stop_loss_price'
  | 'setup_trigger_state_risk'
  | 'below_vs_crossunder_mismatch'
  | 'oscillator_plot_overlay_risk'
  | 'overlay_oscillator_plot'
  | 'entry_price_reference_risk'
  | 'stop_order_semantics_risk'
  | 'unused_state_variable'
  | 'narrative_comment'
  | 'long_only_violation'
  | 'setup_trigger_same_bar'
  | 'entry_atr_na_capture'
  | 'provider_review_unavailable'
  | 'other';

export type PineReviewIssue = {
  code: PineReviewIssueCode;
  severity: 'error' | 'warning' | 'info';
  message: string;
  repair_hint: string;
  repairable: boolean;
};

export type PineReviewResult = {
  schema_name: 'pine_review_result';
  schema_version: '1.0';
  status: 'pass' | 'needs_repair';
  issues: PineReviewIssue[];
  summary: {
    issue_count: number;
    error_count: number;
    warning_count: number;
    repairable_issue_count: number;
  };
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

function normalizeUnsupportedPineAliases(script: string): {
  script: string;
  warnings: string[];
  invalidReasonCodes: PineInvalidReasonCode[];
} {
  let normalized = script;
  const warnings: string[] = [];
  const invalidReasonCodes: PineInvalidReasonCode[] = [];

  if (/\bcolor\.color\./.test(normalized)) {
    normalized = normalized.replace(/\bcolor\.color\./g, 'color.');
    warnings.push('Pine Script の unsupported color.color.* namespace を color.* に補正しました。');
    invalidReasonCodes.push('unsupported_color_namespace');
  }

  if (/\bplot\.style_dashed\b/.test(normalized)) {
    normalized = normalized.replace(/\bplot\.style_dashed\b/g, 'plot.style_linebr');
    warnings.push('Pine Script の unsupported plot.style_dashed を plot.style_linebr に補正しました。');
    invalidReasonCodes.push('unsupported_plot_style');
  }

  return { script: normalized, warnings, invalidReasonCodes };
}

function createPineReviewResult(issues: PineReviewIssue[]): PineReviewResult {
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningIssueCount = issues.filter((issue) => issue.severity === 'warning').length;
  const repairableIssueCount = issues.filter((issue) => issue.repairable).length;
  return {
    schema_name: 'pine_review_result',
    schema_version: '1.0',
    status: errorCount > 0 ? 'needs_repair' : 'pass',
    issues,
    summary: {
      issue_count: issues.length,
      error_count: errorCount,
      warning_count: warningIssueCount,
      repairable_issue_count: repairableIssueCount,
    },
  };
}

function pushReviewIssue(issues: PineReviewIssue[], code: PineReviewIssueCode, message: string): void {
  issues.push({
    code,
    severity: 'error',
    message,
    repair_hint: message,
    repairable: true,
  });
}

export function reviewGeneratedPineScriptDeterministic(script: string | null): PineReviewResult {
  if (!script || !script.trim()) {
    return createPineReviewResult([]);
  }

  const issues: PineReviewIssue[] = [];
  const source = script.trim();
  const hasOverlayTrue = /\b(strategy|indicator)\s*\([^)]*\boverlay\s*=\s*true\b/i.test(source);

  if (/\bcolor\.color\./.test(source)) {
    pushReviewIssue(issues, 'unsupported_color_namespace', 'Use supported color.* namespace, not color.color.*.');
  }
  if (/\bplot\.style_dashed\b/.test(source)) {
    pushReviewIssue(issues, 'unsupported_plot_style', 'plot.style_dashed is not supported in plot().');
  }
  if (/\bta\.dmi\s*\([^)]*\)\s*\.\w+/i.test(source)) {
    pushReviewIssue(issues, 'unsupported_dmi_property_access', 'Do not access properties directly from ta.dmi(...).');
  }
  if (/\bta\.adx\s*\(/i.test(source)) {
    pushReviewIssue(issues, 'unsupported_adx_function', 'Use supported DMI/ADX calculation patterns instead of ta.adx(...).');
  }
  if (/^\s*stopLossPrice\s*=\s*na\s*$/im.test(source)) {
    pushReviewIssue(issues, 'uninitialized_stop_loss_price', 'Do not initialize stopLossPrice with a bare na assignment.');
  }
  if (
    hasOverlayTrue &&
    (/\bplot\s*\(\s*(rsi|rsiValue|stoch|stochValue|macd|macdHist|adx|adxValue)\b/i.test(source) ||
      /^\s*hline\s*\(/im.test(source))
  ) {
    pushReviewIssue(issues, 'overlay_oscillator_plot', 'Do not plot oscillator panes by default when overlay=true.');
  }
  if (/^\s*(\/\/|\/\*)\s*(Note:|注意:|Since\b|To ensure\b|Let's use\b|より正確な実装|Pine Scriptの仕様上)/im.test(source)) {
    pushReviewIssue(issues, 'narrative_comment', 'Generated script comments must stay short and structural, not narrative.');
  }
  if (/\b(entryCondition\s*=\s*)?setupCondition\s+and\s+triggerCondition\b/i.test(source)) {
    pushReviewIssue(issues, 'setup_trigger_same_bar', 'Use setupActive state instead of requiring setup and trigger on the same bar.');
  }
  if (/\bif\s+strategy\.position_size\s*>\s*0\s+and\s+na\s*\(\s*entryAtr\s*\)/i.test(source)) {
    pushReviewIssue(issues, 'entry_atr_na_capture', 'Capture entry ATR on the position-open transition instead of na(entryAtr).');
  }

  return createPineReviewResult(issues);
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

  const normalizedUnsupportedAliases = normalizeUnsupportedPineAliases(normalizedScript);
  normalizedScript = normalizedUnsupportedAliases.script;
  warnings.push(...normalizedUnsupportedAliases.warnings);
  invalidReasonCodes.push(...normalizedUnsupportedAliases.invalidReasonCodes);

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
