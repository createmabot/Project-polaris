import { env } from '../env';
import { AlertSummaryContext, AlertSummaryOutput, MockAiAdapter } from './adapter';
import { LocalLlmAdapter } from './local-llm-adapter';
import { FallbackApiAdapter } from './fallback-api-adapter';
import {
  generatePineDeterministic,
  reviewGeneratedPineScriptDeterministic,
} from '../strategy/pine';
import type { PineReviewIssue, PineReviewIssueCode, PineReviewResult } from '../strategy/pine';
import {
  buildNormalizedStrategySpec,
  isNormalizedStrategySpec,
  type NormalizedStrategySpec,
} from '../strategy/normalized-spec';

export type HomeAiProviderType = 'stub' | 'local_llm' | 'openai_api';
export type DailySummaryType = 'latest' | 'morning' | 'evening';

export type DailySummaryContext = {
  summaryType: DailySummaryType;
  date: string | null;
  marketSnapshotCount: number;
  alertCount: number;
  referenceCount: number;
};

export type DailySummaryOutput = {
  title: string;
  bodyMarkdown: string;
  structuredJson: {
    schema_name: 'daily_summary';
    schema_version: '1.0';
    confidence: 'high' | 'medium' | 'low';
    insufficient_context: boolean;
    payload: {
      highlights: Array<{
        title: string;
        summary: string;
        reason: string;
        confidence: 'high' | 'medium' | 'low';
        reference_ids: string[];
        symbol_ids: string[];
      }>;
      watch_items: string[];
      focus_symbols: Array<{ symbol_id: string; reason: string }>;
      market_context: {
        tone: 'risk_on' | 'risk_off' | 'neutral';
        summary: string;
      };
    };
  };
  modelName: string;
  promptVersion: string;
};

export type SymbolThesisScope = 'thesis' | 'latest';

export type SymbolThesisContext = {
  scope: SymbolThesisScope;
  symbol: {
    id: string;
    symbol: string;
    symbolCode: string | null;
    displayName: string | null;
    marketCode: string | null;
    tradingviewSymbol: string | null;
  };
  referenceIds: string[];
  references: Array<{
    id: string;
    title: string;
    referenceType: string;
    summaryText: string | null;
    publishedAt: string | null;
  }>;
  snapshot: {
    lastPrice: number | null;
    changePercent: number | null;
    asOf: string | null;
  } | null;
  latestNoteSummary: {
    noteId: string;
    title: string;
    thesisText: string | null;
    updatedAt: string;
  } | null;
};

export type SymbolThesisOutput = {
  title: string;
  bodyMarkdown: string;
  structuredJson: {
    schema_name: 'symbol_thesis_summary';
    schema_version: '1.0';
    confidence: 'high' | 'medium' | 'low';
    insufficient_context: boolean;
    payload: {
      bullish_points: Array<string | { text: string; reference_ids: string[] }>;
      bearish_points: Array<string | { text: string; reference_ids: string[] }>;
      watch_kpis: string[];
      next_events: Array<string | { label: string; date?: string | null; reference_ids?: string[] }>;
      invalidation_conditions: string[];
      overall_view: string;
    };
  };
  modelName: string;
  promptVersion: string;
};

export type ComparisonSummaryContext = {
  comparisonId: string;
  symbols: Array<{
    id: string;
    symbol: string;
    symbolCode: string | null;
    displayName: string | null;
    marketCode: string | null;
    tradingviewSymbol: string | null;
  }>;
  metrics: string[];
  comparedMetricJson: Record<string, unknown>;
  references: Array<{
    id: string;
    title: string;
    referenceType: string;
    sourceName: string | null;
    sourceUrl: string | null;
    publishedAt: string | null;
    summaryText: string | null;
  }>;
};

export type ComparisonSummaryOutput = {
  title: string;
  bodyMarkdown: string;
  structuredJson: {
    schema_name: 'comparison_summary';
    schema_version: '1.0';
    confidence: 'high' | 'medium' | 'low';
    insufficient_context: boolean;
    payload: {
      key_differences: string[];
      risk_points: string[];
      next_actions: string[];
      compared_symbols: string[];
      reference_ids: string[];
      overall_view: string;
    };
  };
  modelName: string;
  promptVersion: string;
};

export type BacktestSummaryContext = {
  backtestId: string;
  title: string;
  executionSource: string;
  market: string;
  timeframe: string;
  status: string;
  metrics: {
    totalTrades: number | null;
    winRate: number | null;
    profitFactor: number | null;
    maxDrawdown: number | null;
    netProfit: number | null;
    periodFrom: string | null;
    periodTo: string | null;
  } | null;
  tradeSummary: {
    parsedImportCount: number;
    averageTotalTrades: number | null;
    averageWinRate: number | null;
    averageProfitFactor: number | null;
    averageNetProfit: number | null;
    bestNetProfit: number | null;
    worstNetProfit: number | null;
  } | null;
  importFiles: Array<{
    id: string;
    fileName: string;
    parseStatus: string;
    parseError: string | null;
    createdAt: string;
  }>;
  importParsedSummaries: Array<{
    importId: string;
    fileName: string;
    createdAt: string;
    totalTrades: number | null;
    winRate: number | null;
    profitFactor: number | null;
    maxDrawdown: number | null;
    netProfit: number | null;
    periodFrom: string | null;
    periodTo: string | null;
  }>;
  comparisonDiff: {
    baseImportId: string;
    targetImportId: string;
    totalTradesDiff: number | null;
    winRateDiffPt: number | null;
    profitFactorDiff: number | null;
    maxDrawdownDiff: number | null;
    netProfitDiff: number | null;
  } | null;
  strategy: {
    strategyId: string | null;
    strategyVersionId: string | null;
    naturalLanguageRule: string | null;
    generatedPine: string | null;
  } | null;
  internalBacktestContext: {
    executionSource: 'internal_backtest';
    internalBacktestExecutionId: string | null;
    summaryKind: string | null;
    period: Record<string, unknown> | null;
    metrics: Record<string, unknown> | null;
    artifactPointer: Record<string, unknown> | null;
    resultSummary: Record<string, unknown> | null;
  } | null;
};

export type BacktestSummaryOutput = {
  title: string;
  bodyMarkdown: string;
  structuredJson: {
    schema_name: 'backtest_review_summary';
    schema_version: '1.0';
    confidence: 'high' | 'medium' | 'low';
    insufficient_context: boolean;
    payload: {
      conclusion: string;
      strengths: string[];
      risks: string[];
      next_actions: string[];
      key_metrics: {
        total_trades: number | null;
        win_rate: number | null;
        profit_factor: number | null;
        max_drawdown: number | null;
        net_profit: number | null;
      };
      overall_view: string;
      rule_refinement_candidates?: RuleRefinementCandidate[];
    };
  };
  modelName: string;
  promptVersion: string;
};

export type RuleRefinementCandidate = {
  title: string;
  target_area: 'entry' | 'exit' | 'risk' | 'filter' | 'time_exit' | 'validation_scope' | string;
  rationale: string;
  change_summary: string;
  entry_change: string | null;
  exit_change: string | null;
  risk_change: string | null;
  validation_plan: string;
  expected_metric_effect: {
    profit_factor: string | null;
    win_rate: string | null;
    max_drawdown: string | null;
    trade_count: string | null;
  };
};

export type NaturalLanguageRuleRewriteContext = {
  strategyVersionId: string;
  sourceBacktestId: string | null;
  baseRule: string;
  market: string;
  timeframe: string;
  improvementMemo: string | null;
  metrics: {
    totalTrades: number | null;
    winRate: number | null;
    profitFactor: number | null;
    maxDrawdown: number | null;
    netProfit: number | null;
    periodFrom: string | null;
    periodTo: string | null;
  } | null;
  aiSummary: {
    nextActions: string[];
    overallView: string | null;
    risks: string[];
    strengths: string[];
    keyMetrics: Record<string, unknown> | null;
    ruleRefinementCandidates: RuleRefinementCandidate[];
  } | null;
};

export type NaturalLanguageRuleRewriteOutput = {
  naturalLanguageRule: string;
  warnings: string[];
  assumptions: string[];
  modelName: string;
  promptVersion: string;
};

export type StrategySpecNormalizationContext = {
  strategyVersionId: string;
  naturalLanguageRule: string;
  market: string;
  timeframe: string;
};

export type StrategySpecNormalizationOutput = {
  normalizedSpec: NormalizedStrategySpec | Record<string, unknown>;
  warnings: string[];
  assumptions: string[];
  modelName: string;
  promptVersion: string;
};

export type PineGenerationContext = {
  naturalLanguageSpec: string;
  normalizedRuleJson: Record<string, unknown> | null;
  normalizedStrategySpec?: NormalizedStrategySpec | null;
  specAvailable?: boolean;
  specSource?: {
    provider?: string | null;
    fallbackUsed?: boolean | null;
  } | null;
  targetMarket: string;
  targetTimeframe: string;
  regenerationInput?: {
    sourcePineScriptId: string;
    sourcePineScript: string;
    compileErrorText: string | null;
    validationNote: string | null;
    revisionRequest: string;
  } | null;
  repairRequest?: {
    attempt: number;
    invalidReasonCodes: string[];
    failureReason: string;
    previousScript: string | null;
    reviewIssues?: Array<{
      code: string;
      severity: 'error' | 'warning' | 'info';
      repair_hint: string;
      repair_template?: string;
    }>;
  } | null;
};

export type PineReviewContext = {
  generatedScript: string;
  naturalLanguageSpec: string;
  targetMarket: string;
  targetTimeframe: string;
  repairAttempt: number;
};

export type PineGenerationOutput = {
  normalizedRuleJson: Record<string, unknown>;
  generatedScript: string | null;
  warnings: string[];
  assumptions: string[];
  status: 'generated' | 'failed';
  repairAttempts?: number;
  failureReason?: string | null;
  invalidReasonCodes?: string[];
  reviewerSummary?: {
    issue_count: number;
    error_count: number;
    warning_count: number;
    repairable_issue_count: number;
  };
  reviewerIssues?: Array<{
    code: string;
    severity: 'error' | 'warning' | 'info';
    repair_hint: string;
  }>;
  modelName: string;
  promptVersion: string;
};

export type HomeAiProvider = {
  providerType: HomeAiProviderType;
  generateAlertSummary: (context: AlertSummaryContext) => Promise<AlertSummaryOutput>;
  generateDailySummary: (context: DailySummaryContext) => Promise<DailySummaryOutput>;
  generateSymbolThesisSummary: (context: SymbolThesisContext) => Promise<SymbolThesisOutput>;
  generateComparisonSummary: (context: ComparisonSummaryContext) => Promise<ComparisonSummaryOutput>;
  generateBacktestSummary: (context: BacktestSummaryContext) => Promise<BacktestSummaryOutput>;
  rewriteNaturalLanguageRuleDraft: (
    context: NaturalLanguageRuleRewriteContext,
  ) => Promise<NaturalLanguageRuleRewriteOutput>;
  normalizeStrategySpec: (context: StrategySpecNormalizationContext) => Promise<StrategySpecNormalizationOutput>;
  generatePineScript: (context: PineGenerationContext) => Promise<PineGenerationOutput>;
  reviewPineScript?: (context: PineReviewContext) => Promise<PineReviewResult>;
};

type LocalLlmTaskType =
  | 'daily_summary'
  | 'symbol_thesis_summary'
  | 'comparison_summary'
  | 'backtest_summary'
  | 'natural_language_rule_rewrite'
  | 'strategy_spec_normalization'
  | 'pine_generation';

type LocalLlmSummaryChatOptions = {
  taskType: Exclude<LocalLlmTaskType, 'pine_generation'>;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  think?: boolean;
};

const LOCAL_LLM_SUMMARY_MAX_OUTPUT_TOKENS = 1200;
const LOCAL_LLM_RULE_REWRITE_TIMEOUT_MS_DEFAULT = 90_000;
const LOCAL_LLM_RULE_REWRITE_TIMEOUT_MS_MIN = 10_000;
const LOCAL_LLM_RULE_REWRITE_TIMEOUT_MS_MAX = 300_000;
const LOCAL_LLM_PINE_MAX_OUTPUT_TOKENS = 1800;
const LOCAL_LLM_PINE_TIMEOUT_MS_DEFAULT = 180_000;
const LOCAL_LLM_PINE_TIMEOUT_MS_MIN = 5_000;
const LOCAL_LLM_PINE_TIMEOUT_MS_MAX = 300_000;

const PINE_REPAIR_SYSTEM_PROMPT = [
  'Repair an existing Pine v6 strategy script using only the listed repair_request.reviewIssues.',
  'Return one strict JSON object only. Do not include markdown fences around the JSON.',
  'The generated_script value must contain Pine Script only. Do not include markdown fences, explanations, or comments outside Pine syntax in generated_script.',
  'Fix only the listed issue codes. Prioritize repair_template over repair_hint when repair_template is present.',
  'Preserve unrelated strategy logic, indicators, entry/exit intent, risk settings, comments that are not related to listed issues, target market, and target timeframe.',
  'If the same issue persists after a prior repair attempt, apply the listed repair_template exactly unless doing so would break Pine syntax.',
  'Use //@version=6 and strategy(...). Keep Pine code, identifiers, function names, and required Pine syntax untranslated.',
  'Do not introduce new indicators, ATR state, exits, plots, shorts, pyramiding, request.security, or behavior changes unless directly required by a listed repair issue.',
  'For long-only strategies, do not generate strategy.short entries or short-side strategy.entry calls.',
  'Keep generated_script self-contained and valid Pine Script; do not leave TODOs, placeholders, ellipses, or pseudo-code.',
  'Return user-facing warnings and assumptions in Japanese. Do not write English explanatory sentences in warnings or assumptions.',
  'If failure_reason is needed for a user-facing failure, prefer Japanese. Keep invalid_reason_codes and internal enum/code values in English.',
  'Do not include raw prompt, raw response, endpoint, model, secret, token, credential, local path, stack trace, URLs, citations, web search results, or profit guarantees.',
].join(' ');

const LOCAL_LLM_PINE_REPAIR_SYSTEM_PROMPT = [
  'Repair an existing Pine v6 strategy script using only the listed repair_request.reviewIssues.',
  'Return Pine Script text only. Do not return JSON. Do not include markdown fences.',
  'Start the response with //@version=6.',
  'Fix only the listed issue codes. Prioritize repair_template over repair_hint when repair_template is present.',
  'Preserve unrelated strategy logic, indicators, entry/exit intent, risk settings, target market, and target timeframe.',
  'If the same issue persists after a prior repair attempt, apply the listed repair_template exactly unless doing so would break Pine syntax.',
  'Use strategy(...), not indicator(...), for strategy output.',
  'Keep Pine code, identifiers, function names, and required Pine syntax untranslated.',
  'Do not include explanations, notes, URLs, citations, raw prompt, raw response, endpoint, model, secret, token, credential, local path, stack trace, or profit guarantees.',
].join(' ');

const PINE_SPEC_FIRST_PROMPT_LINES = [
  'If normalized_strategy_spec is present, treat it as the primary implementation contract.',
  'natural_language_rule is supporting context only. If normalized_strategy_spec and natural_language_rule appear to conflict, prefer normalized_strategy_spec.',
  'Implement all supported parts of normalized_strategy_spec: indicators, entry.conditions, filters, exit.conditions, risk.stop_loss, risk.take_profit, and risk.time_exit.',
  'Preserve unsupported_features as warnings or assumptions, not Pine behavior, unless explicitly supported by the current Pine generation scope.',
  'Do not invent additional strategy logic not present in normalized_strategy_spec.',
  'Do not omit measurable thresholds from normalized_strategy_spec.',
  'For volume filters with multiplier, implement the multiplier.',
  'For percent stop loss, use strategy.position_avg_price after the position is open.',
  'For time_exit bars, implement bars-since-entry state safely.',
  'For long_only specs, do not generate short entries.',
];

