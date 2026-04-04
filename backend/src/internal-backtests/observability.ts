import { prisma } from '../db';

export type InternalBacktestDataSourceUnavailableEvent = {
  executionId: string | null;
  providerName: string | null;
  internalReasonCode: string | null;
  symbol: string | null;
  market: string | null;
  timeframe: string | null;
  from: string | null;
  to: string | null;
  elapsedMs: number | null;
  httpStatus: number | null;
  endpointKind: string | null;
  occurredAt?: Date;
};

export type InternalBacktestDataSourceRetryOutcomeEvent = {
  executionId: string | null;
  providerName: string | null;
  internalReasonCode: string | null;
  symbol: string | null;
  market: string | null;
  timeframe: string | null;
  from: string | null;
  to: string | null;
  elapsedMs: number | null;
  httpStatus: number | null;
  endpointKind: string | null;
  retryTarget: boolean;
  retryAttempted: boolean;
  retryAttempts: number;
  outcome: 'retried_and_succeeded' | 'retried_and_failed' | 'not_retried_failed';
  occurredAt?: Date;
};

type RecentFailure = {
  at: string;
  execution_id: string | null;
  provider_name: string | null;
  internal_reason_code: string | null;
  symbol: string | null;
  market: string | null;
  timeframe: string | null;
  from: string | null;
  to: string | null;
  elapsed_ms: number | null;
  http_status: number | null;
  endpoint_kind: string | null;
};

type AggregatedReason = {
  internal_reason_code: string;
  count: number;
  provider_name: string | null;
  last_failed_at: string;
  last_execution_id: string | null;
  last_http_status: number | null;
  last_symbol: string | null;
  last_market: string | null;
  last_timeframe: string | null;
};

type ObservabilityDb = {
  internalBacktestDataSourceFailureEvent: {
    create: (args: {
      data: {
        executionId: string | null;
        providerName: string | null;
        internalReasonCode: string | null;
        symbol: string | null;
        market: string | null;
        timeframe: string | null;
        rangeFrom: string | null;
        rangeTo: string | null;
        elapsedMs: number | null;
        httpStatus: number | null;
        endpointKind: string | null;
        occurredAt?: Date;
      };
    }) => Promise<unknown>;
    findMany: (args: {
      where: { occurredAt: { gte: Date; lte: Date } };
      orderBy: Array<{ occurredAt: 'desc' } | { id: 'desc' }>;
    }) => Promise<
      Array<{
        id: string;
        executionId: string | null;
        providerName: string | null;
        internalReasonCode: string | null;
        symbol: string | null;
        market: string | null;
        timeframe: string | null;
        rangeFrom: string | null;
        rangeTo: string | null;
        elapsedMs: number | null;
        httpStatus: number | null;
        endpointKind: string | null;
        occurredAt: Date;
      }>
    >;
  };
  internalBacktestDataSourceRetryOutcomeEvent: {
    create: (args: {
      data: {
        executionId: string | null;
        providerName: string | null;
        internalReasonCode: string | null;
        symbol: string | null;
        market: string | null;
        timeframe: string | null;
        rangeFrom: string | null;
        rangeTo: string | null;
        elapsedMs: number | null;
        httpStatus: number | null;
        endpointKind: string | null;
        retryTarget: boolean;
        retryAttempted: boolean;
        retryAttempts: number;
        outcome: string;
        occurredAt?: Date;
      };
    }) => Promise<unknown>;
    findMany: (args: {
      where: { occurredAt: { gte: Date; lte: Date } };
      orderBy: Array<{ occurredAt: 'desc' } | { id: 'desc' }>;
    }) => Promise<
      Array<{
        id: string;
        executionId: string | null;
        providerName: string | null;
        internalReasonCode: string | null;
        symbol: string | null;
        market: string | null;
        timeframe: string | null;
        rangeFrom: string | null;
        rangeTo: string | null;
        elapsedMs: number | null;
        httpStatus: number | null;
        endpointKind: string | null;
        retryTarget: boolean;
        retryAttempted: boolean;
        retryAttempts: number;
        outcome: string;
        occurredAt: Date;
      }>
    >;
  };
};

function toWindowHours(window: '24h' | '7d'): number {
  return window === '7d' ? 24 * 7 : 24;
}

function listRecentFailures(
  scopedEvents: Array<{
    executionId: string | null;
    providerName: string | null;
    internalReasonCode: string | null;
    symbol: string | null;
    market: string | null;
    timeframe: string | null;
    rangeFrom: string | null;
    rangeTo: string | null;
    elapsedMs: number | null;
    httpStatus: number | null;
    endpointKind: string | null;
    occurredAt: Date;
  }>,
  limit: number,
): RecentFailure[] {
  return scopedEvents.slice(0, limit).map((event) => ({
    at: event.occurredAt.toISOString(),
    execution_id: event.executionId,
    provider_name: event.providerName,
    internal_reason_code: event.internalReasonCode,
    symbol: event.symbol,
    market: event.market,
    timeframe: event.timeframe,
    from: event.rangeFrom,
    to: event.rangeTo,
    elapsed_ms: event.elapsedMs,
    http_status: event.httpStatus,
    endpoint_kind: event.endpointKind,
  }));
}

