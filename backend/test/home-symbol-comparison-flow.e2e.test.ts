import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';
import { homeRoutes } from '../src/routes/home';
import { symbolRoutes } from '../src/routes/symbols';
import { comparisonRoutes } from '../src/routes/comparisons';

type Runtime = {
  aiJobSeq: number;
  aiSummarySeq: number;
  comparisonSeq: number;
  comparisonResultSeq: number;
  symbols: Array<{
    id: string;
    symbol: string;
    symbolCode: string;
    displayName: string;
    marketCode: string;
    tradingviewSymbol: string;
  }>;
  watchlist: {
    id: string;
    sortOrder: number;
    createdAt: Date;
  };
  watchlistItems: Array<{
    id: string;
    watchlistId: string;
    symbolId: string;
    priority: number | null;
    addedAt: Date;
  }>;
  positions: Array<{
    id: string;
    symbolId: string;
    quantity: { toNumber: () => number };
    averageCost: { toNumber: () => number };
    createdAt: Date;
  }>;
  alerts: Array<{
    id: string;
    symbolId: string;
    alertName: string;
    alertType: string;
    timeframe: string | null;
    triggerPrice: number | null;
    triggeredAt: Date;
    receivedAt: Date;
    processingStatus: string;
  }>;
  references: Array<{
    id: string;
    symbolId: string;
    referenceType: string;
    title: string;
    sourceName: string | null;
    sourceUrl: string | null;
    publishedAt: Date | null;
    summaryText: string | null;
    createdAt: Date;
    updatedAt: Date;
    alertEventId: string | null;
  }>;
  notes: Array<{
    id: string;
    symbolId: string;
    userId: string | null;
    title: string;
    thesisText: string | null;
    status: 'active' | 'archived';
    updatedAt: Date;
  }>;
  aiSummaries: Array<{
    id: string;
    aiJobId: string | null;
    summaryScope: string;
    targetEntityType: string;
    targetEntityId: string;
    title: string | null;
    bodyMarkdown: string;
    structuredJson: Record<string, unknown> | null;
    modelName: string | null;
    promptVersion: string | null;
    generatedAt: Date;
    inputSnapshotHash?: string | null;
    generationContextJson?: Record<string, unknown> | null;
  }>;
  aiJobs: Array<{
    id: string;
    jobType: string;
    targetEntityType: string;
    targetEntityId: string;
    status: string;
    requestPayload?: Record<string, unknown> | null;
    responsePayload?: Record<string, unknown> | null;
    modelName?: string | null;
    promptVersion?: string | null;
    errorMessage?: string | null;
  }>;
  comparisonSessions: Array<{
    id: string;
    name: string;
    comparisonType: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  comparisonSessionSymbols: Array<{
    comparisonSessionId: string;
    symbolId: string;
    sortOrder: number;
  }>;
  comparisonResults: Array<{
    id: string;
    comparisonSessionId: string;
    aiJobId: string | null;
    title: string | null;
    bodyMarkdown: string | null;
    structuredJson: Record<string, unknown> | null;
    modelName: string | null;
    promptVersion: string | null;
    comparedMetricJson: Record<string, unknown>;
    generatedAt: Date;
  }>;
  marketSnapshots: Array<{
    snapshotType: string;
    targetCode: string;
    price: { toNumber: () => number };
    changeValue: { toNumber: () => number } | null;
    changeRate: { toNumber: () => number } | null;
    asOf: Date;
  }>;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    aiJobSeq: 1,
    aiSummarySeq: 1,
    comparisonSeq: 1,
    comparisonResultSeq: 1,
    symbols: [
      {
        id: 'sym-7203',
        symbol: 'TYO:7203',
        symbolCode: '7203',
        displayName: 'トヨタ自動車',
        marketCode: 'JP',
        tradingviewSymbol: 'TYO:7203',
      },
      {
        id: 'sym-6758',
        symbol: 'TYO:6758',
        symbolCode: '6758',
        displayName: 'ソニーグループ',
        marketCode: 'JP',
        tradingviewSymbol: 'TYO:6758',
      },
    ],
    watchlist: {
      id: 'wl-default',
      sortOrder: 0,
      createdAt: new Date('2026-04-26T00:00:00+09:00'),
    },
    watchlistItems: [
      {
        id: 'wli-7203',
        watchlistId: 'wl-default',
        symbolId: 'sym-7203',
        priority: 1,
        addedAt: new Date('2026-04-26T00:01:00+09:00'),
      },
      {
        id: 'wli-6758',
        watchlistId: 'wl-default',
        symbolId: 'sym-6758',
        priority: 2,
        addedAt: new Date('2026-04-26T00:02:00+09:00'),
      },
    ],
    positions: [
      {
        id: 'pos-6758',
        symbolId: 'sym-6758',
        quantity: { toNumber: () => 100 },
        averageCost: { toNumber: () => 12000 },
        createdAt: new Date('2026-04-26T00:03:00+09:00'),
      },
    ],
    alerts: [
      {
        id: 'alert-7203',
        symbolId: 'sym-7203',
        alertName: 'MAブレイク',
        alertType: 'breakout',
        timeframe: '1D',
        triggerPrice: 3000,
        triggeredAt: new Date('2026-04-26T09:00:00+09:00'),
        receivedAt: new Date('2026-04-26T09:00:01+09:00'),
        processingStatus: 'summarized',
      },
      {
        id: 'alert-6758',
        symbolId: 'sym-6758',
        alertName: '出来高増加',
        alertType: 'volume',
        timeframe: '1D',
        triggerPrice: 13000,
        triggeredAt: new Date('2026-04-26T09:10:00+09:00'),
        receivedAt: new Date('2026-04-26T09:10:01+09:00'),
        processingStatus: 'summarized',
      },
    ],
    references: [
      {
        id: 'ref-7203',
        symbolId: 'sym-7203',
        referenceType: 'earnings',
        title: '7203 決算説明',
        sourceName: 'tdnet',
        sourceUrl: 'https://example.test/7203',
        publishedAt: new Date('2026-04-25T09:00:00+09:00'),
        summaryText: '増益基調',
        createdAt: new Date('2026-04-25T09:00:00+09:00'),
        updatedAt: new Date('2026-04-25T09:00:00+09:00'),
        alertEventId: null,
      },
      {
        id: 'ref-6758',
        symbolId: 'sym-6758',
        referenceType: 'news',
        title: '6758 新製品ニュース',
        sourceName: 'rss',
        sourceUrl: 'https://example.test/6758',
        publishedAt: new Date('2026-04-25T10:00:00+09:00'),
        summaryText: '新製品投入',
        createdAt: new Date('2026-04-25T10:00:00+09:00'),
        updatedAt: new Date('2026-04-25T10:00:00+09:00'),
        alertEventId: null,
      },
    ],
    notes: [
      {
        id: 'note-7203',
        symbolId: 'sym-7203',
        userId: 'user-1',
        title: '7203長期メモ',
        thesisText: '高付加価値モデル比率上昇',
        status: 'active',
        updatedAt: new Date('2026-04-25T11:00:00+09:00'),
      },
    ],
    aiSummaries: [
      {
        id: 'sum-thesis-7203',
        aiJobId: null,
        summaryScope: 'thesis',
        targetEntityType: 'symbol',
        targetEntityId: 'sym-7203',
        title: '7203 論点カード',
        bodyMarkdown: '既存のAI論点カード',
        structuredJson: {
          schema_name: 'symbol_thesis_summary',
          schema_version: '1.0',
          insufficient_context: false,
          payload: {
            bullish_points: ['収益性改善'],
            bearish_points: ['為替変動'],
          },
        },
        modelName: 'stub-symbol-v1',
        promptVersion: 'v1.0.0-symbol-stub',
        generatedAt: new Date('2026-04-25T12:00:00+09:00'),
      },
      {
        id: 'sum-alert-7203',
        aiJobId: null,
        summaryScope: 'alert_reason',
        targetEntityType: 'alert_event',
        targetEntityId: 'alert-7203',
        title: 'アラート要約',
        bodyMarkdown: 'アラートの要因要約',
        structuredJson: { payload: { key_points: ['トレンド転換'] } },
        modelName: 'stub-alert-v1',
        promptVersion: 'v1.0.0-alert-stub',
        generatedAt: new Date('2026-04-26T09:05:00+09:00'),
      },
      {
        id: 'sum-daily-latest',
        aiJobId: null,
        summaryScope: 'daily',
        targetEntityType: 'market_snapshot',
        targetEntityId: 'market:jp',
        title: 'デイリーサマリー',
        bodyMarkdown: '本日の相場概況',
        structuredJson: { summary_type: 'latest' },
        modelName: 'stub-daily-v1',
        promptVersion: 'v1.0.0-daily-stub',
        generatedAt: new Date('2026-04-26T08:00:00+09:00'),
        generationContextJson: { summary_type: 'latest' },
      },
      {
        id: 'sum-daily-morning',
        aiJobId: null,
        summaryScope: 'daily',
        targetEntityType: 'market_snapshot',
        targetEntityId: 'market:jp',
        title: '朝サマリー',
        bodyMarkdown: '寄り付き前サマリー',
        structuredJson: { summary_type: 'morning' },
        modelName: 'stub-daily-v1',
        promptVersion: 'v1.0.0-daily-stub',
        generatedAt: new Date('2026-04-26T07:00:00+09:00'),
        generationContextJson: { summary_type: 'morning' },
      },
      {
        id: 'sum-daily-evening',
        aiJobId: null,
        summaryScope: 'daily',
        targetEntityType: 'market_snapshot',
        targetEntityId: 'market:jp',
        title: '夜サマリー',
        bodyMarkdown: '引け後サマリー',
        structuredJson: { summary_type: 'evening' },
        modelName: 'stub-daily-v1',
        promptVersion: 'v1.0.0-daily-stub',
        generatedAt: new Date('2026-04-25T19:00:00+09:00'),
        generationContextJson: { summary_type: 'evening' },
      },
    ],
    aiJobs: [],
    comparisonSessions: [],
    comparisonSessionSymbols: [],
    comparisonResults: [],
    marketSnapshots: [
      {
        snapshotType: 'sector',
        targetCode: 'TOPIX_TRANSPORT',
        price: { toNumber: () => 1500.25 },
        changeValue: { toNumber: () => 12.3 },
        changeRate: { toNumber: () => 0.82 },
        asOf: new Date('2026-04-26T06:00:00.000Z'),
      },
    ],
  };
}

