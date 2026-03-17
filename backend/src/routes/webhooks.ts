import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { redis } from '../redis';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { AppError, formatSuccess } from '../utils/response';
import { webhookQueue } from '../queue';
import { hashSecret } from '../utils/hash';

// External Payload v1
const externalPayloadV1Schema = z.object({
  alert_name: z.string(),
  alert_type: z.string(),
  tradingview_symbol: z.string().optional(),
  symbol: z.string().optional(),
  timeframe: z.string(),
  triggered_at: z.string().datetime(),
  trigger_price: z.number().optional(),
  shared_secret: z.string().optional(),
  market_code: z.string().optional(),
  condition_summary: z.string().optional(),
}).passthrough();

export const webhookRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.post('/tradingview/webhook', async (request, reply) => {
    const rawBodyText = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    const receivedAt = new Date();
    
    // 1. Create Receipt Immediately
    const receipt = await prisma.webhookReceipt.create({
      data: {
        provider: 'tradingview',
        requestHeadersJson: request.headers as any,
        rawBodyText,
        remoteIp: request.ip,
        receivedAt,
      }
    });

    let logData: any = {
      event: 'webhook_receipt',
      request_id: request.id,
      provider: 'tradingview',
      received_at: receivedAt.toISOString(),
      remote_ip: request.ip,
      user_agent: request.headers['user-agent'],
      content_type: request.headers['content-type'],
      body_size: typeof request.body === 'string' ? request.body.length : JSON.stringify(request.body).length
    };

    try {
      // 2. Parse Body if text/plain
      let parsedBody: any;
      let isPureText = false;
      if (typeof request.body === 'string') {
        try {
          parsedBody = JSON.parse(request.body);
          logData.parse_result = 'success_from_text';
          await updateReceipt(receipt.id, { parseResult: 'success_from_text' });
        } catch (e) {
          // It's pure text, not JSON. We still accept it but mark unresolved.
          isPureText = true;
          parsedBody = {}; // empty object for zod to fail gracefully or bypass
          logData.parse_result = 'pure_text_fallback';
          await updateReceipt(receipt.id, { parseResult: 'pure_text_fallback', errorReason: 'Not JSON' });
        }
      } else {
        parsedBody = request.body;
        logData.parse_result = 'success_json';
        await updateReceipt(receipt.id, { parseResult: 'success_json' });
      }

      // 3. Authenticate Request
      // Step 3a: Require token from URL query param or Authorization header
      let token = (request.query as any)?.token;
      if (!token) {
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        logData.token_validation_result = 'missing';
        logData.auth_result = 'failed_missing_token';
        request.log.info(logData);
        await updateReceipt(receipt.id, { authResult: 'failed_missing_token' });
        throw new AppError(401, 'UNAUTHORIZED', 'Missing webhook token');
      }

      // Step 3b: Look up the token record (token NEVER falls back to shared_secret)
      const validToken = await prisma.webhookToken.findFirst({
        where: { token, isActive: true },
      });

      if (!validToken) {
        logData.token_validation_result = 'invalid';
        logData.auth_result = 'failed_invalid_token';
        request.log.info(logData);
        await updateReceipt(receipt.id, { authResult: 'failed_invalid_token' });
        throw new AppError(401, 'UNAUTHORIZED', 'Invalid webhook token');
      }
      logData.token_validation_result = 'valid';

      // Step 3c: Independent shared_secret validation (optional field in payload)
      const payloadSharedSecret = parsedBody?.shared_secret as string | undefined;
      if (payloadSharedSecret !== undefined) {
        // shared_secret is present — must match the hashed value in the DB
        if (!validToken.sharedSecretHash) {
          // Token has no shared_secret configured — treat as mismatch
          logData.shared_secret_validation_result = 'not_configured';
          logData.auth_result = 'failed_shared_secret_not_configured';
          request.log.info(logData);
          await updateReceipt(receipt.id, { authResult: 'failed_shared_secret_not_configured' });
          throw new AppError(401, 'UNAUTHORIZED', 'shared_secret not configured for this token');
        }
        const providedHash = hashSecret(payloadSharedSecret);
        if (providedHash !== validToken.sharedSecretHash) {
          logData.shared_secret_validation_result = 'mismatch';
          logData.auth_result = 'failed_shared_secret_mismatch';
          request.log.info(logData);
          await updateReceipt(receipt.id, { authResult: 'failed_shared_secret_mismatch' });
          throw new AppError(401, 'UNAUTHORIZED', 'shared_secret mismatch');
        }
        logData.shared_secret_validation_result = 'valid';
      } else {
        logData.shared_secret_validation_result = 'not_provided';
      }
      logData.auth_result = 'success';
      await updateReceipt(receipt.id, { authResult: 'success' });

      // 4. Validate Payload against External Payload v1
      let payload: any = {};
      let processingStatus = 'received';
      let dedupeKey = '';
      let symbolId = null;

      if (isPureText) {
         processingStatus = 'needs_review';
         // Generate rudimentary dedupe key for pure text based on content + timeframe fallback to avoid duping same spam
         dedupeKey = crypto.createHash('sha256').update(`puretext:${rawBodyText}`).digest('hex');
      } else {
        const parseResult = externalPayloadV1Schema.safeParse(parsedBody);
        if (!parseResult.success) {
          logData.error_reason = 'Missing required payload fields';
          request.log.info(logData);
          await updateReceipt(receipt.id, { errorReason: 'Missing required payload fields' });
          throw new AppError(400, 'EXTERNAL_PAYLOAD_INVALID', 'Missing required fields', parseResult.error.format());
        }
        payload = parseResult.data;
      }

      // 5. Symbol Resolution (Only if not pure text)
      if (!isPureText) {
        const targetSymbol = payload.tradingview_symbol || payload.symbol;
        if (!targetSymbol) {
          logData.symbol_resolution_result = 'failed_missing';
          request.log.info(logData);
          await updateReceipt(receipt.id, { symbolResolutionResult: 'failed_missing' });
          throw new AppError(400, 'EXTERNAL_PAYLOAD_INVALID', 'Must provide tradingview_symbol or symbol');
        }

        let dbSymbol = null;
        if (payload.tradingview_symbol) {
          dbSymbol = await prisma.symbol.findFirst({ where: { tradingviewSymbol: payload.tradingview_symbol } });
        }
        if (!dbSymbol && payload.market_code && payload.symbol) {
          dbSymbol = await prisma.symbol.findFirst({ where: { marketCode: payload.market_code, symbolCode: payload.symbol } });
        }
        if (!dbSymbol && payload.symbol) {
          dbSymbol = await prisma.symbol.findFirst({ where: { symbol: payload.symbol } });
        }
        if (!dbSymbol && payload.symbol) {
          dbSymbol = await prisma.symbol.findFirst({ where: { symbolCode: payload.symbol } });
        }
        if (!dbSymbol && targetSymbol) {
          dbSymbol = await prisma.symbol.findFirst({ where: { displayName: targetSymbol } });
        }

        if (dbSymbol) {
          symbolId = dbSymbol.id;
          logData.symbol_resolution_result = 'success';
          await updateReceipt(receipt.id, { symbolResolutionResult: 'success' });
        } else {
          processingStatus = 'unresolved_symbol';
          logData.symbol_resolution_result = 'failed_not_found';
          await updateReceipt(receipt.id, { symbolResolutionResult: 'failed_not_found' });
          fastify.log.warn(`Webhook received for unresolved symbol: ${targetSymbol}`);
        }

        // 6. Deduplication Key Generation
        const dedupeString = `tradingview:${payload.tradingview_symbol || ''}:${payload.alert_name}:${payload.timeframe}:${payload.triggered_at}:${payload.trigger_price || ''}`;
        dedupeKey = crypto.createHash('sha256').update(dedupeString).digest('hex');
      }

      // 6b. Redis Auxiliary check
      const redisKey = `webhook:tv:dedupe:${dedupeKey}`;
      const isNewEventCached = await redis.set(redisKey, '1', 'EX', 60 * 60, 'NX');
      
      if (!isNewEventCached) {
        fastify.log.info(`Duplicate webhook event cached in Redis: ${dedupeKey}`);
        logData.dedupe_result = 'duplicate_redis';
        request.log.info(logData);
        await updateReceipt(receipt.id, { dedupeResult: 'duplicate_redis' });
        return reply.status(200).send(formatSuccess(request, { accepted: true, status: 'duplicate_ignored' }));
      }

      // 7. Save Event to DB (with Primary Dedupe)
      let alertEvent;
      try {
        alertEvent = await prisma.alertEvent.create({
          data: {
            userId: validToken.userId,
            symbolId,
            sourceType: 'tradingview',
            alertType: payload.alert_type || null,
            alertName: payload.alert_name || 'Pure Text Alert',
            timeframe: payload.timeframe || null,
            triggerPrice: payload.trigger_price || null,
            triggerPayloadJson: isPureText ? { text: rawBodyText } : parsedBody,
            dedupeKey,
            eventId: parsedBody.eventId || null, // Capture external ID if provided
            triggeredAt: payload.triggered_at ? new Date(payload.triggered_at) : new Date(),
            receivedAt,
            processingStatus
          },
        });
        await updateReceipt(receipt.id, { dedupeResult: 'success_inserted', alertEventId: alertEvent.id });
        logData.dedupe_result = 'success_inserted';
      } catch (dbError: any) {
        if (dbError instanceof Prisma.PrismaClientKnownRequestError && dbError.code === 'P2002') {
          // Primary constraint deduplication caught it
          logData.dedupe_result = 'duplicate_db';
          request.log.info(logData);
          await updateReceipt(receipt.id, { dedupeResult: 'duplicate_db' });
          return reply.status(200).send(formatSuccess(request, { accepted: true, status: 'duplicate_ignored' }));
        }
        await redis.del(redisKey);
        throw dbError;
      }

      // 8. Enqueue: collect_references_for_alert → process_alert_event
      // docs/6 §15: アラート起点収集 → AI要約 の順で処理する
      let aiJobId = null;
      if (processingStatus !== 'unresolved_symbol' && processingStatus !== 'needs_review') {
        // Job 1: collect_references_for_alert (docs/6 §17.2)
        const collectJob = await prisma.aiJob.create({
          data: {
            jobType: 'collect_references_for_alert',
            targetEntityType: 'alert_event',
            targetEntityId: alertEvent.id,
            requestPayload: { alert_event_id: alertEvent.id },
            status: 'queued',
          }
        });
        // Job 2: generate_alert_summary (docs/5 §11.1) — will be chained after collection
        const summaryJob = await prisma.aiJob.create({
          data: {
            jobType: 'generate_alert_summary',
            targetEntityType: 'alert_event',
            targetEntityId: alertEvent.id,
            requestPayload: isPureText ? { text: rawBodyText } : JSON.parse(JSON.stringify(parsedBody)),
            status: 'queued',
          }
        });
        aiJobId = summaryJob.id;

        // Enqueue both — BullMQ handles parallelism but we intentionally add collect first
        await webhookQueue.add('collect_references_for_alert', {
          alert_event_id: alertEvent.id,
          ai_job_id: collectJob.id,
          next_job: { name: 'process_alert_event', alert_event_id: alertEvent.id, ai_job_id: summaryJob.id }
        });
        logData.enqueue_result = 'success';
      } else {
        logData.enqueue_result = 'skipped_due_to_status';
      }

      
      logData.event_id = alertEvent.id;
      logData.processing_status = processingStatus;
      logData.response_status = 200;
      request.log.info(logData);

      return reply.status(200).send(formatSuccess(request, { accepted: true, event_id: alertEvent.id, ai_job_id: aiJobId, status: processingStatus }));

    } catch (err: any) {
      if (!(err instanceof AppError)) {
        await updateReceipt(receipt.id, { errorReason: 'Internal Server Error' });
      }
      throw err;
    }
  });
};

async function updateReceipt(id: string, data: any) {
  try {
    await prisma.webhookReceipt.update({ where: { id }, data });
  } catch (e) {
    // Fire and forget, don't break request if receipt update fails
    console.error(`Failed to update receipt ${id}`, e);
  }
}
