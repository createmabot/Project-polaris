/**
 * External Reference Collector (docs/6: external references 収集フロー設計)
 *
 * Defines the interface for collecting external references (news, disclosures, earnings).
 * Current implementation is a mock. Swap MockReferenceCollector for real API adapters
 * (e.g., NewsAPI, TDnet disclosure feed) without changing the caller.
 */

import crypto from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────

export type ReferenceType = 'news' | 'disclosure' | 'earnings';

export interface CollectedReference {
  referenceType: ReferenceType;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: Date | null;
  summaryText: string | null;
  /** Source-specific metadata: provider_article_id, language, category, relevance_score, etc. */
  metadataJson: Record<string, unknown>;
  /** 0-100 relevance score for ranking (docs/6 §13.3) */
  relevanceScore: number;
}

export interface AlertReferenceCollectionContext {
  alertEventId: string;
  symbolId: string | null;
  symbolCode: string | null;       // e.g., "7203" — used as search query
  displayName: string | null;      // human-readable name
  tradingviewSymbol: string | null;
  alertType: string | null;
  alertName: string;
  triggeredAt: Date | null;
}

export interface ReferenceCollector {
  collectForAlert(ctx: AlertReferenceCollectionContext): Promise<CollectedReference[]>;
}

// ─── Dedupe Key ─────────────────────────────────────────────────────────────

/**
 * Build a stable dedupeKey per reference.
 * Prefer source_url; fall back to hash of symbolId + type + title.
 * docs/6 §14.3: same source_url = same reference, don't duplicate.
 */
export function buildDedupeKey(
  symbolId: string | null,
  sourceUrl: string | null,
  referenceType: string,
  title: string,
): string {
  if (sourceUrl) {
    // URL-based: one record per URL (global across symbols)
    return crypto.createHash('sha256').update(`url:${sourceUrl}`).digest('hex').slice(0, 64);
  }
  // Fallback: hash of symbolId + type + title
  const raw = `${symbolId ?? ''}:${referenceType}:${title}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
}

// ─── Mock Collector ─────────────────────────────────────────────────────────

export class MockReferenceCollector implements ReferenceCollector {
  async collectForAlert(ctx: AlertReferenceCollectionContext): Promise<CollectedReference[]> {
    // Simulate a short delay
    await new Promise((r) => setTimeout(r, 20));

    const symbol = ctx.symbolCode ?? ctx.displayName ?? 'Unknown';
    const now = ctx.triggeredAt ?? new Date();

    // docs/6 §12: normalize references per reference_type
    const mockRefs: CollectedReference[] = [
      {
        referenceType: 'news',
        title: `[Mock] ${symbol} — 関連市場ニュース`,
        sourceName: 'mock_news_feed',
        sourceUrl: `https://mock-news.example.com/${ctx.symbolId ?? 'unknown'}-${now.getTime()}`,
        publishedAt: now,
        summaryText: `模擬ニュース: ${symbol} に関する本日の市況情報。背景要因の特定には実データが必要です。`,
        metadataJson: {
          provider_article_id: `mock-${now.getTime()}`,
          language: 'ja',
          relevance_score: 40,
          is_mock: true,
        },
        relevanceScore: 40,
      },
      {
        referenceType: 'disclosure',
        title: `[Mock] ${symbol} — 直近の適時開示候補`,
        sourceName: 'mock_disclosure_feed',
        sourceUrl: `https://mock-disclosure.example.com/${ctx.symbolId ?? 'unknown'}-disclosure-${now.getTime()}`,
        publishedAt: new Date(now.getTime() - 86400000), // 1 day ago
        summaryText: `模擬開示: ${symbol} の直近開示情報です。`,
        metadataJson: {
          disclosure_category: 'financial_results',
          relevance_score: 70,
          is_mock: true,
        },
        relevanceScore: 70,
      },
    ];

    return mockRefs;
  }
}

export const mockReferenceCollector: ReferenceCollector = new MockReferenceCollector();
