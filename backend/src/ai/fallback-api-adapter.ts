/**
 * FallbackApiAdapter — GPT-5 mini via OpenAI-compatible API
 * docs/28 §3-2: exception-only fallback; never used for routine tasks
 *
 * Only active when one of the four escalation conditions is met:
 *  1. Pine compile error
 *  2. 2+ retry loops failed
 *  3. High-constraint input
 *  4. Final quality version required
 */

import { AiAdapter, AlertSummaryContext, AlertSummaryOutput } from './adapter';
import { AI_CONFIG, EscalationReason } from './config';

export class FallbackApiAdapter implements AiAdapter {
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  readonly escalationReason: EscalationReason;

  constructor(escalationReason: EscalationReason) {
    this.modelName = AI_CONFIG.fallbackApiModel;
    this.apiKey = AI_CONFIG.fallbackApiKey ?? '';
    this.endpoint = AI_CONFIG.fallbackApiEndpoint;
    this.escalationReason = escalationReason;
  }

  get promptVersion(): string {
    return 'v1.0.0-fallback';
  }

  async generateAlertSummary(ctx: AlertSummaryContext): Promise<AlertSummaryOutput> {
    if (!this.apiKey) {
      throw new Error('FALLBACK_API_KEY is not configured. Cannot escalate to GPT-5 mini.');
    }

    const symbolLabel = ctx.symbol?.displayName ?? ctx.symbol?.tradingviewSymbol ?? 'Unknown Symbol';
    const hasRefs = ctx.references.length > 0;

    const systemPrompt = [
      'あなたは株式市場のプロフェッショナルなアラート分析アシスタントです。',
      '提供されたアラート情報と参照情報をもとに、高品質なJSON形式の分析を日本語で出力してください。',
      '断定的な表現は避け、根拠となる参照情報のIDを必ず含めてください。',
    ].join(' ');

    const refSummaries = ctx.references
      .slice(0, 8)
      .map((r) => {
        const publishedAt = r.publishedAtIso ?? (r.publishedAt ? r.publishedAt.toISOString() : 'N/A');
        return `[${r.id.slice(0, 8)}] (sourceType=${r.sourceType ?? r.referenceType}, published_at=${publishedAt}) ${r.title}${r.summaryText ? ': ' + r.summaryText : ''}`;
      })
      .join('\n');

    const userPrompt = [
      `## アラート情報`,
      `- 銘柄: ${symbolLabel}`,
      `- アラート名: ${ctx.alertName}`,
      `- 種別: ${ctx.alertType ?? 'N/A'}`,
      `- 時間足: ${ctx.timeframe ?? 'N/A'}`,
      `- 発火時刻: ${ctx.triggeredAt?.toISOString() ?? 'N/A'}`,
      `- 発火価格: ${ctx.triggerPrice ?? 'N/A'}`,
      '',
      hasRefs ? `## 参照情報\n${refSummaries}` : '## 参照情報\nなし',
      '',
      `## エスカレーション理由: ${this.escalationReason}`,
      '',
      '## 出力形式 (strict JSON, no markdown)',
      JSON.stringify({
        title: '<string>',
        what_happened: '<string>',
        fact_points: ['<string>'],
        reason_hypotheses: [{ text: '<string>', confidence: 'low|medium|high', reference_ids: ['<ref_id>'] }],
        watch_points: ['<string>'],
        next_actions: ['<string>'],
      }),
    ].join('\n');

    const startedAt = Date.now();
    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Fallback API error HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    const estimatedTokens = (data.usage?.total_tokens ?? Math.ceil(content.length / 4));
    // GPT-5 mini rough cost estimate ($0.40/1M input + $1.60/1M output tokens, simplified)
    const estimatedCostUsd = (data.usage?.prompt_tokens ?? 0) * 0.0000004 +
                             (data.usage?.completion_tokens ?? 0) * 0.0000016;

    let parsed: any = null;
    try { parsed = JSON.parse(content); } catch { /* use fallback structure */ }

    const title = parsed?.title ?? `[Fallback] ${ctx.alertName} — ${symbolLabel}`;

    return {
      title,
      bodyMarkdown: [
        `## ${title}`,
        '',
        `**Symbol:** ${symbolLabel}`,
        `**Escalation reason:** ${this.escalationReason}`,
        '',
        parsed?.what_happened ?? '（要約に失敗しました）',
      ].join('\n'),
      structuredJson: {
        schema_name: 'alert_reason_summary',
        schema_version: '1.0',
        confidence: hasRefs ? 'high' : 'medium',
        insufficient_context: !parsed,
        payload: {
          what_happened: parsed?.what_happened ?? '',
          fact_points: parsed?.fact_points ?? [],
          reason_hypotheses: parsed?.reason_hypotheses ?? [],
          watch_points: parsed?.watch_points ?? [],
          next_actions: parsed?.next_actions ?? [],
          reference_ids: ctx.referenceIds,
        },
      },
      modelName: this.modelName,
      promptVersion: this.promptVersion,
      _meta: { durationMs, estimatedTokens, estimatedCostUsd, escalationReason: this.escalationReason },
    } as AlertSummaryOutput & { _meta: any };
  }
}
