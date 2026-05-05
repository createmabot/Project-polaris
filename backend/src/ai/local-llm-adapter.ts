import { AiAdapter, AlertSummaryContext, AlertSummaryOutput } from './adapter';
import { AI_CONFIG } from './config';

interface OllamaResponse {
  message?: { content?: string };
  choices?: Array<{ message?: { content?: string } }>;
  done_reason?: string;
}

type SignalLabel = 'buy' | 'sell' | 'warning' | 'watch';

function sanitizeReferenceIds(value: unknown, allowedReferenceIds: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const allowed = new Set(allowedReferenceIds);
  return value
    .filter((item): item is string => typeof item === 'string' && allowed.has(item))
    .slice(0, 5);
}

function sanitizeReasonHypotheses(value: unknown, allowedReferenceIds: readonly string[]) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || typeof (item as any).text !== 'string') {
        return null;
      }
      const rawConfidence = typeof (item as any).confidence === 'string' ? (item as any).confidence : 'low';
      const confidence =
        rawConfidence === 'high' || rawConfidence === 'medium' || rawConfidence === 'low'
          ? rawConfidence
          : 'low';
      return {
        text: (item as any).text,
        confidence,
        reference_ids: sanitizeReferenceIds((item as any).reference_ids, allowedReferenceIds),
      };
    })
    .filter(
      (
        item,
      ): item is { text: string; confidence: 'low' | 'medium' | 'high'; reference_ids: string[] } =>
        item !== null,
    )
    .slice(0, 4);
}

function inferSignalLabel(ctx: AlertSummaryContext): SignalLabel {
  const raw = [
    ctx.alertName,
    ctx.alertType ?? '',
    typeof ctx.rawPayload?.condition_summary === 'string' ? ctx.rawPayload.condition_summary : '',
  ]
    .join(' ')
    .toLowerCase();

  const buyHints = [
    'buy',
    'long',
    'bull',
    'breakout',
    'cross above',
    'golden',
    '上抜け',
    '突破',
    '反発',
    '買い',
    '上昇',
    'ブレイクアウト',
    'ゴールデンクロス',
  ];
  const sellHints = [
    'sell',
    'short',
    'bear',
    'break below',
    'cross below',
    'dead cross',
    '下抜け',
    '売り',
    '下落',
    '弱気',
    'デッドクロス',
    'ロスカット',
  ];
  const warningHints = ['warning', 'caution', 'risk', 'alert', '警戒', '注意', '失速', '過熱'];

  if (sellHints.some((hint) => raw.includes(hint))) return 'sell';
  if (buyHints.some((hint) => raw.includes(hint))) return 'buy';
  if (warningHints.some((hint) => raw.includes(hint))) return 'warning';
  return 'watch';
}

function signalLabelText(label: SignalLabel): string {
  switch (label) {
    case 'buy':
      return '買いシグナル';
    case 'sell':
      return '売りシグナル';
    case 'warning':
      return '警戒シグナル';
    default:
      return '監視継続シグナル';
  }
}

function buildSignalEvaluation(ctx: AlertSummaryContext): string {
  const label = inferSignalLabel(ctx);
  const conditionSummary =
    typeof ctx.rawPayload?.condition_summary === 'string' && ctx.rawPayload.condition_summary.trim().length > 0
      ? ctx.rawPayload.condition_summary.trim()
      : null;

  const detail =
    conditionSummary ??
    (ctx.alertName && ctx.alertName.trim().length > 0 ? ctx.alertName.trim() : '条件名から方向性が十分に読めません');

  if (label === 'watch') {
    return `方向不明の監視シグナルとして扱うのが妥当です。条件は「${detail}」で、売買方向は追加確認が必要です。`;
  }

  return `${signalLabelText(label)}として扱える可能性があります。条件は「${detail}」で、テクニカル発火としては妥当性を検討できます。`;
}

function buildBackgroundAssessment(hasRefs: boolean, ctx: AlertSummaryContext): string {
  if (!hasRefs) {
    return '背景補強は弱く、テクニカル発火の評価はできても材料面の裏付けは不足しています。';
  }

  const hasHighSignalReference = ctx.references.some(
    (ref) => ref.referenceType === 'disclosure' || ref.referenceType === 'earnings',
  );

  if (hasHighSignalReference) {
    return '背景材料はシグナルの補強材料として使えます。直近の開示や決算系材料も合わせて確認できます。';
  }

  return '背景材料は主にニュース由来で、補強材料としては中程度です。地合いと次足確認を合わせて判断したい状態です。';
}

function buildDefaultReasonHypotheses(hasRefs: boolean, ctx: AlertSummaryContext) {
  const signalEvaluation = buildSignalEvaluation(ctx);
  const backgroundAssessment = buildBackgroundAssessment(hasRefs, ctx);
  return [
    {
      text: `${signalEvaluation} ${backgroundAssessment}`,
      confidence: hasRefs ? ('medium' as const) : ('low' as const),
      reference_ids: [],
    },
  ];
}

