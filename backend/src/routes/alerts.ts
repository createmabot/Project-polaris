import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';

export async function alertRoutes(fastify: FastifyInstance) {
  fastify.get('/:alertId', async (
    request: FastifyRequest<{ Params: { alertId: string } }>,
    reply: FastifyReply
  ) => {
    const { alertId } = request.params;

    // Fetch alert with related symbol and external references
    const alertEvent = await prisma.alertEvent.findUnique({
      where: { id: alertId },
      include: {
        symbol: true,
        externalReferences: {
          orderBy: { publishedAt: 'desc' },
        },
      },
    });

    if (!alertEvent) {
      throw new AppError(404, 'ALERT_NOT_FOUND', 'The specified alert was not found.');
    }

    // Fetch related AI summary for the alert reason
    const relatedSummary = await prisma.aiSummary.findFirst({
      where: {
        targetEntityType: 'alert_event',
        targetEntityId: alertId,
        summaryScope: 'alert_reason',
      },
      orderBy: { generatedAt: 'desc' },
    });

    // Grouping the response up
    const data = {
      alert_event: alertEvent, // includes symbol and externalReferences internally, but let's be explicit
      symbol: alertEvent.symbol || null,
      related_references: alertEvent.externalReferences,
      related_ai_summary: relatedSummary || null,
      processing_status: alertEvent.processingStatus,
    };

    return reply.status(200).send(formatSuccess(request, data));
  });
}