function descTime(value: Date | null | undefined): number {
  return value instanceof Date ? value.getTime() : 0;
}

function nextAiJobId(): string {
  const id = `ai-job-${runtime.aiJobSeq}`;
  runtime.aiJobSeq += 1;
  return id;
}

function nextAiSummaryId(): string {
  const id = `sum-${runtime.aiSummarySeq}`;
  runtime.aiSummarySeq += 1;
  return id;
}

function nextComparisonId(): string {
  const id = `cmp-${runtime.comparisonSeq}`;
  runtime.comparisonSeq += 1;
  return id;
}

function nextComparisonResultId(): string {
  const id = `cmp-result-${runtime.comparisonResultSeq}`;
  runtime.comparisonResultSeq += 1;
  return id;
}

vi.mock('../src/home/positions-read-model', () => ({
  rebuildPositionsReadModel: vi.fn(async () => undefined),
}));

vi.mock('../src/db', () => {
  const prisma = {
    symbol: {
      findUnique: async ({ where }: any) => {
        if (!where?.id) return null;
        return runtime.symbols.find((row) => row.id === where.id) ?? null;
      },
      findMany: async ({ where }: any) => {
        const symbols = runtime.symbols.slice();
        if (where?.id?.in) {
          const ids: string[] = where.id.in;
          return symbols.filter((row) => ids.includes(row.id));
        }
        const orConditions: any[] = Array.isArray(where?.OR) ? where.OR : [];
        if (orConditions.length === 0) return [];
        const matched = new Map<string, (typeof symbols)[number]>();
        for (const condition of orConditions) {
          if (condition?.id?.in) {
            const ids: string[] = condition.id.in;
            symbols.filter((row) => ids.includes(row.id)).forEach((row) => matched.set(row.id, row));
          }
          if (condition?.symbolCode?.in) {
            const values: string[] = condition.symbolCode.in;
            symbols.filter((row) => values.includes(row.symbolCode)).forEach((row) => matched.set(row.id, row));
          }
          if (condition?.symbol?.in) {
            const values: string[] = condition.symbol.in;
            symbols.filter((row) => values.includes(row.symbol)).forEach((row) => matched.set(row.id, row));
          }
          if (condition?.tradingviewSymbol?.in) {
            const values: string[] = condition.tradingviewSymbol.in;
            symbols.filter((row) => values.includes(row.tradingviewSymbol)).forEach((row) => matched.set(row.id, row));
          }
          if (condition?.displayName?.in) {
            const values: string[] = condition.displayName.in;
            symbols.filter((row) => values.includes(row.displayName)).forEach((row) => matched.set(row.id, row));
          }
        }
        return [...matched.values()];
      },
    },
    watchlist: {
      findFirst: async () => runtime.watchlist,
    },
    watchlistItem: {
      findMany: async ({ where }: any) => {
        return runtime.watchlistItems
          .filter((row) => row.watchlistId === where?.watchlistId)
          .map((row) => ({
            ...row,
            symbol: runtime.symbols.find((symbol) => symbol.id === row.symbolId) ?? null,
          }))
          .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
      },
    },
    position: {
      findMany: async () => {
        return runtime.positions
          .map((row) => ({
            ...row,
            symbol: runtime.symbols.find((symbol) => symbol.id === row.symbolId) ?? null,
          }))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      },
    },
    alertEvent: {
      findMany: async ({ where }: any = {}) => {
        let rows = runtime.alerts.slice();
        if (where?.symbolId?.in) {
          const ids: string[] = where.symbolId.in;
          rows = rows.filter((row) => ids.includes(row.symbolId));
        }
        return rows
          .map((row) => ({
            ...row,
            symbol: runtime.symbols.find((symbol) => symbol.id === row.symbolId) ?? null,
          }))
          .sort((a, b) => descTime(b.triggeredAt) - descTime(a.triggeredAt));
      },
    },
    externalReference: {
      findMany: async ({ where }: any) => {
        let rows = runtime.references.slice();
        if (where?.symbolId?.in) {
          const ids: string[] = where.symbolId.in;
          rows = rows.filter((row) => ids.includes(row.symbolId));
        } else if (where?.symbolId) {
          rows = rows.filter((row) => row.symbolId === where.symbolId);
        }
        if (where?.id?.in) {
          const ids: string[] = where.id.in;
          rows = rows.filter((row) => ids.includes(row.id));
        }
        return rows.sort((a, b) => descTime(b.publishedAt) - descTime(a.publishedAt));
      },
      count: async () => runtime.references.length,
    },
    researchNote: {
      findFirst: async ({ where }: any) => {
        const filtered = runtime.notes
          .filter((row) => {
            if (where?.symbolId && row.symbolId !== where.symbolId) return false;
            if (where?.status && row.status !== where.status) return false;
            return true;
          })
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        return filtered[0] ?? null;
      },
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.symbolId?.in ?? [];
        return runtime.notes
          .filter((row) => ids.includes(row.symbolId) && (!where?.status || row.status === where.status))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      },
    },
    aiSummary: {
      findMany: async ({ where }: any) => {
        return runtime.aiSummaries
          .filter((row) => {
            if (where?.targetEntityType && row.targetEntityType !== where.targetEntityType) return false;
            if (where?.summaryScope && row.summaryScope !== where.summaryScope) return false;
            if (where?.targetEntityId?.in) {
              const ids: string[] = where.targetEntityId.in;
              if (!ids.includes(row.targetEntityId)) return false;
            }
            return true;
          })
          .sort((a, b) => descTime(b.generatedAt) - descTime(a.generatedAt));
      },
      findFirst: async ({ where }: any) => {
        const rows = runtime.aiSummaries
          .filter((row) => {
            if (where?.id && row.id !== where.id) return false;
            if (where?.aiJobId && row.aiJobId !== where.aiJobId) return false;
            if (where?.targetEntityType && row.targetEntityType !== where.targetEntityType) return false;
            if (where?.targetEntityId && row.targetEntityId !== where.targetEntityId) return false;
            if (where?.summaryScope && row.summaryScope !== where.summaryScope) return false;
            if (where?.inputSnapshotHash && row.inputSnapshotHash !== where.inputSnapshotHash) return false;
            return true;
          })
          .sort((a, b) => descTime(b.generatedAt) - descTime(a.generatedAt));
        return rows[0] ?? null;
      },
      create: async ({ data }: any) => {
        const row = {
          id: nextAiSummaryId(),
          aiJobId: data.aiJobId ?? null,
          summaryScope: data.summaryScope,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          title: data.title ?? null,
          bodyMarkdown: data.bodyMarkdown,
          structuredJson: data.structuredJson ?? null,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          generatedAt: data.generatedAt ?? new Date(),
          inputSnapshotHash: data.inputSnapshotHash ?? null,
          generationContextJson: data.generationContextJson ?? null,
        };
        runtime.aiSummaries.push(row);
        return row;
      },
    },
    aiJob: {
      findUnique: async ({ where }: any) => {
        const row = runtime.aiJobs.find((job) => job.id === where.id) ?? null;
        if (!row) return null;
        return { responsePayload: row.responsePayload ?? null };
      },
      create: async ({ data }: any) => {
        const row = {
          id: nextAiJobId(),
          jobType: data.jobType,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          status: data.status ?? 'queued',
          requestPayload: data.requestPayload ?? null,
          responsePayload: data.responsePayload ?? null,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          errorMessage: null,
        };
        runtime.aiJobs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.aiJobs.find((job) => job.id === where.id);
        if (!row) throw new Error(`ai_job_not_found:${where.id}`);
        Object.assign(row, data);
        return row;
      },
    },
    comparisonSession: {
      create: async ({ data }: any) => {
        const now = new Date();
        const session = {
          id: nextComparisonId(),
          name: data.name,
          comparisonType: data.comparisonType,
          status: data.status,
          createdAt: now,
          updatedAt: now,
        };
        runtime.comparisonSessions.push(session);
        const symbols = (data.comparisonSymbols?.create ?? []).map((row: any) => ({
          comparisonSessionId: session.id,
          symbolId: row.symbolId,
          sortOrder: row.sortOrder,
        }));
        runtime.comparisonSessionSymbols.push(...symbols);
        return {
          ...session,
          comparisonSymbols: symbols.slice().sort((a, b) => a.sortOrder - b.sortOrder),
        };
      },
      findUnique: async ({ where, include }: any) => {
        const session = runtime.comparisonSessions.find((row) => row.id === where.id) ?? null;
        if (!session) return null;
        if (!include?.comparisonSymbols) return session;
        const symbols = runtime.comparisonSessionSymbols
          .filter((row) => row.comparisonSessionId === session.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((row) => ({ symbolId: row.symbolId, sortOrder: row.sortOrder }));
        return {
          ...session,
          comparisonSymbols: symbols,
        };
      },
    },
    comparisonResult: {
      findFirst: async ({ where }: any) => {
        return runtime.comparisonResults
          .filter((row) => row.comparisonSessionId === where?.comparisonSessionId)
          .sort((a, b) => descTime(b.generatedAt) - descTime(a.generatedAt))[0] ?? null;
      },
      create: async ({ data }: any) => {
        const row = {
          id: nextComparisonResultId(),
          comparisonSessionId: data.comparisonSessionId,
          aiJobId: data.aiJobId ?? null,
          title: data.title ?? null,
          bodyMarkdown: data.bodyMarkdown ?? null,
          structuredJson: data.structuredJson ?? null,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          comparedMetricJson: data.comparedMetricJson,
          generatedAt: data.generatedAt ?? new Date(),
        };
        runtime.comparisonResults.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.comparisonResults.find((item) => item.id === where.id);
        if (!row) throw new Error(`comparison_result_not_found:${where.id}`);
        Object.assign(row, data);
        return row;
      },
    },
    marketSnapshot: {
      findMany: async ({ where }: any) => {
        return runtime.marketSnapshots
          .filter((row) => {
            if (where?.snapshotType && row.snapshotType !== where.snapshotType) return false;
            if (where?.targetCode?.in) {
              const codes: string[] = where.targetCode.in;
              if (!codes.includes(row.targetCode)) return false;
            }
            return true;
          })
          .sort((a, b) => b.asOf.getTime() - a.asOf.getTime());
      },
    },
  };
  return { prisma };
});

