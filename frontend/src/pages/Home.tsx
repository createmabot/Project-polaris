import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { fetchApi, postApi, swrFetcher } from '../api/client';
import { DailySummaryData, HomeData, InvestmentCalendarRefreshData } from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import { SIDE_RAIL_HOME_API_PATH } from '../components/layout/SideRail';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import LoadingState from '../components/ui/LoadingState';
import SectionCard from '../components/ui/SectionCard';
import TextLink from '../components/ui/TextLink';
import Button from '../components/ui/Button';
import InlineNotice from '../components/ui/InlineNotice';
import InvestmentCalendarGrid, { formatProviderRefreshSummary } from '../components/investment-calendar/InvestmentCalendarGrid';
export { getInitialCalendarMonthKey } from '../components/investment-calendar/InvestmentCalendarGrid';

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

export function buildDailySummaryApiPath(summaryType: HomeSummaryType, date: string | null): string {
  const params = new URLSearchParams();
  params.set('type', summaryType);
  if (date) {
    params.set('date', date);
  }
  return `/api/summaries/daily?${params.toString()}`;
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

function formatSummaryGeneratedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `生成: ${date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function summarySlotLabel(summaryType: HomeSummaryType): string {
  if (summaryType === 'morning') return '朝';
  if (summaryType === 'evening') return '夜';
  return '最新';
}

function summarySelectionLabel(summary: DailySummaryData | null, selectedType: HomeSummaryType): string {
  if (summary?.date) return `対象日: ${summary.date}`;
  if (selectedType === 'morning') return '対象: 保存済みの朝サマリー';
  if (selectedType === 'evening') return '対象: 保存済みの夜サマリー';
  return '対象: 保存済み最新';
}

function summaryUnavailableTitle(summaryType: HomeSummaryType): string {
  if (summaryType === 'morning') return '朝のサマリーはまだありません。';
  if (summaryType === 'evening') return '夜のサマリーはまだありません。';
  return 'サマリーはまだありません。';
}

function summaryUnavailableDetail(insufficientContext: boolean): string {
  if (insufficientContext) {
    return 'マーケット snapshot / アラート / 参照情報が不足している可能性があります。';
  }
  return 'この slot のサマリーはまだ生成されていません。';
}

function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
}

function formatChangeRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${value > 0 ? '+' : ''}${formatCompactNumber(value)}%`;
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
  const [selectedDailySummary, setSelectedDailySummary] = useState<DailySummaryData | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isRefreshingCalendar, setIsRefreshingCalendar] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const homeApiPath = useMemo(() => buildHomeApiPath('latest', summaryDate), [summaryDate]);
  const { data, error, isLoading, mutate } = useSWR<HomeData>(homeApiPath, swrFetcher);
  const canShareSideRailHomeData = homeApiPath === SIDE_RAIL_HOME_API_PATH;
  const investmentCalendarEvents = data?.investment_calendar?.events ?? [];

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
    setSummaryError(null);
    setIsSummaryLoading(true);
    try {
      const summaryData = await fetchApi<DailySummaryData>(buildDailySummaryApiPath(nextSummaryType, summaryDate));
      setSelectedDailySummary(summaryData);
      setSummaryType(nextSummaryType);
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

  const dailySummary = selectedDailySummary ?? data.daily_summary;


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
          <SectionCard
            title="マーケット概況"
            description="主要指標、為替、固定ウォッチ対象セクターの snapshot を表示します。"
            className="p-4"
            headingClassName="text-base font-semibold text-slate-900"
          >
              {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.indices).length === 0 &&
              asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.fx).length === 0 &&
              asArray<{ display_name?: string; change_rate?: number }>(data.market_overview?.sectors).length === 0 ? (
                <EmptyState title="マーケット概況データはまだありません。">
                  固定対象の主要指標・為替・セクター snapshot が保存されると表示されます。
                </EmptyState>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.indices).map((item, index) => (
                    <MarketTile
                      key={`index-${index}`}
                      kind="主要指標"
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
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                  種別: {summarySlotLabel(summaryType)}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                  {summarySelectionLabel(dailySummary, summaryType)}
                </span>
                {dailySummary?.generated_at ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                    {formatSummaryGeneratedAt(dailySummary.generated_at)}
                  </span>
                ) : null}
              </div>
              {dailySummary && dailySummary.status === 'available' ? (
                <div>
                  {dailySummary.title ? (
                    <div className="mb-2 text-sm font-semibold text-slate-900">{dailySummary.title}</div>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {dailySummary.body_markdown ?? '-'}
                  </p>
                  {dailySummary.insufficient_context ? (
                    <InlineNotice tone="warning" className="mt-2">
                      参考情報が不足しているため、要約の精度が限定的です。
                    </InlineNotice>
                  ) : null}
                </div>
              ) : (
                <EmptyState title={summaryUnavailableTitle(summaryType)}>
                  {summaryUnavailableDetail(Boolean(dailySummary?.insufficient_context))}
                </EmptyState>
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
            className="order-first p-4"
            headingClassName="text-base font-semibold text-slate-900"
            actions={
              <Button variant="secondary" onClick={handleRefreshCalendar} disabled={isRefreshingCalendar}>
                {isRefreshingCalendar ? '更新中...' : '投資カレンダーを更新'}
              </Button>
            }
          >
            <InvestmentCalendarGrid
              events={investmentCalendarEvents}
              meta={data.investment_calendar?.meta}
              emptyTitle="投資カレンダーはまだありません。"
              monthEmptyNote="この月の投資カレンダー予定はありません。前月・次月で表示月を切り替えられます。"
              refreshMessage={calendarMessage}
              refreshError={calendarError}
              fallbackWhenEmpty={
                data.key_events.length === 0 ? undefined : (
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
              }
            />
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}