function buildDefaultWatchPoints(hasRefs: boolean): string[] {
  return [
    '次足でシグナルが維持されるかを確認したいです。',
    '出来高が伴っているかを確認したいです。',
    hasRefs ? '直近ニュースや開示がシグナルを補強しているかを確認したいです。' : '背景補強が弱いため、直近開示やニュースの有無を確認したいです。',
  ];
}

function buildDefaultNextActions(): string[] {
  return [
    '地合いと同業他社の値動きを合わせて確認したいです。',
    '損切り・利確ルールと整合するかを確認したいです。',
    '必要なら次足確定後に再評価したいです。',
  ];
}

export class LocalLlmAdapter implements AiAdapter {
  readonly modelName: string;
  private readonly endpoint: string;

  constructor(modelName = AI_CONFIG.primaryLocalModel, endpoint = AI_CONFIG.localLlmEndpoint) {
    this.modelName = modelName;
    this.endpoint = endpoint;
  }

  get promptVersion(): string {
    return 'v1.0.2-local';
  }

  async generateAlertSummary(ctx: AlertSummaryContext): Promise<AlertSummaryOutput> {
    const symbolLabel = ctx.symbol?.displayName ?? ctx.symbol?.tradingviewSymbol ?? 'Unknown Symbol';
    const hasRefs = ctx.references.length > 0;

    const systemPrompt = [
      'You are a Japanese alert-evaluation assistant for equity market alerts.',
      'The alert was configured by the user as a trading or monitoring signal.',
      'Use only the provided alert facts and references.',
      'Evaluate whether the alert currently looks like a buy signal, sell signal, warning signal, or watch-only signal.',
      'Clearly separate the technical signal from supporting or conflicting background information.',
      'Do not make unconditional or guaranteed buy/sell claims.',
      'If references are limited, say that background confirmation is weak rather than avoiding signal evaluation.',
      'Return strict JSON only.',
    ].join(' ');

    const userPrompt = this._buildUserPrompt(ctx, symbolLabel, hasRefs);

    const startedAt = Date.now();
    let rawText: string;

    try {
      rawText = await this._callEndpoint(systemPrompt, userPrompt);
    } catch (e: any) {
      throw new Error(`LocalLLM connection failed (${this.endpoint}): ${e.message}`);
    }

    const durationMs = Date.now() - startedAt;
    const parsed = this._parseOutput(rawText, ctx, symbolLabel, hasRefs);

    return {
      ...parsed,
      modelName: this.modelName,
      promptVersion: this.promptVersion,
      _meta: { durationMs, estimatedTokens: Math.ceil(rawText.length / 4) },
    } as AlertSummaryOutput & { _meta: any };
  }

  private _buildUserPrompt(ctx: AlertSummaryContext, symbolLabel: string, hasRefs: boolean): string {
    const refSummaries = ctx.references
      .slice(0, 5)
      .map((r, i) => {
        const publishedAt = r.publishedAtIso ?? (r.publishedAt ? r.publishedAt.toISOString() : 'N/A');
        return `[ref${i + 1}] (sourceType=${r.sourceType ?? r.referenceType}, published_at=${publishedAt}) ${r.title}${r.summaryText ? ': ' + r.summaryText : ''}`;
      })
      .join('\n');

    const conditionSummary =
      typeof ctx.rawPayload?.condition_summary === 'string' && ctx.rawPayload.condition_summary.trim().length > 0
        ? ctx.rawPayload.condition_summary
        : 'N/A';

    return [
      '## Alert facts',
      `- symbol: ${symbolLabel}`,
      `- alert_name: ${ctx.alertName}`,
      `- alert_type: ${ctx.alertType ?? 'N/A'}`,
      `- timeframe: ${ctx.timeframe ?? 'N/A'}`,
      `- triggered_at: ${ctx.triggeredAt?.toISOString() ?? 'N/A'}`,
      `- trigger_price: ${ctx.triggerPrice ?? 'N/A'}`,
      `- condition_summary: ${conditionSummary}`,
      `- reference_count: ${ctx.referenceIds.length}`,
      '',
      hasRefs ? `## References\n${refSummaries}` : '## References\n(none)',
      '',
      '## Required output policy',
      '- Explain what triggered.',
      '- Evaluate the alert as closer to a buy signal, sell signal, warning signal, or watch-only signal.',
      '- If direction is unclear, say it is a direction-unclear watch-only signal.',
      '- Separate the technical signal from supporting or conflicting background information.',
      '- If references are limited, keep the signal evaluation but say that background confirmation is weak.',
      '- Avoid guaranteed language such as 必ず買うべき, 絶対売るべき, 確実に上がる, 損しない, 安全.',
      '- Return JSON only. No markdown code fences.',
      JSON.stringify(
        {
          title: '<string: alert title>',
          what_happened: '<string: what triggered>',
          signal_evaluation: '<string: buy/sell/warning/watch-only assessment>',
          background_assessment: '<string: whether references support, conflict, or are insufficient>',
          fact_points: ['<string>'],
          reason_hypotheses: [{ text: '<string>', confidence: 'low|medium|high', reference_ids: ['<id>'] }],
          watch_points: ['<string>'],
          next_actions: ['<string>'],
        },
        null,
        2,
      ),
    ].join('\n');
  }