vi.mock('../src/summaries/daily', async () => {
  const actual = await vi.importActual<typeof import('../src/summaries/daily')>('../src/summaries/daily');
  return {
    ...actual,
    resolveDailySummary: vi.fn(async (_prismaAny: unknown, params: { summaryType: 'latest' | 'morning' | 'evening'; date: string | null }) => {
      const type = params.summaryType;
      const target =
        type === 'morning'
          ? runtime.aiSummaries.find((row) => row.id === 'sum-daily-morning')
          : type === 'evening'
            ? runtime.aiSummaries.find((row) => row.id === 'sum-daily-evening')
            : runtime.aiSummaries.find((row) => row.id === 'sum-daily-latest');
      return {
        id: target?.id ?? null,
        title: target?.title ?? null,
        body_markdown: target?.bodyMarkdown ?? null,
        structured_json: target?.structuredJson ?? null,
        generated_at: target?.generatedAt?.toISOString() ?? null,
        status: target ? 'available' : 'unavailable',
        insufficient_context: false,
        summary_type: type,
        date: params.date,
      };
    }),
  };
});

vi.mock('../src/market/snapshot', () => ({
  getCurrentSnapshotsForSymbols: vi.fn(async (symbols: Array<{ id: string }>) => {
    const map = new Map<string, any>();
    for (const symbol of symbols) {
      if (symbol.id === 'sym-7203') {
        map.set(symbol.id, {
          symbol_id: symbol.id,
          as_of: '2026-04-26T06:00:00.000Z',
          last_price: 3021.5,
          change: 41.2,
          change_percent: 1.38,
          volume: 1234000,
          market_status: 'closed',
          source_name: 'test_stub',
        });
      } else if (symbol.id === 'sym-6758') {
        map.set(symbol.id, {
          symbol_id: symbol.id,
          as_of: '2026-04-26T06:00:00.000Z',
          last_price: 13120.0,
          change: -55.3,
          change_percent: -0.42,
          volume: 998000,
          market_status: 'closed',
          source_name: 'test_stub',
        });
      }
    }
    return map;
  }),
  getCurrentSnapshotForSymbol: vi.fn(async (symbol: { id: string }) => {
    if (symbol.id === 'sym-6758') {
      return {
        symbol_id: symbol.id,
        as_of: '2026-04-26T06:00:00.000Z',
        last_price: 13120.0,
        change: -55.3,
        change_percent: -0.42,
        volume: 998000,
        market_status: 'closed',
        source_name: 'test_stub',
      };
    }
    return {
      symbol_id: symbol.id,
      as_of: '2026-04-26T06:00:00.000Z',
      last_price: 3021.5,
      change: 41.2,
      change_percent: 1.38,
      volume: 1234000,
      market_status: 'closed',
      source_name: 'test_stub',
    };
  }),
}));

