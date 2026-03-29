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
