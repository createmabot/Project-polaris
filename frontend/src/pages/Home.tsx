import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { postApi, swrFetcher } from '../api/client';
import { HomeData, InvestmentCalendarEvent, InvestmentCalendarRefreshData } from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import { SIDE_RAIL_HOME_API_PATH } from '../components/layout/SideRail';
import PageHeader from '../components/layout/PageHeader';
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
  const [isRefreshingCalendar, setIsRefreshingCalendar] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const homeApiPath = useMemo(() => buildHomeApiPath(summaryType, summaryDate), [summaryType, summaryDate]);
  const { data, error, isLoading, mutate } = useSWR<HomeData>(homeApiPath, swrFetcher);
  const canShareSideRailHomeData = homeApiPath === SIDE_RAIL_HOME_API_PATH;

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

  async function handleRefreshCalendar() {
    setIsRefreshingCalendar(true);
    setCalendarMessage(null);
    setCalendarError(null);
    try {
      const result = await postApi<InvestmentCalendarRefreshData>('/api/home/investment-calendar/refresh', {
        include_market_events: true,
      });
      if (result.status === 'failed') {
        setCalendarError('投資カレンダーを更新できませんでした。時間をおいて再実行してください。');
      } else if (result.status === 'partial_success') {
        setCalendarError(`一部のカレンダー取得に失敗しました。取得できた予定は保存されています。追加 ${result.saved_count} 件 / 更新 ${result.updated_count} 件。`);
      } else {
        setCalendarMessage(`投資カレンダーを更新しました。追加 ${result.saved_count} 件 / 更新 ${result.updated_count} 件。`);
      }
      await mutate();
    } catch {
      setCalendarError('投資カレンダーを更新できませんでした。時間をおいて再実行してください。');
    } finally {
      setIsRefreshingCalendar(false);
    }
  }

  const investmentCalendarEvents = data.investment_calendar?.events ?? [];

  return (
    <AppLayout
      showSideRail
      sideRailHomeData={canShareSideRailHomeData ? data : undefined}
      sideRailHomeError={canShareSideRailHomeData ? error : undefined}
      sideRailHomeIsLoading={canShareSideRailHomeData ? isLoading : undefined}
      sideRailMutateHome={canShareSideRailHomeData ? mutate : undefined}
    >
      <div className="w-full">
        <PageHeader
          title="北極星"
          description="概況、AIサマリー、アラート、注目イベントを確認します。"
          actions={
            <>
              <TextLink href="/compare">銘柄比較を開く</TextLink>
              <TextLink href="/strategy-lab">ルール検証ラボを開く</TextLink>
            </>
          }
        />

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
                      onClick={() => setSummaryType(option.value)}
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
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              {data.daily_summary && data.daily_summary.status === 'available' ? (
                <div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {data.daily_summary.body_markdown ?? '-'}
                  </p>
                  {data.daily_summary.insufficient_context ? (
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
            {calendarMessage ? <InlineNotice tone="success" className="mb-3">{calendarMessage}</InlineNotice> : null}
            {calendarError ? <InlineNotice tone="warning" className="mb-3">{calendarError}</InlineNotice> : null}
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
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {investmentCalendarEvents.map((event: InvestmentCalendarEvent) => (
                  <div key={event.id} className="px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-slate-800">{event.title}</strong>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {importanceLabel(event.importance)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{event.event_date ?? '-'}{event.event_time ? ` ${event.event_time}` : ''}</span>
                      <span>{eventTypeLabel(event.event_type)}</span>
                      <span>{event.scope === 'market' ? '市場全体' : event.display_name ?? event.symbol_code ?? '-'}</span>
                      {event.source_label ? <span>source: {event.source_label}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}
