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
  done_reason?: string;
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
      const confidence = rawConfidence === 'high' || rawConfidence === 'medium' || rawConfidence === 'low' ? rawConfidence : 'low';
      return {
        text: (item as any).text,
        confidence,
        reference_ids: sanitizeReferenceIds((item as any).reference_ids, allowedReferenceIds),
      };
    })
    .filter((item): item is { text: string; confidence: 'low' | 'medium' | 'high'; reference_ids: string[] } => item !== null)
    .slice(0, 4);
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
    return 'v1.0.1-local';
  }

  async generateAlertSummary(ctx: AlertSummaryContext): Promise<AlertSummaryOutput> {
    const symbolLabel = ctx.symbol?.displayName ?? ctx.symbol?.tradingviewSymbol ?? 'Unknown Symbol';
    const hasRefs = ctx.references.length > 0;

    const systemPrompt = [
      'You are a Japanese alert-summary assistant for equity market alerts.',
      'Use only the provided alert facts and references.',
      'Do not give direct buy or sell recommendations.',
      'When references are limited, explicitly say that context is limited and stay conservative.',
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

    return [
      `## アラート情報`,
      `- 銘柄: ${symbolLabel}`,
      `- アラート名: ${ctx.alertName}`,
      `- 種別: ${ctx.alertType ?? 'N/A'}`,
      `- 時間足: ${ctx.timeframe ?? 'N/A'}`,
      `- 発火時刻: ${ctx.triggeredAt?.toISOString() ?? 'N/A'}`,
      `- 発火価格: ${ctx.triggerPrice ?? 'N/A'}`,
      `- reference_count: ${ctx.referenceIds.length}`,
      '',
      hasRefs ? `## 参照情報\n${refSummaries}` : '## 参照情報\n(なし)',
      '',
      '## 出力指示',
      '- 断定的な売買推奨はしないこと',
      '- 参照不足時は「追加確認が必要」と明記すること',
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
    const reasonHypotheses = parsed?.reason_hypotheses
      ? sanitizeReasonHypotheses(parsed.reason_hypotheses, ctx.referenceIds)
      : [{
          text: hasRefs ? '参照情報をもとに分析中（要確認）。' : '参照情報なし。背景要因は特定されていない。',
          confidence: 'low' as const,
          reference_ids: [],
        }];
    const watchPoints: string[] = parsed?.watch_points ?? ['翌営業日の値動きを確認する。'];
    const nextActions: string[] = parsed?.next_actions ?? ['関連情報を確認する。'];

    const bodyMarkdown = [
      `## ${title}`,
      '',
      `- 銘柄: ${symbolLabel}`,
      `- アラート: ${ctx.alertName}`,
      `- 時間足: ${ctx.timeframe ?? 'N/A'}`,
      `- 発火価格: ${ctx.triggerPrice ?? 'N/A'}`,
      '',
      `### 何が起きたか`,
      whatHappened,
      '',
      `### 背景要因の候補`,
      ...(reasonHypotheses.length > 0
        ? reasonHypotheses.slice(0, 3).map((item: any) => `- ${item.text}`)
        : ['- 参照情報が不足しているため、背景要因は追加確認が必要です。']),
      '',
      `### 追加で見るべき点`,
      ...watchPoints.slice(0, 3).map((item) => `- ${item}`),
      ...nextActions.slice(0, 3).map((item) => `- ${item}`),
      '',
      hasRefs
        ? `### 参照情報 (${ctx.references.length}件)\n${ctx.references.slice(0, 3).map(r => `- [${r.sourceType ?? r.referenceType}] ${r.title} (${r.publishedAtIso ?? (r.publishedAt ? r.publishedAt.toISOString() : 'N/A')})`).join('\n')}`
        : '> 参照情報が不足しているため、背景要因は暫定評価です。',
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
