/**
 * Context Builder for alert_reason summary (docs/5 §8, docs/6 §15)
 *
 * Reads an AlertEvent + its Symbol + ExternalReferences from the DB
 * and assembles an AlertSummaryContext for the AI adapter.
 */

import { prisma } from '../db';
import { AlertSummaryContext } from './adapter';

export async function buildAlertSummaryContext(alertEventId: string): Promise<AlertSummaryContext> {
  const event = await prisma.alertEvent.findUniqueOrThrow({
    where: { id: alertEventId },
    include: {
      symbol: true,
      // Load associated references sorted by relevance desc (docs/6 §13 relevance ordering)
      externalReferences: {
        orderBy: [{ relevanceScore: 'desc' }, { publishedAt: 'desc' }],
        take: 10, // top-10 to stay within context window
      },
    },
  });

  // Build reference summaries for structured_json / AI prompt
  const referenceSummaries = event.externalReferences.map((ref: {
    id: string;
    referenceType: string;
    title: string;
    sourceName: string | null;
    sourceUrl: string | null;
    publishedAt: Date | null;
    summaryText: string | null;
    relevanceScore: number | null;
  }) => ({
    id: ref.id,
    referenceType: ref.referenceType,
    title: ref.title,
    sourceName: ref.sourceName,
    sourceUrl: ref.sourceUrl,
    publishedAt: ref.publishedAt,
    summaryText: ref.summaryText,
    relevanceScore: ref.relevanceScore,
  }));

  return {
    alertEventId: event.id,
    alertName: event.alertName,
    alertType: event.alertType,
    timeframe: event.timeframe,
    triggerPrice: event.triggerPrice,
    triggeredAt: event.triggeredAt,
    symbol: event.symbol
      ? {
          id: event.symbol.id,
          displayName: event.symbol.displayName,
          tradingviewSymbol: event.symbol.tradingviewSymbol,
          marketCode: event.symbol.marketCode,
        }
      : null,
    rawPayload: event.triggerPayloadJson as Record<string, unknown>,
    // Collected references — included in structured_json reference_ids (docs/5 §5.1, docs/10 §6)
    referenceIds: referenceSummaries.map((r: { id: string }) => r.id),
    references: referenceSummaries,
  };
}