const LOCAL_LLM_PINE_GENERATION_SYSTEM_PROMPT = [
  'Convert the provided trading rule into Pine v6 strategy code.',
  'Return Pine Script text only. Do not return JSON. Do not include markdown fences.',
  'Start the response with //@version=6.',
  'Use strategy(...), not indicator(...), unless strategy output is impossible.',
  ...PINE_SPEC_FIRST_PROMPT_LINES,
  'Use long-only behavior by default unless the user explicitly requests short behavior and it can be represented safely.',
  'For long-only strategies, do not generate strategy.short entries or short-side strategy.entry calls.',
  'Call strategy.entry only inside a block that confirms strategy.position_size == 0, unless the user explicitly requests pyramiding and it is supported.',
  'Call strategy.exit only inside a block that confirms strategy.position_size > 0. Submit strategy.exit on every bar while the position is open, not only on the entry bar.',
  'Do not compute stop or limit prices from strategy.position_avg_price in the same block where strategy.entry is called.',
  'When an ATR stop uses entry-time ATR, declare a var float such as entryAtr and capture ATR after the position becomes open, for example when strategy.position_size > 0 and strategy.position_size[1] == 0.',
  'Do not reset entry-time state variables such as entryAtr with a simple if strategy.position_size == 0 block immediately after the entry block.',
  'Remember that on the same bar after strategy.entry is submitted, strategy.position_size may still be 0, so a simple flat-state reset can erase entry-time state too early.',
  'Reset entry-time state variables only on an open-to-flat transition. Prefer: if strategy.position_size == 0 and strategy.position_size[1] > 0 then entryAtr := na.',
  'Compute stop prices that depend on entryAtr only under strategy.position_size > 0 and not na(entryAtr).',
  'Do not compute stopLossPrice at top level while flat when it depends on entryAtr or strategy.position_avg_price.',
  'Do not use close as a substitute for the actual entry price when calculating stop loss.',
  'Do not create entry_price := close or entryPrice := close unless the user explicitly requests signal-bar close as the entry-price basis.',
  'For entry-price-based stops, use strategy.position_avg_price after the position is open.',
  'Entry-time ATR may be stored as state, but calculate the stop price from strategy.position_avg_price, not from signal-bar close.',
  'For fixed percentage stop loss, calculate stopLossPrice while the position is open using strategy.position_avg_price, for example strategy.position_avg_price * 0.95 for a 5% long stop.',
  'Do not create entryPrice or entry_price from strategy.position_avg_price inside the entry block. Wait until the position is open and use strategy.position_avg_price directly for stop calculations.',
  'Fixed percentage stops do not need entry-time state variables unless the user explicitly requests them.',
  'Only create ATR variables, entryAtr, atrValue, or other ATR state when the user asks for an ATR stop, ATR filter, or ATR breakout.',
  'If the user does not ask for ATR, do not create entryAtr, atrValue, ta.atr, or ATR state.',
  'Do not reuse an ATR stop template for a percentage stop.',
  'Preserve oscillator threshold direction exactly. RSI above 60 means rsi > 60, or ta.crossover(rsi, 60) only when crossing above is requested.',
  'Do not use ta.crossunder(rsi, 60) for an overbought exit unless the user asks for falling back below 60.',
  'RSI crosses back above 30 means ta.crossover(rsi, 30); RSI crosses below a threshold means ta.crossunder.',
  'With overlay=true, do not plot RSI, Stochastic, MACD histogram, ADX, or other oscillators by default.',
  'Plot price indicators by default if helpful, but plot oscillators only when explicitly requested or when overlay=false is intended for a separate pane.',
  'Do not use color.color.*; use color=color.green, color=color.red, or another supported color.* value.',
  'Do not use plot.style_dashed in plot(); prefer supported styles such as plot.style_linebr where appropriate, or omit unsupported style arguments.',
  'For wording like "after setup, trigger" or "X state then Y", use state variables such as var bool setupActive.',
  'Do not directly require setupCondition and triggerCondition on the same bar when setup can contradict trigger.',
  'Prefer setting setupActive := true while flat on setup, using entryCondition = setupActive and triggerCondition, then resetting setupActive after entry or when invalidated.',
  'For wording such as 下回った場合, below, or less than, use a state condition such as close < ma or adx < threshold.',
  'Use ta.crossunder only when the wording explicitly says 下抜け, クロス, crosses below, or crossunder.',
  'Avoid representative ATR patterns that capture state with if strategy.position_size > 0 and na(entryAtr).',
  'Do not declare unused variables. Do not create ATR variables or state unless ATR is actually used.',
  'If plotting a stop line, guard it with position and na checks, for example plot(strategy.position_size > 0 and not na(entryAtr) ? stopLossPrice : na, style=plot.style_linebr).',
  'For stop loss or take profit, prefer strategy.exit(..., stop=...) or strategy.exit(..., limit=...).',
  'Avoid manual bar-based stops such as if low <= stopLossPrice then strategy.close(...) unless the user explicitly requests that behavior.',
  'Use strategy.close() for rule-based exits such as moving-average crossunder, dead cross, or close below moving average, not for ordinary stop loss or take profit orders.',
  'Avoid plotting volume or average volume on an overlay price chart unless the user explicitly requests it.',
  'Write self-contained Pine code with every variable declared before use; do not leave TODOs, placeholders, ellipses, or pseudo-code.',
  'Use ta.* built-ins for indicators and valid strategy.entry, strategy.close, or strategy.exit calls; do not invent Pine functions or parameters.',
  'Avoid repainting and future-data dependencies. Do not use lookahead_on, negative history references, or future bar assumptions.',
  'If request.security is required, use barmerge.lookahead_off and keep the request minimal; otherwise avoid cross-symbol or higher-timeframe data.',
  'Use explicit boolean entry and exit conditions and guard orders with strategy.position_size when appropriate.',
  'Respect target_market and target_timeframe context, but do not claim TradingView compile success.',
  'Do not include explanations, narrative notes, URLs, citations, web search results, raw prompt, raw response, endpoint, model, secret, token, credential, local path, stack trace, or profit guarantees.',
].join(' ');

function readBoundedPositiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function getLocalLlmPineTimeoutMs(): number {
  return readBoundedPositiveInteger(
    env.PINE_GENERATION_LOCAL_LLM_TIMEOUT_MS,
    LOCAL_LLM_PINE_TIMEOUT_MS_DEFAULT,
    LOCAL_LLM_PINE_TIMEOUT_MS_MIN,
    LOCAL_LLM_PINE_TIMEOUT_MS_MAX,
  );
}

function getLocalLlmRuleRewriteTimeoutMs(): number {
  return readBoundedPositiveInteger(
    env.RULE_REWRITE_LOCAL_LLM_TIMEOUT_MS,
    LOCAL_LLM_RULE_REWRITE_TIMEOUT_MS_DEFAULT,
    LOCAL_LLM_RULE_REWRITE_TIMEOUT_MS_MIN,
    LOCAL_LLM_RULE_REWRITE_TIMEOUT_MS_MAX,
  );
}

function buildPineGenerationUserPayload(context: PineGenerationContext): Record<string, unknown> {
  const normalizedStrategySpec =
    context.normalizedStrategySpec && isNormalizedStrategySpec(context.normalizedStrategySpec)
      ? context.normalizedStrategySpec
      : null;
  const specAvailable = Boolean(normalizedStrategySpec);
  const outputSchema = {
    generated_script: '<string>',
    warnings: ['<Japanese user-facing string>'],
    assumptions: ['<Japanese user-facing string>'],
    normalized_rule_json: '<object>',
  };

  if (context.repairRequest) {
    return {
      task: 'repair_pine_script',
      natural_language_spec: context.naturalLanguageSpec,
      normalized_rule_json: context.normalizedRuleJson,
      normalized_strategy_spec: normalizedStrategySpec,
      spec_available: specAvailable,
      spec_source: context.specSource ?? null,
      implementation_priority: specAvailable ? 'normalized_strategy_spec_first' : 'natural_language_rule',
      target_market: context.targetMarket,
      target_timeframe: context.targetTimeframe,
      repair_request: context.repairRequest,
      recurring_repair_note:
        context.repairRequest.attempt > 1
          ? 'This is a repeated repair attempt. If a listed issue is still present, apply repair_template exactly and avoid unrelated rewrites.'
          : null,
      previous_script: context.repairRequest.previousScript,
      output_schema: outputSchema,
    };
  }

  return {
    natural_language_spec: context.naturalLanguageSpec,
    normalized_rule_json: context.normalizedRuleJson,
    normalized_strategy_spec: normalizedStrategySpec,
    spec_available: specAvailable,
    spec_source: context.specSource ?? null,
    implementation_priority: specAvailable ? 'normalized_strategy_spec_first' : 'natural_language_rule',
    target_market: context.targetMarket,
    target_timeframe: context.targetTimeframe,
    regeneration_input: context.regenerationInput ?? null,
    repair_request: null,
    output_schema: outputSchema,
  };
}

function buildLocalLlmPineGenerationUserPayload(context: PineGenerationContext): Record<string, unknown> {
  const payload = buildPineGenerationUserPayload(context);
  delete payload.output_schema;
  payload.output_contract = 'pine_script_text_only';
  if (payload.repair_request && typeof payload.repair_request === 'object') {
    delete (payload.repair_request as Record<string, unknown>).output_schema;
  }
  return payload;
}

function buildDeterministicDailyOutput(
  context: DailySummaryContext,
  options: { modelName: string; promptVersion: string; titlePrefix: string },
): DailySummaryOutput {
  const insufficientContext =
    context.marketSnapshotCount === 0 || context.alertCount === 0 || context.referenceCount === 0;
  const confidence: 'high' | 'medium' | 'low' = insufficientContext
    ? 'low'
    : context.referenceCount >= 5
      ? 'high'
      : 'medium';
  const tone: 'risk_on' | 'risk_off' | 'neutral' =
    context.alertCount >= 5 ? 'risk_on' : context.alertCount === 0 ? 'neutral' : 'neutral';
  const dateText = context.date ?? 'latest';
  const slot =
    context.summaryType === 'latest'
      ? '\u6700\u65b0'
      : context.summaryType === 'morning'
        ? '\u671d'
        : '\u5915\u65b9';

  const title = `${options.titlePrefix}${slot}\u30b5\u30de\u30ea\u30fc (${dateText})`;
  const bodyMarkdown = [
    `## ${title}`,
    '',
    `- market_snapshots: ${context.marketSnapshotCount}\u4ef6`,
    `- alert_events: ${context.alertCount}\u4ef6`,
    `- external_references: ${context.referenceCount}\u4ef6`,
    insufficientContext
      ? '- \u5165\u529b\u6750\u6599\u304c\u4e0d\u8db3\u3057\u3066\u3044\u308b\u305f\u3081\u3001\u4fdd\u5b88\u7684\u306a\u8981\u7d04\u3067\u3059\u3002'
      : '- \u5165\u529b\u6750\u6599\u304c\u63c3\u3063\u3066\u304a\u308a\u3001\u5e02\u5834\u6982\u6cc1\u306e\u8981\u7d04\u3092\u8868\u793a\u3057\u3066\u3044\u307e\u3059\u3002',
  ].join('\n');

  return {
    title,
    bodyMarkdown,
    structuredJson: {
      schema_name: 'daily_summary',
      schema_version: '1.0',
      confidence,
      insufficient_context: insufficientContext,
      payload: {
        highlights: [
          {
            title: `${slot}\u306e\u89b3\u6e2c\u30b5\u30de\u30ea\u30fc`,
            summary: `snapshot ${context.marketSnapshotCount}\u4ef6 / alert ${context.alertCount}\u4ef6 / reference ${context.referenceCount}\u4ef6`,
            reason: insufficientContext
              ? '\u5165\u529b\u6750\u6599\u4e0d\u8db3\u306e\u305f\u3081\u4fdd\u5b88\u7684\u8981\u7d04'
              : '\u5165\u529b\u6750\u6599\u3092\u3082\u3068\u306b\u6982\u6cc1\u3092\u6574\u7406',
            confidence,
            reference_ids: [],
            symbol_ids: [],
          },
        ],
        watch_items: insufficientContext
          ? ['market_snapshots / alert_events / external_references \u306e\u4e0d\u8db3\u88dc\u5b8c']
          : ['\u4e3b\u8981\u30a4\u30d9\u30f3\u30c8\u3068\u76f4\u8fd1\u30a2\u30e9\u30fc\u30c8\u306e\u5909\u5316'],
        focus_symbols: [],
        market_context: {
          tone,
          summary: insufficientContext
            ? '\u5165\u529b\u6750\u6599\u304c\u4e0d\u8db3\u3057\u3066\u3044\u308b\u305f\u3081\u4fdd\u5b88\u7684\u306a\u6982\u6cc1\u3067\u3059\u3002'
            : '\u5165\u529b\u6750\u6599\u3092\u8e0f\u307e\u3048\u305f\u5e02\u5834\u6982\u6cc1\u3067\u3059\u3002',
        },
      },
    },
    modelName: options.modelName,
    promptVersion: options.promptVersion,
  };
}

function buildDeterministicSymbolOutput(
  context: SymbolThesisContext,
  options: { modelName: string; promptVersion: string; titlePrefix: string },
): SymbolThesisOutput {
  const hasReferences = context.referenceIds.length > 0;
  const hasSnapshot = !!context.snapshot;
  const insufficientContext = !hasReferences;
  const confidence: 'high' | 'medium' | 'low' = insufficientContext ? 'low' : hasReferences ? 'medium' : 'low';
  const symbolLabel = context.symbol.displayName ?? context.symbol.symbolCode ?? context.symbol.symbol;
  const title = `${options.titlePrefix}${symbolLabel} \u8ad6\u70b9\u30ab\u30fc\u30c9`;
  const snapshotText =
    context.snapshot && context.snapshot.lastPrice !== null
      ? `${context.snapshot.lastPrice} (${context.snapshot.changePercent ?? 0}%)`
      : '\u53d6\u5f97\u306a\u3057';

  return {
    title,
    bodyMarkdown: [
      `## ${title}`,
      '',
      `- \u9298\u67c4: ${symbolLabel}`,
      `- \u30b9\u30b3\u30fc\u30d7: ${context.scope}`,
      `- \u53c2\u7167\u4ef6\u6570: ${context.referenceIds.length}`,
      `- \u30b9\u30ca\u30c3\u30d7\u30b7\u30e7\u30c3\u30c8: ${snapshotText}`,
      `- \u30ce\u30fc\u30c8: ${context.latestNoteSummary ? context.latestNoteSummary.title : '\u306a\u3057'}`,
      insufficientContext
        ? '- \u30b3\u30f3\u30c6\u30ad\u30b9\u30c8: \u53c2\u7167\u60c5\u5831\u304c\u4e0d\u8db3\u3057\u3066\u304a\u308a\u3001snapshot / note \u4e2d\u5fc3\u306e\u4eee\u8aac\u3067\u3059'
        : '- \u30b3\u30f3\u30c6\u30ad\u30b9\u30c8: references / snapshot / note \u3092\u3082\u3068\u306b\u6574\u7406',
    ].join('\n'),
    structuredJson: {
      schema_name: 'symbol_thesis_summary',
      schema_version: '1.0',
      confidence,
      insufficient_context: insufficientContext,
      payload: {
        bullish_points: hasReferences
          ? context.references.slice(0, 2).map((reference) => ({
              text: `\u53c2\u7167\u60c5\u5831\u304b\u3089\u78ba\u8a8d\u3067\u304d\u308b\u524d\u5411\u304d\u6750\u6599: ${reference.title}`,
              reference_ids: [reference.id],
            }))
          : ['\u53c2\u7167\u60c5\u5831\u304c\u9650\u3089\u308c\u308b\u305f\u3081\u3001\u524d\u5411\u304d\u6750\u6599\u306e\u88cf\u53d6\u308a\u306f\u672a\u5341\u5206\u3067\u3059\u3002'],
        bearish_points:
          hasSnapshot &&
          context.snapshot !== null &&
          context.snapshot.changePercent !== null &&
          context.snapshot.changePercent < 0
            ? ['\u76f4\u8fd1\u682a\u4fa1\u304c\u4e0b\u843d\u3057\u3066\u304a\u308a\u3001\u77ed\u671f\u9700\u7d66\u306e\u5f31\u3055\u306b\u6ce8\u610f\u304c\u5fc5\u8981\u3067\u3059\u3002']
            : ['\u4e8b\u696d\u74b0\u5883\u3084\u5e02\u5834\u30bb\u30f3\u30c1\u30e1\u30f3\u30c8\u306e\u5909\u5316\u3092\u7d99\u7d9a\u76e3\u8996\u3057\u3066\u304f\u3060\u3055\u3044\u3002'],
        watch_kpis: ['\u58f2\u4e0a\u6210\u9577\u7387', '\u55b6\u696d\u5229\u76ca\u7387', '\u30ad\u30e3\u30c3\u30b7\u30e5\u30d5\u30ed\u30fc'],
        next_events: hasReferences
          ? context.references.slice(0, 2).map((reference) => ({
              label: reference.title,
              date: reference.publishedAt ?? null,
              reference_ids: [reference.id],
            }))
          : ['\u6b21\u56de\u6c7a\u7b97\u3084\u4e3b\u8981\u958b\u793a\u306e\u78ba\u8a8d'],
        invalidation_conditions: ['\u696d\u7e3e\u898b\u901a\u3057\u306e\u5927\u5e45\u4e0b\u65b9\u4fee\u6b63', '\u4e3b\u8981\u4e8b\u696d\u306e\u53ce\u76ca\u6027\u60aa\u5316'],
        overall_view: insufficientContext
          ? '\u53c2\u7167\u60c5\u5831\u304c\u4e0d\u8db3\u3057\u3066\u3044\u308b\u305f\u3081\u3001snapshot \u3068\u65e2\u5b58\u30ce\u30fc\u30c8\u3092\u4e2d\u5fc3\u306b\u3057\u305f\u6682\u5b9a\u8a55\u4fa1\u3067\u3059\u3002\u8ffd\u52a0\u306e\u958b\u793a\u3084\u30cb\u30e5\u30fc\u30b9\u3092\u78ba\u8a8d\u3057\u3066\u304b\u3089\u5224\u65ad\u3057\u3066\u304f\u3060\u3055\u3044\u3002'
          : '\u53c2\u7167\u60c5\u5831\u3092\u8e0f\u307e\u3048\u3064\u3064\u3001\u696d\u7e3e\u3068\u5e02\u5834\u53cd\u5fdc\u306e\u4e21\u9762\u304b\u3089\u7d99\u7d9a\u76e3\u8996\u3059\u3079\u304d\u9298\u67c4\u3067\u3059\u3002',
      },
    },
    modelName: options.modelName,
    promptVersion: options.promptVersion,
  };
}