vi.mock('../src/ai/home-ai-service', () => ({
  HomeAiService: class {
    async generateSymbolThesisSummary(context: any) {
      const symbolLabel = context?.symbol?.displayName ?? context?.symbol?.symbolCode ?? context?.symbol?.symbol ?? '銘柄';
      return {
        output: {
          title: `${symbolLabel} 再生成論点カード`,
          bodyMarkdown: '再生成された論点カード本文',
          structuredJson: {
            schema_name: 'symbol_thesis_summary',
            schema_version: '1.0',
            confidence: 'medium',
            insufficient_context: false,
            payload: {
              bullish_points: ['受注改善'],
              bearish_points: ['為替感応度'],
              watch_kpis: ['営業利益率'],
              next_events: ['次回決算'],
              invalidation_conditions: ['需要鈍化'],
              overall_view: '中立やや強気',
            },
          },
          modelName: 'stub-symbol-v1',
          promptVersion: 'v1.0.0-symbol-stub',
        },
        log: {
          initialModel: 'stub-symbol-v1',
          finalModel: 'stub-symbol-v1',
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: 1,
          estimatedTokens: 1,
          estimatedCostUsd: 0,
          provider: 'stub',
          fallbackToStub: false,
        },
      };
    }

    async generateComparisonSummary(context: any) {
      return {
        output: {
          title: '比較総評（生成）',
          bodyMarkdown: '7203と6758を比較した結果、収益性とモメンタムに差分があります。',
          structuredJson: {
            schema_name: 'comparison_summary',
            schema_version: '1.0',
            confidence: 'medium',
            insufficient_context: false,
            payload: {
              key_differences: ['利益率と変動率に差分'],
              risk_points: ['外部環境変化'],
              next_actions: ['次回決算で再比較'],
              compared_symbols: context.symbols.map((item: any) => item.id),
              reference_ids: context.references.map((item: any) => item.id),
              overall_view: '比較可能な差分が確認できるが継続監視が必要',
            },
          },
          modelName: 'stub-compare-v1',
          promptVersion: 'v1.0.0-compare-stub',
        },
        log: {
          initialModel: 'stub-compare-v1',
          finalModel: 'stub-compare-v1',
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: 1,
          estimatedTokens: 1,
          estimatedCostUsd: 0,
          provider: 'stub',
          fallbackToStub: false,
        },
      };
    }
  },
}));

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(homeRoutes, { prefix: '/api/home' });
  app.register(symbolRoutes, { prefix: '/api/symbols' });
  app.register(comparisonRoutes, { prefix: '/api/comparisons' });
  await app.ready();
  return app;
}

