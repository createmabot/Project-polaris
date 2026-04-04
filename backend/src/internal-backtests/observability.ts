export type InternalBacktestDataSourceUnavailableEvent = {
  at: string;
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

const MAX_EVENTS = 5000;
const events: InternalBacktestDataSourceUnavailableEvent[] = [];

export function recordInternalBacktestDataSourceUnavailableEvent(
  event: InternalBacktestDataSourceUnavailableEvent,
) {
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

function toWindowHours(window: '24h' | '7d'): number {
  return window === '7d' ? 24 * 7 : 24;
}

function listRecentFailures(
  scopedEvents: InternalBacktestDataSourceUnavailableEvent[],
  limit: number,
): RecentFailure[] {
  return scopedEvents
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((event) => ({
      at: event.at,
      execution_id: event.executionId,
      provider_name: event.providerName,
      internal_reason_code: event.internalReasonCode,
      symbol: event.symbol,
      market: event.market,
      timeframe: event.timeframe,
      from: event.from,
      to: event.to,
      elapsed_ms: event.elapsedMs,
      http_status: event.httpStatus,
      endpoint_kind: event.endpointKind,
    }));
}

function aggregateReasons(scopedEvents: InternalBacktestDataSourceUnavailableEvent[]): AggregatedReason[] {
  const map = new Map<string, AggregatedReason>();
  for (const event of scopedEvents) {
    const reason = event.internalReasonCode ?? 'unknown';
    const existing = map.get(reason);
    if (!existing) {
      map.set(reason, {
        internal_reason_code: reason,
        count: 1,
        provider_name: event.providerName,
        last_failed_at: event.at,
        last_execution_id: event.executionId,
        last_http_status: event.httpStatus,
        last_symbol: event.symbol,
        last_market: event.market,
        last_timeframe: event.timeframe,
      });
      continue;
    }
    existing.count += 1;
    if (event.at > existing.last_failed_at) {
      existing.provider_name = event.providerName;
      existing.last_failed_at = event.at;
      existing.last_execution_id = event.executionId;
      existing.last_http_status = event.httpStatus;
      existing.last_symbol = event.symbol;
      existing.last_market = event.market;
      existing.last_timeframe = event.timeframe;
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.internal_reason_code.localeCompare(b.internal_reason_code));
}

export function getInternalBacktestDataSourceUnavailableSummary(
  args: { window: '24h' | '7d'; now?: Date; recentLimit?: number },
) {
  const now = args.now ?? new Date();
  const windowHours = toWindowHours(args.window);
  const fromTime = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const fromIso = fromTime.toISOString();
  const scoped = events.filter((event) => event.at >= fromIso && event.at <= now.toISOString());
  return {
    window: args.window,
    from: fromIso,
    to: now.toISOString(),
    total_failures: scoped.length,
    by_reason: aggregateReasons(scoped),
    recent_failures: listRecentFailures(scoped, args.recentLimit ?? 10),
  };
}

export function __resetInternalBacktestObservabilityForTest() {
  events.splice(0, events.length);
}
