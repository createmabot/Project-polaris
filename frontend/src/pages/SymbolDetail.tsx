import { type ReactNode, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRoute } from 'wouter';
import { postApi, swrFetcher } from '../api/client';
import {
  StrategyListData,
  StrategyVersionListData,
  SymbolAiSummaryData,
  SymbolDetailData,
  SymbolStrategyApplicationCreateData,
  SymbolStrategyApplicationItem,
  SymbolStrategyApplicationListData,
} from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import TextLink from '../components/ui/TextLink';

const LABELS = {
  backToHome: 'ホームへ戻る',
  compare: '比較画面に進む',
  code: 'コード',
  market: '市場',
  processingStatus: '処理状態',
  chartTitle: 'TradingView chart',
  chartDescription: '共通サイドメニューと併用しながら、銘柄の現在状況とチャートを確認します。',
  snapshotTitle: '現在スナップショット',
  latestAlertsTitle: '最新アラート',
  latestAiTitle: '最新AI論点カード',
  strategyResultsTitle: 'ストラテジー / 検証結果',
  strategyResultsIntro: 'この銘柄に適用したストラテジーと検証結果をここに集約します。',
  strategyResultsPending:
    '保存済み application から CSV取込 / 内部バックテストへ進む接続は後続タスクです。',
  savedApplicationsTitle: '保存済みストラテジー適用',
  savedApplicationsLoading: '保存済み application を読み込み中...',
  savedApplicationsError: '保存済み application を取得できませんでした。',
  noSavedApplications: '保存済み application はまだありません。',
  latestRun: '最新run',
  latestBacktestReport: '最新検証レポート',
  noLatestRun: '最新run はまだありません。',
  noLatestBacktestReport: '最新検証レポートはまだありません。',
  runCount: 'run count',
  chooseExistingStrategy: '既存ストラテジーを選ぶ',
  applySelectionNotice:
    '保存すると、この銘柄のストラテジー適用として記録されます。',
  chooseApplyCandidate: '適用候補を選択',
  selectedStrategy: '選択中のストラテジー',
  selectedVersion: '選択中の version',
  unsaved: '未保存',
  applyNotSaved: '選択中の内容は保存するまで未保存です。',
  saveApply: '適用を保存',
  saveApplySuccess: '保存しました。',
  saveApplyDescription: '保存後に、保存済みストラテジー適用一覧へ反映します。',
  strategyList: 'ストラテジー一覧',
  versionList: 'version 一覧',
  openStrategyDetail: 'StrategyDetail を開く',
  openStrategyVersionDetail: 'StrategyVersionDetail を開く',
  clearSelection: '選択解除',
  saveApplyPending: '適用を保存（準備中）',
  csvImportLater: 'CSV取込（後続）',
  internalBacktestLater: '内部バックテスト（後続）',
  openStrategyLab: 'ストラテジー作成を開く',
  openBacktestList: '検証レポート一覧を開く',
  researchNoteTitle: 'Research Note',
  referencesTitle: '関連参照情報',
  currentPrice: '現在値',
  dayChange: '前日比',
  volume: '出来高',
  source: 'ソース',
  marketStatus: '市場状態',
  snapshotUnavailable: 'スナップショットを取得できませんでした。',
  noAlerts: 'この銘柄のアラートはまだありません。',
  datetime: '日時',
  status: '状態',
  loadingAi: 'AI論点カードを読み込み中...',
  unavailableAi: 'AI論点カードは未生成です。',
  emptyAi: 'AI論点カードは空です。',
  generateAi: 'AI論点カード生成',
  regenerateAi: 'AI論点カードを再生成',
  generating: '生成中...',
  generatedAt: '生成日時',
  noReferencesWarning: '参照情報は0件です。スナップショットやノート中心の要約になっている可能性があります。',
  limitedReferencesWarning: '参照情報が不足しているため、論点の精度には限界がある可能性があります。',
  openNote: 'ノートを開く',
  createNote: 'ノートを新規作成',
  lastUpdated: '最終更新',
  nextReview: '次回確認日',
  noResearchNote: 'アクティブな research note はありません。',
  breakdown: '内訳',
  noReferences: '関連参照情報はありません。',
  emptyStateHint: 'データ未取得の場合は、seed 再投入後にページを再読み込みしてください。',
  notFoundTitle: '銘柄が見つかりません',
  notFoundBody: '指定された銘柄IDは存在しないか、削除されています。',
  loadSymbol: '銘柄情報を読み込み中...',
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

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function SavedApplicationRow({ application }: { application: SymbolStrategyApplicationItem }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{application.strategy.title}</h4>
          <MetaText>
            application_id: {application.id} / status: {application.status} / source: {application.source}
          </MetaText>
          <MetaText>
            version_id: {application.strategy_version.id} / {application.strategy_version.market} / {application.strategy_version.timeframe} / {application.strategy_version.status}
          </MetaText>
          {application.memo ? <p className="mt-2 text-sm text-slate-600">{application.memo}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <TextLink href={`/strategies/${application.strategy.id}`}>{LABELS.openStrategyDetail}</TextLink>
          <TextLink href={`/strategy-versions/${application.strategy_version.id}`}>{LABELS.openStrategyVersionDetail}</TextLink>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.latestRun}</h5>
          {application.latest_run ? (
            <MetaText>
              {application.latest_run.run_type} / {application.latest_run.status} / {formatDate(application.latest_run.updated_at)}
            </MetaText>
          ) : (
            <EmptyText>{LABELS.noLatestRun}</EmptyText>
          )}
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.latestBacktestReport}</h5>
          {application.latest_backtest_report ? (
            <div>
              <p className="text-sm font-medium text-slate-800">{application.latest_backtest_report.title}</p>
              <MetaText>
                {application.latest_backtest_report.execution_source} / {application.latest_backtest_report.status} / {formatDate(application.latest_backtest_report.updated_at)}
              </MetaText>
              <TextLink href={`/backtests/${application.latest_backtest_report.id}`}>BacktestDetail</TextLink>
            </div>
          ) : (
            <EmptyText>{LABELS.noLatestBacktestReport}</EmptyText>
          )}
        </div>
      </div>
      <MetaText>{LABELS.runCount}: {application.run_count}</MetaText>
    </div>
  );
}

