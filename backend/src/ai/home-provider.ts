import { env } from '../env';
import { AlertSummaryContext, AlertSummaryOutput, MockAiAdapter } from './adapter';
import { LocalLlmAdapter } from './local-llm-adapter';
import { FallbackApiAdapter } from './fallback-api-adapter';

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
  importFiles: Array<{
    id: string;
    fileName: string;
    parseStatus: string;
    parseError: string | null;
    createdAt: string;
  }>;
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

export type HomeAiProvider = {
  providerType: HomeAiProviderType;
  generateAlertSummary: (context: AlertSummaryContext) => Promise<AlertSummaryOutput>;
  generateDailySummary: (context: DailySummaryContext) => Promise<DailySummaryOutput>;
  generateSymbolThesisSummary: (context: SymbolThesisContext) => Promise<SymbolThesisOutput>;
  generateComparisonSummary: (context: ComparisonSummaryContext) => Promise<ComparisonSummaryOutput>;
  generateBacktestSummary: (context: BacktestSummaryContext) => Promise<BacktestSummaryOutput>;
};

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
  const slot = context.summaryType === 'latest' ? '最新' : context.summaryType === 'morning' ? '朝' : '夕方';

  const title = `${options.titlePrefix}${slot}サマリ (${dateText})`;
  const bodyMarkdown = [
    `## ${title}`,
    '',
    `- market_snapshots: ${context.marketSnapshotCount}件`,
    `- alert_events: ${context.alertCount}件`,
    `- external_references: ${context.referenceCount}件`,
    insufficientContext
      ? '- 材料不足のため、断定を避けた要約を返却'
      : '- 材料は揃っており、通常精度の要約を返却',
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
            title: `${slot}の観測サマリ`,
            summary: `snapshot ${context.marketSnapshotCount}件 / alert ${context.alertCount}件 / reference ${context.referenceCount}件`,
            reason: insufficientContext ? '入力材料不足のため保守的要約' : '入力材料が揃っているため通常要約',
            confidence,
            reference_ids: [],
            symbol_ids: [],
          },
        ],
        watch_items: insufficientContext
          ? ['market_snapshots / alert_events / external_references の不足補完']
          : ['重要イベントと直近アラートの継続監視'],
        focus_symbols: [],
        market_context: {
          tone,
          summary: insufficientContext ? '材料不足のため中立評価' : '直近シグナルを踏まえた中立評価',
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
  const hasNote = !!context.latestNoteSummary?.thesisText;
  const insufficientContext = !hasReferences && !hasSnapshot && !hasNote;
  const confidence: 'high' | 'medium' | 'low' = insufficientContext ? 'low' : hasReferences ? 'medium' : 'low';
  const symbolLabel = context.symbol.displayName ?? context.symbol.symbolCode ?? context.symbol.symbol;
  const title = `${options.titlePrefix}${symbolLabel} Thesis Card`;
  const snapshotText =
    context.snapshot && context.snapshot.lastPrice !== null
      ? `${context.snapshot.lastPrice} (${context.snapshot.changePercent ?? 0}%)`
      : 'N/A';

  return {
    title,
    bodyMarkdown: [
      `## ${title}`,
      '',
      `- symbol: ${symbolLabel}`,
      `- scope: ${context.scope}`,
      `- references: ${context.referenceIds.length}`,
      `- snapshot: ${snapshotText}`,
      `- note: ${context.latestNoteSummary ? context.latestNoteSummary.title : 'N/A'}`,
      insufficientContext ? '- context: insufficient' : '- context: minimal sufficient',
    ].join('\n'),
    structuredJson: {
      schema_name: 'symbol_thesis_summary',
      schema_version: '1.0',
      confidence,
      insufficient_context: insufficientContext,
      payload: {
        bullish_points: hasReferences
          ? context.references.slice(0, 2).map((reference) => ({
              text: `Reference supports thesis: ${reference.title}`,
              reference_ids: [reference.id],
            }))
          : ['No high-confidence bullish reference yet'],
        bearish_points:
          hasSnapshot &&
          context.snapshot !== null &&
          context.snapshot.changePercent !== null &&
          context.snapshot.changePercent < 0
          ? ['Recent price weakness needs validation']
          : ['Valuation or execution risk remains'],
        watch_kpis: ['Revenue growth', 'Operating margin', 'Cash flow'],
        next_events: hasReferences
          ? context.references.slice(0, 2).map((reference) => ({
              label: reference.title,
              date: reference.publishedAt ?? null,
              reference_ids: [reference.id],
            }))
          : ['Next earnings release'],
        invalidation_conditions: ['Guidance cut', 'Material demand slowdown'],
        overall_view: insufficientContext
          ? 'Context is insufficient. Treat this as a provisional thesis.'
          : 'Base thesis remains valid with monitored downside risks.',
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
  const insufficientContext = symbolLabels.length < 2 || context.metrics.length === 0;
  const confidence: 'high' | 'medium' | 'low' = insufficientContext
    ? 'low'
    : context.references.length >= 2
      ? 'high'
      : 'medium';
  const title = `${options.titlePrefix}Comparison Summary: ${symbolLabels.join(' vs ')}`;

  return {
    title,
    bodyMarkdown: [
      `## ${title}`,
      '',
      `- symbols: ${symbolLabels.join(', ')}`,
      `- metrics: ${context.metrics.join(', ')}`,
      `- references: ${context.references.length}`,
      insufficientContext ? '- context: insufficient' : '- context: minimal sufficient',
    ].join('\n'),
    structuredJson: {
      schema_name: 'comparison_summary',
      schema_version: '1.0',
      confidence,
      insufficient_context: insufficientContext,
      payload: {
        key_differences: [
          context.metrics.length > 0
            ? `Primary difference axis: ${context.metrics.slice(0, 2).join(', ')}`
            : 'Insufficient metrics to identify differences',
        ],
        risk_points: insufficientContext
          ? ['Input context is limited. Treat this as provisional.']
          : ['Cross-check recent alerts and references for regime change risk.'],
        next_actions: ['Review latest disclosures', 'Validate thesis consistency with current snapshots'],
        compared_symbols: context.symbols.map((symbol) => symbol.id),
        reference_ids: context.references.map((reference) => reference.id),
        overall_view: insufficientContext
          ? 'Comparison context is limited and should be used only as a starting point.'
          : 'Current comparison suggests a measurable gap, but requires follow-up validation.',
      },
    },
    modelName: options.modelName,
    promptVersion: options.promptVersion,
  };
}

function buildDeterministicBacktestOutput(
  context: BacktestSummaryContext,
  options: { modelName: string; promptVersion: string; titlePrefix: string },
): BacktestSummaryOutput {
  const hasMetrics = !!context.metrics;
  const hasImports = context.importFiles.length > 0;
  const insufficientContext = !hasMetrics && !hasImports;
  const confidence: 'high' | 'medium' | 'low' = insufficientContext ? 'low' : hasMetrics ? 'high' : 'medium';
  const title = `${options.titlePrefix}Backtest Review: ${context.title}`;
  const keyMetrics = {
    total_trades: context.metrics?.totalTrades ?? null,
    win_rate: context.metrics?.winRate ?? null,
    profit_factor: context.metrics?.profitFactor ?? null,
    max_drawdown: context.metrics?.maxDrawdown ?? null,
    net_profit: context.metrics?.netProfit ?? null,
  };

  return {
    title,
    bodyMarkdown: [
      `## ${title}`,
      '',
      `- backtest_id: ${context.backtestId}`,
      `- market/timeframe: ${context.market}/${context.timeframe}`,
      `- imports: ${context.importFiles.length}`,
      `- metrics: ${hasMetrics ? 'available' : 'unavailable'}`,
      insufficientContext ? '- context: insufficient' : '- context: minimal sufficient',
    ].join('\n'),
    structuredJson: {
      schema_name: 'backtest_review_summary',
      schema_version: '1.0',
      confidence,
      insufficient_context: insufficientContext,
      payload: {
        strengths: hasMetrics
          ? ['Parsed metrics are available for quantitative review.']
          : ['Import history is available for operational traceability.'],
        risks: insufficientContext
          ? ['Insufficient parsed summary context. Treat this as provisional.']
          : ['Validate robustness with additional periods and stress cases.'],
        next_actions: ['Re-check assumptions in strategy snapshot', 'Compare with another import window'],
        key_metrics: keyMetrics,
        overall_view: insufficientContext
          ? 'Backtest context is limited. Additional parsed inputs are required.'
          : 'Backtest result is usable as a baseline and should be validated against broader scenarios.',
      },
    },
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
}

class LocalLlmHomeAiProvider implements HomeAiProvider {
  readonly providerType: HomeAiProviderType = 'local_llm';
  private readonly alertAdapter = new LocalLlmAdapter();
  private readonly endpoint = (env.LOCAL_LLM_ENDPOINT ?? 'http://localhost:11434').replace(/\/$/, '');
  private readonly modelName = env.PRIMARY_LOCAL_MODEL;

  async generateAlertSummary(context: AlertSummaryContext): Promise<AlertSummaryOutput> {
    return this.alertAdapter.generateAlertSummary(context);
  }

  async generateDailySummary(context: DailySummaryContext): Promise<DailySummaryOutput> {
    const systemPrompt = [
      'あなたは日本株のホーム画面向け日次要約アシスタントです。',
      '入力された件数情報だけを使い、推測しすぎず JSON 形式で返答してください。',
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

    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`local_llm daily summary failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? data.message?.content ?? '';
    if (!content) {
      throw new Error('local_llm daily summary returned empty content');
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(content.replace(/```[a-z]*\n?/gi, '').trim());
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

    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content:
              'Generate a concise symbol thesis summary. Return strict JSON only.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              scope: context.scope,
              symbol: context.symbol,
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
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`local_llm symbol thesis failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? data.message?.content ?? '';
    if (!content) {
      throw new Error('local_llm symbol thesis returned empty content');
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(content.replace(/```[a-z]*\n?/gi, '').trim());
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
            ? parsed.bullish_points.slice(0, 5)
            : deterministic.structuredJson.payload.bullish_points,
          bearish_points: Array.isArray(parsed?.bearish_points)
            ? parsed.bearish_points.slice(0, 5)
            : deterministic.structuredJson.payload.bearish_points,
          watch_kpis: Array.isArray(parsed?.watch_kpis)
            ? parsed.watch_kpis.filter((item: unknown) => typeof item === 'string').slice(0, 6)
            : deterministic.structuredJson.payload.watch_kpis,
          next_events: Array.isArray(parsed?.next_events)
            ? parsed.next_events.slice(0, 4)
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

    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content:
              'Generate a concise comparison summary for stock analysis. Return strict JSON only.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              comparison_id: context.comparisonId,
              symbols: context.symbols,
              metrics: context.metrics,
              compared_metric_json: context.comparedMetricJson,
              references: context.references.slice(0, 8),
              output_schema: {
                title: '<string>',
                body_markdown: '<string>',
                key_differences: ['<string>'],
                risk_points: ['<string>'],
                next_actions: ['<string>'],
                overall_view: '<string>',
              },
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`local_llm comparison summary failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? data.message?.content ?? '';
    if (!content) {
      throw new Error('local_llm comparison summary returned empty content');
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(content.replace(/```[a-z]*\n?/gi, '').trim());
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

    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: 'Generate a concise backtest review summary for trading analysis. Return strict JSON only.',
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
              import_files: context.importFiles.slice(0, 10),
              strategy: context.strategy,
              output_schema: {
                title: '<string>',
                body_markdown: '<string>',
                strengths: ['<string>'],
                risks: ['<string>'],
                next_actions: ['<string>'],
                overall_view: '<string>',
              },
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`local_llm backtest summary failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? data.message?.content ?? '';
    if (!content) {
      throw new Error('local_llm backtest summary returned empty content');
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(content.replace(/```[a-z]*\n?/gi, '').trim());
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
          strengths: Array.isArray(parsed?.strengths)
            ? parsed.strengths.filter((item: unknown) => typeof item === 'string').slice(0, 5)
            : deterministic.structuredJson.payload.strengths,
          risks: Array.isArray(parsed?.risks)
            ? parsed.risks.filter((item: unknown) => typeof item === 'string').slice(0, 5)
            : deterministic.structuredJson.payload.risks,
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
          { role: 'system', content: 'Generate a concise symbol thesis summary as strict JSON.' },
          {
            role: 'user',
            content: JSON.stringify({
              scope: context.scope,
              symbol: context.symbol,
              reference_ids: context.referenceIds,
              references: context.references.slice(0, 6),
              snapshot: context.snapshot,
              latest_note_summary: context.latestNoteSummary,
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
            content: 'Generate a concise comparison summary as strict JSON.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              comparison_id: context.comparisonId,
              symbols: context.symbols,
              metrics: context.metrics,
              compared_metric_json: context.comparedMetricJson,
              references: context.references.slice(0, 8),
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
            content: 'Generate a concise backtest review summary as strict JSON.',
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
              import_files: context.importFiles.slice(0, 10),
              strategy: context.strategy,
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
