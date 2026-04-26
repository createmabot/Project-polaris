import { FastifyReply, FastifyRequest } from 'fastify';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = (error: Error, request: FastifyRequest, reply: FastifyReply) => {
  request.log.error(error);
  const fastifyStatusCode = (error as { statusCode?: unknown })?.statusCode;
  const statusCode = typeof fastifyStatusCode === 'number' ? fastifyStatusCode : null;
  const fastifyCode = (error as { code?: unknown })?.code;
  const fastifyCodeText = typeof fastifyCode === 'string' ? fastifyCode : '';
  const rawMessage = error.message;

  const prismaCode = (error as { code?: unknown })?.code;
  if (prismaCode === 'P2021' || prismaCode === 'P2022') {
    return reply.status(500).send({
      data: null,
      meta: { request_id: request.id },
      error: {
        code: 'DATABASE_SCHEMA_MISMATCH',
        message: 'Database schema is outdated. Run `npx prisma migrate deploy` in backend and restart the API.',
      },
    });
  }
  
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      data: null,
      meta: { request_id: request.id },
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  if (statusCode === 400 || fastifyCodeText === 'FST_ERR_CTP_INVALID_JSON_BODY') {
    return reply.status(400).send({
      data: null,
      meta: { request_id: request.id },
      error: {
        code: 'INVALID_REQUEST_FORMAT',
        message: '入力内容またはCSV形式が不正です。必須項目や形式を確認してください。',
        details: {
          status_code: statusCode,
          fastify_code: fastifyCode ?? null,
          raw_message: rawMessage,
        },
      },
    });
  }

  if (statusCode === 413 || fastifyCodeText === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return reply.status(413).send({
      data: null,
      meta: { request_id: request.id },
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: '入力サイズが上限を超えています。CSVファイルを小さくして再試行してください。',
        details: {
          status_code: statusCode,
          fastify_code: fastifyCode ?? null,
          raw_message: rawMessage,
        },
      },
    });
  }

  if (statusCode === 415 || fastifyCodeText === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return reply.status(415).send({
      data: null,
      meta: { request_id: request.id },
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: '送信形式がサポート対象外です。CSVを text/csv として送信してください。',
        details: {
          status_code: statusCode,
          fastify_code: fastifyCode ?? null,
          raw_message: rawMessage,
        },
      },
    });
  }
  
  // Generic 500
  return reply.status(500).send({
    data: null,
    meta: { request_id: request.id },
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    }
  });
};

export const formatSuccess = (request: FastifyRequest, data: any) => {
  return {
    data,
    meta: { request_id: request.id },
    error: null
  };
};
