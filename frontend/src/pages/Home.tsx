import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { fetchApi, postApi, swrFetcher } from '../api/client';
import { HomeData, InvestmentCalendarEvent, InvestmentCalendarRefreshData } from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import { SIDE_RAIL_HOME_API_PATH } from '../components/layout/SideRail';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import LoadingState from '../components/ui/LoadingState';
import SectionCard from '../components/ui/SectionCard';
import TextLink from '../components/ui/TextLink';
import Button from '../components/ui/Button';
import InlineNotice from '../components/ui/InlineNotice';

type HomeSummaryType = 'latest' | 'morning' | 'evening';

const SUMMARY_OPTIONS: Array<{ value: HomeSummaryType; label: string }> = [
  { value: 'latest', label: '最新' },
  { value: 'morning', label: '朝' },
  { value: 'evening', label: '夜' },
];
const CALENDAR_WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const MAX_CALENDAR_EVENTS_PER_DAY = 3;

type CalendarDayCell = {
  date: string;
  day: number;
  inMonth: boolean;
  events: InvestmentCalendarEvent[];
};

type CalendarMonth = {
  key: string;
  label: string;
  weeks: CalendarDayCell[][];
};

export function buildHomeApiPath(summaryType: HomeSummaryType, date: string | null): string {
  const params = new URLSearchParams();
  params.set('summary_type', summaryType);
  if (date) {
    params.set('date', date);
  }
  return `/api/home?${params.toString()}`;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function formatCalendarFetchedAt(value: string | null): string {
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

function providerLabel(provider: string | null | undefined, sourceName?: string | null): string {
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

function formatProviderRefreshSummary(result: InvestmentCalendarRefreshData): string {
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

function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
}

function formatChangeRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${value > 0 ? '+' : ''}${formatCompactNumber(value)}%`;
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
  if (importance === 'high') return '重要';
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

function buildCalendarMonth(events: InvestmentCalendarEvent[], monthKey: string): CalendarMonth {
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
  if (!day.inMonth) return 'bg-slate-50/70 text-slate-400';
  if (weekdayIndex === 0) return 'bg-rose-50/45';
  if (weekdayIndex === 6) return 'bg-sky-50/45';
  return 'bg-white';
}

function calendarChipClass(event: InvestmentCalendarEvent): string {
  const tone =
    event.importance === 'high'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : event.importance === 'low'
        ? 'border-slate-200 bg-slate-50 text-slate-700'
        : 'border-sky-200 bg-sky-50 text-sky-900';
  const stale = event.is_stale ? ' ring-1 ring-amber-300' : '';
  return `rounded-md border px-1.5 py-1 text-[11px] leading-4 ${tone}${stale}`;
}

function calendarEventTitle(event: InvestmentCalendarEvent): string {
  const parts = [
    event.title,
    `importance: ${importanceLabel(event.importance)}`,
    event.source_label ? `source: ${event.source_label}` : null,
    `provider: ${providerLabel(event.provider, event.source_name)}`,
    event.fetched_at ? formatCalendarFetchedAt(event.fetched_at) : null,
    event.is_stale ? '取得情報が古い可能性があります' : null,
  ];
  return parts.filter(Boolean).join(' / ');
}

function MarketTile({
  kind,
  name,
  price,
  changeRate,
}: {
  kind: string;
  name: string;
  price?: number | null;
  changeRate?: number | null;
}) {
  const isPositive = typeof changeRate === 'number' && changeRate > 0;
  const isNegative = typeof changeRate === 'number' && changeRate < 0;
  const changeClass = isPositive ? 'text-emerald-700' : isNegative ? 'text-rose-700' : 'text-slate-500';
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{kind}</span>
        <span className={`text-xs font-semibold ${changeClass}`}>{formatChangeRate(changeRate)}</span>
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900">{name || '-'}</div>
      {price !== undefined ? <div className="mt-0.5 text-xs text-slate-500">値 {formatCompactNumber(price)}</div> : null}
    </div>
  );
}

export default function Home() {
  const [summaryType, setSummaryType] = useState<HomeSummaryType>('latest');
  const [summaryDate] = useState<string | null>(null);
  const [selectedDailySummary, setSelectedDailySummary] = useState<HomeData['daily_summary'] | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isRefreshingCalendar, setIsRefreshingCalendar] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarVisibleMonth, setCalendarVisibleMonth] = useState(() => getInitialCalendarMonthKey());
  const homeApiPath = useMemo(() => buildHomeApiPath('latest', summaryDate), [summaryDate]);
  const { data, error, isLoading, mutate } = useSWR<HomeData>(homeApiPath, swrFetcher);
  const canShareSideRailHomeData = homeApiPath === SIDE_RAIL_HOME_API_PATH;
  const investmentCalendarEvents = data?.investment_calendar?.events ?? [];
  const calendarMonth = useMemo(
    () => buildCalendarMonth(investmentCalendarEvents, calendarVisibleMonth),
    [investmentCalendarEvents, calendarVisibleMonth],
  );
  const calendarMonthEventCount = countCalendarMonthEvents(calendarMonth);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <LoadingState title="読み込み中..." />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <ErrorState title="Home の取得に失敗しました">
          エラー: {error.message}
        </ErrorState>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <EmptyState title="Home データが見つかりません" />
      </div>
    );
  }

  async function handleSummaryTypeChange(nextSummaryType: HomeSummaryType) {
    if (nextSummaryType === summaryType || isSummaryLoading) return;
    setSummaryType(nextSummaryType);
    setSummaryError(null);
    setIsSummaryLoading(true);
    try {
      const summaryData = await fetchApi<HomeData>(buildHomeApiPath(nextSummaryType, summaryDate));
      setSelectedDailySummary(summaryData.daily_summary ?? null);
    } catch {
      setSummaryError('AIデイリーサマリーを更新できませんでした。時間をおいて再実行してください。');
    } finally {
      setIsSummaryLoading(false);
    }
  }

  async function handleRefreshCalendar() {
    setIsRefreshingCalendar(true);
    setCalendarMessage(null);
    setCalendarError(null);
    try {
      const result = await postApi<InvestmentCalendarRefreshData>('/api/home/investment-calendar/refresh', {
        include_market_events: true,
      });
      if (result.status === 'failed') {
        const summary = formatProviderRefreshSummary(result);
        setCalendarError(`投資カレンダーを更新できませんでした。時間をおいて再実行してください。${summary ? ` ${summary}` : ''}`);
      } else if (result.status === 'partial_success') {
        const summary = formatProviderRefreshSummary(result);
        setCalendarError(`一部のカレンダー取得に失敗しました。取得できた予定は保存されています。追加 ${result.saved_count} 件 / 更新 ${result.updated_count} 件。${summary ? ` ${summary}` : ''}`);
      } else {
        const summary = formatProviderRefreshSummary(result);
        setCalendarMessage(`投資カレンダーを更新しました。追加 ${result.saved_count} 件 / 更新 ${result.updated_count} 件。${summary ? ` ${summary}` : ''}`);
      }
      await mutate();
    } catch {
      setCalendarError('投資カレンダーを更新できませんでした。時間をおいて再実行してください。');
    } finally {
      setIsRefreshingCalendar(false);
    }
  }

  function handleCalendarMonthChange(monthOffset: number) {
    setCalendarVisibleMonth((current) => formatMonthKey(addMonths(parseMonthKey(current), monthOffset)));
  }

  const calendarStaleCount = data.investment_calendar?.meta?.stale_event_count ?? 0;
  const calendarProviderStatuses = data.investment_calendar?.meta?.provider_statuses ?? [];
  const dailySummary = selectedDailySummary ?? data.daily_summary;
  const hasCalendarMeta =
    Boolean(calendarMessage) ||
    Boolean(calendarError) ||
    calendarStaleCount > 0 ||
    calendarProviderStatuses.length > 0;
  const calendarMeta = hasCalendarMeta ? (
    <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
      {calendarMessage ? <InlineNotice tone="success">{calendarMessage}</InlineNotice> : null}
      {calendarError ? <InlineNotice tone="warning">{calendarError}</InlineNotice> : null}
      {calendarStaleCount > 0 ? (
        <InlineNotice tone="warning">
          取得情報が古い可能性があります。カレンダーを更新してください。
        </InlineNotice>
      ) : null}
      {calendarProviderStatuses.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {calendarProviderStatuses.map((status) => (
            <span key={status.provider} className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
              {providerLabel(status.provider)}: {status.last_fetched_at ? formatCalendarFetchedAt(status.last_fetched_at) : '取得: -'}
              {status.stale_event_count ? ` / stale ${status.stale_event_count}` : ''}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <AppLayout
      showSideRail
      sideRailHomeData={canShareSideRailHomeData ? data : undefined}
      sideRailHomeError={canShareSideRailHomeData ? error : undefined}
      sideRailHomeIsLoading={canShareSideRailHomeData ? isLoading : undefined}
      sideRailMutateHome={canShareSideRailHomeData ? mutate : undefined}
    >
      <div className="w-full">
        <div className="grid gap-4">
          <SectionCard title="マーケット概況" className="p-4" headingClassName="text-base font-semibold text-slate-900">
              {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.indices).length === 0 &&
              asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.fx).length === 0 &&
              asArray<{ display_name?: string; change_rate?: number }>(data.market_overview?.sectors).length === 0 ? (
                <EmptyState title="マーケット概況データはまだありません。" />
              ) : (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.indices).map((item, index) => (
                    <MarketTile
                      key={`index-${index}`}
                      kind="指数"
                      name={item.display_name ?? '-'}
                      price={item.price}
                      changeRate={item.change_rate}
                    />
                  ))}
                  {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.fx).map((item, index) => (
                    <MarketTile
                      key={`fx-${index}`}
                      kind="為替"
                      name={item.display_name ?? '-'}
                      price={item.price}
                      changeRate={item.change_rate}
                    />
                  ))}
                  {asArray<{ display_name?: string; change_rate?: number }>(data.market_overview?.sectors).map((item, index) => (
                    <MarketTile
                      key={`sector-${index}`}
                      kind="セクター"
                      name={item.display_name ?? '-'}
                      changeRate={item.change_rate}
                    />
                  ))}
                </div>
              )}
          </SectionCard>

          <SectionCard
            title="AIデイリーサマリー"
            description="AIがマーケット・アラート・参照情報をもとに生成した要約です。"
            className="p-4"
            headingClassName="text-base font-semibold text-slate-900"
            actions={
              <div className="flex flex-wrap gap-1.5">
                {SUMMARY_OPTIONS.map((option) => {
                  const selected = summaryType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSummaryTypeChange(option.value)}
                      disabled={isSummaryLoading}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        selected
                          ? 'border-sky-600 bg-sky-100 text-sky-900'
                          : 'border-slate-300 bg-white text-slate-600'
                      }`}
                      aria-pressed={selected}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            }
          >
            {summaryError ? (
              <InlineNotice tone="warning" className="mb-3">
                {summaryError}
              </InlineNotice>
            ) : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              {dailySummary && dailySummary.status === 'available' ? (
                <div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {dailySummary.body_markdown ?? '-'}
                  </p>
                  {dailySummary.insufficient_context ? (
                    <p className="mt-2 text-xs text-slate-500">
                      参考情報が不足しているため、要約の精度が限定的です。
                    </p>
                  ) : null}
                </div>
              ) : (
                <EmptyState title="サマリーはまだありません。" />
              )}
            </div>
          </SectionCard>

          <SectionCard title="最新アラート" className="p-4" headingClassName="text-base font-semibold text-slate-900">
            {data.recent_alerts.length === 0 ? (
              <EmptyState title="アラートはありません。" />
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {data.recent_alerts.map((alert) => (
                  <article key={alert.id} className="px-3 py-2.5 transition hover:bg-sky-50/40">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <strong className="text-sm text-slate-900">
                          <TextLink href={`/alerts/${alert.id}`}>{alert.alertName}</TextLink>
                        </strong>
                        <span className="text-xs text-slate-500">
                          {alert.symbol?.id ? (
                            <TextLink href={`/symbols/${alert.symbol.id}`}>
                              {alert.symbol.displayName || alert.symbol.symbol}
                            </TextLink>
                          ) : (
                            <span>{alert.symbol?.displayName || alert.symbol?.symbol || '不明'}</span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-slate-500">
                        発生 {formatDate(alert.triggeredAt || alert.receivedAt)} / 状態{' '}
                        <code>{alert.processingStatus}</code>
                      </div>
                    </div>
                    {alert.related_ai_summary ? (
                      <div className="mt-2 rounded-md border-l-2 border-sky-600 bg-slate-50 px-2.5 py-1.5">
                        <div className="truncate text-xs font-medium text-slate-900">
                          {alert.related_ai_summary.title || 'AI要約'}
                        </div>
                        <p className="mt-1 max-h-10 overflow-hidden whitespace-pre-wrap text-xs leading-5 text-slate-700">
                          {alert.related_ai_summary.bodyMarkdown}
                        </p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="投資カレンダー"
            description="監視・保有銘柄の予定と市場イベントをまとめて確認します。"
            className="p-4"
            headingClassName="text-base font-semibold text-slate-900"
            actions={
              <Button variant="secondary" onClick={handleRefreshCalendar} disabled={isRefreshingCalendar}>
                {isRefreshingCalendar ? '更新中...' : '投資カレンダーを更新'}
              </Button>
            }
          >
            {investmentCalendarEvents.length === 0 ? (
              data.key_events.length === 0 ? (
                <EmptyState title="投資カレンダーはまだありません。" />
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {data.key_events.map((event: any, index: number) => (
                    <div key={`${event.label ?? 'event'}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <strong className="text-slate-800">{event.label ?? 'イベント'}</strong>
                      <div className="text-xs text-slate-500">
                        日付: {event.date ?? '-'}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
                        <div key={`${calendarMonth.key}-week-${weekIndex}`} className="grid grid-cols-7 border-b border-slate-200 last:border-b-0">
                          {week.map((day, dayIndex) => {
                            const visibleEvents = day.events.slice(0, MAX_CALENDAR_EVENTS_PER_DAY);
                            const hiddenCount = Math.max(0, day.events.length - visibleEvents.length);
                            return (
                              <div
                                key={day.date}
                                className={`min-h-28 border-r border-slate-200 p-1.5 last:border-r-0 ${calendarDayClass(day, dayIndex)}`}
                              >
                                <div className="mb-1 flex items-center justify-between gap-1">
                                  <span className={`text-xs font-semibold ${day.inMonth ? 'text-slate-700' : 'text-slate-400'}`}>
                                    {day.day}
                                  </span>
                                  {day.events.length > 0 ? (
                                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                      {day.events.length}件
                                    </span>
                                  ) : null}
                                </div>
                                <div className="space-y-1">
                                  {visibleEvents.map((event) => (
                                    <div key={event.id} className={calendarChipClass(event)} title={calendarEventTitle(event)}>
                                      <div className="flex items-center gap-1">
                                        <span className="shrink-0 rounded bg-white/70 px-1 text-[10px] font-semibold">
                                          {eventTypeLabel(event.event_type)}
                                        </span>
                                        <span className="min-w-0 truncate font-semibold">{event.title}</span>
                                      </div>
                                      <div className="mt-0.5 flex items-center gap-1 text-[10px] opacity-80">
                                        <span className="truncate">{event.scope === 'market' ? '市場全体' : event.display_name ?? event.symbol_code ?? '-'}</span>
                                        <span>·</span>
                                        <span className="truncate">{providerLabel(event.provider, event.source_name)}</span>
                                        {event.is_stale ? <span className="font-semibold text-amber-700">stale</span> : null}
                                      </div>
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
                    この月の投資カレンダー予定はありません。前月・次月で表示月を切り替えられます。
                  </p>
                ) : null}
              </div>
            )}
            {calendarMeta}
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}
