import { ReactNode, useMemo, useState } from 'react';
import { InvestmentCalendarData, InvestmentCalendarEvent, InvestmentCalendarRefreshData } from '../../api/types';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import InlineNotice from '../ui/InlineNotice';

const CALENDAR_WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const MAX_CALENDAR_EVENTS_PER_DAY = 3;

type CalendarDayCell = {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  events: InvestmentCalendarEvent[];
};

type CalendarMonth = {
  key: string;
  label: string;
  weeks: CalendarDayCell[][];
};

type InvestmentCalendarGridProps = {
  events: InvestmentCalendarEvent[];
  meta?: InvestmentCalendarData['meta'];
  emptyTitle: string;
  monthEmptyNote: string;
  fallbackWhenEmpty?: ReactNode;
  refreshMessage?: string | null;
  refreshError?: string | null;
};

export function formatCalendarFetchedAt(value: string | null): string {
  if (!value) return '取得: -';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '取得: -';
  return `取得: ${date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function providerLabel(provider: string | null | undefined, sourceName?: string | null): string {
  const value = provider || sourceName || '';
  const labels: Record<string, string> = {
    alpha_vantage: 'Alpha Vantage',
    jquants: 'J-Quants',
    official_market: 'official_market',
    seed: 'seed',
    stub: 'stub',
    federal_reserve: 'official_market',
    boj: 'official_market',
    nyse: 'official_market',
  };
  return labels[value] ?? (value || '-');
}

function providerStatusLabel(status: string): string {
  if (status === 'succeeded') return '成功';
  if (status === 'failed') return '失敗';
  if (status === 'skipped') return 'スキップ';
  return status;
}

export function formatProviderRefreshSummary(result: InvestmentCalendarRefreshData): string {
  const providers = result.providers ?? [];
  if (providers.length === 0) return '';
  return providers
    .map((provider) => {
      const counts = `追加 ${provider.saved_count ?? 0} / 更新 ${provider.updated_count ?? 0} / skip ${provider.skipped_count ?? 0}`;
      const error = provider.error_code ? ` / ${provider.error_code}` : '';
      return `${providerLabel(provider.provider)}: ${providerStatusLabel(provider.status)} (${counts}${error})`;
    })
    .join(' / ');
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    earnings: '決算',
    ex_dividend: '権利落ち',
    shareholder_meeting: '株主総会',
    dividend_payment: '配当支払',
    economic_indicator: '経済指標',
    central_bank: '中央銀行',
    market_holiday: '休場日',
    derivatives_settlement: 'SQ',
    ipo: 'IPO',
    other: 'その他',
  };
  return labels[type] ?? type;
}

function importanceLabel(importance: string): string {
  if (importance === 'high') return '高';
  if (importance === 'low') return '低';
  return '中';
}

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseMonthKey(value: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const year = Number(match[1]);
  const month = Number(match[2]);
  return new Date(year, month - 1, 1);
}

export function getInitialCalendarMonthKey(now: Date = new Date()): string {
  return formatMonthKey(now);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function calendarEventRank(event: InvestmentCalendarEvent): number {
  if (event.importance === 'high') return 0;
  if (event.importance === 'medium') return 1;
  if (event.importance === 'low') return 2;
  return 3;
}

function buildCalendarMonth(
  events: InvestmentCalendarEvent[],
  monthKey: string,
  todayKey: string = formatDateKey(new Date()),
): CalendarMonth {
  const datedEvents = events
    .map((event) => ({ event, date: parseDateOnly(event.event_date) }))
    .filter((item): item is { event: InvestmentCalendarEvent; date: Date } => item.date !== null)
    .sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      const rankDiff = calendarEventRank(a.event) - calendarEventRank(b.event);
      if (rankDiff !== 0) return rankDiff;
      return (a.event.event_time ?? '').localeCompare(b.event.event_time ?? '');
    });

  const eventsByDate = new Map<string, InvestmentCalendarEvent[]>();
  for (const { event, date } of datedEvents) {
    const key = formatDateKey(date);
    const items = eventsByDate.get(key) ?? [];
    items.push(event);
    eventsByDate.set(key, items);
  }

  const cursor = parseMonthKey(monthKey);
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());
  const weeks: CalendarDayCell[][] = [];
  let week: CalendarDayCell[] = [];

  for (let day = gridStart; day.getTime() <= gridEnd.getTime(); day = addDays(day, 1)) {
    const key = formatDateKey(day);
    const inMonth = day.getMonth() === cursor.getMonth();
    week.push({
      date: key,
      day: day.getDate(),
      inMonth,
      isToday: inMonth && key === todayKey,
      events: inMonth ? eventsByDate.get(key) ?? [] : [],
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  return {
    key: formatMonthKey(cursor),
    label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
    weeks,
  };
}

function countCalendarMonthEvents(month: CalendarMonth): number {
  return month.weeks.reduce(
    (total, week) => total + week.reduce((weekTotal, day) => weekTotal + day.events.length, 0),
    0,
  );
}

function calendarWeekdayClass(index: number): string {
  if (index === 0) return 'bg-rose-50 text-rose-700';
  if (index === 6) return 'bg-sky-50 text-sky-700';
  return 'bg-slate-50 text-slate-500';
}

function calendarDayClass(day: CalendarDayCell, weekdayIndex: number): string {
  const todayClass = day.isToday ? ' ring-2 ring-inset ring-amber-300' : '';
  if (!day.inMonth) return `bg-slate-50/70 text-slate-400${todayClass}`;
  if (weekdayIndex === 0) return `bg-rose-50/45${todayClass}`;
  if (weekdayIndex === 6) return `bg-sky-50/45${todayClass}`;
  return `bg-white${todayClass}`;
}

function calendarChipClass(event: InvestmentCalendarEvent): string {
  const tone =
    event.importance === 'high'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : event.importance === 'low'
        ? 'border-slate-200 bg-slate-50 text-slate-700'
        : 'border-sky-200 bg-sky-50 text-sky-900';
  const stale = event.is_stale ? ' ring-1 ring-amber-300' : '';
  return `group relative rounded-md border px-1.5 py-0.5 text-[11px] leading-4 outline-none ${tone}${stale}`;
}

function calendarEventTitle(event: InvestmentCalendarEvent): string {
  const parts = [
    event.title,
    event.symbol_code ? `symbol: ${event.symbol_code}` : null,
    event.event_time ? `time: ${event.event_time}` : null,
  ];
  return parts.filter(Boolean).join(' / ');
}

function calendarChipPrefix(event: InvestmentCalendarEvent): string {
  if (event.event_type === 'earnings') return event.symbol_code ? `決算 ${event.symbol_code}` : '決算';
  if (event.event_type === 'economic_indicator') return event.title.includes('CPI') ? 'CPI' : '指標';
  if (event.event_type === 'central_bank') {
    if (event.title.includes('日銀')) return '日銀';
    if (event.title.includes('FOMC')) return 'FOMC';
    return '中銀';
  }
  if (event.event_type === 'derivatives_settlement') return event.title.includes('メジャー') ? '大SQ' : 'SQ';
  if (event.event_type === 'market_holiday') return '休場';
  if (event.event_type === 'ipo') return 'IPO';
  return eventTypeLabel(event.event_type);
}

function calendarEventScopeLabel(event: InvestmentCalendarEvent): string {
  if (event.scope === 'market') return '市場全体';
  return event.symbol_code || event.display_name || '-';
}

function CalendarEventHoverDetail({ event }: { event: InvestmentCalendarEvent }) {
  return (
    <div className="pointer-events-none absolute left-0 top-full z-40 mt-1 hidden w-72 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] leading-5 text-slate-700 shadow-xl shadow-slate-300/40 group-hover:block group-focus-within:block">
      <div className="font-semibold text-slate-950">{event.title}</div>
      <div className="mt-1 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
        <span className="text-slate-500">種別</span>
        <span>{eventTypeLabel(event.event_type)}</span>
        <span className="text-slate-500">日付</span>
        <span>{event.event_date}{event.event_time ? ` ${event.event_time}` : ''}</span>
        <span className="text-slate-500">重要度</span>
        <span>{importanceLabel(event.importance)}</span>
        <span className="text-slate-500">対象</span>
        <span>{calendarEventScopeLabel(event)}</span>
        <span className="text-slate-500">provider</span>
        <span>{providerLabel(event.provider, event.source_name)}</span>
        <span className="text-slate-500">source</span>
        <span>{event.source_label || event.source_name || event.source_type || '-'}</span>
        <span className="text-slate-500">取得</span>
        <span>{event.fetched_at ? formatCalendarFetchedAt(event.fetched_at).replace('取得: ', '') : '-'}</span>
      </div>
      {event.is_stale ? (
        <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-800">
          取得情報が古い可能性があります。
        </div>
      ) : null}
      {event.description ? (
        <p className="mt-1 max-h-16 overflow-hidden text-slate-600">{event.description}</p>
      ) : null}
    </div>
  );
}

export default function InvestmentCalendarGrid({
  events,
  meta,
  emptyTitle,
  monthEmptyNote,
  fallbackWhenEmpty,
  refreshMessage,
  refreshError,
}: InvestmentCalendarGridProps) {
  const [calendarVisibleMonth, setCalendarVisibleMonth] = useState(() => getInitialCalendarMonthKey());
  const todayDateKey = formatDateKey(new Date());
  const calendarMonth = useMemo(
    () => buildCalendarMonth(events, calendarVisibleMonth, todayDateKey),
    [events, calendarVisibleMonth, todayDateKey],
  );
  const calendarMonthEventCount = countCalendarMonthEvents(calendarMonth);
  const staleCount = meta?.stale_event_count ?? 0;
  const providerStatuses = meta?.provider_statuses ?? [];
  const hasMeta = Boolean(refreshMessage) || Boolean(refreshError) || staleCount > 0 || providerStatuses.length > 0;

  function handleCalendarMonthChange(monthOffset: number) {
    setCalendarVisibleMonth((current) => formatMonthKey(addMonths(parseMonthKey(current), monthOffset)));
  }

  const bottomMeta = hasMeta ? (
    <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
      {refreshMessage ? <InlineNotice tone="success">{refreshMessage}</InlineNotice> : null}
      {refreshError ? <InlineNotice tone="warning">{refreshError}</InlineNotice> : null}
      {staleCount > 0 ? (
        <InlineNotice tone="warning">
          取得情報が古い可能性があります。カレンダーを更新してください。
        </InlineNotice>
      ) : null}
      {providerStatuses.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {providerStatuses.map((status) => (
            <span key={status.provider} className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
              {providerLabel(status.provider)}: {status.last_fetched_at ? formatCalendarFetchedAt(status.last_fetched_at) : '取得: -'}
              {status.stale_event_count ? ` / stale ${status.stale_event_count}` : ''}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  if (events.length === 0) {
    return (
      <>
        {fallbackWhenEmpty ?? <EmptyState title={emptyTitle} />}
        {bottomMeta}
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="overflow-visible rounded-xl border border-slate-200 bg-white">
          <div className="min-w-[44rem]">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <Button variant="secondary" onClick={() => handleCalendarMonthChange(-1)}>
                前月
              </Button>
              <h3 className="text-sm font-semibold text-slate-900">{calendarMonth.label}</h3>
              <Button variant="secondary" onClick={() => handleCalendarMonthChange(1)}>
                次月
              </Button>
            </div>
            <div className="grid grid-cols-7 border-b border-slate-200 text-center text-[11px] font-semibold">
              {CALENDAR_WEEKDAY_LABELS.map((label, index) => (
                <div key={label} className={`border-r border-slate-200 px-2 py-1.5 last:border-r-0 ${calendarWeekdayClass(index)}`}>
                  {label}
                </div>
              ))}
            </div>
            {calendarMonth.weeks.map((week, weekIndex) => (
              <div key={`${calendarMonth.key}-week-${weekIndex}`} className="grid grid-cols-7 items-start border-b border-slate-200 last:border-b-0">
                {week.map((day, dayIndex) => {
                  const visibleEvents = day.events.slice(0, MAX_CALENDAR_EVENTS_PER_DAY);
                  const hiddenCount = Math.max(0, day.events.length - visibleEvents.length);
                  return (
                    <div
                      key={day.date}
                      className={`min-h-8 border-r border-slate-200 p-1 last:border-r-0 ${calendarDayClass(day, dayIndex)}`}
                    >
                      <div className={`${day.events.length > 0 ? 'mb-1' : ''} flex min-h-5 items-center justify-between gap-1`}>
                        <span className={`text-xs font-semibold ${day.inMonth ? 'text-slate-700' : 'text-slate-400'}`}>
                          {day.day}
                        </span>
                        <span className="flex items-center gap-1">
                          {day.isToday ? (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              今日
                            </span>
                          ) : null}
                          {day.events.length > 0 ? (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              {day.events.length}件
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {visibleEvents.map((event) => (
                          <div
                            key={event.id}
                            className={calendarChipClass(event)}
                            title={calendarEventTitle(event)}
                            tabIndex={0}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="shrink-0 rounded bg-white/70 px-1 text-[10px] font-semibold">
                                {calendarChipPrefix(event)}
                              </span>
                              <span className="min-w-0 truncate font-semibold">{event.title}</span>
                            </div>
                            <CalendarEventHoverDetail event={event} />
                          </div>
                        ))}
                        {hiddenCount > 0 ? (
                          <div className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] font-semibold text-slate-500">
                            +{hiddenCount}件
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {calendarMonthEventCount === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {monthEmptyNote}
          </p>
        ) : null}
      </div>
      {bottomMeta}
    </>
  );
}
