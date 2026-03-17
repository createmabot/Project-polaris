import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db';
import { formatSuccess } from '../utils/response';

export async function homeRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Fetch recent alerts (e.g., last 10)
    // We join the symbol to display the name/ticker, and we also try to get the associated aiSummary
    // If it's unresolved_symbol or needs_review, it might not have an ai_summary, which is fine.
    const recentAlertsRaw = await prisma.alertEvent.findMany({
      take: 10,
      orderBy: {
        triggeredAt: 'desc',
      },
      include: {
        symbol: true,
        // Since an alert could theoretically have multiple summaries over time, 
        // we could just fetch the latest one directly or via a nested query.
      },
    });

    // To get the latest ai_summary for each alert efficiently, we can fetch them separately
    // based on targetEntityId, or just use findMany.
    const alertIds = recentAlertsRaw.map((a: any) => a.id);
    const summaries = await prisma.aiSummary.findMany({
      where: {
        targetEntityType: 'alert_event',
        targetEntityId: { in: alertIds },
        summaryScope: 'alert_reason', // As per specs docs/5
      },
      orderBy: { generatedAt: 'desc' },
    });

    // Map summaries to alerts (simplest: first matching summary is the latest due to orderBy)
    const recentAlerts = recentAlertsRaw.map((alert: any) => {
      const relatedSummary = summaries.find((s: any) => s.targetEntityId === alert.id) || null;
      return {
        ...alert,
        related_ai_summary: relatedSummary,
      };
    });

    // 2. Fetch daily summary
    // Fetches the latest daily summary, if one exists
    const dailySummary = await prisma.aiSummary.findFirst({
      where: {
        targetEntityType: 'market_snapshot', // or general daily scope
        summaryScope: 'daily',
      },
      orderBy: { generatedAt: 'desc' },
    });

    // 3. Watchlists and key events (Empty placeholders for MVP)
    const watchlist_symbols: any[] = [];
    const positions: any[] = [];
    const key_events: any[] = [];
    const market_overview = { indices: [], fx: [], sectors: [] };

    const data = {
      market_overview,
      watchlist_symbols,
      positions,
      recent_alerts: recentAlerts,
      daily_summary: dailySummary,
      key_events,
    };

    return reply.status(200).send(formatSuccess(request, data));
  });
}