function aggregateReasons(
  scopedEvents: Array<{
    executionId: string | null;
    providerName: string | null;
    internalReasonCode: string | null;
    symbol: string | null;
    market: string | null;
    timeframe: string | null;
    httpStatus: number | null;
    occurredAt: Date;
  }>,
): AggregatedReason[] {
  const map = new Map<string, AggregatedReason>();
  for (const event of scopedEvents) {
    const reason = event.internalReasonCode ?? 'unknown';
    const existing = map.get(reason);
    const occurredAtIso = event.occurredAt.toISOString();
    if (!existing) {
      map.set(reason, {
        internal_reason_code: reason,
        count: 1,
        provider_name: event.providerName,
        last_failed_at: occurredAtIso,
        last_execution_id: event.executionId,
        last_http_status: event.httpStatus,
        last_symbol: event.symbol,
        last_market: event.market,
        last_timeframe: event.timeframe,
      });
      continue;
    }
    existing.count += 1;
    if (occurredAtIso > existing.last_failed_at) {
      existing.provider_name = event.providerName;
      existing.last_failed_at = occurredAtIso;
      existing.last_execution_id = event.executionId;
      existing.last_http_status = event.httpStatus;
      existing.last_symbol = event.symbol;
      existing.last_market = event.market;
      existing.last_timeframe = event.timeframe;
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.internal_reason_code.localeCompare(b.internal_reason_code),
  );
}

export async function recordInternalBacktestDataSourceUnavailableEvent(
  event: InternalBacktestDataSourceUnavailableEvent,
  deps: { db?: ObservabilityDb } = {},
) {
  const db = deps.db ?? (prisma as unknown as ObservabilityDb);
  await db.internalBacktestDataSourceFailureEvent.create({
    data: {
      executionId: event.executionId,
      providerName: event.providerName,
      internalReasonCode: event.internalReasonCode,
      symbol: event.symbol,
      market: event.market,
      timeframe: event.timeframe,
      rangeFrom: event.from,
      rangeTo: event.to,
      elapsedMs: event.elapsedMs,
      httpStatus: event.httpStatus,
      endpointKind: event.endpointKind,
      occurredAt: event.occurredAt,
    },
  });
}

export async function recordInternalBacktestDataSourceRetryOutcomeEvent(
  event: InternalBacktestDataSourceRetryOutcomeEvent,
  deps: { db?: ObservabilityDb } = {},
) {
  const db = deps.db ?? (prisma as unknown as ObservabilityDb);
  await db.internalBacktestDataSourceRetryOutcomeEvent.create({
    data: {
      executionId: event.executionId,
      providerName: event.providerName,
      internalReasonCode: event.internalReasonCode,
      symbol: event.symbol,
      market: event.market,
      timeframe: event.timeframe,
      rangeFrom: event.from,
      rangeTo: event.to,
      elapsedMs: event.elapsedMs,
      httpStatus: event.httpStatus,
      endpointKind: event.endpointKind,
      retryTarget: event.retryTarget,
      retryAttempted: event.retryAttempted,
      retryAttempts: event.retryAttempts,
      outcome: event.outcome,
      occurredAt: event.occurredAt,
    },
  });
}

export async function getInternalBacktestDataSourceUnavailableSummary(
  args: { window: '24h' | '7d'; now?: Date; recentLimit?: number },
  deps: { db?: ObservabilityDb } = {},
) {
  const db = deps.db ?? (prisma as unknown as ObservabilityDb);
  const now = args.now ?? new Date();
  const windowHours = toWindowHours(args.window);
  const fromTime = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  const scoped = await db.internalBacktestDataSourceFailureEvent.findMany({
    where: {
      occurredAt: {
        gte: fromTime,
        lte: now,
      },
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });

  const retryScoped = await db.internalBacktestDataSourceRetryOutcomeEvent.findMany({
    where: {
      occurredAt: {
        gte: fromTime,
        lte: now,
      },
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });

  const retryByReasonMap = new Map<string, {
    internal_reason_code: string;
    total: number;
    retried_and_succeeded: number;
    retried_and_failed: number;
    not_retried_failed: number;
  }>();
  let retryTargeted = 0;
  let retryAttempted = 0;
  let retriedAndSucceeded = 0;
  let retriedAndFailed = 0;
  let notRetriedFailed = 0;
  for (const event of retryScoped) {
    if (event.retryTarget) retryTargeted += 1;
    if (event.retryAttempted) retryAttempted += 1;
    if (event.outcome === 'retried_and_succeeded') retriedAndSucceeded += 1;
    if (event.outcome === 'retried_and_failed') retriedAndFailed += 1;
    if (event.outcome === 'not_retried_failed') notRetriedFailed += 1;
    const reason = event.internalReasonCode ?? 'unknown';
    const current = retryByReasonMap.get(reason) ?? {
      internal_reason_code: reason,
      total: 0,
      retried_and_succeeded: 0,
      retried_and_failed: 0,
      not_retried_failed: 0,
    };
    current.total += 1;
    if (event.outcome === 'retried_and_succeeded') current.retried_and_succeeded += 1;
    if (event.outcome === 'retried_and_failed') current.retried_and_failed += 1;
    if (event.outcome === 'not_retried_failed') current.not_retried_failed += 1;
    retryByReasonMap.set(reason, current);
  }
  const retryByReason = [...retryByReasonMap.values()].sort(
    (a, b) => b.total - a.total || a.internal_reason_code.localeCompare(b.internal_reason_code),
  );

  return {
    window: args.window,
    from: fromTime.toISOString(),
    to: now.toISOString(),
    total_failures: scoped.length,
    by_reason: aggregateReasons(scoped),
    recent_failures: listRecentFailures(scoped, args.recentLimit ?? 10),
    retry_effect: {
      total_observed: retryScoped.length,
      retry_targeted_count: retryTargeted,
      retry_attempted_count: retryAttempted,
      retried_and_succeeded_count: retriedAndSucceeded,
      retried_and_failed_count: retriedAndFailed,
      not_retried_failed_count: notRetriedFailed,
      by_reason: retryByReason,
    },
  };
}