describe('home -> symbol detail -> comparison minimal flow', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('covers the main API flow used by Home / SymbolDetail / Comparison', async () => {
    const app = await createApp();

    const homeRes = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=latest',
    });
    expect(homeRes.statusCode).toBe(200);
    const homeBody = homeRes.json().data;
    expect(homeBody.market_overview).toBeTruthy();
    expect(homeBody.watchlist_symbols.length).toBeGreaterThanOrEqual(1);
    expect(homeBody.positions.length).toBeGreaterThanOrEqual(1);
    expect(homeBody.daily_summary?.status).toBe('available');
    expect(homeBody.recent_alerts.length).toBeGreaterThanOrEqual(1);
    expect(homeBody.key_events.length).toBeGreaterThanOrEqual(1);

    const watchlistSymbolId = homeBody.watchlist_symbols[0].symbol_id as string;
    const positionSymbolId = homeBody.positions[0].symbol_id as string;
    expect(watchlistSymbolId).toBeTruthy();
    expect(positionSymbolId).toBeTruthy();

    const watchlistSymbolRes = await app.inject({
      method: 'GET',
      url: `/api/symbols/${watchlistSymbolId}`,
    });
    expect(watchlistSymbolRes.statusCode).toBe(200);
    const watchlistSymbolBody = watchlistSymbolRes.json().data;
    expect(watchlistSymbolBody.symbol.id).toBe(watchlistSymbolId);
    expect(watchlistSymbolBody.current_snapshot).toBeTruthy();
    expect(watchlistSymbolBody.latest_ai_thesis_summary).toBeTruthy();
    expect(watchlistSymbolBody.related_references.length).toBeGreaterThanOrEqual(1);

    const positionSymbolRes = await app.inject({
      method: 'GET',
      url: `/api/symbols/${positionSymbolId}`,
    });
    expect(positionSymbolRes.statusCode).toBe(200);
    const positionSymbolBody = positionSymbolRes.json().data;
    expect(positionSymbolBody.symbol.id).toBe(positionSymbolId);
    expect(positionSymbolBody.current_snapshot).toBeTruthy();

    const regenerateRes = await app.inject({
      method: 'POST',
      url: `/api/symbols/${positionSymbolId}/ai-summary/generate`,
      payload: {
        scope: 'thesis',
        reference_ids: ['ref-6758'],
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(regenerateRes.statusCode).toBe(200);
    expect(regenerateRes.json().data.summary.status).toBe('available');

    const createComparisonRes = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: {
        symbol_ids: ['7203', '6758'],
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(createComparisonRes.statusCode).toBe(201);
    const comparisonId = createComparisonRes.json().data.comparison_session.id as string;
    expect(comparisonId).toBeTruthy();

    const generateComparisonRes = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: {
        include_ai_summary: true,
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(generateComparisonRes.statusCode).toBe(200);
    const generated = generateComparisonRes.json().data;
    expect(generated.ai_summary).toBeTruthy();

    const comparisonDetailRes = await app.inject({
      method: 'GET',
      url: `/api/comparisons/${comparisonId}`,
    });
    expect(comparisonDetailRes.statusCode).toBe(200);
    const comparisonDetail = comparisonDetailRes.json().data;
    expect(comparisonDetail.comparison_header.comparison_id).toBe(comparisonId);
    expect(comparisonDetail.symbols.length).toBe(2);
    expect(comparisonDetail.latest_result.compared_metric_json).toBeTruthy();
    expect(comparisonDetail.latest_result.ai_summary).toBeTruthy();

    await app.close();
  });
});

