import { type ReactNode, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRoute } from 'wouter';
import { postApi, swrFetcher } from '../api/client';
import { SymbolAiSummaryData, SymbolDetailData } from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import TextLink from '../components/ui/TextLink';

const LABELS = {
  backToHome: '\u30db\u30fc\u30e0\u3078\u623b\u308b',
  compare: '\u6bd4\u8f03\u753b\u9762\u306b\u9032\u3080',
  code: '\u30b3\u30fc\u30c9',
  market: '\u5e02\u5834',
  processingStatus: '\u51e6\u7406\u72b6\u614b',
  chartTitle: 'TradingView chart',
  chartDescription: '\u5171\u901a\u30b5\u30a4\u30c9\u30e1\u30cb\u30e5\u30fc\u3068\u4f75\u7528\u3057\u306a\u304c\u3089\u3001\u9298\u67c4\u306e\u73fe\u5728\u72b6\u6cc1\u3068\u30c1\u30e3\u30fc\u30c8\u3092\u78ba\u8a8d\u3057\u307e\u3059\u3002',
  snapshotTitle: '\u73fe\u5728\u30b9\u30ca\u30c3\u30d7\u30b7\u30e7\u30c3\u30c8',
  latestAlertsTitle: '\u6700\u65b0\u30a2\u30e9\u30fc\u30c8',
  latestAiTitle: '\u6700\u65b0AI\u8ad6\u70b9\u30ab\u30fc\u30c9',
  researchNoteTitle: 'Research Note',
  referencesTitle: '\u95a2\u9023\u53c2\u7167\u60c5\u5831',
  currentPrice: '\u73fe\u5728\u5024',
  dayChange: '\u524d\u65e5\u6bd4',
  volume: '\u51fa\u6765\u9ad8',
  source: '\u30bd\u30fc\u30b9',
  marketStatus: '\u5e02\u5834\u72b6\u614b',
  snapshotUnavailable: '\u30b9\u30ca\u30c3\u30d7\u30b7\u30e7\u30c3\u30c8\u3092\u53d6\u5f97\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002',
  noAlerts: '\u3053\u306e\u9298\u67c4\u306e\u30a2\u30e9\u30fc\u30c8\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093\u3002',
  datetime: '\u65e5\u6642',
  status: '\u72b6\u614b',
  loadingAi: 'AI\u8ad6\u70b9\u30ab\u30fc\u30c9\u3092\u8aad\u307f\u8fbc\u307f\u4e2d...',
  unavailableAi: 'AI\u8ad6\u70b9\u30ab\u30fc\u30c9\u306f\u672a\u751f\u6210\u3067\u3059\u3002',
  emptyAi: 'AI\u8ad6\u70b9\u30ab\u30fc\u30c9\u306f\u7a7a\u3067\u3059\u3002',
  generateAi: 'AI\u8ad6\u70b9\u30ab\u30fc\u30c9\u751f\u6210',
  regenerateAi: 'AI\u8ad6\u70b9\u30ab\u30fc\u30c9\u3092\u518d\u751f\u6210',
  generating: '\u751f\u6210\u4e2d...',
  generatedAt: '\u751f\u6210\u65e5\u6642',
  noReferencesWarning: '\u53c2\u7167\u60c5\u5831\u306f0\u4ef6\u3067\u3059\u3002\u30b9\u30ca\u30c3\u30d7\u30b7\u30e7\u30c3\u30c8\u3084\u30ce\u30fc\u30c8\u4e2d\u5fc3\u306e\u8981\u7d04\u306b\u306a\u3063\u3066\u3044\u308b\u53ef\u80fd\u6027\u304c\u3042\u308a\u307e\u3059\u3002',
  limitedReferencesWarning: '\u53c2\u7167\u60c5\u5831\u304c\u4e0d\u8db3\u3057\u3066\u3044\u308b\u305f\u3081\u3001\u8ad6\u70b9\u306e\u7cbe\u5ea6\u306b\u306f\u9650\u754c\u304c\u3042\u308b\u53ef\u80fd\u6027\u304c\u3042\u308a\u307e\u3059\u3002',
  openNote: '\u30ce\u30fc\u30c8\u3092\u958b\u304f',
  createNote: '\u30ce\u30fc\u30c8\u3092\u65b0\u898f\u4f5c\u6210',
  lastUpdated: '\u6700\u7d42\u66f4\u65b0',
  nextReview: '\u6b21\u56de\u78ba\u8a8d\u65e5',
  noResearchNote: '\u30a2\u30af\u30c6\u30a3\u30d6\u306a research note \u306f\u3042\u308a\u307e\u305b\u3093\u3002',
  breakdown: '\u5185\u8a33',
  noReferences: '\u95a2\u9023\u53c2\u7167\u60c5\u5831\u306f\u3042\u308a\u307e\u305b\u3093\u3002',
  emptyStateHint: '\u30c7\u30fc\u30bf\u672a\u53d6\u5f97\u306e\u5834\u5408\u306f\u3001seed \u518d\u6295\u5165\u5f8c\u306b\u30da\u30fc\u30b8\u3092\u518d\u8aad\u307f\u8fbc\u307f\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
  notFoundTitle: '\u9298\u67c4\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093',
  notFoundBody: '\u6307\u5b9a\u3055\u308c\u305f\u9298\u67c4ID\u306f\u5b58\u5728\u3057\u306a\u3044\u304b\u3001\u524a\u9664\u3055\u308c\u3066\u3044\u307e\u3059\u3002',
  loadSymbol: '\u9298\u67c4\u60c5\u5831\u3092\u8aad\u307f\u8fbc\u307f\u4e2d...',
} as const;

