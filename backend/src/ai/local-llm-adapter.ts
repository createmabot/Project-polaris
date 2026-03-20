/**
 * LocalLlmAdapter — Qwen3 via Ollama-compatible HTTP API
 * docs/28 §3-1: primary local model for all routine AI tasks
 *
 * Compatible with:
 *  - Ollama  (POST /api/chat or /v1/chat/completions)
 *  - LM Studio (POST /v1/chat/completions)
 *  - Any OpenAI-compatible local server
 */

import { AiAdapter, AlertSummaryContext, AlertSummaryOutput } from './adapter';
import { AI_CONFIG } from './config';

interface OllamaResponse {
  message?: { content?: string };
  choices?: Array<{ message?: { content?: string } }>;
}

export class LocalLlmAdapter implements AiAdapter {
  readonly modelName: string;
  private readonly endpoint: string;

  constructor(
    modelName = AI_CONFIG.primaryLocalModel,
    endpoint = AI_CONFIG.localLlmEndpoint,
  ) {
    this.modelName = modelName;
    this.endpoint = endpoint;
  }

  get promptVersion(): string {
    return 'v1.0.0-local';
  }

  async generateAlertSummary(ctx: AlertSummaryContext): Promise<AlertSummaryOutput> {
    const symbolLabel = ctx.symbol?.displayName ?? ctx.symbol?.tradingviewSymbol ?? 'Unknown Symbol';
    const hasRefs = ctx.references.length > 0;

    const systemPrompt = [
      'あなたは株式市場のアラート分析アシスタントです。',
      'アラートの背景要因を JSON スキーマに従って日本語で出力してください。',
      '断定的な表現は使わず、「可能性」「候補」として述べてください。',
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

    return [
      `## アラート情報`,
      `- 銘柄: ${symbolLabel}`,
      `- アラート名: ${ctx.alertName}`,
      `- 種別: ${ctx.alertType ?? 'N/A'}`,
      `- 時間足: ${ctx.timeframe ?? 'N/A'}`,
      `- 発火時刻: ${ctx.triggeredAt?.toISOString() ?? 'N/A'}`,
      `- 発火価格: ${ctx.triggerPrice ?? 'N/A'}`,
      '',
      hasRefs ? `## 参照情報\n${refSummaries}` : '## 参照情報\n(なし)',
      '',
      '## 出力指示',
      '以下の JSON 形式で出力してください（コードブロックは不要）:',
      JSON.stringify({
        title: '<string: アラートタイトル>',
        what_happened: '<string: 何が起きたか>',
        fact_points: ['<string>'],
        reason_hypotheses: [{ text: '<string>', confidence: 'low|medium|high', reference_ids: ['<id>'] }],
        watch_points: ['<string>'],
        next_actions: ['<string>'],
      }, null, 2),
    ].join('\n');
  }

  private async _callEndpoint(systemPrompt: string, userPrompt: string): Promise<string> {
    // Try OpenAI-compatible endpoint first (/v1/chat/completions)
    const url = `${this.endpoint.replace(/\/$/, '')}/v1/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
      // 60 second timeout
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const data: OllamaResponse = await response.json();
    const content = data.choices?.[0]?.message?.content ?? data.message?.content;
    if (!content) throw new Error('Empty response from local LLM');
    return content;
  }

  private _parseOutput(
    rawText: string,
    ctx: AlertSummaryContext,
    symbolLabel: string,
    hasRefs: boolean,
  ): Omit<AlertSummaryOutput, 'modelName' | 'promptVersion'> {
    // Try to extract JSON from the response
    let parsed: any = null;
    try {
      // Strip markdown code fences if any
      const jsonText = rawText.replace(/```[a-z]*\n?/g, '').trim();
      parsed = JSON.parse(jsonText);
    } catch {
      // Fallback: model returned non-JSON; build minimal output
    }

    const title = parsed?.title ?? `[Local] ${ctx.alertName} — ${symbolLabel}`;
    const whatHappened = parsed?.what_happened ?? `${ctx.alertName} が ${symbolLabel} で発火した。`;
    const factPoints: string[] = parsed?.fact_points ?? ['アラート条件が成立した。'];
    const reasonHypotheses = parsed?.reason_hypotheses ?? [{
      text: hasRefs ? '参照情報をもとに分析中（要確認）。' : '参照情報なし。背景要因は特定されていない。',
      confidence: 'low',
      reference_ids: [],
    }];
    const watchPoints: string[] = parsed?.watch_points ?? ['翌営業日の値動きを確認する。'];
    const nextActions: string[] = parsed?.next_actions ?? ['関連情報を確認する。'];

    const bodyMarkdown = [
      `## ${title}`,
      '',
      `**Symbol:** ${symbolLabel}`,
      `**Alert:** ${ctx.alertName}`,
      '',
      hasRefs
        ? `**参照情報 (${ctx.references.length}件):**\n${ctx.references.slice(0, 3).map(r => `- [${r.sourceType ?? r.referenceType}] ${r.title} (${r.publishedAtIso ?? (r.publishedAt ? r.publishedAt.toISOString() : 'N/A')})`).join('\n')}`
        : '> 外部参照情報なし。背景要因の特定には追加情報が必要です。',
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
