import { env } from '../env';
import { AlertSummaryContext, AlertSummaryOutput, MockAiAdapter } from './adapter';
import { LocalLlmAdapter } from './local-llm-adapter';
import { FallbackApiAdapter } from './fallback-api-adapter';
import { generatePineDeterministic } from '../strategy/pine';

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
    };
  };
  modelName: string;
  promptVersion: string;
};

export type PineGenerationContext = {
  naturalLanguageSpec: string;
  normalizedRuleJson: Record<string, unknown> | null;
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
  } | null;
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
  generatePineScript: (context: PineGenerationContext) => Promise<PineGenerationOutput>;
};

type LocalLlmTaskType =
  | 'daily_summary'
  | 'symbol_thesis_summary'
  | 'comparison_summary'
  | 'backtest_summary'
  | 'pine_generation';

type LocalLlmSummaryChatOptions = {
  taskType: Exclude<LocalLlmTaskType, 'pine_generation'>;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  think?: boolean;
};

const LOCAL_LLM_SUMMARY_MAX_OUTPUT_TOKENS = 1200;
const LOCAL_LLM_PINE_MAX_OUTPUT_TOKENS = 1800;

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

function renderBacktestBodyMarkdown(
  title: string,
  conclusion: string,
  strengths: string[],
  risks: string[],
  nextActions: string[],
): string {
  return [
    `## ${title}`,
    '',
    '### 結論',
    conclusion,
    '',
    '### 良い点',
    ...strengths.map((item) => `- ${item}`),
    '',
    '### 懸念点',
    ...risks.map((item) => `- ${item}`),
    '',
    '### 次に確認すべき点',
    ...nextActions.map((item) => `- ${item}`),
  ].join('\n');
}