const PRIMARY_BUTTON_CLASS =
  'rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400';
const PANEL_CLASS = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('ja-JP', { maximumFractionDigits: digits });
}

function getReferenceBreakdown(references: Array<{ reference_type?: string | null }>) {
  return references.reduce(
    (acc, reference) => {
      if (reference.reference_type === 'news') acc.news += 1;
      if (reference.reference_type === 'disclosure') acc.disclosure += 1;
      if (reference.reference_type === 'earnings') acc.earnings += 1;
      return acc;
    },
    { news: 0, disclosure: 0, earnings: 0 },
  );
}

function getThesisPoints(structuredJson: any): string[] {
  const payload = structuredJson?.payload;
  if (!payload || typeof payload !== 'object') return [];

  const points: string[] = [];
  const candidates = [...(payload.bullish_points ?? []), ...(payload.bearish_points ?? [])];
  for (const point of candidates) {
    if (typeof point === 'string' && point.trim()) {
      points.push(point.trim());
    } else if (point && typeof point === 'object' && typeof point.text === 'string' && point.text.trim()) {
      points.push(point.text.trim());
    }
  }
  return points.slice(0, 4);
}

type DetailSectionProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

function DetailSection({ title, actions, children }: DetailSectionProps) {
  return (
    <section className={PANEL_CLASS}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function InfoCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-slate-50 p-4 ${className}`.trim()}>{children}</div>;
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-slate-500">{children}</p>;
}

function MetaText({ children }: { children: ReactNode }) {
  return <div className="text-xs leading-5 text-slate-500">{children}</div>;
}

export default function SymbolDetail() {
  const [, params] = useRoute('/symbols/:symbolId');
  const symbolId = params?.symbolId;
  const tvContainerRef = useRef<HTMLDivElement>(null);
  const [isGeneratingThesis, setIsGeneratingThesis] = useState(false);
  const [generateThesisError, setGenerateThesisError] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<SymbolDetailData>(
    symbolId ? `/api/symbols/${symbolId}` : null,
    swrFetcher,
  );
  const {
    data: aiSummaryData,
    error: aiSummaryError,
    isLoading: isAiSummaryLoading,
    mutate: mutateAiSummary,
  } = useSWR<SymbolAiSummaryData>(
    symbolId ? `/api/symbols/${symbolId}/ai-summary?scope=thesis` : null,
    swrFetcher,
  );

  useEffect(() => {
    if (!data?.chart?.widget_symbol || !tvContainerRef.current) return;

    tvContainerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (typeof (window as any).TradingView !== 'undefined') {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: data.chart?.widget_symbol,
          interval: data.chart?.default_interval || 'D',
          timezone: 'Asia/Tokyo',
          theme: 'light',
          style: '1',
          locale: 'ja',
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: tvContainerRef.current?.id,
        });
      }
    };
    tvContainerRef.current.appendChild(script);
  }, [data?.chart?.widget_symbol, data?.chart?.default_interval]);

  if (isLoading) {
    return (
      <AppLayout showSideRail>
        <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{LABELS.loadSymbol}</div>
      </AppLayout>
    );
  }

  if (error) {
    if (error.code === 'NOT_FOUND' || error.message.includes('404')) {
      return (
        <AppLayout showSideRail>
          <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">{LABELS.notFoundTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{LABELS.notFoundBody}</p>
            <div className="mt-4">
              <TextLink href="/">{LABELS.backToHome}</TextLink>
            </div>
          </div>
        </AppLayout>
      );
    }

    return (
      <AppLayout showSideRail>
        <div className="w-full rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">\u30a8\u30e9\u30fc: {error.message}</div>
      </AppLayout>
    );
  }

  if (!data) return null;

  const aiSummary = aiSummaryData?.summary;
  const availableSummary =
    aiSummary?.status === 'available'
      ? {
          title: aiSummary.title,
          body_markdown: aiSummary.body_markdown ?? '',
          generated_at: aiSummary.generated_at,
          structured_json: aiSummary.structured_json,
        }
      : data.latest_ai_thesis_summary;
  const thesisPoints = getThesisPoints(availableSummary?.structured_json);
  const hasSummaryContent = Boolean(
    availableSummary?.title?.trim() ||
      availableSummary?.body_markdown?.trim() ||
      thesisPoints.length > 0,
  );
  const referenceBreakdown = getReferenceBreakdown(data.related_references);
  const aiSummaryInsufficientContext =
    aiSummary?.insufficient_context === true ||
    availableSummary?.structured_json?.insufficient_context === true;
  const hasNoReferences = data.related_references.length === 0;

  async function handleGenerateThesis(forceRegenerate = false) {
    if (!symbolId || !data) return;
    setIsGeneratingThesis(true);
    setGenerateThesisError(null);
    try {
      await postApi(`/api/symbols/${symbolId}/ai-summary/generate`, {
        scope: 'thesis',
        reference_ids: data.related_references.slice(0, 5).map((item) => item.id),
        force_regenerate: forceRegenerate,
      });
      await mutateAiSummary();
    } catch (err: any) {
      setGenerateThesisError(err?.message ?? '\u0041\u0049\u8ad6\u70b9\u30ab\u30fc\u30c9\u751f\u6210\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002');
    } finally {
      setIsGeneratingThesis(false);
    }
  }

  return (
    <AppLayout showSideRail>
      <div className="w-full space-y-5">
        <PageHeader
          title={data.symbol.display_name || data.symbol.symbol}
          backLink={{ href: '/', label: LABELS.backToHome }}
          description={
            <>
              {LABELS.code}: <code>{data.symbol.symbol_code || data.symbol.symbol}</code> | {LABELS.market}: <code>{data.symbol.market_code || '-'}</code> | {LABELS.processingStatus}:{' '}
              <code>{data.latest_processing_status}</code>
            </>
          }
          actions={<TextLink href={`/compare?symbolIds=${encodeURIComponent(data.symbol.symbol_code || data.symbol.symbol)}`}>{LABELS.compare}</TextLink>}
        />

        {data.chart && data.chart.widget_symbol ? (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{LABELS.chartTitle}</h2>
              <p className="mt-1 text-sm text-slate-600">{LABELS.chartDescription}</p>
            </div>
            <div className="h-[500px] w-full bg-white p-4">
              <div id={`tv_chart_${data.symbol.id}`} ref={tvContainerRef} className="h-full w-full" />
            </div>
          </section>
        ) : null}

        <DetailSection title={LABELS.snapshotTitle}>
          {data.current_snapshot ? (
            <InfoCard>
              <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  {LABELS.currentPrice}: <strong className="text-base text-slate-900">{formatNumber(data.current_snapshot.last_price, 3)}</strong>
                </div>
                <div>
                  {LABELS.dayChange} {formatNumber(data.current_snapshot.change, 3)} ({data.current_snapshot.change_percent === null ? '-' : `${formatNumber(data.current_snapshot.change_percent, 2)}%`})
                </div>
                <div>{LABELS.volume}: {formatNumber(data.current_snapshot.volume, 0)}</div>
                <div>
                  {LABELS.source}: <code>{data.current_snapshot.source_name}</code>
                </div>
              </div>
              <div className="mt-3 border-t border-slate-200 pt-3">
                <MetaText>
                  asOf: {formatDate(data.current_snapshot.as_of)} | {LABELS.marketStatus}: <code>{data.current_snapshot.market_status}</code>
                </MetaText>
              </div>
            </InfoCard>
          ) : (
            <EmptyText>{LABELS.snapshotUnavailable}</EmptyText>
          )}
        </DetailSection>

        <DetailSection title={LABELS.latestAlertsTitle}>
          {data.recent_alerts.length === 0 ? (
            <EmptyText>{LABELS.noAlerts}</EmptyText>
          ) : (
            <div className="grid gap-3">
              {data.recent_alerts.map((alert) => (
                <article key={alert.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="min-w-0">
                    <strong className="block text-slate-900">
                      <TextLink href={`/alerts/${alert.id}`}>{alert.alert_name}</TextLink>
                    </strong>
                    <div className="mt-2">
                      <MetaText>
                        {LABELS.datetime}: {formatDate(alert.triggered_at || alert.received_at)} | {LABELS.status}: <code>{alert.processing_status}</code>
                      </MetaText>
                    </div>
                  </div>
                  {alert.related_ai_summary && alert.related_ai_summary.key_points.length > 0 ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                      {alert.related_ai_summary.key_points.map((point, index) => (
                        <li key={`${alert.related_ai_summary?.id}-${index}`}>{point}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title={LABELS.latestAiTitle}>
          {isAiSummaryLoading ? (
            <InfoCard>
              <EmptyText>{LABELS.loadingAi}</EmptyText>
            </InfoCard>
          ) : availableSummary && hasSummaryContent ? (
            <InfoCard>
              {availableSummary.title ? <h3 className="text-base font-semibold text-slate-900">{availableSummary.title}</h3> : null}
              {thesisPoints.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                  {thesisPoints.map((point, index) => (
                    <li key={`thesis-${index}`}>{point}</li>
                  ))}
                </ul>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{availableSummary.body_markdown}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <MetaText>{LABELS.generatedAt}: {formatDate(availableSummary.generated_at)}</MetaText>
                <button type="button" onClick={() => handleGenerateThesis(true)} disabled={isGeneratingThesis} className={PRIMARY_BUTTON_CLASS}>
                  {isGeneratingThesis ? LABELS.generating : LABELS.regenerateAi}
                </button>
              </div>
            </InfoCard>
          ) : aiSummary?.status === 'unavailable' || aiSummaryError ? (
            <InfoCard>
              <EmptyText>{LABELS.unavailableAi}</EmptyText>
              <p className="mt-2 text-sm text-slate-500">{LABELS.emptyStateHint}</p>
              <div className="mt-4">
                <button type="button" onClick={() => handleGenerateThesis(false)} disabled={isGeneratingThesis} className={PRIMARY_BUTTON_CLASS}>
                  {isGeneratingThesis ? LABELS.generating : LABELS.generateAi}
                </button>
              </div>
            </InfoCard>
          ) : (
            <InfoCard>
              <EmptyText>{LABELS.emptyAi}</EmptyText>
              <p className="mt-2 text-sm text-slate-500">{LABELS.emptyStateHint}</p>
            </InfoCard>
          )}
          {availableSummary && hasSummaryContent && (aiSummaryInsufficientContext || hasNoReferences) ? (
            <p className="text-sm leading-6 text-slate-500">{hasNoReferences ? LABELS.noReferencesWarning : LABELS.limitedReferencesWarning}</p>
          ) : null}
          {generateThesisError ? <div className="text-sm text-rose-700">{generateThesisError}</div> : null}
        </DetailSection>

        <DetailSection
          title={LABELS.researchNoteTitle}
          actions={
            data.latest_active_note ? (
              <TextLink href={`/notes/${data.latest_active_note.id}`} className="rounded bg-sky-700 px-4 py-2 text-white no-underline hover:no-underline">
                {LABELS.openNote}
              </TextLink>
            ) : (
              <TextLink href={`/symbols/${symbolId}/note/new`} className="rounded bg-emerald-600 px-4 py-2 text-white no-underline hover:no-underline">
                {LABELS.createNote}
              </TextLink>
            )
          }
        >
          {data.latest_active_note ? (
            <InfoCard>
              <h3 className="text-base font-semibold text-slate-900">{data.latest_active_note.title}</h3>
              <div className="mb-3 mt-2">
                <MetaText>
                  {LABELS.lastUpdated}: {formatDate(data.latest_active_note.updatedAt)} | {LABELS.status}: <code>{data.latest_active_note.status}</code>
                </MetaText>
              </div>
              {data.latest_active_note.thesisText ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{data.latest_active_note.thesisText}</p>
              ) : null}
              {data.latest_active_note.nextReviewAt ? (
                <div className="mt-3 text-sm font-semibold text-rose-600">{LABELS.nextReview}: {formatDate(data.latest_active_note.nextReviewAt)}</div>
              ) : null}
            </InfoCard>
          ) : (
            <InfoCard>
              <EmptyText>{LABELS.noResearchNote}</EmptyText>
              <p className="mt-2 text-sm text-slate-500">{LABELS.emptyStateHint}</p>
            </InfoCard>
          )}
        </DetailSection>

        <DetailSection title={LABELS.referencesTitle}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {LABELS.breakdown}: news {referenceBreakdown.news} / disclosure {referenceBreakdown.disclosure} / earnings {referenceBreakdown.earnings}
            </p>
            {data.related_references.length === 0 ? (
              <InfoCard>
                <EmptyText>{LABELS.noReferences}</EmptyText>
                <p className="mt-2 text-sm text-slate-500">{LABELS.emptyStateHint}</p>
              </InfoCard>
            ) : (
              <div className="grid gap-3">
                {data.related_references.map((reference) => (
                  <article key={reference.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <MetaText>
                      [{reference.reference_type}] {formatDate(reference.published_at)}
                    </MetaText>
                    <div className="mt-2 text-sm font-medium text-slate-900">
                      {reference.source_url ? (
                        <a href={reference.source_url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">
                          {reference.title}
                        </a>
                      ) : (
                        <strong>{reference.title}</strong>
                      )}
                    </div>
                    {reference.summary_text ? <p className="mt-2 text-sm leading-6 text-slate-700">{reference.summary_text}</p> : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </DetailSection>
      </div>
    </AppLayout>
  );
}
