import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';

function runErrorHandler(error: Error & { statusCode?: number; code?: string }) {
  let statusCode = 0;
  let payload: any = null;
  const request = {
    id: 'req-test',
    log: {
      error: vi.fn(),
    },
  } as any;
  const reply = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    send(body: any) {
      payload = body;
      return this;
    },
  } as any;

  errorHandler(error, request, reply);
  return { statusCode, payload };
}

describe('errorHandler fastify status mapping', () => {
  it('maps FST_ERR_CTP_INVALID_JSON_BODY to 400 INVALID_REQUEST_FORMAT', () => {
    const error = new Error('body parse failed') as Error & { code?: string };
    error.code = 'FST_ERR_CTP_INVALID_JSON_BODY';
    const result = runErrorHandler(error);

    expect(result.statusCode).toBe(400);
    expect(result.payload.error.code).toBe('INVALID_REQUEST_FORMAT');
  });

  it('maps FST_ERR_CTP_BODY_TOO_LARGE to 413 PAYLOAD_TOO_LARGE', () => {
    const error = new Error('body is too large') as Error & { code?: string };
    error.code = 'FST_ERR_CTP_BODY_TOO_LARGE';
    const result = runErrorHandler(error);

    expect(result.statusCode).toBe(413);
    expect(result.payload.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('maps FST_ERR_CTP_INVALID_MEDIA_TYPE to 415 UNSUPPORTED_MEDIA_TYPE', () => {
    const error = new Error('unsupported media') as Error & { code?: string };
    error.code = 'FST_ERR_CTP_INVALID_MEDIA_TYPE';
    const result = runErrorHandler(error);

    expect(result.statusCode).toBe(415);
    expect(result.payload.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