function buildDeterministicBacktestOutput(
  context: BacktestSummaryContext,
  options: { modelName: string; promptVersion: string; titlePrefix: string },
): BacktestSummaryOutput {
  const hasMetrics = !!context.metrics;
  const hasParsedImports = context.importParsedSummaries.length > 0;
  const insufficientContext = !hasMetrics && !hasParsedImports;
  const confidence: 'high' | 'medium' | 'low' = insufficientContext ? 'low' : hasMetrics ? 'high' : 'medium';
  const title = `${options.titlePrefix}Backtest Review: ${context.title}`;
  const keyMetrics = {
    total_trades: context.metrics?.totalTrades ?? null,
    win_rate: context.metrics?.winRate ?? null,
    profit_factor: context.metrics?.profitFactor ?? null,
    max_drawdown: context.metrics?.maxDrawdown ?? null,
    net_profit: context.metrics?.netProfit ?? null,
  };
  const netProfitText = toSigned(context.metrics?.netProfit, 0);
  const profitFactorText = toSigned(context.metrics?.profitFactor, 2);
  const winRateText = toSigned(context.metrics?.winRate, 2, 'pt');
  const maxDrawdownText = toSigned(context.metrics?.maxDrawdown, 2, '%');

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

  const conclusion = insufficientContext
    ? '入力素材が不足しているため、総評は暫定です。最低1件の解析済みCSVを追加して再評価してください。'
    : context.metrics && context.metrics.netProfit !== null && context.metrics.profitFactor !== null
      ? context.metrics.netProfit > 0 && context.metrics.profitFactor > 1
        ? `純利益${netProfitText ?? '-'}、Profit Factor${profitFactorText ?? '-'}で、現時点の成績は前向きです。`
        : `純利益${netProfitText ?? '-'}、Profit Factor${profitFactorText ?? '-'}で、成績の安定性には追加検証が必要です。`
      : '主要指標は一部取得済みですが、追加の検証素材を加えて判断精度を上げる段階です。';

  const strengths = [
    hasMetrics && netProfitText ? `純利益は${netProfitText}で、定量的な優位を確認できます。` : '',
    hasMetrics && profitFactorText ? `Profit Factorは${profitFactorText}で、損益比の把握が可能です。` : '',
    hasMetrics && winRateText ? `勝率は${winRateText}で、再現性の初期判断材料があります。` : '',
    context.comparisonDiff?.netProfitDiff !== null && context.comparisonDiff?.netProfitDiff !== undefined
      ? `最新取込は前回比で純利益${toSigned(context.comparisonDiff.netProfitDiff, 0) ?? '-'}です。`
      : '',
    tradeSummary.parsedImportCount > 1
      ? `解析済み${tradeSummary.parsedImportCount}件から傾向比較が可能です。`
      : '',
  ].filter(Boolean);

  const risks = [
    hasMetrics && (context.metrics?.profitFactor ?? 0) <= 1 ? 'Profit Factor が1以下で、損益比が弱い可能性があります。' : '',
    hasMetrics && (context.metrics?.maxDrawdown ?? 0) <= -15
      ? `最大ドローダウンは${maxDrawdownText ?? '-'}で、下振れ耐性に懸念があります。`
      : '',
    hasMetrics && (context.metrics?.winRate ?? 100) < 45 ? `勝率は${winRateText ?? '-'}で、勝ち筋の安定性が不足しています。` : '',
    tradeSummary.worstNetProfit !== null
      ? `取込間の最悪純利益は${toSigned(tradeSummary.worstNetProfit, 0) ?? '-'}で、期間依存の振れ幅があります。`
      : '',
    insufficientContext ? '解析済み素材が不足しており、結論の信頼度は低いです。' : '',
  ].filter(Boolean);

  const nextActions = [
    `同条件で期間を分割し、PF・DD・勝率の再現性を確認してください。`,
    context.strategy?.naturalLanguageRule ? '自然言語ルールの exit 条件が現行ボラティリティに合うか見直してください。' : '',
    context.comparisonDiff ? '最新取込と前回取込の差分要因（期間/銘柄条件）を切り分けてください。' : '',
    tradeSummary.parsedImportCount < 2 ? 'もう1件以上CSVを追加して比較可能な状態にしてください。' : '',
  ].filter(Boolean);

  return {
    title,
    bodyMarkdown: renderBacktestBodyMarkdown(title, conclusion, strengths, risks, nextActions),
    structuredJson: {
      schema_name: 'backtest_review_summary',
      schema_version: '1.0',
      confidence,
      insufficient_context: insufficientContext,
      payload: {
        conclusion,
        strengths: strengths.length > 0 ? strengths : ['定量評価に使える入力が限定的です。'],
        risks: risks.length > 0 ? risks : ['主要リスクを断定するには材料が不足しています。'],
        next_actions: nextActions.length > 0 ? nextActions : ['追加CSVの取込後に再評価してください。'],
        key_metrics: keyMetrics,
        overall_view: conclusion,
      },
    },
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
    warnings.push(
      `regeneration_context_applied: source=${context.regenerationInput.sourcePineScriptId}`,
    );
  }

  return {
    ...generated,
    warnings,
    modelName: options.modelName,
    promptVersion: options.promptVersion,
  };
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

  async generatePineScript(context: PineGenerationContext): Promise<PineGenerationOutput> {
    return buildDeterministicPineOutput(context, {
      modelName: 'stub-pine-v1',
      promptVersion: 'v1.0.0-pine-stub',
    });
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
      signal: AbortSignal.timeout(60_000),
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
              'Interpret numeric inputs in natural language and organize the output into conclusion, strengths, risks, and next checks.',
              'Do not overstate quality from a short favorable period when long-term metrics disagree.',
              'Do not give direct buy or sell recommendations.',
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
              strategy: context.strategy,
              output_schema: {
                title: '<string>',
                conclusion: '<string>',
                good_points: ['<string>'],
                concern_points: ['<string>'],
                next_checks: ['<string>'],
                body_markdown: '<string>',
                overall_view: '<string>',
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

    const conclusion =
      typeof parsed?.conclusion === 'string' && parsed.conclusion.trim()
        ? parsed.conclusion
        : deterministic.structuredJson.payload.conclusion;
    const strengths = Array.isArray(parsed?.good_points)
      ? parsed.good_points.filter((item: unknown) => typeof item === 'string').slice(0, 5)
      : deterministic.structuredJson.payload.strengths;
    const risks = Array.isArray(parsed?.concern_points)
      ? parsed.concern_points.filter((item: unknown) => typeof item === 'string').slice(0, 5)
      : deterministic.structuredJson.payload.risks;
    const nextActions = Array.isArray(parsed?.next_checks)
      ? parsed.next_checks.filter((item: unknown) => typeof item === 'string').slice(0, 5)
      : deterministic.structuredJson.payload.next_actions;
    const title =
      typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title : deterministic.title;

    return {
      ...deterministic,
      title,
      bodyMarkdown:
        typeof parsed?.body_markdown === 'string' && parsed.body_markdown.trim()
          ? parsed.body_markdown
          : renderBacktestBodyMarkdown(title, conclusion, strengths, risks, nextActions),
      structuredJson: {
        ...deterministic.structuredJson,
        payload: {
          ...deterministic.structuredJson.payload,
          conclusion,
          strengths,
          risks,
          next_actions: nextActions,
          overall_view:
            typeof parsed?.overall_view === 'string' && parsed.overall_view.trim()
              ? parsed.overall_view
              : conclusion,
        },
      },
    };
  }

  async generatePineScript(context: PineGenerationContext): Promise<PineGenerationOutput> {
    const deterministic = buildDeterministicPineOutput(context, {
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
            content:
              'Convert natural language trading rule into Pine v6 script. Use regeneration_input when provided to revise existing script. Return strict JSON only.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              natural_language_spec: context.naturalLanguageSpec,
              normalized_rule_json: context.normalizedRuleJson,
              target_market: context.targetMarket,
              target_timeframe: context.targetTimeframe,
              regeneration_input: context.regenerationInput ?? null,
              repair_request: context.repairRequest ?? null,
              output_schema: {
                generated_script: '<string>',
                warnings: ['<string>'],
                assumptions: ['<string>'],
                normalized_rule_json: '<object>',
              },
            }),
          },
        ],
        stream: false,
        think: false,
        options: {
          temperature: 0.1,
          num_predict: LOCAL_LLM_PINE_MAX_OUTPUT_TOKENS,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `local_llm pine generation failed: HTTP ${response.status} ${body.slice(0, 200)} | task_type=pine_generation | model=${this.modelName} | endpoint=${endpointPath} | think=false`,
      );
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
          model: this.modelName,
          endpoint: endpointPath,
          think: false,
          finish_reason: finishReason,
          has_content: hasContent,
          has_thinking: hasThinking,
        }),
      );
      throw new Error(
        [
          `local_llm pine generation returned invalid output: ${
            finishReason === 'length' ? 'empty content with finish_reason=length' : 'empty content'
          }`,
          'task_type=pine_generation',
          `model=${this.modelName}`,
          `endpoint=${endpointPath}`,
          'think=false',
          `finish_reason=${finishReason ?? 'null'}`,
          `content_present=${hasContent}`,
          `thinking_present=${hasThinking}`,
        ].join(' | '),
      );
    }
    if (finishReason === 'length') {
      console.warn(
        JSON.stringify({
          event: 'local_llm_pine_call',
          task_type: 'pine_generation',
          model: this.modelName,
          endpoint: endpointPath,
          think: false,
          finish_reason: finishReason,
          has_content: true,
          has_thinking: hasThinking,
        }),
      );
    }

    const content = messageContent;

    let parsed: any = null;
    try {
      parsed = JSON.parse(content.replace(/```[a-z]*\n?/gi, '').trim());
    } catch {
      return deterministic;
    }

    const generatedScript =
      typeof parsed?.generated_script === 'string' && parsed.generated_script.trim()
        ? parsed.generated_script
        : deterministic.generatedScript;
    const warnings = Array.isArray(parsed?.warnings)
      ? parsed.warnings.filter((item: unknown) => typeof item === 'string').slice(0, 16)
      : deterministic.warnings;
    const assumptions = Array.isArray(parsed?.assumptions)
      ? parsed.assumptions.filter((item: unknown) => typeof item === 'string').slice(0, 16)
      : deterministic.assumptions;
    const normalizedRuleJson =
      typeof parsed?.normalized_rule_json === 'object' &&
      parsed.normalized_rule_json !== null &&
      !Array.isArray(parsed.normalized_rule_json)
        ? parsed.normalized_rule_json
        : deterministic.normalizedRuleJson;

    return {
      ...deterministic,
      generatedScript,
      warnings,
      assumptions,
      normalizedRuleJson,
      status: generatedScript ? 'generated' : 'failed',
    };
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
              'Generate a concise backtest review summary as strict JSON. Interpret numeric inputs in natural language and avoid metadata enumeration.',
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
              strategy: context.strategy,
              output_schema: {
                title: '<string>',
                conclusion: '<string>',
                good_points: ['<string>'],
                concern_points: ['<string>'],
                next_checks: ['<string>'],
                body_markdown: '<string>',
                overall_view: '<string>',
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
      const title =
        typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title : deterministic.title;
      const conclusion =
        typeof parsed?.conclusion === 'string' && parsed.conclusion.trim()
          ? parsed.conclusion
          : deterministic.structuredJson.payload.conclusion;
      const strengths = Array.isArray(parsed?.good_points)
        ? parsed.good_points.filter((item: unknown) => typeof item === 'string').slice(0, 5)
        : deterministic.structuredJson.payload.strengths;
      const risks = Array.isArray(parsed?.concern_points)
        ? parsed.concern_points.filter((item: unknown) => typeof item === 'string').slice(0, 5)
        : deterministic.structuredJson.payload.risks;
      const nextActions = Array.isArray(parsed?.next_checks)
        ? parsed.next_checks.filter((item: unknown) => typeof item === 'string').slice(0, 5)
        : deterministic.structuredJson.payload.next_actions;

      return {
        ...deterministic,
        title,
        bodyMarkdown:
          typeof parsed?.body_markdown === 'string' && parsed.body_markdown.trim()
            ? parsed.body_markdown
            : renderBacktestBodyMarkdown(title, conclusion, strengths, risks, nextActions),
        structuredJson: {
          ...deterministic.structuredJson,
          payload: {
            ...deterministic.structuredJson.payload,
            conclusion,
            strengths,
            risks,
            next_actions: nextActions,
            overall_view:
              typeof parsed?.overall_view === 'string' && parsed.overall_view.trim()
                ? parsed.overall_view
                : conclusion,
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
            content: 'Convert natural language rule to Pine script. Use regeneration_input when provided to revise existing script. Return strict JSON.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              natural_language_spec: context.naturalLanguageSpec,
              normalized_rule_json: context.normalizedRuleJson,
              target_market: context.targetMarket,
              target_timeframe: context.targetTimeframe,
              regeneration_input: context.regenerationInput ?? null,
              repair_request: context.repairRequest ?? null,
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
      const body = await response.text().catch(() => '');
      throw new Error(`openai_api pine generation failed: HTTP ${response.status} ${body.slice(0, 200)}`);
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
        status: generatedScript ? 'generated' : 'failed',
      };
    } catch {
      return deterministic;
    }
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