function buildDeterministicComparisonOutput(
  context: ComparisonSummaryContext,
  options: { modelName: string; promptVersion: string; titlePrefix: string },
): ComparisonSummaryOutput {
  const symbolLabels = context.symbols.map((symbol) => symbol.displayName ?? symbol.symbolCode ?? symbol.symbol);
  const symbolMetricRows = Array.isArray((context.comparedMetricJson as any)?.symbol_metrics)
    ? ((context.comparedMetricJson as any).symbol_metrics as Array<Record<string, unknown>>)
    : [];
  const hasReferenceImbalance = symbolMetricRows.some((row) => {
    const count = row?.recent_reference_count;
    return typeof count === 'number' && count === 0;
  });
  const insufficientContext = symbolLabels.length < 2 || context.metrics.length === 0;
  const confidence: 'high' | 'medium' | 'low' = insufficientContext
    ? 'low'
    : hasReferenceImbalance
      ? 'medium'
      : context.references.length >= 2
        ? 'high'
        : 'medium';
  const title = `${options.titlePrefix}\u6bd4\u8f03\u30b5\u30de\u30ea\u30fc: ${symbolLabels.join(' vs ')}`;

  return {
    title,
    bodyMarkdown: [
      `## ${title}`,
      '',
      `- \u5bfe\u8c61: ${symbolLabels.join(', ')}`,
      `- \u6307\u6a19: ${context.metrics.join(', ')}`,
      `- \u53c2\u7167\u4ef6\u6570: ${context.references.length}`,
      insufficientContext
        ? '- \u30b3\u30f3\u30c6\u30ad\u30b9\u30c8: \u6bd4\u8f03\u6750\u6599\u304c\u4e0d\u8db3\u3057\u3066\u3044\u307e\u3059'
        : hasReferenceImbalance
          ? '- \u30b3\u30f3\u30c6\u30ad\u30b9\u30c8: \u7247\u5074\u306e\u53c2\u7167\u60c5\u5831\u304c\u5c11\u306a\u3044\u305f\u3081\u3001\u6bd4\u8f03\u306e\u78ba\u5ea6\u306f\u4e2d\u7a0b\u5ea6\u3067\u3059'
          : '- \u30b3\u30f3\u30c6\u30ad\u30b9\u30c8: \u6bd4\u8f03\u6750\u6599\u306f\u4e00\u5b9a\u6570\u3042\u308a\u307e\u3059',
    ].join('\n'),
    structuredJson: {
      schema_name: 'comparison_summary',
      schema_version: '1.0',
      confidence,
      insufficient_context: insufficientContext,
      payload: {
        key_differences: [
          context.metrics.length > 0
            ? `\u4e3b\u306a\u6bd4\u8f03\u8ef8: ${context.metrics.slice(0, 2).join(', ')}`
            : '\u6bd4\u8f03\u8ef8\u3092\u7279\u5b9a\u3059\u308b\u305f\u3081\u306e\u6307\u6a19\u304c\u4e0d\u8db3\u3057\u3066\u3044\u307e\u3059\u3002',
        ],
        risk_points: insufficientContext
          ? ['\u6bd4\u8f03\u6750\u6599\u304c\u4e0d\u8db3\u3057\u3066\u3044\u308b\u305f\u3081\u3001\u8ffd\u52a0\u306e\u958b\u793a\u3084\u30cb\u30e5\u30fc\u30b9\u3092\u78ba\u8a8d\u3057\u3066\u304b\u3089\u8a55\u4fa1\u3057\u3066\u304f\u3060\u3055\u3044\u3002']
          : hasReferenceImbalance
            ? ['\u7247\u5074\u306e\u53c2\u7167\u60c5\u5831\u304c\u5c11\u306a\u3044\u305f\u3081\u3001\u6750\u6599\u306e\u591a\u5be1\u304c\u7d50\u8ad6\u306b\u4e0e\u3048\u308b\u5f71\u97ff\u3078\u6ce8\u610f\u304c\u5fc5\u8981\u3067\u3059\u3002']
            : ['\u6750\u6599\u306e\u8cea\u3068\u5e02\u5834\u53cd\u5fdc\u306e\u5dee\u5206\u3092\u7d99\u7d9a\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002'],
        next_actions: ['\u6700\u65b0\u958b\u793a\u3068\u30cb\u30e5\u30fc\u30b9\u306e\u5dee\u5206\u3092\u78ba\u8a8d\u3059\u308b', '\u5404\u9298\u67c4\u306e\u30b9\u30ca\u30c3\u30d7\u30b7\u30e7\u30c3\u30c8\u3068\u8ad6\u70b9\u30ab\u30fc\u30c9\u306e\u6839\u62e0\u5dee\u3092\u898b\u76f4\u3059'],
        compared_symbols: context.symbols.map((symbol) => symbol.id),
        reference_ids: context.references.map((reference) => reference.id),
        overall_view: insufficientContext
          ? '\u6bd4\u8f03\u6750\u6599\u304c\u4e0d\u8db3\u3057\u3066\u3044\u308b\u305f\u3081\u3001\u78ba\u5ea6\u3092\u6291\u3048\u305f\u6682\u5b9a\u6bd4\u8f03\u3068\u3057\u3066\u6271\u3063\u3066\u304f\u3060\u3055\u3044\u3002'
          : hasReferenceImbalance
            ? '\u4e00\u65b9\u306e\u9298\u67c4\u306f\u53c2\u7167\u60c5\u5831\u304c\u5c11\u306a\u3044\u305f\u3081\u3001\u6bd4\u8f03\u7d50\u679c\u306f\u6682\u5b9a\u7684\u3067\u3059\u3002\u6750\u6599\u5dee\u3092\u8e0f\u307e\u3048\u3066\u8ffd\u52a0\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002'
            : '\u53c2\u7167\u60c5\u5831\u3068\u5e02\u5834\u30c7\u30fc\u30bf\u3092\u8e0f\u307e\u3048\u305f\u6bd4\u8f03\u7d50\u679c\u3067\u3059\u3002\u6750\u6599\u5dee\u3068\u4fa1\u683c\u53cd\u5fdc\u306e\u4e21\u9762\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
      },
    },
    modelName: options.modelName,
    promptVersion: options.promptVersion,
  };
}

function toSigned(value: number | null | undefined, digits = 2, unit = ''): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}${unit}`;
}

function formatNumberValue(value: number | null | undefined, digits = 2, unit = ''): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `${value.toFixed(digits)}${unit}`;
}

function sanitizeSummaryText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\r\n/g, '\n').replace(/\t/g, ' ').trim();
  if (!normalized) return '';
  const unsafePattern =
    /(https?:\/\/|file:\/\/|www\.|localhost|127\.0\.0\.1|::1|\/api\/|[a-z]:\\|\\|\/users\/|\/home\/|endpoint|model|secret|token|api[_-]?key|password|credential|stack trace|traceback|provider response|raw prompt|raw csv|raw import|raw pine)/i;
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !unsafePattern.test(line));
  return lines.join('\n').slice(0, maxLength).trim();
}

function sanitizeSummaryStringList(value: unknown, limit: number, maxLength = 220): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeSummaryText(item, maxLength))
    .filter(Boolean)
    .slice(0, limit);
}

function inferBacktestMetricKey(text: string): string {
  const normalized = text.toLowerCase();
  const candidateMatch = text.match(/候補\d+/);
  if (candidateMatch) return candidateMatch[0];
  if (/複数csv|csv比較|取込間|期間依存/.test(normalized)) {
    return 'csv_comparison';
  }
  if (/総取引数|取引回数|trade count|total trades|統計的信頼性|validation scope|期間延長|複数銘柄/.test(text) || normalized.includes('trade_count')) {
    return 'trade_count';
  }
  if (/profit factor|pf|損益比/.test(normalized) || /Profit Factor/.test(text)) {
    return 'profit_factor';
  }
  if (/win rate|勝率/.test(normalized)) {
    return 'win_rate';
  }
  if (/drawdown|dd|ドローダウン/.test(normalized) || /最大DD/.test(text)) {
    return 'max_drawdown';
  }
  if (/net profit|純利益/.test(normalized)) {
    return 'net_profit';
  }
  if (/entry|エントリー|trigger|filter|regime|地合い/.test(normalized)) {
    return 'entry';
  }
  if (/exit|利確|損切り|保有期間|time exit/.test(normalized)) {
    return 'exit';
  }
  if (/risk|stop|position|連敗/.test(normalized)) {
    return 'risk';
  }
  return `text:${text.replace(/\s+/g, ' ').trim().slice(0, 60)}`;
}

function dedupeSummaryTextsByMetricKey(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const key = inferBacktestMetricKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function sanitizeRuleRefinementCandidates(value: unknown, limit = 4): RuleRefinementCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): RuleRefinementCandidate | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const title = sanitizeSummaryText(row.title, 80);
      const targetArea = sanitizeSummaryText(row.target_area, 40) || 'filter';
      const rationale = sanitizeSummaryText(row.rationale, 180);
      const changeSummary = sanitizeSummaryText(row.change_summary, 180);
      const entryChange = sanitizeSummaryText(row.entry_change, 180) || null;
      const exitChange = sanitizeSummaryText(row.exit_change, 180) || null;
      const riskChange = sanitizeSummaryText(row.risk_change, 180) || null;
      const validationPlan = sanitizeSummaryText(row.validation_plan, 180);
      const effect = row.expected_metric_effect && typeof row.expected_metric_effect === 'object'
        ? row.expected_metric_effect as Record<string, unknown>
        : {};
      if (!title || !rationale || !changeSummary || (!entryChange && !exitChange && !riskChange)) {
        return null;
      }
      return {
        title,
        target_area: targetArea,
        rationale,
        change_summary: changeSummary,
        entry_change: clarifyRuleChangeText(entryChange),
        exit_change: clarifyRuleChangeText(exitChange),
        risk_change: clarifyRuleChangeText(riskChange),
        validation_plan: validationPlan || '同一条件でPF、勝率、最大DD、取引回数を比較する。',
        expected_metric_effect: {
          profit_factor: sanitizeSummaryText(effect.profit_factor, 100) || null,
          win_rate: sanitizeSummaryText(effect.win_rate, 100) || null,
          max_drawdown: sanitizeSummaryText(effect.max_drawdown, 100) || null,
          trade_count: sanitizeSummaryText(effect.trade_count, 100) || null,
        },
      };
    })
    .filter((item): item is RuleRefinementCandidate => item !== null)
    .slice(0, limit);
}

function clarifyRuleChangeText(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/、または/g, '。代替案として')
    .replace(/または/g, 'または別versionで')
    .replace(/かつ/g, 'かつ')
    .trim();
}

type StrategyIndicatorHint = {
  key: 'macd' | 'rsi' | 'moving_average';
  label: string;
  rationaleContext: string;
  changeContext: string;
  entryCondition: string;
};

function detectStrategyIndicatorHint(context: BacktestSummaryContext): StrategyIndicatorHint | null {
  const source = `${context.title ?? ''} ${context.strategy?.naturalLanguageRule ?? ''}`.toLowerCase();
  if (/macd|ｍａｃｄ|ヒストグラム|histogram/.test(source)) {
    return {
      key: 'macd',
      label: 'MACDヒストグラム',
      rationaleContext: '元戦略のMACDヒストグラム条件は維持しつつ、低品質なentryを減らす追加filterが必要です。',
      changeContext: 'MACDヒストグラムの増加条件を維持したうえで、trend / volume filter を追加する。',
      entryCondition:
        '元条件: MACDヒストグラムがプラス圏である。追加確認: MACDヒストグラムが前日比で増加している。追加filter: 終値が25日SMAを上回る。追加filter: 出来高が20日平均以上である。',
    };
  }
  if (/rsi|ＲＳＩ/.test(source)) {
    return {
      key: 'rsi',
      label: 'RSI',
      rationaleContext: '元戦略のRSI反転条件は維持しつつ、ノイズの大きいentryを減らす追加filterが必要です。',
      changeContext: 'RSI の反転条件を維持したうえで、trend / volume filter を追加する。',
      entryCondition:
        '元条件: RSI の反転条件を維持する。追加filter: 終値が主要移動平均を上回る。追加filter: 出来高が直近平均以上である。',
    };
  }
  if (/sma|移動平均|moving average|crossover|クロス|ゴールデンクロス|デッドクロス/.test(source)) {
    return {
      key: 'moving_average',
      label: '移動平均',
      rationaleContext: '元戦略の移動平均条件は維持しつつ、トレンド継続を確認する追加filterが必要です。',
      changeContext: '移動平均 crossover 条件を維持したうえで、volume / trend continuation filter を追加する。',
      entryCondition:
        '元条件: 移動平均 crossover 条件を維持する。追加filter: 出来高が直近平均以上である。追加filter: 終値が短期移動平均を上回って推移している。',
    };
  }
  return null;
}

function buildRuleRefinementCandidates(
  context: BacktestSummaryContext,
  formatted: { winRate: string | null; profitFactor: string | null; maxDrawdown: string | null; netProfit: string | null },
): RuleRefinementCandidate[] {
  const metrics = context.metrics;
  const indicatorHint = detectStrategyIndicatorHint(context);
  const candidates: RuleRefinementCandidate[] = [];
  const pushCandidate = (candidate: RuleRefinementCandidate) => {
    if (candidates.some((item) => item.target_area === candidate.target_area || item.title === candidate.title)) return;
    candidates.push(candidate);
  };

  if (metrics && (metrics.winRate ?? 100) < 45) {
    pushCandidate({
      title: 'entry filter を強化する',
      target_area: 'entry',
      rationale: indicatorHint
        ? `勝率${formatted.winRate ?? '-'}で、entry trigger のノイズが大きい可能性があります。${indicatorHint.rationaleContext}`
        : `勝率${formatted.winRate ?? '-'}で、entry trigger のノイズが大きい可能性があります。`,
      change_summary: indicatorHint
        ? indicatorHint.changeContext
        : 'entry に trend / volume / market regime の確認条件を1つ追加し、低品質なシグナルを減らす。',
      entry_change:
        indicatorHint
          ? `entry 条件を次のように明確化する。${indicatorHint.entryCondition} 代替version: 上位足トレンドが上向きの場合だけを別versionで検証する。`
          : 'entry 条件を次のように明確化する。必須条件: 終値が主要移動平均を上回る。追加filter: 出来高が直近平均以上である。代替version: 上位足トレンドが上向きの場合だけを別versionで検証する。',
      exit_change: null,
      risk_change: null,
      validation_plan: 'entry filter 追加前後で勝率、PF、取引回数を比較し、取引回数が過度に減らないか確認する。',
      expected_metric_effect: {
        profit_factor: '低品質 entry を減らして改善する可能性がある。',
        win_rate: 'entry 精度の改善を狙う。',
        max_drawdown: null,
        trade_count: 'filter 追加により減少する可能性がある。',
      },
    });
  }

  if (metrics && (metrics.profitFactor ?? 2) <= 1) {
    pushCandidate({
      title: 'exit / time exit を見直す',
      target_area: 'exit',
      rationale: `Profit Factor${formatted.profitFactor ?? '-'}で、損益比または損失継続の制御が弱い可能性があります。`,
      change_summary: 'profit taking、stop、time exit を明文化し、損失が伸びる局面と利益を伸ばす局面を分ける。',
      entry_change: null,
      exit_change:
        '一定本数経過して含み益が伸びない場合は time exit し、反対シグナルまたは移動平均割れで exit する条件にする。',
      risk_change: 'stop loss と take profit の基準を entry price または ATR に対して明確化する。',
      validation_plan: 'time exit あり / なし、stop 幅、利確条件を分けてPFと平均損益を比較する。',
      expected_metric_effect: {
        profit_factor: '損益比の改善を狙う。',
        win_rate: null,
        max_drawdown: '損失継続の抑制に寄与する可能性がある。',
        trade_count: null,
      },
    });
  }

  if (metrics && (metrics.maxDrawdown ?? 0) <= -15) {
    pushCandidate({
      title: 'risk management を明確化する',
      target_area: 'risk',
      rationale: `最大ドローダウン${formatted.maxDrawdown ?? '-'}で、下振れ局面の制御が不足している可能性があります。`,
      change_summary: 'stop loss、position risk、連敗時停止または time exit を自然言語ルール本文に入れる。',
      entry_change: null,
      exit_change: '含み損が一定幅を超えた場合、または保有期間が上限を超えた場合に exit する。',
      risk_change: '1 trade の損失上限を固定率または ATR 倍率で定義し、連敗時は新規 entry を停止する条件を検証する。',
      validation_plan: '最大DD、PF、取引回数を比較し、risk 制約が過剰に取引機会を削らないか確認する。',
      expected_metric_effect: {
        profit_factor: null,
        win_rate: null,
        max_drawdown: '下振れ抑制を狙う。',
        trade_count: 'risk 制約により減少する可能性がある。',
      },
    });
  }

  if (metrics && (metrics.totalTrades ?? 999) < 30) {
    if (candidates.length === 0) {
      pushCandidate({
        title: 'entry 条件を最小限だけ緩和する',
        target_area: 'entry',
        rationale: `取引回数${metrics.totalTrades ?? '-'}件で、strategy logic の過剰な絞り込みを別versionで確認する必要があります。`,
        change_summary: 'entry 条件のうち1つだけを緩和し、検証範囲拡張とは分けて取引回数への影響を見る。',
        entry_change: 'entry filter が複数ある場合、最も補助的なfilterを1つだけ外したversionを作る。主要triggerは維持する。',
        exit_change: null,
        risk_change: null,
        validation_plan: '候補1のentry条件緩和版を作り、PF、勝率、最大DD、取引回数を元versionと比較する。',
        expected_metric_effect: {
          profit_factor: '条件緩和で悪化しないか確認する。',
          win_rate: 'entry精度の低下幅を確認する。',
          max_drawdown: '下振れが増えないか確認する。',
          trade_count: '取引回数の増加を確認する。',
        },
      });
    }
  }

  if (metrics && (metrics.netProfit ?? 1) <= 0 && candidates.length < 3) {
    pushCandidate({
      title: 'market regime filter を追加する',
      target_area: 'filter',
      rationale: `純利益${formatted.netProfit ?? '-'}で、戦略が苦手な地合いに巻き込まれている可能性があります。`,
      change_summary: indicatorHint
        ? `${indicatorHint.label} 条件を維持したうえで、上位足トレンドまたはボラティリティ regime を確認し、苦手局面で entry を抑制する。`
        : '上位足トレンドとボラティリティ regime を確認し、苦手局面で entry を抑制する。',
      entry_change: indicatorHint
        ? `元条件: ${indicatorHint.label} の主要entry条件を維持する。追加filter: 上位足の移動平均方向が上向きである。追加filter: ADX が事前定義した閾値以上である。代替version: ボラティリティ水準filterをADXの代わりに使う。`
        : 'entry 前の regime filter を追加する。条件1: 上位足の移動平均方向が上向きである。条件2: ADX が事前定義した閾値以上である。代替version: ボラティリティ水準filterをADXの代わりに使う。',
      exit_change: null,
      risk_change: null,
      validation_plan: 'regime filter 有無で純利益、PF、最大DD、取引回数を比較する。',
      expected_metric_effect: {
        profit_factor: '苦手局面の回避で改善する可能性がある。',
        win_rate: '地合いによる負け trade の減少を狙う。',
        max_drawdown: 'トレンド崩れ局面のDD抑制を狙う。',
        trade_count: 'filter 追加により減少する可能性がある。',
      },
    });
  }

  if (candidates.length === 0) {
    pushCandidate({
      title: 'entry / exit / risk を1要素ずつ比較する',
      target_area: 'filter',
      rationale: '主要指標だけでは単一の原因を断定できないため、変更箇所を分けて検証する必要があります。',
      change_summary: 'entry filter、exit trigger、stop / time exit のうち1つだけを変えた version を作る。',
      entry_change: 'entry trigger に trend または出来高確認を1つ追加する案を検証する。',
      exit_change: 'exit trigger と time exit の有無を分けて検証する。',
      risk_change: 'stop loss の基準を固定率または ATR 倍率で明確にする。',
      validation_plan: '1変更1versionでPF、勝率、最大DD、取引回数を比較する。',
      expected_metric_effect: {
        profit_factor: '変更箇所ごとの影響を切り分ける。',
        win_rate: 'entry 精度の影響を確認する。',
        max_drawdown: 'risk 条件の影響を確認する。',
        trade_count: 'filter による減少幅を確認する。',
      },
    });
  }

  return candidates.slice(0, 4);
}

function buildCandidateValidationActions(candidates: RuleRefinementCandidate[]): string[] {
  return candidates.slice(0, 4).map((candidate, index) => {
    const metricFocus = [
      candidate.expected_metric_effect.profit_factor ? 'PF' : '',
      candidate.expected_metric_effect.win_rate ? '勝率' : '',
      candidate.expected_metric_effect.max_drawdown ? '最大DD' : '',
      candidate.expected_metric_effect.trade_count ? '取引回数' : '',
    ].filter(Boolean);
    const metrics = metricFocus.length > 0 ? metricFocus.join(' / ') : 'PF / 勝率 / 最大DD / 取引回数';
    return `候補${index + 1}「${candidate.title}」のversionを作り、${metrics}を元versionと比較する。`;
  });
}

function renderRuleRefinementCandidateLines(candidates: RuleRefinementCandidate[]): string[] {
  return candidates.flatMap((candidate, index) => [
    `- 候補${index + 1}: ${candidate.title}（${candidate.target_area}）`,
    `  - 理由: ${candidate.rationale}`,
    `  - 変更概要: ${candidate.change_summary}`,
    ...(candidate.entry_change ? [`  - entry: ${candidate.entry_change}`] : []),
    ...(candidate.exit_change ? [`  - exit: ${candidate.exit_change}`] : []),
    ...(candidate.risk_change ? [`  - risk: ${candidate.risk_change}`] : []),
    `  - 検証: ${candidate.validation_plan}`,
  ]);
}

function extractTextParts(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextParts(item));
  }
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (typeof row.text === 'string') {
      const trimmed = row.text.trim();
      if (trimmed) return [trimmed];
    }
    if (typeof row.content === 'string') {
      const trimmed = row.content.trim();
      if (trimmed) return [trimmed];
    }
    if (Array.isArray(row.content)) {
      return extractTextParts(row.content);
    }
  }
  return [];
}

function sanitizeReferenceIds(value: unknown, allowedReferenceIds: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const allowed = new Set(allowedReferenceIds);
  return value
    .filter((item): item is string => typeof item === 'string' && allowed.has(item))
    .slice(0, 5);
}

function sanitizeThesisPointArray(value: unknown[], allowedReferenceIds: readonly string[], limit: number) {
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object' && typeof (item as any).text === 'string') {
        return {
          text: (item as any).text,
          reference_ids: sanitizeReferenceIds((item as any).reference_ids, allowedReferenceIds),
        };
      }
      return null;
    })
    .filter((item): item is string | { text: string; reference_ids: string[] } => item !== null)
    .slice(0, limit);
}

function sanitizeNextEventArray(value: unknown[], allowedReferenceIds: readonly string[], limit: number) {
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object' && typeof (item as any).label === 'string') {
        const date = typeof (item as any).date === 'string' || (item as any).date === null ? (item as any).date : null;
        const referenceIds = sanitizeReferenceIds((item as any).reference_ids, allowedReferenceIds);
        return {
          label: (item as any).label,
          ...(date !== undefined ? { date } : {}),
          ...(referenceIds.length > 0 ? { reference_ids: referenceIds } : {}),
        };
      }
      return null;
    })
    .filter((item): item is string | { label: string; date?: string | null; reference_ids?: string[] } => item !== null)
    .slice(0, limit);
}

function extractLlmContent(data: any): string {
  const candidates = [
    data?.choices?.[0]?.message?.content,
    data?.choices?.[0]?.text,
    data?.message?.content,
    data?.response,
    data?.output_text,
  ];
  for (const candidate of candidates) {
    const parts = extractTextParts(candidate);
    if (parts.length > 0) {
      return parts.join('\n').trim();
    }
  }
  return '';
}

function average(values: Array<number | null | undefined>, digits = 2): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, value) => acc + value, 0);
  return Number((sum / valid.length).toFixed(digits));
}

function getRecordNumber(record: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function getRecordString(record: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function renderBacktestBodyMarkdown(
  title: string,
  conclusion: string,
  strengths: string[],
  risks: string[],
  nextActions: string[],
  keyMetrics: BacktestSummaryOutput['structuredJson']['payload']['key_metrics'],
  overallView: string,
  ruleRefinementCandidates: RuleRefinementCandidate[] = [],
): string {
  const metricLines = [
    ['total trades', keyMetrics.total_trades],
    ['win rate', keyMetrics.win_rate],
    ['profit factor', keyMetrics.profit_factor],
    ['max drawdown', keyMetrics.max_drawdown],
    ['net profit', keyMetrics.net_profit],
  ]
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([label, value]) => `- ${label}: ${value}`);
  const safeStrengths = strengths.length > 0 ? strengths : ['評価できる強みを断定するには追加検証が必要です。'];
  const safeRisks = risks.length > 0 ? risks : ['主要リスクを断定するには材料が不足しています。'];
  const safeNextActions = nextActions.length > 0 ? nextActions : ['追加CSVまたはinternal backtest resultの取込後に再評価してください。'];
  const improvementHypotheses =
    ruleRefinementCandidates.length > 0
      ? ruleRefinementCandidates
          .slice(0, 4)
          .map((item) => `- ${item.title}: ${item.rationale} ${item.change_summary}`)
      : safeRisks.slice(0, 4).map((item) => `- ${item} entry / exit / risk 条件のどこに起因するかを切り分けてください。`);
  const refinementLines = ruleRefinementCandidates.length > 0
    ? renderRuleRefinementCandidateLines(ruleRefinementCandidates)
    : [overallView];
  return [
    `## ${title}`,
    '',
    '### 概要',
    conclusion,
    '',
    '### 主要メトリクス',
    ...(metricLines.length > 0 ? metricLines : ['- 主要メトリクスは不足しています。']),
    '',
    '### 成績評価',
    ...safeStrengths.map((item) => `- ${item}`),
    '',
    '### 問題の切り分け',
    ...safeRisks.map((item) => `- ${item}`),
    '',
    '### 改善仮説',
    ...improvementHypotheses,
    '',
    '### 次に試す検証案',
    ...safeNextActions.map((item) => `- ${item}`),
    '',
    '### 自然言語ルール改善案',
    ...refinementLines,
    '',
    '### Pine修正依頼に入れるべきではない注意',
    '- entry / exit / risk management など strategy logic 自体の変更は、revision_request ではなく自然言語ルール本文に反映してください。',
    '- revision_request は compile error、validation note、TradingView 上の挙動調整など、既存 Pine の意図を維持した実装修正に限定してください。',
    '',
    '### 注意点',
    '- この総評は投資助言ではなく、Pine化して再検証するための改善候補です。',
    '- CSV全文、取込本文、生成依頼本文、provider応答本文などの生データは含めていません。',
  ].join('\n');
}

