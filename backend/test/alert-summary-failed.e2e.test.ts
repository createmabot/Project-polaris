/**
 * alert-summary-failed.e2e.test.ts
 *
 * generate_alert_summary が failed になった場合に、
 * GET /api/alerts/:alertId/summary で latest_job 情報が返ることを確認する。
 *
 * 確認事項:
 * - status=failed の ai_job が存在する場合、latest_job.status = 'failed' が返る
 * - latest_job.error_message が返る（secret・prompt全文は含まれない）
 * - latest_job.job_id が返る（運用者が DB で詳細を追えるようにする）
 * - requestPayload / responsePayload が返らないことを確認する
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alertRoutes, sanitizeErrorMessage } from '../src/routes/alerts';
import { errorHandler } from '../src/utils/response';

type AiJobRow = {
  id: string;
  jobType: string;
  targetEntityType: string;
  targetEntityId: string;
  status: string;
  errorMessage: string | null;
  modelName: string | null;
  finalModel: string | null;
  retryCount: number;
  createdAt: Date;
  completedAt: Date | null;
  requestPayload: Record<string, unknown> | null; // DB には存在するが API では返さない
  responsePayload: Record<string, unknown> | null; // DB には存在するが API では返さない
};

type AiSummaryRow = {
  id: string;
  summaryScope: string;
  targetEntityType: string;
  targetEntityId: string;
  title: string | null;
  bodyMarkdown: string;
  structuredJson: Record<string, unknown> | null;
  generatedAt: Date | null;
  generationContextJson?: Record<string, unknown> | null;
};

type AlertEventRow = {
  id: string;
  processingStatus: string;
  externalReferences: unknown[];
};

type Runtime = {
  alertExists: boolean;
  aiJobs: AiJobRow[];
  aiSummaries: AiSummaryRow[];
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    alertExists: true,
    aiJobs: [],
    aiSummaries: [],
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    alertEvent: {
      findUnique: async ({ where }: any) => {
        if (!runtime.alertExists || where?.id !== 'alert-1') return null;
        return {
          id: 'alert-1',
          processingStatus: 'failed',
          externalReferences: [],
        };
      },
      update: async () => ({}),
    },
    aiJob: {
      findFirst: async ({ where, orderBy, select }: any) => {
        const matches = runtime.aiJobs.filter((j) => {
          if (where?.targetEntityType && j.targetEntityType !== where.targetEntityType) return false;
          if (where?.targetEntityId && j.targetEntityId !== where.targetEntityId) return false;
          if (where?.jobType && j.jobType !== where.jobType) return false;
          return true;
        });
        if (matches.length === 0) return null;
        // createdAt 降順
        matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const job = matches[0];
        // select で指定されたフィールドのみ返す（Prisma の select を模倣）
        if (select) {
          const result: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (key in job) {
              result[key] = (job as any)[key];
            }
          }
          return result;
        }
        return job;
      },
      create: async ({ data }: any) => {
        const row: AiJobRow = {
          id: `job-${runtime.aiJobs.length + 1}`,
          jobType: data.jobType,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          status: data.status ?? 'queued',
          errorMessage: data.errorMessage ?? null,
          modelName: data.modelName ?? null,
          finalModel: data.finalModel ?? null,
          retryCount: data.retryCount ?? 0,
          createdAt: new Date(),
          completedAt: data.completedAt ?? null,
          requestPayload: data.requestPayload ?? null,
          responsePayload: data.responsePayload ?? null,
        };
        runtime.aiJobs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.aiJobs.find((j) => j.id === where.id);
        if (!row) throw new Error(`aiJob not found: ${where.id}`);
        Object.assign(row, data);
        return row;
      },
    },
    aiSummary: {
      findFirst: async ({ where }: any) => {
        const matches = runtime.aiSummaries.filter((s) => {
          if (where?.targetEntityType && s.targetEntityType !== where.targetEntityType) return false;
          if (where?.targetEntityId && s.targetEntityId !== where.targetEntityId) return false;
          if (where?.summaryScope && s.summaryScope !== where.summaryScope) return false;
          return true;
        });
        if (matches.length === 0) return null;
        matches.sort((a, b) => (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0));
        return matches[0];
      },
      create: async ({ data }: any) => {
        const row: AiSummaryRow = {
          id: `sum-${runtime.aiSummaries.length + 1}`,
          summaryScope: data.summaryScope,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          title: data.title ?? null,
          bodyMarkdown: data.bodyMarkdown,
          structuredJson: data.structuredJson ?? null,
          generatedAt: data.generatedAt ?? null,
        };
        runtime.aiSummaries.push(row);
        return row;
      },
    },
  };
  return { prisma };
});

vi.mock('../src/ai/context-builder', () => ({
  buildAlertSummaryContext: vi.fn(async () => ({
    alertEventId: 'alert-1',
    alertName: 'test alert',
    alertType: 'price',
    timeframe: '1D',
    triggerPrice: 3000,
    triggeredAt: new Date(),
    symbol: null,
    referenceIds: [],
    references: [],
    rawPayload: {},
  })),
}));

vi.mock('../src/ai/home-ai-service', () => ({
  HomeAiService: class {
    async generateAlertSummary(_context: unknown) {
      throw new Error('local_llm: connection refused - provider not available');
    }
  },
}));

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(alertRoutes, { prefix: '/api/alerts' });
  await app.ready();
  return app;
}

describe('GET /api/alerts/:alertId/summary - generate_alert_summary failed 可視化', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('ai_job が存在しない場合、latest_job は null を返す', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/alerts/alert-1/summary',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.latest_job).toBeNull();
    expect(body.data.summary.status).toBe('unavailable');
  });

  it('generate_alert_summary が failed の場合、latest_job.status = failed が返る', async () => {
    // failed な ai_job を事前に配置
    runtime.aiJobs.push({
      id: 'job-failed-1',
      jobType: 'generate_alert_summary',
      targetEntityType: 'alert_event',
      targetEntityId: 'alert-1',
      status: 'failed',
      errorMessage: 'local_llm: connection refused',
      modelName: null,
      finalModel: null,
      retryCount: 0,
      createdAt: new Date('2026-04-27T00:00:00Z'),
      completedAt: new Date('2026-04-27T00:00:10Z'),
      requestPayload: { prompt: 'SHOULD_NOT_APPEAR_IN_API_RESPONSE' },
      responsePayload: { raw_output: 'SHOULD_NOT_APPEAR_IN_API_RESPONSE' },
    });

    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/alerts/alert-1/summary',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // latest_job の基本情報が返ること
    expect(body.data.latest_job).not.toBeNull();
    expect(body.data.latest_job.job_id).toBe('job-failed-1');
    expect(body.data.latest_job.job_type).toBe('generate_alert_summary');
    expect(body.data.latest_job.status).toBe('failed');
    expect(body.data.latest_job.error_message).toBe('local_llm: connection refused');
    expect(body.data.latest_job.retry_count).toBe(0);
    expect(body.data.latest_job.created_at).toBeDefined();
    expect(body.data.latest_job.completed_at).toBeDefined();

    // secret / prompt 全文が返ってこないことを確認
    const latestJobStr = JSON.stringify(body.data.latest_job);
    expect(latestJobStr).not.toContain('SHOULD_NOT_APPEAR_IN_API_RESPONSE');
    expect(latestJobStr).not.toContain('requestPayload');
    expect(latestJobStr).not.toContain('responsePayload');
    expect(latestJobStr).not.toContain('request_payload');
    expect(latestJobStr).not.toContain('response_payload');

    // summary は unavailable のまま
    expect(body.data.summary.status).toBe('unavailable');
  });

  it('generate_alert_summary が succeeded の場合も latest_job が返る', async () => {
    // succeeded な ai_job + ai_summary を配置
    runtime.aiJobs.push({
      id: 'job-ok-1',
      jobType: 'generate_alert_summary',
      targetEntityType: 'alert_event',
      targetEntityId: 'alert-1',
      status: 'succeeded',
      errorMessage: null,
      modelName: 'stub-v1',
      finalModel: 'stub-v1',
      retryCount: 0,
      createdAt: new Date('2026-04-27T00:00:00Z'),
      completedAt: new Date('2026-04-27T00:00:05Z'),
      requestPayload: null,
      responsePayload: { summary_id: 'sum-1' },
    });
    runtime.aiSummaries.push({
      id: 'sum-1',
      summaryScope: 'alert_reason',
      targetEntityType: 'alert_event',
      targetEntityId: 'alert-1',
      title: 'テスト要約',
      bodyMarkdown: '## テスト\n要約本文',
      structuredJson: null,
      generatedAt: new Date('2026-04-27T00:00:05Z'),
    });

    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/alerts/alert-1/summary',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.data.latest_job.status).toBe('succeeded');
    expect(body.data.latest_job.job_id).toBe('job-ok-1');
    expect(body.data.summary.status).toBe('available');
    expect(body.data.summary.title).toBe('テスト要約');
  });

  it('複数 ai_job がある場合、最新（createdAt 降順）の job が返る', async () => {
    runtime.aiJobs.push(
      {
        id: 'job-old-1',
        jobType: 'generate_alert_summary',
        targetEntityType: 'alert_event',
        targetEntityId: 'alert-1',
        status: 'failed',
        errorMessage: '古いエラー',
        modelName: null,
        finalModel: null,
        retryCount: 0,
        createdAt: new Date('2026-04-26T00:00:00Z'),
        completedAt: new Date('2026-04-26T00:00:10Z'),
        requestPayload: null,
        responsePayload: null,
      },
      {
        id: 'job-new-1',
        jobType: 'generate_alert_summary',
        targetEntityType: 'alert_event',
        targetEntityId: 'alert-1',
        status: 'failed',
        errorMessage: '最新のエラー',
        modelName: null,
        finalModel: null,
        retryCount: 1,
        createdAt: new Date('2026-04-27T00:00:00Z'),
        completedAt: new Date('2026-04-27T00:00:10Z'),
        requestPayload: null,
        responsePayload: null,
      },
    );

    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/alerts/alert-1/summary',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.data.latest_job.job_id).toBe('job-new-1');
    expect(body.data.latest_job.error_message).toBe('最新のエラー');
    expect(body.data.latest_job.retry_count).toBe(1);
  });

  it('alert が存在しない場合は 404 を返す', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/alerts/non-existent/summary',
    });
    expect(res.statusCode).toBe(404);
  });
  it('reference_count が 0 の既存 summary を insufficient_context=true で返す', async () => {
    runtime.aiJobs.push({
      id: 'job-ok-zero-ref',
      jobType: 'generate_alert_summary',
      targetEntityType: 'alert_event',
      targetEntityId: 'alert-1',
      status: 'succeeded',
      errorMessage: null,
      modelName: 'stub-v1',
      finalModel: 'stub-v1',
      retryCount: 0,
      createdAt: new Date('2026-04-27T00:00:00Z'),
      completedAt: new Date('2026-04-27T00:00:05Z'),
      requestPayload: null,
      responsePayload: { summary_id: 'sum-zero-ref' },
    });
    runtime.aiSummaries.push({
      id: 'sum-zero-ref',
      summaryScope: 'alert_reason',
      targetEntityType: 'alert_event',
      targetEntityId: 'alert-1',
      title: 'zero ref summary',
      bodyMarkdown: 'body',
      structuredJson: {
        insufficient_context: false,
      },
      generationContextJson: {
        reference_count: 0,
      },
      generatedAt: new Date('2026-04-27T00:00:05Z'),
    });

    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/alerts/alert-1/summary',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.data.summary.status).toBe('available');
    expect(body.data.summary.insufficient_context).toBe(true);
    expect(body.data.summary.structured_json.insufficient_context).toBe(true);
  });
});

describe('sanitizeErrorMessage ユーティリティ', () => {
  it('sk-形式のAPIキーをマスクする', () => {
    const msg = 'Error: Invalid API key sk-abc123def456ghi789jkl012mno345pqr678stu901vwx';
    expect(sanitizeErrorMessage(msg)).toBe('Error: Invalid API key [REDACTED]');
  });

  it('Bearer トークンをマスクする', () => {
    const msg = 'Authorization header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
    expect(sanitizeErrorMessage(msg)).toBe('Authorization header: Bearer [REDACTED]');
  });

  it('一般的な秘匿情報のキーバリューをマスクする', () => {
    const cases = [
      { input: 'api_key=secret123', expected: 'api_key=[REDACTED]' },
      { input: 'token: my-secret-token', expected: 'token: [REDACTED]' },
      { input: '"shared_secret": "abcdef"', expected: '"shared_secret": "[REDACTED]"' },
      { input: "password='my_password'", expected: "password='[REDACTED]'" },
      { input: 'connection failed: token=abc', expected: 'connection failed: token=[REDACTED]' },
    ];
    for (const c of cases) {
      expect(sanitizeErrorMessage(c.input)).toBe(c.expected);
    }
  });

  it('500文字を超える場合は切り詰める', () => {
    const msg = 'a'.repeat(600);
    const result = sanitizeErrorMessage(msg);
    expect(result?.length).toBe(503); // 500 + '...'
    expect(result?.endsWith('...')).toBe(true);
  });

  it('nullや空文字の場合はそのまま返す', () => {
    expect(sanitizeErrorMessage(null)).toBeNull();
    expect(sanitizeErrorMessage('')).toBeNull();
  });
});

describe('GET /api/alerts/:alertId/summary - error_message サニタイズ', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('DB内のエラーメッセージにsecretが含まれていても、APIの latest_job ではマスクされる', async () => {
    runtime.aiJobs.push({
      id: 'job-sanitize-1',
      jobType: 'generate_alert_summary',
      targetEntityType: 'alert_event',
      targetEntityId: 'alert-1',
      status: 'failed',
      errorMessage: 'Failed to connect: api_key=sk-1234567890abcdef1234567890abcdef',
      modelName: null,
      finalModel: null,
      retryCount: 0,
      createdAt: new Date('2026-04-27T00:00:00Z'),
      completedAt: new Date('2026-04-27T00:00:10Z'),
      requestPayload: null,
      responsePayload: null,
    });

    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/alerts/alert-1/summary',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.data.latest_job.error_message).toBe('Failed to connect: api_key=[REDACTED]');
  });
});

