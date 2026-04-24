import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { formatSuccess } from '../utils/response';
import {
  generateDailySummaryWithJob,
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
  fastify.post('/daily/generate', async (
    request: FastifyRequest<{ Body: DailySummaryQuery }>,
    reply: FastifyReply,
  ) => {
    const body = request.body ?? {};
    const summaryType = normalizeDailyQueryType(
      body.type ?? body.summary_type ?? body.summaryType,
    );
    const date = normalizeDate(body.date);

    const generated = await generateDailySummaryWithJob(prisma as any, {
      summaryType,
      date,
    });

    return reply.status(200).send(formatSuccess(request, {
      job_id: generated.jobId,
      summary: generated.summary,
    }));
  });

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

