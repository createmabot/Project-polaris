import useSWR from 'swr';
import { useMemo, useState, type ReactNode } from 'react';
import { swrFetcher } from '../api/client';
import { HomeData } from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import { SIDE_RAIL_HOME_API_PATH } from '../components/layout/SideRail';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import SectionCard from '../components/ui/SectionCard';
import Surface from '../components/ui/Surface';
import TextLink from '../components/ui/TextLink';

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

function InfoCard({ children }: { children: ReactNode }) {
  return <Surface variant="muted" className="p-4 shadow-slate-200/50">{children}</Surface>;
}

export default function Home() {
  const [summaryType, setSummaryType] = useState<HomeSummaryType>('latest');
  const [summaryDate] = useState<string | null>(null);
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
          description="アラート、ノート、日次サマリーをまとめて確認します。"
          actions={
            <>
              <TextLink href="/compare">銘柄比較を開く</TextLink>
              <TextLink href="/strategy-lab">ルール検証ラボを開く</TextLink>
            </>
          }
        />

        <div className="grid gap-5">
          <SectionCard title="日次確認の見方">
            <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
              <InfoCard>
                <p className="text-sm leading-6 text-slate-600">
                  監視銘柄・保有銘柄の詳細一覧は、左の共通サイドメニューから確認します。
                  Home 本体ではマーケット概況、AIデイリーサマリー、最新アラート、注目イベントを優先表示します。
                </p>
              </InfoCard>
              <InfoCard>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Daily workspace</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  まず概況とサマリーを読み、気になる銘柄は SideRail から詳細へ進む構成です。
                </p>
              </InfoCard>
            </div>
          </SectionCard>

          <SectionCard title="マーケット概況">
            <InfoCard>
              {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.indices).length === 0 &&
              asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.fx).length === 0 &&
              asArray<{ display_name?: string; change_rate?: number }>(data.market_overview?.sectors).length === 0 ? (
                <EmptyState title="マーケット概況データはまだありません。" />
              ) : (
                <div className="grid gap-3 xl:grid-cols-3">
                  {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.indices).map((item, index) => (
                    <InfoCard key={`index-${index}`}>
                      <KeyValueList>
                        <KeyValueRow label="指数">{item.display_name ?? '-'}</KeyValueRow>
                        <KeyValueRow label="値">{item.price ?? '-'}</KeyValueRow>
                        <KeyValueRow label="変化率">{item.change_rate ?? '-'}</KeyValueRow>
                      </KeyValueList>
                    </InfoCard>
                  ))}
                  {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.fx).map((item, index) => (
                    <InfoCard key={`fx-${index}`}>
                      <KeyValueList>
                        <KeyValueRow label="為替">{item.display_name ?? '-'}</KeyValueRow>
                        <KeyValueRow label="値">{item.price ?? '-'}</KeyValueRow>
                        <KeyValueRow label="変化率">{item.change_rate ?? '-'}</KeyValueRow>
                      </KeyValueList>
                    </InfoCard>
                  ))}
                  {asArray<{ display_name?: string; change_rate?: number }>(data.market_overview?.sectors).map((item, index) => (
                    <InfoCard key={`sector-${index}`}>
                      <KeyValueList>
                        <KeyValueRow label="セクター">{item.display_name ?? '-'}</KeyValueRow>
                        <KeyValueRow label="変化率">{item.change_rate ?? '-'}</KeyValueRow>
                      </KeyValueList>
                    </InfoCard>
                  ))}
                </div>
              )}
            </InfoCard>
          </SectionCard>

          <SectionCard
            title="AIデイリーサマリー"
            description="AIがマーケット・アラート・参照情報をもとに生成した要約です。"
            actions={
              <div className="flex flex-wrap gap-2">
                {SUMMARY_OPTIONS.map((option) => {
                  const selected = summaryType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSummaryType(option.value)}
                      className={`rounded-full border px-3 py-1.5 text-sm ${
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
            <InfoCard>
              {data.daily_summary && data.daily_summary.status === 'available' ? (
                <div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {data.daily_summary.body_markdown ?? '-'}
                  </p>
                  {data.daily_summary.insufficient_context ? (
                    <p className="mt-3 text-xs text-slate-500">
                      参考情報が不足しているため、要約の精度が限定的です。
                    </p>
                  ) : null}
                </div>
              ) : (
                <EmptyState title="サマリーはまだありません。" />
              )}
            </InfoCard>
          </SectionCard>

          <SectionCard title="最新アラート">
            {data.recent_alerts.length === 0 ? (
              <EmptyState title="アラートはありません。" />
            ) : (
              <div className="grid gap-3">
                {data.recent_alerts.map((alert) => (
                  <article key={alert.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/30">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block text-slate-900">
                          <TextLink href={`/alerts/${alert.id}`}>{alert.alertName}</TextLink>
                        </strong>
                        <div className="mt-1 text-sm text-slate-600">
                          銘柄:{' '}
                          {alert.symbol?.id ? (
                            <TextLink href={`/symbols/${alert.symbol.id}`}>
                              {alert.symbol.displayName || alert.symbol.symbol}
                            </TextLink>
                          ) : (
                            <span>{alert.symbol?.displayName || alert.symbol?.symbol || '不明'}</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          発生: {formatDate(alert.triggeredAt || alert.receivedAt)} | 状態:{' '}
                          <code>{alert.processingStatus}</code>
                        </div>
                      </div>
                    </div>
                    {alert.related_ai_summary ? (
                      <div className="mt-3 rounded-lg border-l-4 border-sky-600 bg-slate-50 p-3">
                        <div className="font-medium text-slate-900">
                          {alert.related_ai_summary.title || 'AI要約'}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                          {alert.related_ai_summary.bodyMarkdown}
                        </p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="注目イベント">
            {data.key_events.length === 0 ? (
              <EmptyState title="注目イベントはまだありません。" />
            ) : (
              <div className="grid gap-3">
                {data.key_events.map((event: any, index: number) => (
                  <InfoCard key={`${event.label ?? 'event'}-${index}`}>
                    <div className="text-sm text-slate-800">
                      <strong>{event.label ?? 'イベント'}</strong>
                      <span className="ml-3 text-slate-500">日付: {event.date ?? '-'}</span>
                    </div>
                  </InfoCard>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}
