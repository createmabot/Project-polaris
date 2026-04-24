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

export type HomeAiProvider = {
  providerType: HomeAiProviderType;
  generateAlertSummary: (context: AlertSummaryContext) => Promise<AlertSummaryOutput>;
  generateDailySummary: (context: DailySummaryContext) => Promise<DailySummaryOutput>;
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
