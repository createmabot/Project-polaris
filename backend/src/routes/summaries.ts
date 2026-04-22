import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { formatSuccess } from '../utils/response';
import {
  normalizeDailyQueryType,
  normalizeDate,
  resolveDailySummary,
} from '../summaries/daily';
import { prisma } from '../db';

type DailySummaryQuery = {
  type?: string;
  summary_type?: string;
  summaryType?: string;
  date?: string;
};

export async function summaryRoutes(fastify: FastifyInstance) {
  fastify.get('/daily', async (
    request: FastifyRequest<{ Querystring: DailySummaryQuery }>,
    reply: FastifyReply,
  ) => {
    const query = request.query ?? {};
    const summaryType = normalizeDailyQueryType(
      query.type ?? query.summary_type ?? query.summaryType,
    );
    const date = normalizeDate(query.date);

    const dailySummary = await resolveDailySummary(prisma as any, {
      summaryType,
      date,
    });

    return reply.status(200).send(formatSuccess(request, dailySummary));
  });
}