  private async _callEndpoint(systemPrompt: string, userPrompt: string): Promise<string> {
    const base = this.endpoint.replace(/\/$/, '');
    const openAiUrl = `${base}/v1/chat/completions`;
    const ollamaUrl = `${base}/api/chat`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await fetch(openAiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          temperature: 0.2,
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
      }

      const data: OllamaResponse = await response.json();
      const content = data.choices?.[0]?.message?.content ?? data.message?.content;
      if (typeof content === 'string' && content.trim().length > 0) {
        return content;
      }
      throw new Error('Empty response from local LLM');
    } catch (firstError: any) {
      const response = await fetch(ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          stream: false,
          think: false,
          options: {
            temperature: 0.2,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`${firstError.message}; fallback HTTP ${response.status}: ${body.slice(0, 200)}`);
      }

      const data: OllamaResponse = await response.json();
      const content = data.choices?.[0]?.message?.content ?? data.message?.content;
      if (!content || content.trim().length === 0) {
        throw new Error(`${firstError.message}; fallback empty response from local LLM`);
      }
      return content;
    }
  }

  private _parseOutput(
    rawText: string,
    ctx: AlertSummaryContext,
    symbolLabel: string,
    hasRefs: boolean,
  ): Omit<AlertSummaryOutput, 'modelName' | 'promptVersion'> {
    let parsed: any = null;
    try {
      const jsonText = rawText.replace(/```[a-z]*\n?/g, '').trim();
      parsed = JSON.parse(jsonText);
    } catch {
      // Keep parsed as null and fall back to deterministic output.
    }

    const title = parsed?.title ?? `[Local] ${ctx.alertName} - ${symbolLabel}`;
    const whatHappened =
      parsed?.what_happened ??
      `${ctx.alertName} が ${symbolLabel} で発火しました。timeframe は ${ctx.timeframe ?? 'N/A'}、trigger price は ${
        ctx.triggerPrice ?? 'N/A'
      } です。`;
    const signalEvaluation = parsed?.signal_evaluation ?? buildSignalEvaluation(ctx);
    const backgroundAssessment = parsed?.background_assessment ?? buildBackgroundAssessment(hasRefs, ctx);
    const factPoints: string[] =
      parsed?.fact_points ??
      [
        `alert_name: ${ctx.alertName}`,
        `timeframe: ${ctx.timeframe ?? 'N/A'}`,
        `trigger_price: ${ctx.triggerPrice ?? 'N/A'}`,
      ];
    const reasonHypotheses =
      parsed?.reason_hypotheses && sanitizeReasonHypotheses(parsed.reason_hypotheses, ctx.referenceIds).length > 0
        ? sanitizeReasonHypotheses(parsed.reason_hypotheses, ctx.referenceIds)
        : buildDefaultReasonHypotheses(hasRefs, ctx);
    const watchPoints: string[] = parsed?.watch_points ?? buildDefaultWatchPoints(hasRefs);
    const nextActions: string[] = parsed?.next_actions ?? buildDefaultNextActions();

    const bodyMarkdown = [
      `## ${title}`,
      '',
      `- 銘柄: ${symbolLabel}`,
      `- アラート: ${ctx.alertName}`,
      `- time frame: ${ctx.timeframe ?? 'N/A'}`,
      `- trigger price: ${ctx.triggerPrice ?? 'N/A'}`,
      '',
      '### 何が発火したか',
      whatHappened,
      '',
      '### シグナル評価',
      `- ${signalEvaluation}`,
      '',
      '### 背景材料',
      `- ${backgroundAssessment}`,
      ...reasonHypotheses.slice(0, 3).map((item: any) => `- ${item.text}`),
      '',
      '### 追加確認',
      ...watchPoints.slice(0, 3).map((item) => `- ${item}`),
      ...nextActions.slice(0, 3).map((item) => `- ${item}`),
      '',
      hasRefs
        ? `### 参照情報 (${ctx.references.length}件)\n${ctx.references
            .slice(0, 3)
            .map(
              (r) =>
                `- [${r.sourceType ?? r.referenceType}] ${r.title} (${
                  r.publishedAtIso ?? (r.publishedAt ? r.publishedAt.toISOString() : 'N/A')
                })`,
            )
            .join('\n')}`
        : '> 参照情報は0件です。シグナル評価は可能ですが、背景補強は弱い状態です。',
    ].join('\n');

    return {
      title,
      bodyMarkdown,
      structuredJson: {
        schema_name: 'alert_reason_summary',
        schema_version: '1.0',
        confidence: hasRefs ? 'medium' : 'low',
        insufficient_context: !hasRefs || !parsed,
        payload: {
          what_happened: whatHappened,
          fact_points: factPoints,
          reason_hypotheses: reasonHypotheses,
          watch_points: watchPoints,
          next_actions: nextActions,
          reference_ids: ctx.referenceIds,
        },
      },
    };
  }
}