function buildDeterministicBacktestOutput(
  context: BacktestSummaryContext,
  options: { modelName: string; promptVersion: string; titlePrefix: string },
): BacktestSummaryOutput {
  const hasMetrics = !!context.metrics;
  const hasParsedImports = context.importParsedSummaries.length > 0;
  const internalContext = context.internalBacktestContext;
  const internalMetrics = internalContext?.metrics ?? null;
  const hasInternalBacktestContext = !!internalContext && (!!internalContext.resultSummary || !!internalMetrics);
  const insufficientContext = !hasMetrics && !hasParsedImports && !hasInternalBacktestContext;
  const confidence: 'high' | 'medium' | 'low' = insufficientContext
    ? 'low'
    : hasMetrics || hasInternalBacktestContext
      ? 'high'
      : 'medium';
  const title = `${options.titlePrefix}Backtest Review: ${context.title}`;
  const keyMetrics = {
    total_trades: context.metrics?.totalTrades ?? null,
    win_rate: context.metrics?.winRate ?? null,
    profit_factor: context.metrics?.profitFactor ?? null,
    max_drawdown: context.metrics?.maxDrawdown ?? null,
    net_profit: context.metrics?.netProfit ?? null,
  };
  const netProfitText = toSigned(context.metrics?.netProfit, 0);
  const profitFactorText = formatNumberValue(context.metrics?.profitFactor, 2);
  const winRateText = formatNumberValue(context.metrics?.winRate, 2, '%');
  const maxDrawdownText = formatNumberValue(context.metrics?.maxDrawdown, 2);
  const internalSummaryKind = internalContext?.summaryKind ?? getRecordString(internalContext?.resultSummary, ['kind', 'summary_kind']);
  const internalPeriodFrom = getRecordString(internalContext?.period, ['from', 'start', 'period_from']);
  const internalPeriodTo = getRecordString(internalContext?.period, ['to', 'end', 'period_to']);
  const internalBarCount = getRecordNumber(internalMetrics, ['bar_count', 'bars', 'sample_count']);
  const internalPriceChange = getRecordNumber(internalMetrics, ['price_change_percent', 'priceChangePercent']);
  const internalRange = getRecordNumber(internalMetrics, ['range_percent', 'rangePercent']);

  const tradeSummary = context.tradeSummary ?? {
    parsedImportCount: context.importParsedSummaries.length,
    averageTotalTrades: average(context.importParsedSummaries.map((item) => item.totalTrades), 1),
    averageWinRate: average(context.importParsedSummaries.map((item) => item.winRate), 2),
    averageProfitFactor: average(context.importParsedSummaries.map((item) => item.profitFactor), 2),
    averageNetProfit: average(context.importParsedSummaries.map((item) => item.netProfit), 0),
    bestNetProfit: (() => {
      const values = context.importParsedSummaries
        .map((item) => item.netProfit)
        .filter((value): value is number => typeof value === 'number');
      return values.length > 0 ? Math.max(...values) : null;
    })(),
    worstNetProfit: (() => {
      const values = context.importParsedSummaries
        .map((item) => item.netProfit)
        .filter((value): value is number => typeof value === 'number');
      return values.length > 0 ? Math.min(...values) : null;
    })(),
  };
  const hasMultipleParsedImports =
    (tradeSummary.parsedImportCount ?? 0) > 1 || context.importParsedSummaries.length > 1;
  const hasAnyParsedImport =
    (tradeSummary.parsedImportCount ?? 0) > 0 || context.importParsedSummaries.length > 0;

  const conclusion = insufficientContext
    ? '入力素材が不足しているため、総評は暫定です。最低1件の解析済みCSVまたはinternal backtest resultを追加して再評価してください。'
    : hasInternalBacktestContext && !hasMetrics
      ? `internal_backtest result_summary をもとにした暫定評価です。${internalSummaryKind ? `summary kind は ${internalSummaryKind} です。` : 'CSV import 指標とは別文脈で確認してください。'}`
      : context.metrics && context.metrics.netProfit !== null && context.metrics.profitFactor !== null
      ? context.metrics.netProfit > 0 && context.metrics.profitFactor > 1
        ? `純利益${netProfitText ?? '-'}、Profit Factor${profitFactorText ?? '-'}で、現時点の成績は前向きです。`
        : `純利益${netProfitText ?? '-'}、Profit Factor${profitFactorText ?? '-'}で、成績の安定性には追加検証が必要です。`
      : '主要指標は一部取得済みですが、追加の検証素材を加えて判断精度を上げる段階です。';

  const strengths = [
    hasInternalBacktestContext ? `historical internal_backtest report snapshot ${internalContext?.internalBacktestExecutionId ?? '-'} の result summary を参照しています。` : '',
    hasInternalBacktestContext && internalPeriodFrom && internalPeriodTo
      ? `対象期間は ${internalPeriodFrom} から ${internalPeriodTo} です。`
      : '',
    hasInternalBacktestContext && internalBarCount !== null ? `内部検証のサンプル数は ${internalBarCount} 件です。` : '',
    hasInternalBacktestContext && internalPriceChange !== null
      ? `期間内の価格変化率は ${toSigned(internalPriceChange, 2, '%') ?? '-'} です。`
      : '',
    hasMetrics && (context.metrics?.netProfit ?? 0) > 0 && netProfitText
      ? `純利益は${netProfitText}で、定量的な優位を確認できます。`
      : '',
    hasMetrics && (context.metrics?.profitFactor ?? 0) > 1 && profitFactorText
      ? `Profit Factorは${profitFactorText}で、損益比は1を上回っています。`
      : '',
    hasMetrics && (context.metrics?.winRate ?? 0) >= 45 && winRateText
      ? `勝率は${winRateText}で、再現性の初期判断材料があります。`
      : '',
    context.comparisonDiff?.netProfitDiff !== null && context.comparisonDiff?.netProfitDiff !== undefined
      ? `最新取込は前回比で純利益${toSigned(context.comparisonDiff.netProfitDiff, 0) ?? '-'}です。`
      : '',
    tradeSummary.parsedImportCount > 1
      ? `解析済み${tradeSummary.parsedImportCount}件から傾向比較が可能です。`
      : '',
  ].filter(Boolean);

  const ruleRefinementCandidates = buildRuleRefinementCandidates(context, {
    winRate: winRateText,
    profitFactor: profitFactorText,
    maxDrawdown: maxDrawdownText,
    netProfit: netProfitText,
  });
  const candidateValidationActions = buildCandidateValidationActions(ruleRefinementCandidates);
  const diagnosis = dedupeSummaryTextsByMetricKey([
    hasMetrics && (context.metrics?.totalTrades ?? 0) < 30
      ? `総取引数は${context.metrics?.totalTrades ?? '-'}件で、統計的信頼性はまだ低いです。strategy logic の変更と、検証期間延長・複数銘柄検証のような validation scope 拡張を分けてください。`
      : '',
    hasMetrics && (context.metrics?.profitFactor ?? 0) <= 1
      ? 'Profit Factor が1以下で、損益比が弱い可能性があります。exit、stop、profit taking の設計を見直してください。'
      : '',
    hasMetrics && (context.metrics?.winRate ?? 100) < 45
      ? `勝率は${winRateText ?? '-'}で、entry filter、market regime、trigger 条件の切り分けが必要です。`
      : '',
    hasMetrics && (context.metrics?.maxDrawdown ?? 0) <= -15
      ? `最大ドローダウンは${maxDrawdownText ?? '-'}で、stop loss、position management、time exit の見直しが必要です。`
      : '',
    hasMetrics && (context.metrics?.netProfit ?? 0) <= 0
      ? `純利益は${netProfitText ?? '-'}で、entry 条件と exit 条件のどちらが悪化要因かを別versionで比較してください。`
      : '',
    context.strategy?.naturalLanguageRule
      ? '現行の自然言語ルールについて、entry / exit / risk management のどこが成績悪化に寄与しているかを分けて検証してください。'
      : '',
  ].filter(Boolean), 6);

  const risks = dedupeSummaryTextsByMetricKey([
    hasInternalBacktestContext ? 'internal_backtest report は BacktestImport を持たないため、CSVの取引明細・parsed summaryとは比較軸が異なります。' : '',
    hasInternalBacktestContext && internalRange !== null && internalRange > 30
      ? `期間内レンジは ${toSigned(internalRange, 2, '%') ?? '-'} で、ボラティリティ依存を確認してください。`
      : '',
    hasMultipleParsedImports && tradeSummary.worstNetProfit !== null
      ? `取込間の最悪純利益は${toSigned(tradeSummary.worstNetProfit, 0) ?? '-'}で、期間依存の振れ幅があります。`
      : '',
    hasAnyParsedImport && !hasMultipleParsedImports
      ? '複数CSV比較がないため、期間依存の評価は保留です。'
      : '',
    insufficientContext ? '解析済み素材が不足しており、結論の信頼度は低いです。' : '',
  ].filter(Boolean), 4);

  const nextActions = dedupeSummaryTextsByMetricKey([
    ...candidateValidationActions,
    hasInternalBacktestContext ? 'artifact pointer と historical internal report snapshot を確認し、report 化済みの前提条件を記録してください。' : '',
    hasInternalBacktestContext ? '必要に応じて同じ strategy version のTradingView CSV import reportと比較してください。' : '',
    `同条件で期間を分割し、PF・最大DD・勝率の再現性を確認してください。`,
    context.strategy?.naturalLanguageRule ? '自然言語ルールの entry / exit / risk 条件を1つずつ変更し、どの変更がPF・勝率・DDに効くかを比較してください。' : '',
    hasMetrics && (context.metrics?.totalTrades ?? 0) < 30 ? 'validation scope として、検証期間延長・複数銘柄検証・相場局面別検証を行い、strategy logic 変更とは別にサンプル不足を確認してください。' : '',
    hasMetrics && (context.metrics?.profitFactor ?? 0) <= 1 ? '損切り幅、利確条件、保有期間、time exit を変えた version を作り、損益比の改善を確認してください。' : '',
    hasMetrics && (context.metrics?.winRate ?? 100) < 45 ? 'entry trigger に出来高、トレンド、地合い filter を追加または緩和した version を比較してください。' : '',
    hasMetrics && (context.metrics?.maxDrawdown ?? 0) <= -15 ? '最大ドローダウン抑制のため、stop loss、position sizing、連敗時停止条件の検証案を作ってください。' : '',
    context.comparisonDiff ? '最新取込と前回取込の差分要因（期間/銘柄条件）を切り分けてください。' : '',
    tradeSummary.parsedImportCount < 2 ? 'もう1件以上CSVを追加して比較可能な状態にしてください。' : '',
  ].filter(Boolean), 7);

  const combinedRisks = dedupeSummaryTextsByMetricKey([...diagnosis, ...risks], 7);
  const improvementMemo = [
    'この検証結果をもとに、自然言語ルール本文で entry / exit / risk 条件を分けて改善してください。',
    ruleRefinementCandidates.length > 0
      ? `優先候補: ${ruleRefinementCandidates
          .slice(0, 3)
          .map((item) => `${item.title}（${item.change_summary}）`)
          .join(' / ')}`
      : '',
    diagnosis.length > 0 ? `優先して切り分ける問題: ${diagnosis.slice(0, 3).join(' / ')}` : '',
    nextActions.length > 0 ? `次に試す検証案: ${nextActions.slice(0, 3).join(' / ')}` : '',
    context.strategy?.naturalLanguageRule ? '自然言語ルール本文を修正する場合は、変更点を1つずつ分け、PF・勝率・最大DD・取引回数への影響を比較してください。Pine 修正依頼は compile error や実装上の調整に限定してください。' : '',
  ].filter(Boolean).join('\n');

  return {
    title,
    bodyMarkdown: renderBacktestBodyMarkdown(
      title,
      conclusion,
      strengths,
      combinedRisks,
      nextActions,
      keyMetrics,
      improvementMemo,
      ruleRefinementCandidates,
    ),
    structuredJson: {
      schema_name: 'backtest_review_summary',
      schema_version: '1.0',
      confidence,
      insufficient_context: insufficientContext,
      payload: {
        conclusion,
        strengths: strengths.length > 0 ? strengths : ['定量評価に使える入力が限定的です。'],
        risks: combinedRisks.length > 0 ? combinedRisks : ['主要リスクを断定するには材料が不足しています。'],
        next_actions: nextActions.length > 0 ? nextActions : ['追加CSVまたはinternal backtest resultの取込後に再評価してください。'],
        key_metrics: keyMetrics,
        overall_view: improvementMemo,
        rule_refinement_candidates: ruleRefinementCandidates,
      },
    },
    modelName: options.modelName,
    promptVersion: options.promptVersion,
  };
}

const REWRITE_UNSAFE_TEXT_PATTERN =
  /(https?:\/\/|file:\/\/|www\.|localhost|127\.0\.0\.1|::1|\/api\/|[a-z]:\\|\\|\/users\/|\/home\/|endpoint|model|secret|token|api[_-]?key|password|credential|stack trace|traceback|provider response|raw prompt)/i;

function sanitizeRewriteText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\r\n/g, '\n').replace(/\t/g, ' ').trim();
  if (!normalized) return '';
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !REWRITE_UNSAFE_TEXT_PATTERN.test(line));
  return lines.join('\n').slice(0, maxLength).trim();
}

function sanitizeRewriteStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeRewriteText(item, 220))
    .filter(Boolean)
    .slice(0, limit);
}

function buildRuleRewriteCandidateLines(candidates: RuleRefinementCandidate[]): string[] {
  return candidates.slice(0, 3).flatMap((candidate, index) => {
    const lines = [
      `${index + 1}. ${candidate.title}: ${candidate.change_summary}`,
      candidate.entry_change ? `entry: ${candidate.entry_change}` : '',
      candidate.exit_change ? `exit: ${candidate.exit_change}` : '',
      candidate.risk_change ? `risk: ${candidate.risk_change}` : '',
      `validation: ${candidate.validation_plan}`,
    ].filter(Boolean);
    return lines;
  });
}

function buildDeterministicNaturalLanguageRuleRewriteOutput(
  context: NaturalLanguageRuleRewriteContext,
  options: { modelName: string; promptVersion: string },
): NaturalLanguageRuleRewriteOutput {
  const memo = sanitizeRewriteText(context.improvementMemo, 1200);
  const nextActions = sanitizeRewriteStringList(context.aiSummary?.nextActions, 5);
  const risks = sanitizeRewriteStringList(context.aiSummary?.risks, 4);
  const overallView = sanitizeRewriteText(context.aiSummary?.overallView, 700);
  const candidates = Array.isArray(context.aiSummary?.ruleRefinementCandidates)
    ? context.aiSummary.ruleRefinementCandidates
    : [];
  const candidateLines = buildRuleRewriteCandidateLines(candidates);
  const metricLines = [
    context.metrics?.totalTrades !== null && context.metrics?.totalTrades !== undefined
      ? `取引回数は ${context.metrics.totalTrades} 件として、少なすぎる場合は条件緩和または検証期間延長を検討する。`
      : '',
    context.metrics?.profitFactor !== null && context.metrics?.profitFactor !== undefined
      ? `Profit Factor ${context.metrics.profitFactor} を踏まえ、利確、損切り、保有期間の設計を明確にする。`
      : '',
    context.metrics?.winRate !== null && context.metrics?.winRate !== undefined
      ? `勝率 ${context.metrics.winRate} を踏まえ、entry filter と market regime 条件を測定可能にする。`
      : '',
    context.metrics?.maxDrawdown !== null && context.metrics?.maxDrawdown !== undefined
      ? `最大ドローダウン ${context.metrics.maxDrawdown} を踏まえ、stop loss、position risk、time exit を定義する。`
      : '',
    context.metrics?.periodFrom || context.metrics?.periodTo
      ? `検証期間 ${context.metrics.periodFrom ?? '-'} から ${context.metrics.periodTo ?? '-'} の結果を過剰最適化しない。`
      : '',
  ].filter(Boolean);
  const improvementInputs = [
    ...candidateLines,
    ...metricLines,
    ...nextActions,
    overallView,
    ...risks.map((risk) => `リスク観点: ${risk}`),
    memo,
  ].filter(Boolean).slice(0, 10);

  const lines = [
    `対象市場: ${sanitizeRewriteText(context.market, 40) || '未指定'}`,
    `時間足: ${sanitizeRewriteText(context.timeframe, 40) || '未指定'}`,
    '前提: long-only の検証候補として、次の Pine 生成に使える単一の最新自然言語ルール本文にする。',
    '',
    '戦略定義:',
    '現行の自然言語ルールをベースに、検証結果で弱かった entry / exit / risk management を見直した最新版として定義する。',
    '',
    'entry / exit / risk 条件:',
    ...(improvementInputs.length > 0
      ? improvementInputs.map((line) => `- ${line}`)
      : ['- entry trigger、exit trigger、stop loss、time exit を1つずつ比較できる形にする。']),
    '',
    'Pine化のための明確化:',
    '- entry trigger、exit trigger、stop loss、time exit、indicator period、threshold を可能な限り具体化する。',
    '- AI総評や改善履歴を追記せず、現在の strategy version を定義する単一の最新ルール本文として扱う。',
    '- 投資助言ではなく、TradingView で再検証するための条件定義に留める。',
  ];

  return {
    naturalLanguageRule: lines.join('\n').trim(),
    warnings: [
      'deterministic fallback により、保存済みルールと検証メモから安全な draft を作成しました。',
      '保存や Pine 生成は自動実行されません。',
    ],
    assumptions: ['raw CSV、raw import text、生成依頼本文、provider応答本文は使用していません。'],
    modelName: options.modelName,
    promptVersion: options.promptVersion,
  };
}

function buildDeterministicPineOutput(
  context: PineGenerationContext,
  options: { modelName: string; promptVersion: string },
): PineGenerationOutput {
  const generated = generatePineDeterministic({
    naturalLanguageSpec: context.naturalLanguageSpec,
    normalizedRuleJson: context.normalizedRuleJson,
    targetMarket: context.targetMarket,
    targetTimeframe: context.targetTimeframe,
  });

  const warnings = [...generated.warnings];
  if (context.regenerationInput) {
    warnings.push('既存Pineスクリプトの修正入力を反映しました。');
  }

  return {
    ...generated,
    warnings,
    modelName: options.modelName,
    promptVersion: options.promptVersion,
  };
}

const PINE_REVIEW_ISSUE_CODES: ReadonlySet<string> = new Set([
  'pine_syntax_risk',
  'unsupported_color_alias',
  'unsupported_color_namespace',
  'unsupported_plot_style',
  'unsupported_function_alias',
  'dmi_property_access',
  'unsupported_dmi_property_access',
  'unsupported_adx_function',
  'block_local_variable_scope_risk',
  'na_type_inference_risk',
  'uninitialized_stop_loss_price',
  'stop_order_guard_risk',
  'setup_trigger_state_risk',
  'entry_guard_risk',
  'below_vs_crossunder_mismatch',
  'oscillator_plot_overlay_risk',
  'overlay_oscillator_plot',
  'entry_price_reference_risk',
  'stop_order_semantics_risk',
  'unused_state_variable',
  'narrative_comment',
  'long_only_violation',
  'setup_trigger_same_bar',
  'entry_atr_na_capture',
  'donchian_current_bar_self_reference',
  'entry_time_atr_not_persisted',
  'other',
]);

function createPineReviewResultFromIssues(issues: PineReviewIssue[]): PineReviewResult {
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

function normalizePineReviewResult(value: unknown): PineReviewResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('pine_review_invalid_response');
  }
  const row = value as Record<string, unknown>;
  if (row.schema_name !== 'pine_review_result' || row.schema_version !== '1.0') {
    throw new Error('pine_review_invalid_response');
  }
  if (row.status !== 'pass' && row.status !== 'needs_repair') {
    throw new Error('pine_review_invalid_response');
  }
  if (!Array.isArray(row.issues)) {
    throw new Error('pine_review_invalid_response');
  }
  const issues = row.issues
    .map((item): PineReviewIssue | null => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
      const issue = item as Record<string, unknown>;
      if (typeof issue.code !== 'string' || !PINE_REVIEW_ISSUE_CODES.has(issue.code)) return null;
      const severity =
        issue.severity === 'error' || issue.severity === 'warning' || issue.severity === 'info'
          ? issue.severity
          : null;
      if (!severity) return null;
      const message = typeof issue.message === 'string' && issue.message.trim() ? issue.message.trim() : issue.code;
      const repairHint =
        typeof issue.repair_hint === 'string' && issue.repair_hint.trim() ? issue.repair_hint.trim() : message;
      return {
        code: issue.code as PineReviewIssueCode,
        severity,
        message,
        repair_hint: repairHint,
        repairable: typeof issue.repairable === 'boolean' ? issue.repairable : severity === 'error',
      };
    })
    .filter((issue): issue is PineReviewIssue => issue !== null)
    .slice(0, 16);

  return createPineReviewResultFromIssues(issues);
}

class StubHomeAiProvider implements HomeAiProvider {
  readonly providerType: HomeAiProviderType = 'stub';
  private readonly adapter = new MockAiAdapter();

  async generateAlertSummary(context: AlertSummaryContext): Promise<AlertSummaryOutput> {
    return this.adapter.generateAlertSummary(context);
  }

  async generateDailySummary(context: DailySummaryContext): Promise<DailySummaryOutput> {
    return buildDeterministicDailyOutput(context, {
      modelName: 'stub-daily-v1',
      promptVersion: 'v1.0.0-daily-stub',
      titlePrefix: '[Stub] ',
    });
  }

  async generateSymbolThesisSummary(context: SymbolThesisContext): Promise<SymbolThesisOutput> {
    return buildDeterministicSymbolOutput(context, {
      modelName: 'stub-symbol-v1',
      promptVersion: 'v1.0.0-symbol-stub',
      titlePrefix: '[Stub] ',
    });
  }

  async generateComparisonSummary(context: ComparisonSummaryContext): Promise<ComparisonSummaryOutput> {
    return buildDeterministicComparisonOutput(context, {
      modelName: 'stub-compare-v1',
      promptVersion: 'v1.0.0-compare-stub',
      titlePrefix: '[Stub] ',
    });
  }

  async generateBacktestSummary(context: BacktestSummaryContext): Promise<BacktestSummaryOutput> {
    return buildDeterministicBacktestOutput(context, {
      modelName: 'stub-backtest-v1',
      promptVersion: 'v1.0.0-backtest-stub',
      titlePrefix: '[Stub] ',
    });
  }

  async rewriteNaturalLanguageRuleDraft(
    context: NaturalLanguageRuleRewriteContext,
  ): Promise<NaturalLanguageRuleRewriteOutput> {
    return buildDeterministicNaturalLanguageRuleRewriteOutput(context, {
      modelName: 'stub-rule-rewrite-v1',
      promptVersion: 'v1.0.0-rule-rewrite-stub',
    });
  }

  async normalizeStrategySpec(context: StrategySpecNormalizationContext): Promise<StrategySpecNormalizationOutput> {
    const normalizedSpec = buildNormalizedStrategySpec({
      id: context.strategyVersionId,
      naturalLanguageRule: context.naturalLanguageRule,
      market: context.market,
      timeframe: context.timeframe,
    });
    return {
      normalizedSpec,
      warnings: normalizedSpec.warnings,
      assumptions: normalizedSpec.assumptions,
      modelName: 'stub-strategy-spec-v1',
      promptVersion: 'v1.0.0-strategy-spec-stub',
    };
  }

  async generatePineScript(context: PineGenerationContext): Promise<PineGenerationOutput> {
    return buildDeterministicPineOutput(context, {
      modelName: 'stub-pine-v1',
      promptVersion: 'v1.0.0-pine-stub',
    });
  }

  async reviewPineScript(context: PineReviewContext): Promise<PineReviewResult> {
    return reviewGeneratedPineScriptDeterministic(context.generatedScript);
  }
}

class LocalLlmHomeAiProvider implements HomeAiProvider {
  readonly providerType: HomeAiProviderType = 'local_llm';
  private readonly alertAdapter = new LocalLlmAdapter();
  private readonly endpoint = (env.LOCAL_LLM_ENDPOINT ?? 'http://localhost:11434').replace(/\/$/, '');
  private readonly modelName = env.PRIMARY_LOCAL_MODEL;

  async generateAlertSummary(context: AlertSummaryContext): Promise<AlertSummaryOutput> {
    return this.alertAdapter.generateAlertSummary(context);
  }

  private sanitizeJsonContent(content: string): string {
    return content.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  }

  private extractJsonObjectCandidates(content: string): string[] {
    const sanitized = this.sanitizeJsonContent(content);
    const candidates: string[] = [];
    if (sanitized.startsWith('{') && sanitized.endsWith('}')) {
      candidates.push(sanitized);
    }

    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < sanitized.length; index += 1) {
      const char = sanitized[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        if (depth === 0) {
          start = index;
        }
        depth += 1;
        continue;
      }

      if (char === '}') {
        if (depth === 0) {
          continue;
        }
        depth -= 1;
        if (depth === 0 && start >= 0) {
          const candidate = sanitized.slice(start, index + 1).trim();
          if (!candidates.includes(candidate)) {
            candidates.push(candidate);
          }
          start = -1;
        }
      }
    }