function SavedStrategyApplicationsPanel({
  applications,
  isLoading,
  error,
}: {
  applications: SymbolStrategyApplicationItem[];
  isLoading: boolean;
  error: unknown;
}) {
  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">{LABELS.savedApplicationsTitle}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{LABELS.strategyResultsPending}</p>
      {isLoading ? (
        <EmptyText>{LABELS.savedApplicationsLoading}</EmptyText>
      ) : error ? (
        <p className="mt-3 text-sm text-rose-700">{LABELS.savedApplicationsError}</p>
      ) : applications.length === 0 ? (
        <EmptyText>{LABELS.noSavedApplications}</EmptyText>
      ) : (
        <div className="mt-3 grid gap-3">
          {applications.map((application) => (
            <SavedApplicationRow key={application.id} application={application} />
          ))}
        </div>
      )}
    </div>
  );
}

function StrategyApplySelectionPanel({
  symbolId,
  mutateApplications,
}: {
  symbolId: string;
  mutateApplications: () => Promise<SymbolStrategyApplicationListData | undefined>;
}) {
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isSavingApplication, setIsSavingApplication] = useState(false);
  const [saveApplicationError, setSaveApplicationError] = useState<string | null>(null);
  const [saveApplicationMessage, setSaveApplicationMessage] = useState<string | null>(null);
  const {
    data: strategyListData,
    error: strategyListError,
    isLoading: isStrategyListLoading,
  } = useSWR<StrategyListData>(
    '/api/strategies?page=1&limit=20&sort=updated_at&order=desc&status=active',
    swrFetcher,
  );

  const strategies = strategyListData?.strategies ?? [];
  const selectedStrategy = selectedStrategyId
    ? strategies.find((strategy) => strategy.id === selectedStrategyId) ?? null
    : null;

  const {
    data: versionListData,
    error: versionListError,
    isLoading: isVersionListLoading,
  } = useSWR<StrategyVersionListData>(
    selectedStrategy
      ? `/api/strategies/${selectedStrategy.id}/versions?page=1&limit=20&sort=updated_at&order=desc`
      : null,
    swrFetcher,
  );

  const versions = versionListData?.strategy_versions ?? [];
  const selectedVersion = selectedVersionId
    ? versions.find((version) => version.id === selectedVersionId) ?? null
    : null;

  const chooseStrategy = (strategyId: string) => {
    setSelectedStrategyId(strategyId);
    setSelectedVersionId(null);
    setSaveApplicationError(null);
    setSaveApplicationMessage(null);
  };

  const chooseVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    setSaveApplicationError(null);
    setSaveApplicationMessage(null);
  };

  const clearSelection = () => {
    setSelectedStrategyId(null);
    setSelectedVersionId(null);
    setSaveApplicationError(null);
  };

  const saveApplication = async () => {
    if (!selectedStrategy || !selectedVersion) {
      return;
    }
    setIsSavingApplication(true);
    setSaveApplicationError(null);
    setSaveApplicationMessage(null);
    try {
      await postApi<SymbolStrategyApplicationCreateData>(`/api/symbols/${symbolId}/strategy-applications`, {
        strategy_id: selectedStrategy.id,
        strategy_version_id: selectedVersion.id,
      });
      await mutateApplications();
      setSaveApplicationMessage(LABELS.saveApplySuccess);
      setSelectedStrategyId(null);
      setSelectedVersionId(null);
    } catch (error) {
      setSaveApplicationError(getErrorMessage(error, 'application を保存できませんでした。'));
    } finally {
      setIsSavingApplication(false);
    }
  };

  return (
    <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{LABELS.chooseExistingStrategy}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{LABELS.applySelectionNotice}</p>
      </div>

      <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{LABELS.unsaved}</span>
        <p className="mt-2 text-sm leading-6 text-amber-900">{LABELS.applyNotSaved}</p>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-900">{LABELS.chooseApplyCandidate}</h4>
        {isStrategyListLoading ? (
          <EmptyText>strategy 候補を読み込み中...</EmptyText>
        ) : strategyListError ? (
          <p className="text-sm text-rose-700">strategy 候補を取得できませんでした。</p>
        ) : strategies.length === 0 ? (
          <EmptyText>active strategy はまだありません。</EmptyText>
        ) : (
          <div className="mt-3 grid gap-2">
            {strategies.map((strategy) => {
              const isSelected = selectedStrategy?.id === strategy.id;
              return (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => chooseStrategy(strategy.id)}
                  className={
                    isSelected
                      ? 'rounded-lg border border-sky-300 bg-sky-50 p-3 text-left'
                      : 'rounded-lg border border-slate-200 bg-slate-50 p-3 text-left'
                  }
                >
                  <span className="block text-sm font-semibold text-slate-900">{strategy.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    strategy_id: {strategy.id} / status: {strategy.status} / versions: {strategy.version_count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedStrategy ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">{LABELS.selectedStrategy}</h4>
              <p className="mt-1 text-sm text-slate-700">{selectedStrategy.title}</p>
              <MetaText>
                strategy_id: {selectedStrategy.id} / status: {selectedStrategy.status}
              </MetaText>
            </div>
            <div className="flex flex-wrap gap-2">
              <TextLink href={`/strategies/${selectedStrategy.id}`}>{LABELS.openStrategyDetail}</TextLink>
              <button type="button" onClick={clearSelection} className="text-sm text-slate-600 underline">
                {LABELS.clearSelection}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedStrategy ? (
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{LABELS.versionList}</h4>
          {isVersionListLoading ? (
            <EmptyText>version 候補を読み込み中...</EmptyText>
          ) : versionListError ? (
            <p className="text-sm text-rose-700">version 候補を取得できませんでした。</p>
          ) : versions.length === 0 ? (
            <EmptyText>この strategy には version がありません。</EmptyText>
          ) : (
            <div className="mt-3 grid gap-2">
              {versions.map((version) => {
                const isSelected = selectedVersion?.id === version.id;
                return (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => chooseVersion(version.id)}
                    className={
                      isSelected
                        ? 'rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-left'
                        : 'rounded-lg border border-slate-200 bg-white p-3 text-left'
                    }
                  >
                    <span className="block text-sm font-semibold text-slate-900">{version.id}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {version.market} / {version.timeframe} / {version.status}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {selectedStrategy && selectedVersion ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h4 className="text-sm font-semibold text-emerald-950">{LABELS.selectedVersion}</h4>
          <p className="mt-1 text-sm text-emerald-900">
            version_id: {selectedVersion.id} / {selectedVersion.market} / {selectedVersion.timeframe} / {selectedVersion.status}
          </p>
          <p className="mt-2 text-sm text-emerald-900">{LABELS.saveApplyDescription}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <TextLink href={`/strategy-versions/${selectedVersion.id}`}>{LABELS.openStrategyVersionDetail}</TextLink>
            <TextLink href={`/strategies/${selectedStrategy.id}/versions`}>{LABELS.versionList}</TextLink>
          </div>
        </div>
      ) : null}

      {saveApplicationMessage ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{saveApplicationMessage}</p>
      ) : null}
      {saveApplicationError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{saveApplicationError}</p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          disabled={!selectedStrategy || !selectedVersion || isSavingApplication}
          onClick={saveApplication}
          className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          {isSavingApplication ? '保存中...' : LABELS.saveApply}
        </button>
        <button type="button" disabled className="rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-500">
          {LABELS.csvImportLater}
        </button>
        <button type="button" disabled className="rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-500">
          {LABELS.internalBacktestLater}
        </button>
      </div>
    </div>
  );
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
  const {
    data: applicationListData,
    error: applicationListError,
    isLoading: isApplicationListLoading,
    mutate: mutateApplicationList,
  } = useSWR<SymbolStrategyApplicationListData>(
    symbolId
      ? `/api/symbols/${symbolId}/strategy-applications?status=active&page=1&limit=20&sort=updated_at&order=desc`
      : null,
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
        <div className="w-full rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">エラー: {error.message}</div>
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
      setGenerateThesisError(err?.message ?? 'AI論点カード生成に失敗しました。');
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
          title={LABELS.strategyResultsTitle}
          actions={
            <>
              <TextLink href="/strategy-lab" className="rounded bg-sky-700 px-4 py-2 text-white no-underline hover:no-underline">
                {LABELS.openStrategyLab}
              </TextLink>
              <TextLink href="/backtests" className="rounded border border-slate-300 bg-white px-4 py-2 text-slate-700 no-underline hover:no-underline">
                {LABELS.openBacktestList}
              </TextLink>
            </>
          }
        >
          <InfoCard>
            <p className="text-sm leading-6 text-slate-700">{LABELS.strategyResultsIntro}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{LABELS.strategyResultsPending}</p>
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-4">
              <MetaText>今後ここに表示する予定の要素</MetaText>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                <li>この銘柄に適用済みのストラテジー一覧</li>
                <li>最新の検証結果と検証レポート詳細への導線</li>
                <li>CSV取込、内部バックテスト、銘柄別比較の入口</li>
              </ul>
            </div>
            <SavedStrategyApplicationsPanel
              applications={applicationListData?.applications ?? []}
              isLoading={isApplicationListLoading}
              error={applicationListError}
            />
            {symbolId ? (
              <StrategyApplySelectionPanel
                symbolId={symbolId}
                mutateApplications={mutateApplicationList}
              />
            ) : null}
          </InfoCard>
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