    return candidates;
  }

  private hasUsableGeneratedScript(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed !== '<string>' && trimmed !== 'string' && !/^<[^>]+>$/.test(trimmed);
  }

  private extractRawPineScript(content: string): string | null {
    const candidates: string[] = [];
    const fencedBlockPattern = /```(?:pine|pinescript|pine-script|tradingview)?\s*([\s\S]*?)```/gi;
    let fencedMatch: RegExpExecArray | null;
    while ((fencedMatch = fencedBlockPattern.exec(content)) !== null) {
      candidates.push(fencedMatch[1] ?? '');
    }
    candidates.push(content);

    for (const candidate of candidates) {
      const lines = candidate.split(/\r?\n/);
      const startIndex = lines.findIndex((line) => line.trim().startsWith('//@version='));
      if (startIndex < 0) {
        continue;
      }
      const script = lines.slice(startIndex).join('\n').trim();
      if (/^\/\/@version=\d+/m.test(script) && /\b(strategy|indicator)\s*\(/i.test(script)) {
        return script;
      }
    }

    return null;
  }

  private normalizeFinishReason(payload: any): string | null {
    const raw = payload?.done_reason ?? payload?.finish_reason ?? payload?.doneReason ?? null;
    if (typeof raw !== 'string') {
      return null;
    }
    const normalized = raw.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private logSummaryChatResult(params: {
    level: 'warn' | 'error';
    taskType: Exclude<LocalLlmTaskType, 'pine_generation'>;
    endpoint: string;
    think: boolean;
    finishReason: string | null;
    hasContent: boolean;
    hasThinking: boolean;
  }): void {
    const payload = {
      event: 'local_llm_summary_call',
      task_type: params.taskType,
      model: this.modelName,
      endpoint: params.endpoint,
      think: params.think,
      finish_reason: params.finishReason,
      has_content: params.hasContent,
      has_thinking: params.hasThinking,
    };
    const line = JSON.stringify(payload);
    if (params.level === 'error') {
      console.error(line);
      return;
    }
    console.warn(line);
  }

  private buildSummaryOutputError(params: {
    taskType: Exclude<LocalLlmTaskType, 'pine_generation'>;
    endpoint: string;
    think: boolean;
    finishReason: string | null;
    hasContent: boolean;
    hasThinking: boolean;
    detail: string;
  }): Error {
    return new Error(
      [
        `local_llm ${params.taskType} returned invalid output: ${params.detail}`,
        `task_type=${params.taskType}`,
        `model=${this.modelName}`,
        `endpoint=${params.endpoint}`,
        `think=${params.think}`,
        `finish_reason=${params.finishReason ?? 'null'}`,
        `content_present=${params.hasContent}`,
        `thinking_present=${params.hasThinking}`,
      ].join(' | '),
    );
  }

  private async callOllamaSummaryChat(options: LocalLlmSummaryChatOptions): Promise<string> {
    const endpointPath = '/api/chat';
    const endpoint = `${this.endpoint}${endpointPath}`;
    const think = options.think ?? false;
    const maxOutputTokens = options.maxOutputTokens ?? LOCAL_LLM_SUMMARY_MAX_OUTPUT_TOKENS;
    const timeoutMs = options.timeoutMs ?? 60_000;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userPrompt },
        ],
        stream: false,
        think,
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: maxOutputTokens,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `local_llm ${options.taskType} failed: HTTP ${response.status} ${body.slice(0, 200)} | task_type=${options.taskType} | model=${this.modelName} | endpoint=${endpointPath} | think=${think}`,
      );
    }

    const data: any = await response.json();
    const finishReason = this.normalizeFinishReason(data);
    const messageContent = typeof data?.message?.content === 'string' ? data.message.content.trim() : '';
    const thinkingContent = typeof data?.message?.thinking === 'string' ? data.message.thinking.trim() : '';
    const hasContent = messageContent.length > 0;
    const hasThinking = thinkingContent.length > 0;

    if (!hasContent) {
      this.logSummaryChatResult({
        level: 'error',
        taskType: options.taskType,
        endpoint: endpointPath,
        think,
        finishReason,
        hasContent,
        hasThinking,
      });
      throw this.buildSummaryOutputError({
        taskType: options.taskType,
        endpoint: endpointPath,
        think,
        finishReason,
        hasContent,
        hasThinking,
        detail: finishReason === 'length' ? 'empty content with finish_reason=length' : 'empty content',
      });
    }

    if (finishReason === 'length') {
      this.logSummaryChatResult({
        level: 'warn',
        taskType: options.taskType,
        endpoint: endpointPath,
        think,
        finishReason,
        hasContent,
        hasThinking,
      });
    }

    return messageContent;
  }

  async generateDailySummary(context: DailySummaryContext): Promise<DailySummaryOutput> {
    const systemPrompt = [
      'You are a Japanese market-summary assistant for the home screen.',
      'Use only the provided market snapshots, alerts, and references.',
      'If context is limited, say so explicitly and stay conservative.',
      'Do not invent missing facts. Return strict JSON only.',
    ].join(' ');

    const userPrompt = [
      `summary_type: ${context.summaryType}`,
      `date: ${context.date ?? 'latest'}`,
      `market_snapshot_count: ${context.marketSnapshotCount}`,
      `alert_count: ${context.alertCount}`,
      `reference_count: ${context.referenceCount}`,
      '',
      '以下の JSON を返してください:',
      JSON.stringify(
        {
          title: '<string>',
          highlights: [{ title: '<string>', summary: '<string>', reason: '<string>', confidence: 'low|medium|high' }],
          watch_items: ['<string>'],
          market_context: { tone: 'risk_on|risk_off|neutral', summary: '<string>' },
        },
        null,
        2,
      ),
    ].join('\n');

    const content = await this.callOllamaSummaryChat({
      taskType: 'daily_summary',
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: LOCAL_LLM_SUMMARY_MAX_OUTPUT_TOKENS,
      think: false,
    });

    let parsed: any = null;
    try {
      parsed = JSON.parse(this.sanitizeJsonContent(content));
    } catch {
      return buildDeterministicDailyOutput(context, {
        modelName: this.modelName,
        promptVersion: 'v1.0.0-daily-local',
        titlePrefix: '[LocalLLM] ',
      });
    }

    const deterministic = buildDeterministicDailyOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-daily-local',
      titlePrefix: '[LocalLLM] ',
    });
    const highlightsFromModel = Array.isArray(parsed?.highlights) ? parsed.highlights : [];
    const watchItemsFromModel = Array.isArray(parsed?.watch_items) ? parsed.watch_items : [];
    const marketContextFromModel = parsed?.market_context;

    return {
      ...deterministic,
      title: typeof parsed?.title === 'string' && parsed.title.trim() !== '' ? parsed.title : deterministic.title,
      bodyMarkdown: [
        `## ${typeof parsed?.title === 'string' && parsed.title.trim() !== '' ? parsed.title : deterministic.title}`,
        '',
        `- market_snapshots: ${context.marketSnapshotCount}件`,
        `- alert_events: ${context.alertCount}件`,
        `- external_references: ${context.referenceCount}件`,
      ].join('\n'),
      structuredJson: {
        ...deterministic.structuredJson,
        payload: {
          ...deterministic.structuredJson.payload,
          highlights:
            highlightsFromModel.length > 0
              ? highlightsFromModel.slice(0, 3).map((item: any) => ({
                  title: typeof item?.title === 'string' ? item.title : '観測サマリ',
                  summary: typeof item?.summary === 'string' ? item.summary : '要約なし',
                  reason: typeof item?.reason === 'string' ? item.reason : '理由なし',
                  confidence:
                    item?.confidence === 'high' || item?.confidence === 'medium' || item?.confidence === 'low'
                      ? item.confidence
                      : deterministic.structuredJson.confidence,
                  reference_ids: [],
                  symbol_ids: [],
                }))
              : deterministic.structuredJson.payload.highlights,
          watch_items:
            watchItemsFromModel.length > 0
              ? watchItemsFromModel.filter((item: any) => typeof item === 'string').slice(0, 5)
              : deterministic.structuredJson.payload.watch_items,
          market_context:
            marketContextFromModel && typeof marketContextFromModel === 'object'
              ? {
                  tone:
                    marketContextFromModel.tone === 'risk_on' ||
                    marketContextFromModel.tone === 'risk_off' ||
                    marketContextFromModel.tone === 'neutral'
                      ? marketContextFromModel.tone
                      : deterministic.structuredJson.payload.market_context.tone,
                  summary:
                    typeof marketContextFromModel.summary === 'string'
                      ? marketContextFromModel.summary
                      : deterministic.structuredJson.payload.market_context.summary,
                }
              : deterministic.structuredJson.payload.market_context,
        },
      },
    };
  }

  async generateSymbolThesisSummary(context: SymbolThesisContext): Promise<SymbolThesisOutput> {
    const deterministic = buildDeterministicSymbolOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-symbol-local',
      titlePrefix: '[LocalLLM] ',
    });

    const content = await this.callOllamaSummaryChat({
      taskType: 'symbol_thesis_summary',
      systemPrompt: [
        'You are a Japanese equity-analysis assistant.',
        'Use only the provided references, snapshot, and note.',
        'Do not give direct buy or sell recommendations.',
        'When reference_count is 0, explicitly say that reference context is limited.',
        'Prefer cautious language such as possibility, scenario, and watchpoint.',
        'Return strict JSON only.',
      ].join(' '),
      userPrompt: JSON.stringify({
        scope: context.scope,
        symbol: context.symbol,
        reference_count: context.referenceIds.length,
        insufficient_context: context.referenceIds.length === 0,
        reference_ids: context.referenceIds,
        references: context.references.slice(0, 5),
        snapshot: context.snapshot,
        latest_note_summary: context.latestNoteSummary,
        output_schema: {
          title: '<string>',
          bullish_points: ['<string or {text,reference_ids}>'],
          bearish_points: ['<string or {text,reference_ids}>'],
          watch_kpis: ['<string>'],
          next_events: ['<string or {label,date,reference_ids}>'],
          invalidation_conditions: ['<string>'],
          overall_view: '<string>',
        },
        output_language: 'ja',
      }),
      temperature: 0.2,
      maxOutputTokens: LOCAL_LLM_SUMMARY_MAX_OUTPUT_TOKENS,
      think: false,
    });

    let parsed: any = null;
    try {
      parsed = JSON.parse(this.sanitizeJsonContent(content));
    } catch {
      return deterministic;
    }

    return {
      ...deterministic,
      title: typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title : deterministic.title,
      bodyMarkdown:
        typeof parsed?.body_markdown === 'string' && parsed.body_markdown.trim()
          ? parsed.body_markdown
          : deterministic.bodyMarkdown,
      structuredJson: {
        ...deterministic.structuredJson,
        payload: {
          bullish_points: Array.isArray(parsed?.bullish_points)
            ? sanitizeThesisPointArray(parsed.bullish_points, context.referenceIds, 5)
            : deterministic.structuredJson.payload.bullish_points,
          bearish_points: Array.isArray(parsed?.bearish_points)
            ? sanitizeThesisPointArray(parsed.bearish_points, context.referenceIds, 5)
            : deterministic.structuredJson.payload.bearish_points,
          watch_kpis: Array.isArray(parsed?.watch_kpis)
            ? parsed.watch_kpis.filter((item: unknown) => typeof item === 'string').slice(0, 6)
            : deterministic.structuredJson.payload.watch_kpis,
          next_events: Array.isArray(parsed?.next_events)
            ? sanitizeNextEventArray(parsed.next_events, context.referenceIds, 4)
            : deterministic.structuredJson.payload.next_events,
          invalidation_conditions: Array.isArray(parsed?.invalidation_conditions)
            ? parsed.invalidation_conditions.filter((item: unknown) => typeof item === 'string').slice(0, 5)
            : deterministic.structuredJson.payload.invalidation_conditions,
          overall_view:
            typeof parsed?.overall_view === 'string' && parsed.overall_view.trim()
              ? parsed.overall_view
              : deterministic.structuredJson.payload.overall_view,
        },
      },
    };
  }

  async generateComparisonSummary(context: ComparisonSummaryContext): Promise<ComparisonSummaryOutput> {
    const deterministic = buildDeterministicComparisonOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-compare-local',
      titlePrefix: '[LocalLLM] ',
    });

    const content = await this.callOllamaSummaryChat({
      taskType: 'comparison_summary',
      systemPrompt: [
        'You are a Japanese comparison-analysis assistant.',
        'Use only compared_metric_json and provided references.',
        'If one side has fewer references, explicitly mention that limitation.',
        'Do not give direct buy or sell recommendations.',
        'Organize the output as differences, risks, and next checks.',
        'Return strict JSON only.',
      ].join(' '),
      userPrompt: JSON.stringify({
        comparison_id: context.comparisonId,
        symbols: context.symbols,
        metrics: context.metrics,
        compared_metric_json: context.comparedMetricJson,
        reference_count: context.references.length,
        references: context.references.slice(0, 8),
        output_schema: {
          title: '<string>',
          body_markdown: '<string>',
          key_differences: ['<string>'],
          risk_points: ['<string>'],
          next_actions: ['<string>'],
          overall_view: '<string>',
        },
        output_language: 'ja',
      }),
      temperature: 0.2,
      maxOutputTokens: LOCAL_LLM_SUMMARY_MAX_OUTPUT_TOKENS,
      think: false,
    });

    let parsed: any = null;
    try {
      parsed = JSON.parse(this.sanitizeJsonContent(content));
    } catch {
      return deterministic;
    }

    return {
      ...deterministic,
      title: typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title : deterministic.title,
      bodyMarkdown:
        typeof parsed?.body_markdown === 'string' && parsed.body_markdown.trim()
          ? parsed.body_markdown
          : deterministic.bodyMarkdown,
      structuredJson: {
        ...deterministic.structuredJson,
        payload: {
          ...deterministic.structuredJson.payload,
          key_differences: Array.isArray(parsed?.key_differences)
            ? parsed.key_differences.filter((item: unknown) => typeof item === 'string').slice(0, 5)
            : deterministic.structuredJson.payload.key_differences,
          risk_points: Array.isArray(parsed?.risk_points)
            ? parsed.risk_points.filter((item: unknown) => typeof item === 'string').slice(0, 5)
            : deterministic.structuredJson.payload.risk_points,
          next_actions: Array.isArray(parsed?.next_actions)
            ? parsed.next_actions.filter((item: unknown) => typeof item === 'string').slice(0, 5)
            : deterministic.structuredJson.payload.next_actions,
          overall_view:
            typeof parsed?.overall_view === 'string' && parsed.overall_view.trim()
              ? parsed.overall_view
              : deterministic.structuredJson.payload.overall_view,
        },
      },
    };
  }

  async generateBacktestSummary(context: BacktestSummaryContext): Promise<BacktestSummaryOutput> {
    const deterministic = buildDeterministicBacktestOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-backtest-local',
      titlePrefix: '[LocalLLM] ',
    });

    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: [
              'You are a Japanese backtest-review assistant.',
              'Interpret numeric inputs in natural language and organize the output for strategy refinement, not just performance review.',
              'Keep JSON schema v1.0 compatible. body_markdown must include these Japanese sections: 概要, 主要メトリクス, 成績評価, 問題の切り分け, 改善仮説, 自然言語ルール改善案, Pine修正依頼に入れるべきではない注意, 次に試す検証案, 注意点.',
              'When trade count is low, separate validation-scope actions such as longer periods or multi-symbol checks from strategy-logic changes such as condition relaxation.',
              'When PF, win rate, max drawdown, or net profit are weak, connect them to entry, exit, stop loss, profit taking, position management, time exit, or market-regime filters.',
              'Avoid repeating the same metric issue across diagnosis and risks. Mention each metric issue once in concern_points.',
              'Put concrete refinement and retest actions in next_checks. Put natural-language-rule improvement notes in overall_view. Do not frame strategy logic changes as revision_request drafts.',
              'Make next_checks correspond to rule_refinement_candidates when possible, using candidate numbers such as candidate 1 entry filter comparison.',
              'Return rule_refinement_candidates separately from next_checks. next_checks are validation work; rule_refinement_candidates are changes to consider for the natural language rule.',
              'Each rule_refinement_candidate must include title, target_area, rationale, change_summary, entry_change, exit_change, risk_change, validation_plan, and expected_metric_effect. At least one of entry_change, exit_change, or risk_change must be concrete and measurable. Do not use abstract text such as just review, compare, or consider.',
              'Avoid ambiguous combined logic such as A and B, or C. Use explicit required conditions, alternative versions, or bullet-like structure in entry_change, exit_change, and risk_change.',
              'Prefer Pine-feasible conditions such as indicator periods, thresholds, stop loss, time exit, volume filter, trend filter, or market-regime filter.',
              'If a strategy natural language rule exists, mention whether entry, exit, or risk management should be reviewed. Do not quote full generated Pine.',
              'Do not include raw CSV, raw import text, raw prompt, provider response, endpoint, model value, secret, token, local path, or stack trace.',
              'Do not overstate quality from a short favorable period when long-term metrics disagree.',
              'Do not give direct buy or sell recommendations; write as backtest improvement hypotheses.',
              'Return strict JSON only.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              backtest_id: context.backtestId,
              title: context.title,
              market: context.market,
              timeframe: context.timeframe,
              execution_source: context.executionSource,
              status: context.status,
              metrics: context.metrics,
              trade_summary: context.tradeSummary,
              import_files: context.importFiles.slice(0, 10),
              import_parsed_summaries: context.importParsedSummaries.slice(0, 3),
              comparison_diff: context.comparisonDiff,
              report_context_type: context.internalBacktestContext ? 'internal_backtest' : 'csv_import',
              internal_backtest_context: context.internalBacktestContext
                ? {
                    execution_source: context.internalBacktestContext.executionSource,
                    internal_backtest_execution_id: context.internalBacktestContext.internalBacktestExecutionId,
                    summary_kind: context.internalBacktestContext.summaryKind,
                    period: context.internalBacktestContext.period,
                    metrics: context.internalBacktestContext.metrics,
                    artifact_pointer: context.internalBacktestContext.artifactPointer,
                  }
                : null,
              strategy: context.strategy,
              output_schema: {
                title: '<string>',
                conclusion: '<string>',
                good_points: ['<string>'],
                concern_points: ['<string>'],
                next_checks: ['<string>'],
                rule_refinement_candidates: [
                  {
                    title: '<string>',
                    target_area: '<entry|exit|risk|filter|time_exit|validation_scope>',
                    rationale: '<string>',
                    change_summary: '<string>',
                    entry_change: '<string|null>',
                    exit_change: '<string|null>',
                    risk_change: '<string|null>',
                    validation_plan: '<string>',
                    expected_metric_effect: {
                      profit_factor: '<string|null>',
                      win_rate: '<string|null>',
                      max_drawdown: '<string|null>',
                      trade_count: '<string|null>',
                    },
                  },
                ],
                body_markdown: '<markdown with required natural-language-rule improvement sections>',
                overall_view: '<natural language rule improvement memo>',
              },
            }),
          },
        ],
        stream: false,
        think: false,
        options: {
          temperature: 0.2,
          num_predict: LOCAL_LLM_SUMMARY_MAX_OUTPUT_TOKENS,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`local_llm backtest summary failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const finishReason = this.normalizeFinishReason(data);
    const thinkingContent = typeof data?.message?.thinking === 'string' ? data.message.thinking.trim() : '';
    const content = typeof data?.message?.content === 'string' ? data.message.content.trim() : '';
    if (!content) {
      const hasThinking = thinkingContent.length > 0;
      this.logSummaryChatResult({
        level: 'error',
        taskType: 'backtest_summary',
        endpoint: '/api/chat',
        think: false,
        finishReason,
        hasContent: false,
        hasThinking,
      });
      throw this.buildSummaryOutputError({
        taskType: 'backtest_summary',
        endpoint: '/api/chat',
        think: false,
        finishReason,
        hasContent: false,
        hasThinking,
        detail: finishReason === 'length' ? 'empty content with finish_reason=length' : 'empty content',
      });
    }
    if (finishReason === 'length') {
      this.logSummaryChatResult({
        level: 'warn',
        taskType: 'backtest_summary',
        endpoint: '/api/chat',
        think: false,
        finishReason,
        hasContent: true,
        hasThinking: thinkingContent.length > 0,
      });
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(this.sanitizeJsonContent(content));
    } catch {
      return deterministic;
    }

    const conclusion = sanitizeSummaryText(parsed?.conclusion, 500) || deterministic.structuredJson.payload.conclusion;
    const strengths = sanitizeSummaryStringList(parsed?.good_points, 5);
    const effectiveStrengths = strengths.length > 0 ? strengths : deterministic.structuredJson.payload.strengths;
    const risks = sanitizeSummaryStringList(parsed?.concern_points, 5);
    const title = sanitizeSummaryText(parsed?.title, 160) || deterministic.title;
    const overallView = sanitizeSummaryText(parsed?.overall_view, 900) || deterministic.structuredJson.payload.overall_view;
    const ruleRefinementCandidates = sanitizeRuleRefinementCandidates(parsed?.rule_refinement_candidates, 4);
    const effectiveRuleRefinementCandidates =
      ruleRefinementCandidates.length > 0
        ? ruleRefinementCandidates
        : deterministic.structuredJson.payload.rule_refinement_candidates ?? [];
    const effectiveRisks = dedupeSummaryTextsByMetricKey(
      risks.length > 0 ? risks : deterministic.structuredJson.payload.risks,
      7,
    );
    const nextActions = sanitizeSummaryStringList(parsed?.next_checks, 5);
    const effectiveNextActions = dedupeSummaryTextsByMetricKey(
      [
        ...buildCandidateValidationActions(effectiveRuleRefinementCandidates),
        ...(nextActions.length > 0 ? nextActions : deterministic.structuredJson.payload.next_actions),
      ],
      7,
    );
    const bodyMarkdown = renderBacktestBodyMarkdown(
      title,
      conclusion,
      effectiveStrengths,
      effectiveRisks,
      effectiveNextActions,
      deterministic.structuredJson.payload.key_metrics,
      overallView,
      effectiveRuleRefinementCandidates,
    );

    return {
      ...deterministic,
      title,
      bodyMarkdown,
      structuredJson: {
        ...deterministic.structuredJson,
        payload: {
          ...deterministic.structuredJson.payload,
          conclusion,
          strengths: effectiveStrengths,
          risks: effectiveRisks,
          next_actions: effectiveNextActions,
          overall_view: overallView,
          rule_refinement_candidates: effectiveRuleRefinementCandidates,
        },
      },
    };
  }

  async rewriteNaturalLanguageRuleDraft(
    context: NaturalLanguageRuleRewriteContext,
  ): Promise<NaturalLanguageRuleRewriteOutput> {
    const deterministic = buildDeterministicNaturalLanguageRuleRewriteOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-rule-rewrite-local',
    });

    const content = await this.callOllamaSummaryChat({
      taskType: 'natural_language_rule_rewrite',
      systemPrompt: [
        'You are a Japanese strategy-rule rewrite assistant.',
        'Return strict JSON only with natural_language_rule, warnings, and assumptions.',
        'The natural_language_rule must be a single current strategy definition for the next Pine generation.',
        'The natural_language_rule must materially differ from saved_natural_language_rule by incorporating the improvement memo or backtest findings; do not return the saved rule unchanged.',
        'If ai_summary_context.ruleRefinementCandidates exists, select one or combine compatible candidates and rewrite the rule around concrete entry, exit, or risk changes.',
        'Do not keep the saved rule and append the candidate list; produce one clean latest rule body.',
        'Do not append improvement history, AI summary quotes, or explanatory review notes to the rule.',
        'Make entry, exit, risk management, indicator periods, thresholds, stop loss, and time exit measurable where possible.',
        'Respect market and timeframe context, avoid overfitting, and do not give investment advice.',
        'Do not include raw CSV, raw import text, raw prompt, provider response, endpoint, model value, secret, token, local path, stack trace, URLs, citations, or full generated Pine.',
        'Output Japanese text. Do not include markdown fences.',
      ].join(' '),
      userPrompt: JSON.stringify({
        strategy_version_id: context.strategyVersionId,
        source_backtest_id: context.sourceBacktestId,
        market: context.market,
        timeframe: context.timeframe,
        saved_natural_language_rule: context.baseRule,
        source_backtest_metrics: context.metrics,
        ai_summary_context: context.aiSummary,
        user_improvement_memo: context.improvementMemo,
        output_schema: {
          natural_language_rule: '<single rewritten rule body>',
          warnings: ['<short Japanese warning>'],
          assumptions: ['<short Japanese assumption>'],
        },
      }),
      temperature: 0.2,
      maxOutputTokens: 1200,
      timeoutMs: getLocalLlmRuleRewriteTimeoutMs(),
      think: false,
    });

    try {
      const parsed = JSON.parse(this.sanitizeJsonContent(content));
      const naturalLanguageRule = sanitizeRewriteText(parsed?.natural_language_rule, 4000);
      if (!naturalLanguageRule) {
        return deterministic;
      }
      return {
        naturalLanguageRule,
        warnings: sanitizeRewriteStringList(parsed?.warnings, 8),
        assumptions: sanitizeRewriteStringList(parsed?.assumptions, 8),
        modelName: this.modelName,
        promptVersion: 'v1.0.0-rule-rewrite-local',
      };
    } catch {
      return deterministic;
    }
  }

  async normalizeStrategySpec(context: StrategySpecNormalizationContext): Promise<StrategySpecNormalizationOutput> {
    const content = await this.callOllamaSummaryChat({
      taskType: 'strategy_spec_normalization',
      systemPrompt: [
        'You extract strategy rules into normalized_strategy_spec v1. Return strict JSON only.',
        'Output schema_name must be normalized_strategy_spec and schema_version must be 1.0.',
        'Extract entry, exit, risk, and filters separately. Preserve every measurable numeric threshold.',
        'Do not merge entry moving average length with exit moving average length.',
        'Preserve volume multipliers such as 1.5x, stop loss such as entry price -5%, and time exit bars.',
        'Trading-history-dependent rules such as consecutive loss skip must be preserved as unsupported_features or risk with supported=false.',
        'Do not invent indicators, thresholds, URLs, citations, investment advice, raw Pine, raw prompt, provider response, endpoint, model value, secret, token, local path, or stack trace.',
        'Use supported scope only: timeframe D, side long_only, indicators SMA, EMA, RSI, MACD, ATR, volume_sma, and entry, exit, stop_loss, take_profit, time_exit.',
        'Use machine-readable fields and concise Japanese rule descriptions.',
      ].join(' '),
      userPrompt: JSON.stringify({
        task: 'strategy_spec_normalization',
        strategy_version_id: context.strategyVersionId,
        market: context.market,
        timeframe: context.timeframe,
        natural_language_rule: context.naturalLanguageRule,
        supported_scope: {
          timeframe: 'D',
          side: 'long_only',
          indicators: ['SMA', 'EMA', 'RSI', 'MACD', 'ATR', 'VOLUME_SMA'],
          rules: ['entry', 'exit', 'stop_loss', 'take_profit', 'time_exit'],
        },
        output_schema: {
          schema_name: 'normalized_strategy_spec',
          schema_version: '1.0',
          market: context.market,
          timeframe: 'D',
          side: 'long_only',
          strategy_family: '<string>',
          indicators: [{ id: '<indicator_id>', type: 'SMA|EMA|RSI|MACD|ATR|VOLUME_SMA', length: '<number>' }],
          entry: {
            logic: 'all',
            conditions: [{ id: '<id>', type: '<type>', indicator: '<indicator_id>', operator: '>|>=|<|<=|crosses_above|crosses_below', value: '<number optional>', rule: '<short Japanese rule>' }],
          },
          exit: {
            logic: 'any',
            conditions: [{ id: '<id>', type: '<type>', indicator: '<indicator_id optional>', operator: '>|>=|<|<=|crosses_above|crosses_below', value: '<number optional>', rule: '<short Japanese rule>' }],
          },
          risk: {
            stop_loss: { type: 'percent', value: '<number>', basis: 'entry_price' },
            time_exit: { type: 'bars', bars: '<number>' },
          },
          filters: [{ id: '<id>', type: 'volume_filter', indicator: 'volume_sma_20', operator: '>=', multiplier: '<number optional>', rule: '<short Japanese rule>' }],
          validation: {
            supported_for_internal_backtest: false,
            unsupported_features: ['<unsupported feature code>'],
            warnings: ['<short Japanese warning>'],
            assumptions: ['<short Japanese assumption>'],
          },
          warnings: ['<short Japanese warning>'],
          assumptions: ['<short Japanese assumption>'],
        },
      }),
      temperature: 0.1,
      maxOutputTokens: 1800,
      timeoutMs: getLocalLlmRuleRewriteTimeoutMs(),
      think: false,
    });

    const candidates = this.extractJsonObjectCandidates(content);
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        return {
          normalizedSpec: parsed,
          warnings: [],
          assumptions: [],
          modelName: this.modelName,
          promptVersion: 'v1.0.0-strategy-spec-local',
        };
      } catch {
        // Try the next extracted object.
      }
    }
    throw new Error('local_llm strategy_spec_normalization returned invalid JSON');
  }

  async generatePineScript(context: PineGenerationContext): Promise<PineGenerationOutput> {
    const baseline = buildDeterministicPineOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-pine-local',
    });

    const failedProviderOutput = (
      warning: string,
      failureReason: string,
      invalidReasonCodes: string[],
    ): PineGenerationOutput => ({
      normalizedRuleJson: baseline.normalizedRuleJson,
      generatedScript: null,
      warnings: [warning],
      assumptions: baseline.assumptions,
      status: 'failed',
      failureReason,
      invalidReasonCodes,
      modelName: this.modelName,
      promptVersion: 'v1.0.0-pine-local',
    });

    const endpointPath = '/api/chat';
    const response = await fetch(`${this.endpoint}${endpointPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: context.repairRequest
              ? LOCAL_LLM_PINE_REPAIR_SYSTEM_PROMPT
              : LOCAL_LLM_PINE_GENERATION_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify(buildLocalLlmPineGenerationUserPayload(context)),
          },
        ],
        stream: false,
        think: false,
        options: {
          temperature: 0.1,
          num_predict: LOCAL_LLM_PINE_MAX_OUTPUT_TOKENS,
        },
      }),
      signal: AbortSignal.timeout(getLocalLlmPineTimeoutMs()),
    });

    if (!response.ok) {
      throw new Error(`local_llm pine generation failed: HTTP ${response.status} | task_type=pine_generation`);
    }

    const data: any = await response.json();
    const finishReason = this.normalizeFinishReason(data);
    const messageContent = typeof data?.message?.content === 'string' ? data.message.content.trim() : '';
    const thinkingContent = typeof data?.message?.thinking === 'string' ? data.message.thinking.trim() : '';
    const hasContent = messageContent.length > 0;
    const hasThinking = thinkingContent.length > 0;
    if (!hasContent) {
      console.error(
        JSON.stringify({
          event: 'local_llm_pine_call',
          task_type: 'pine_generation',
          think: false,
          finish_reason: finishReason,
          has_content: hasContent,
          has_thinking: hasThinking,
        }),
      );
      return failedProviderOutput(
        finishReason === 'length'
          ? 'LLM Pine生成の本文が出力上限に達して空でした。修復リトライを試みます。'
          : 'LLM Pine生成の本文が空でした。修復リトライを試みます。',
        'provider_invalid_response',
        ['provider_invalid_response', 'empty_output'],
      );
    }
    if (finishReason === 'length') {
      console.warn(
        JSON.stringify({
          event: 'local_llm_pine_call',
          task_type: 'pine_generation',
          think: false,
          finish_reason: finishReason,
          has_content: true,
          has_thinking: hasThinking,
        }),
      );
    }

    let parsed: any = null;
    let parsedAnyJson = false;
    for (const candidate of this.extractJsonObjectCandidates(messageContent)) {
      try {
        const candidateJson = JSON.parse(candidate);
        parsedAnyJson = true;
        if (this.hasUsableGeneratedScript(candidateJson?.generated_script)) {
          parsed = candidateJson;
          break;
        }
      } catch {
        // Try the next balanced object. Local models sometimes include a prose example before the real envelope.
      }
    }

    if (!parsed) {
      const extractedScript = this.extractRawPineScript(messageContent);
      if (extractedScript) {
        return {
          ...baseline,
          generatedScript: extractedScript,
          warnings: baseline.warnings,
          assumptions: baseline.assumptions,
          normalizedRuleJson: baseline.normalizedRuleJson,
          status: 'generated',
          modelName: this.modelName,
          promptVersion: 'v1.0.0-pine-local',
        };
      }
    }

    if (!parsed && !parsedAnyJson) {
      return failedProviderOutput(
        'LLM Pine生成のJSONを解析できませんでした。修復リトライを試みます。',
        'provider_invalid_response',
        ['provider_invalid_response', 'malformed_json'],
      );
    }
    if (!parsed) {
      return failedProviderOutput(
        'LLM Pine生成結果に generated_script が含まれていませんでした。修復リトライを試みます。',
        'provider_invalid_response',
        ['provider_invalid_response', 'generated_script_missing'],
      );
    }

    const generatedScript =
      typeof parsed?.generated_script === 'string' && parsed.generated_script.trim()
        ? parsed.generated_script
        : null;
    if (!generatedScript) {
      return failedProviderOutput(
        'LLM Pine生成結果に generated_script が含まれていませんでした。修復リトライを試みます。',
        'provider_invalid_response',
        ['provider_invalid_response', 'generated_script_missing'],
      );
    }

    const warnings = Array.isArray(parsed?.warnings)
      ? parsed.warnings.filter((item: unknown) => typeof item === 'string').slice(0, 16)
      : [];
    const assumptions = Array.isArray(parsed?.assumptions)
      ? parsed.assumptions.filter((item: unknown) => typeof item === 'string').slice(0, 16)
      : [];
    const normalizedRuleJson =
      typeof parsed?.normalized_rule_json === 'object' &&
      parsed.normalized_rule_json !== null &&
      !Array.isArray(parsed.normalized_rule_json)
        ? parsed.normalized_rule_json
        : baseline.normalizedRuleJson;

    return {
      ...baseline,
      generatedScript,
      warnings,
      assumptions,
      normalizedRuleJson,
      status: 'generated',
    };
  }

  async reviewPineScript(context: PineReviewContext): Promise<PineReviewResult> {
    const endpointPath = '/api/chat';
    const response = await fetch(`${this.endpoint}${endpointPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: [
              'Review generated Pine Script for known compile, safety, and strategy-state issues.',
              'Return one strict JSON object only. Do not include markdown fences.',
              'Do not rewrite or return the Pine script.',
              'Use schema_name pine_review_result and schema_version 1.0.',
              'Use status pass when no error issues exist, otherwise needs_repair.',
              'Each issue must include code, severity, message, repair_hint, and repairable.',
              'Use severity error only for likely compile failures, material order behavior changes, long-only violations, or issues that make the strategy unlikely to trade.',
              'Use warning for readability, plotting preferences, below-vs-crossunder nuance, minor unused variables, narrative comments, and other non-blocking observations.',
              'Do not mark quality-only or readability-only observations as error.',
              'Allowed issue codes: pine_syntax_risk, unsupported_color_alias, unsupported_color_namespace, unsupported_plot_style, unsupported_function_alias, dmi_property_access, unsupported_dmi_property_access, unsupported_adx_function, block_local_variable_scope_risk, na_type_inference_risk, uninitialized_stop_loss_price, stop_order_guard_risk, setup_trigger_state_risk, entry_guard_risk, below_vs_crossunder_mismatch, oscillator_plot_overlay_risk, overlay_oscillator_plot, entry_price_reference_risk, stop_order_semantics_risk, unused_state_variable, narrative_comment, long_only_violation, setup_trigger_same_bar, entry_atr_na_capture, donchian_current_bar_self_reference, entry_time_atr_not_persisted, other.',
              'Flag unsupported_function_alias when ta.crossabove or ta.crossbelow appears; prefer ta.crossover and ta.crossunder.',
              'For setup->trigger strategies, setupActive should remain true until entry occurs, explicit invalidation occurs, or lifecycle reset. Do not clear setupActive in a generic else branch before the trigger can fire.',
              'Flag setup_trigger_state_risk when a setupActive-based entry block calls strategy.entry but does not reset setupActive := false after the entry call.',
              'Setup-state variable names may vary, for example priceWasBelowBB, belowBand, touchedLower, wasBelow, pullbackActive, setupArmed, or similar names. Apply the same premature reset and post-entry reset checks to those variables.',
              'Flag entry_guard_risk when a long-only or no-pyramiding strategy.entry call is not protected by strategy.position_size == 0 or equivalent flat-position guard.',
              'If stopLossPrice is plotted, require an outer typed declaration such as float stopLossPrice = na or var float stopLossPrice = na, then reassignment with :=.',
              'Flag stop_order_guard_risk when strategy.exit(..., stop=stopLossPrice) can run without a nearby not na(stopLossPrice) guard.',
              'Flag stop_order_guard_risk when stopLossPrice is calculated from strategy.position_avg_price outside a strategy.position_size > 0 position guard.',
              'For ADX/DMI, prefer [plusDI, minusDI, adxValue] = ta.dmi(adxLength, adxLength); do not use ta.adx() or ta.dmi(...).property access.',
              'Flag donchian_current_bar_self_reference when Donchian breakout or exit logic compares close to ta.highest(high, len) or ta.lowest(low, len), or variables assigned from them, without using the prior channel value such as upperBand[1] or lowerBand[1].',
              'Flag entry_time_atr_not_persisted when entry-time ATR is requested but stop calculation uses current ATR directly instead of persisting ATR at the position-open transition in entryAtr.',
              'When wording says below or less than, prefer state conditions such as close < ma unless cross wording is explicit.',
              'With overlay=true, flag oscillator plot or hline usage for RSI, Stochastic, MACD histogram, or ADX unless explicitly requested.',
              'Do not include raw prompt, raw response, endpoint, model, secret, local path, or stack trace.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              target_market: context.targetMarket,
              target_timeframe: context.targetTimeframe,
              repair_attempt: context.repairAttempt,
              natural_language_spec_summary:
                context.naturalLanguageSpec.length > 240
                  ? `${context.naturalLanguageSpec.slice(0, 240)}...`
                  : context.naturalLanguageSpec,
              generated_script: context.generatedScript,
              output_schema: {
                schema_name: 'pine_review_result',
                schema_version: '1.0',
                status: 'pass | needs_repair',
                issues: [
                  {
                    code: '<allowed_issue_code>',
                    severity: 'error | warning | info',
                    message: '<sanitized short string>',
                    repair_hint: '<sanitized short string>',
                    repairable: true,
                  },
                ],
                summary: {
                  issue_count: '<number>',
                  error_count: '<number>',
                  warning_count: '<number>',
                  repairable_issue_count: '<number>',
                },
              },
            }),
          },
        ],
        stream: false,
        think: false,
        options: {
          temperature: 0,
          num_predict: 700,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`local_llm pine review failed: HTTP ${response.status} | task_type=pine_review`);
    }

    const data: any = await response.json();
    const content = typeof data?.message?.content === 'string' ? data.message.content.trim() : '';
    if (!content) {
      throw new Error('local_llm pine review returned invalid output | task_type=pine_review');
    }

    try {
      return normalizePineReviewResult(JSON.parse(this.sanitizeJsonContent(content)));
    } catch {
      throw new Error('local_llm pine review returned invalid output | task_type=pine_review');
    }
  }
}

class OpenAiHomeAiProvider implements HomeAiProvider {
  readonly providerType: HomeAiProviderType = 'openai_api';
  private readonly endpoint = (env.FALLBACK_API_ENDPOINT ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  private readonly apiKey = env.FALLBACK_API_KEY ?? '';
  private readonly modelName = env.FALLBACK_API_MODEL;

  async generateAlertSummary(context: AlertSummaryContext): Promise<AlertSummaryOutput> {
    const adapter = new FallbackApiAdapter('final_quality_required');
    return adapter.generateAlertSummary(context);
  }

  async rewriteNaturalLanguageRuleDraft(
    context: NaturalLanguageRuleRewriteContext,
  ): Promise<NaturalLanguageRuleRewriteOutput> {
    if (!this.apiKey) {
      throw new Error('openai_api provider requires FALLBACK_API_KEY');
    }

    const deterministic = buildDeterministicNaturalLanguageRuleRewriteOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-rule-rewrite-openai',
    });

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: [
              'Rewrite a strategy natural-language rule as strict JSON.',
              'The output natural_language_rule must be a single current strategy definition for the next Pine generation.',
              'It must materially differ from saved_natural_language_rule by incorporating the improvement memo or backtest findings; do not return the saved rule unchanged.',
              'If ai_summary_context.ruleRefinementCandidates exists, select one or combine compatible candidates and rewrite the rule around concrete entry, exit, or risk changes.',
              'Do not keep the saved rule and append the candidate list; produce one clean latest rule body.',
              'Do not append improvement history, AI summary quotes, review notes, URLs, citations, or raw artifacts.',
              'Make entry, exit, risk management, indicator periods, thresholds, stop loss, and time exit measurable where possible.',
              'Respect market and timeframe context, avoid overfitting, and do not give investment advice.',
              'Do not include raw CSV, raw import text, raw prompt, provider response, endpoint, model value, secret, token, local path, stack trace, or full generated Pine.',
              'Output Japanese text. Return only JSON with natural_language_rule, warnings, and assumptions.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              strategy_version_id: context.strategyVersionId,
              source_backtest_id: context.sourceBacktestId,
              market: context.market,
              timeframe: context.timeframe,
              saved_natural_language_rule: context.baseRule,
              source_backtest_metrics: context.metrics,
              ai_summary_context: context.aiSummary,
              user_improvement_memo: context.improvementMemo,
            }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      throw new Error(`openai_api rule rewrite failed: HTTP ${response.status} | task_type=natural_language_rule_rewrite`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) {
      return deterministic;
    }

    try {
      const parsed = JSON.parse(content);
      const naturalLanguageRule = sanitizeRewriteText(parsed?.natural_language_rule, 4000);
      if (!naturalLanguageRule) {
        return deterministic;
      }
      return {
        naturalLanguageRule,
        warnings: sanitizeRewriteStringList(parsed?.warnings, 8),
        assumptions: sanitizeRewriteStringList(parsed?.assumptions, 8),
        modelName: this.modelName,
        promptVersion: 'v1.0.0-rule-rewrite-openai',
      };
    } catch {
      return deterministic;
    }
  }

  async normalizeStrategySpec(context: StrategySpecNormalizationContext): Promise<StrategySpecNormalizationOutput> {
    if (!this.apiKey) {
      throw new Error('openai_api provider requires FALLBACK_API_KEY');
    }

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: [
              'Extract strategy rules into normalized_strategy_spec v1. Return strict JSON only.',
              'Output schema_name normalized_strategy_spec and schema_version 1.0.',
              'Extract entry, exit, risk, and filters separately and preserve all numeric thresholds.',
              'Do not merge entry MA length with exit MA length. Preserve volume multipliers, stop loss percent, and time exit bars.',
              'Unsupported trading-history-dependent rules such as consecutive loss skip must be preserved as unsupported_features or risk supported=false.',
              'Do not invent indicators or thresholds. Do not include URLs, citations, investment advice, raw Pine, raw prompt, provider response, endpoint, model value, secret, token, local path, or stack trace.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: 'strategy_spec_normalization',
              strategy_version_id: context.strategyVersionId,
              market: context.market,
              timeframe: context.timeframe,
              natural_language_rule: context.naturalLanguageRule,
              supported_scope: {
                timeframe: 'D',
                side: 'long_only',
                indicators: ['SMA', 'EMA', 'RSI', 'MACD', 'ATR', 'VOLUME_SMA'],
                rules: ['entry', 'exit', 'stop_loss', 'take_profit', 'time_exit'],
              },
              output_schema: {
                schema_name: 'normalized_strategy_spec',
                schema_version: '1.0',
                market: context.market,
                timeframe: 'D',
                side: 'long_only',
                strategy_family: '<string>',
                indicators: [],
                entry: { logic: 'all', conditions: [] },
                exit: { logic: 'any', conditions: [] },
                risk: {},
                filters: [],
                validation: {
                  supported_for_internal_backtest: false,
                  unsupported_features: [],
                  warnings: [],
                  assumptions: [],
                },
                warnings: [],
                assumptions: [],
              },
            }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1800,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      throw new Error(`openai_api strategy spec normalization failed: HTTP ${response.status} | task_type=strategy_spec_normalization`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) {
      throw new Error('openai_api strategy spec normalization returned empty content');
    }
    return {
      normalizedSpec: JSON.parse(content),
      warnings: [],
      assumptions: [],
      modelName: this.modelName,
      promptVersion: 'v1.0.0-strategy-spec-openai',
    };
  }

  async generateDailySummary(context: DailySummaryContext): Promise<DailySummaryOutput> {
    if (!this.apiKey) {
      throw new Error('openai_api provider requires FALLBACK_API_KEY');
    }

    const deterministic = buildDeterministicDailyOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-daily-openai',
      titlePrefix: '[OpenAI] ',
    });

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content:
              'あなたは北極星ホームの日次要約アシスタントです。入力の事実のみを使い、JSON object だけを返してください。',
          },
          {
            role: 'user',
            content: JSON.stringify({
              summary_type: context.summaryType,
              date: context.date,
              market_snapshot_count: context.marketSnapshotCount,
              alert_count: context.alertCount,
              reference_count: context.referenceCount,
            }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`openai_api daily summary failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) {
      return deterministic;
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      return deterministic;
    }

    return {
      ...deterministic,
      title: typeof parsed?.title === 'string' && parsed.title.trim() !== '' ? parsed.title : deterministic.title,
    };
  }

  async generateSymbolThesisSummary(context: SymbolThesisContext): Promise<SymbolThesisOutput> {
    if (!this.apiKey) {
      throw new Error('openai_api provider requires FALLBACK_API_KEY');
    }

    const deterministic = buildDeterministicSymbolOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-symbol-openai',
      titlePrefix: '[OpenAI] ',
    });

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: 'あなたは日本株分析アシスタントです。必ず日本語で、厳密なJSONのみを返してください。' },
          {
            role: 'user',
            content: JSON.stringify({
              scope: context.scope,
              symbol: context.symbol,
              reference_ids: context.referenceIds,
              references: context.references.slice(0, 6),
              snapshot: context.snapshot,
              latest_note_summary: context.latestNoteSummary,
              output_language: 'ja',
            }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`openai_api symbol thesis failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) {
      return deterministic;
    }

    try {
      const parsed = JSON.parse(content);
      if (typeof parsed?.title === 'string' && parsed.title.trim()) {
        return {
          ...deterministic,
          title: parsed.title,
        };
      }
    } catch {
      return deterministic;
    }

    return deterministic;
  }

  async generateComparisonSummary(context: ComparisonSummaryContext): Promise<ComparisonSummaryOutput> {
    if (!this.apiKey) {
      throw new Error('openai_api provider requires FALLBACK_API_KEY');
    }

    const deterministic = buildDeterministicComparisonOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-compare-openai',
      titlePrefix: '[OpenAI] ',
    });

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: 'あなたは日本株比較アシスタントです。必ず日本語で、厳密なJSONのみを返してください。',
          },
          {
            role: 'user',
            content: JSON.stringify({
              comparison_id: context.comparisonId,
              symbols: context.symbols,
              metrics: context.metrics,
              compared_metric_json: context.comparedMetricJson,
              references: context.references.slice(0, 8),
              output_language: 'ja',
            }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`openai_api comparison summary failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) {
      return deterministic;
    }

    try {
      const parsed = JSON.parse(content);
      if (typeof parsed?.title === 'string' && parsed.title.trim()) {
        return {
          ...deterministic,
          title: parsed.title,
        };
      }
    } catch {
      return deterministic;
    }

    return deterministic;
  }

  async generateBacktestSummary(context: BacktestSummaryContext): Promise<BacktestSummaryOutput> {
    if (!this.apiKey) {
      throw new Error('openai_api provider requires FALLBACK_API_KEY');
    }

    const deterministic = buildDeterministicBacktestOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-backtest-openai',
      titlePrefix: '[OpenAI] ',
    });

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content:
              'Generate a concise backtest review summary as strict JSON for strategy refinement. Keep schema v1.0 compatible. body_markdown must include Japanese sections: 概要, 主要メトリクス, 成績評価, 問題の切り分け, 改善仮説, 自然言語ルール改善案, Pine修正依頼に入れるべきではない注意, 次に試す検証案, 注意点. Connect weak trade count, PF, win rate, drawdown, and net profit to entry, exit, stop, profit taking, position management, time exit, or market-regime filters. Do not repeat the same metric issue across concern_points. When trade count is low, separate validation scope actions from strategy logic changes. Put validation work in next_checks and concrete natural-language-rule changes in rule_refinement_candidates, and make next_checks reference candidate numbers where possible. Each candidate must include target_area, rationale, change_summary, validation_plan, expected_metric_effect, and at least one concrete entry_change, exit_change, or risk_change. Avoid abstract text such as just review or compare, and avoid ambiguous logic such as A and B, or C. Do not frame strategy logic changes as revision_request drafts. Do not give buy/sell recommendations and do not include raw CSV, raw import text, raw prompt, provider response, endpoint, model value, secret, token, local path, stack trace, URLs, citations, or full generated Pine.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              backtest_id: context.backtestId,
              title: context.title,
              market: context.market,
              timeframe: context.timeframe,
              execution_source: context.executionSource,
              status: context.status,
              metrics: context.metrics,
              trade_summary: context.tradeSummary,
              import_files: context.importFiles.slice(0, 10),
              import_parsed_summaries: context.importParsedSummaries.slice(0, 3),
              comparison_diff: context.comparisonDiff,
              report_context_type: context.internalBacktestContext ? 'internal_backtest' : 'csv_import',
              internal_backtest_context: context.internalBacktestContext
                ? {
                    execution_source: context.internalBacktestContext.executionSource,
                    internal_backtest_execution_id: context.internalBacktestContext.internalBacktestExecutionId,
                    summary_kind: context.internalBacktestContext.summaryKind,
                    period: context.internalBacktestContext.period,
                    metrics: context.internalBacktestContext.metrics,
                    artifact_pointer: context.internalBacktestContext.artifactPointer,
                  }
                : null,
              strategy: context.strategy,
              output_schema: {
                title: '<string>',
                conclusion: '<string>',
                good_points: ['<string>'],
                concern_points: ['<string>'],
                next_checks: ['<string>'],
                rule_refinement_candidates: [
                  {
                    title: '<string>',
                    target_area: '<entry|exit|risk|filter|time_exit|validation_scope>',
                    rationale: '<string>',
                    change_summary: '<string>',
                    entry_change: '<string|null>',
                    exit_change: '<string|null>',
                    risk_change: '<string|null>',
                    validation_plan: '<string>',
                    expected_metric_effect: {
                      profit_factor: '<string|null>',
                      win_rate: '<string|null>',
                      max_drawdown: '<string|null>',
                      trade_count: '<string|null>',
                    },
                  },
                ],
                body_markdown: '<markdown with required natural-language-rule improvement sections>',
                overall_view: '<natural language rule improvement memo>',
              },
            }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`openai_api backtest summary failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) {
      return deterministic;
    }

    try {
      const parsed = JSON.parse(content);
      const title = sanitizeSummaryText(parsed?.title, 160) || deterministic.title;
      const conclusion = sanitizeSummaryText(parsed?.conclusion, 500) || deterministic.structuredJson.payload.conclusion;
      const strengths = sanitizeSummaryStringList(parsed?.good_points, 5);
      const effectiveStrengths = strengths.length > 0 ? strengths : deterministic.structuredJson.payload.strengths;
      const risks = sanitizeSummaryStringList(parsed?.concern_points, 5);
      const overallView =
        sanitizeSummaryText(parsed?.overall_view, 900) || deterministic.structuredJson.payload.overall_view;
      const ruleRefinementCandidates = sanitizeRuleRefinementCandidates(parsed?.rule_refinement_candidates, 4);
      const effectiveRuleRefinementCandidates =
        ruleRefinementCandidates.length > 0
          ? ruleRefinementCandidates
          : deterministic.structuredJson.payload.rule_refinement_candidates ?? [];
      const effectiveRisks = dedupeSummaryTextsByMetricKey(
        risks.length > 0 ? risks : deterministic.structuredJson.payload.risks,
        7,
      );
      const nextActions = sanitizeSummaryStringList(parsed?.next_checks, 5);
      const effectiveNextActions = dedupeSummaryTextsByMetricKey(
        [
          ...buildCandidateValidationActions(effectiveRuleRefinementCandidates),
          ...(nextActions.length > 0 ? nextActions : deterministic.structuredJson.payload.next_actions),
        ],
        7,
      );
      const bodyMarkdown = renderBacktestBodyMarkdown(
        title,
        conclusion,
        effectiveStrengths,
        effectiveRisks,
        effectiveNextActions,
        deterministic.structuredJson.payload.key_metrics,
        overallView,
        effectiveRuleRefinementCandidates,
      );

      return {
        ...deterministic,
        title,
        bodyMarkdown,
        structuredJson: {
          ...deterministic.structuredJson,
          payload: {
            ...deterministic.structuredJson.payload,
            conclusion,
            strengths: effectiveStrengths,
            risks: effectiveRisks,
            next_actions: effectiveNextActions,
            overall_view: overallView,
            rule_refinement_candidates: effectiveRuleRefinementCandidates,
          },
        },
      };
    } catch {
      return deterministic;
    }
  }

  async generatePineScript(context: PineGenerationContext): Promise<PineGenerationOutput> {
    if (!this.apiKey) {
      throw new Error('openai_api provider requires FALLBACK_API_KEY');
    }

    const deterministic = buildDeterministicPineOutput(context, {
      modelName: this.modelName,
      promptVersion: 'v1.0.0-pine-openai',
    });

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: context.repairRequest
              ? PINE_REPAIR_SYSTEM_PROMPT
              : [
              'Convert natural language rule to Pine script. Use regeneration_input when provided to revise existing script. Return strict JSON.',
              ...PINE_SPEC_FIRST_PROMPT_LINES,
              'Return one strict JSON object only. Do not include markdown fences around the JSON.',
              'The generated_script value must contain Pine Script only. Do not include markdown fences, explanations, or comments outside Pine syntax in generated_script.',
              'Use //@version=6 and strategy(...), not indicator(...), unless strategy output is impossible.',
              'Use long-only behavior by default unless the user explicitly requests short behavior and it can be represented safely.',
              'For long-only strategies, do not generate strategy.short entries or short-side strategy.entry calls.',
              'Call strategy.entry only inside a block that confirms strategy.position_size == 0, unless the user explicitly requests pyramiding and it is supported.',
              'Call strategy.exit only inside a block that confirms strategy.position_size > 0. Submit strategy.exit on every bar while the position is open, not only on the entry bar.',
              'Do not compute stop or limit prices from strategy.position_avg_price in the same block where strategy.entry is called.',
              'When an ATR stop uses entry-time ATR, declare a var float such as entryAtr and capture ATR after the position becomes open, for example when strategy.position_size > 0 and strategy.position_size[1] == 0.',
              'Do not reset entry-time state variables such as entryAtr with a simple if strategy.position_size == 0 block immediately after the entry block.',
              'Remember that on the same bar after strategy.entry is submitted, strategy.position_size may still be 0, so a simple flat-state reset can erase entry-time state too early.',
              'Reset entry-time state variables only on an open-to-flat transition. Prefer: if strategy.position_size == 0 and strategy.position_size[1] > 0 then entryAtr := na.',
              'Compute stop prices that depend on entryAtr only under strategy.position_size > 0 and not na(entryAtr).',
              'Do not compute stopLossPrice at top level while flat when it depends on entryAtr or strategy.position_avg_price.',
              'Do not use close as a substitute for the actual entry price when calculating stop loss.',
              'Do not create entry_price := close or entryPrice := close unless the user explicitly requests signal-bar close as the entry-price basis.',
              'For entry-price-based stops, use strategy.position_avg_price after the position is open.',
              'Entry-time ATR may be stored as state, but calculate the stop price from strategy.position_avg_price, not from signal-bar close.',
              'For fixed percentage stop loss, calculate stopLossPrice while the position is open using strategy.position_avg_price, for example strategy.position_avg_price * 0.95 for a 5% long stop.',
              'Do not create entryPrice or entry_price from strategy.position_avg_price inside the entry block. Wait until the position is open and use strategy.position_avg_price directly for stop calculations.',
              'Fixed percentage stops do not need entry-time state variables unless the user explicitly requests them.',
              'Only create ATR variables, entryAtr, atrValue, or other ATR state when the user asks for an ATR stop, ATR filter, or ATR breakout.',
              'If the user does not ask for ATR, do not create entryAtr, atrValue, ta.atr, or ATR state.',
              'Do not reuse an ATR stop template for a percentage stop.',
              'Preserve oscillator threshold direction exactly. RSI above 60 means rsi > 60, or ta.crossover(rsi, 60) only when crossing above is requested.',
              'Do not use ta.crossunder(rsi, 60) for an overbought exit unless the user asks for falling back below 60.',
              'RSI crosses back above 30 means ta.crossover(rsi, 30); RSI crosses below a threshold means ta.crossunder.',
              'With overlay=true, do not plot RSI, Stochastic, MACD histogram, ADX, or other oscillators by default.',
              'Plot price indicators by default if helpful, but plot oscillators only when explicitly requested or when overlay=false is intended for a separate pane.',
              'Do not use color.color.*; use color=color.green, color=color.red, or another supported color.* value.',
              'Do not use plot.style_dashed in plot(); prefer supported styles such as plot.style_linebr where appropriate, or omit unsupported style arguments.',
              'For wording like "after setup, trigger" or "X state then Y", use state variables such as var bool setupActive.',
              'Do not directly require setupCondition and triggerCondition on the same bar when setup can contradict trigger.',
              'Prefer setting setupActive := true while flat on setup, using entryCondition = setupActive and triggerCondition, then resetting setupActive after entry or when invalidated.',
              'For wording such as 下回った場合, below, or less than, use a state condition such as close < ma or adx < threshold.',
              'Use ta.crossunder only when the wording explicitly says 下抜け, クロス, crosses below, or crossunder.',
              'For entry-time ATR, capture it on the position-open transition using strategy.position_size > 0 and strategy.position_size[1] == 0.',
              'Avoid representative ATR patterns that capture state with if strategy.position_size > 0 and na(entryAtr).',
              'Do not declare unused variables. Do not create ATR variables or state unless ATR is actually used.',
              "generated_script comments should be short section comments only; avoid narrative markers such as Note:, 注意:, Since, To ensure, Let's use, より正確な実装, or Pine Scriptの仕様上.",
              'If plotting a stop line, guard it with position and na checks, for example plot(strategy.position_size > 0 and not na(entryAtr) ? stopLossPrice : na, style=plot.style_linebr).',
              'For stop loss or take profit, prefer strategy.exit(..., stop=...) or strategy.exit(..., limit=...).',
              'Avoid manual bar-based stops such as if low <= stopLossPrice then strategy.close(...) unless the user explicitly requests that behavior.',
              'Use strategy.close() for rule-based exits such as moving-average crossunder, dead cross, or close below moving average, not for ordinary stop loss or take profit orders.',
              'Avoid plotting volume or average volume on an overlay price chart unless the user explicitly requests it. Plot only main price-based indicators by default.',
              'Do not include narrative comments such as 修正:, 注意:, or provider limitation explanations inside generated_script. Short section comments are allowed only when they clarify code structure.',
              'Put limitations, approximations, and unsupported features in warnings or assumptions, not in long Pine comments.',
              'Write self-contained Pine code with every variable declared before use; do not leave TODOs, placeholders, ellipses, or pseudo-code.',
              'Use ta.* built-ins for indicators and valid strategy.entry, strategy.close, or strategy.exit calls; do not invent Pine functions or parameters.',
              'Avoid repainting and future-data dependencies. Do not use lookahead_on, negative history references, or future bar assumptions.',
              'If request.security is required, use barmerge.lookahead_off and keep the request minimal; otherwise avoid cross-symbol or higher-timeframe data.',
              'Use explicit boolean entry and exit conditions and guard orders with strategy.position_size when appropriate.',
              'Respect target_market and target_timeframe context, but do not claim TradingView compile success.',
              'Do not include URLs, citations, web search results, or profit guarantees.',
              'Return user-facing warnings and assumptions in Japanese.',
              'Do not write English explanatory sentences in warnings or assumptions.',
              'Keep generated_script as valid Pine Script; do not translate Pine code, identifiers, function names, or required Pine syntax.',
              'Technical terms such as ATR, RSI, SMA, Chandelier Exit, strategy.entry may remain in English, but the explanatory sentence must be Japanese.',
              'If failure_reason is needed for a user-facing failure, prefer Japanese. Keep invalid_reason_codes and internal enum/code values in English.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify(buildPineGenerationUserPayload(context)),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1800,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      throw new Error(`openai_api pine generation failed: HTTP ${response.status} | task_type=pine_generation`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) {
      return deterministic;
    }

    try {
      const parsed = JSON.parse(content);
      const generatedScript =
        typeof parsed?.generated_script === 'string' && parsed.generated_script.trim()
          ? parsed.generated_script
          : deterministic.generatedScript;
      return {
        ...deterministic,
        generatedScript,
        warnings: Array.isArray(parsed?.warnings)
          ? parsed.warnings.filter((item: unknown) => typeof item === 'string').slice(0, 16)
          : deterministic.warnings,
        assumptions: Array.isArray(parsed?.assumptions)
          ? parsed.assumptions.filter((item: unknown) => typeof item === 'string').slice(0, 16)
          : deterministic.assumptions,
        status: generatedScript ? 'generated' : 'failed',
      };
    } catch {
      return deterministic;
    }
  }

  async reviewPineScript(context: PineReviewContext): Promise<PineReviewResult> {
    return reviewGeneratedPineScriptDeterministic(context.generatedScript);
  }
}

export function createStubHomeAiProvider(): HomeAiProvider {
  return new StubHomeAiProvider();
}

export function createHomeAiProvider(providerType: HomeAiProviderType = env.HOME_AI_PROVIDER): HomeAiProvider {
  if (providerType === 'stub') {
    return new StubHomeAiProvider();
  }
  if (providerType === 'openai_api') {
    return new OpenAiHomeAiProvider();
  }
  return new LocalLlmHomeAiProvider();
}
