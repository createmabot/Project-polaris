import { type ReactNode, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRoute } from 'wouter';
import { patchApi, postApi, swrFetcher } from '../api/client';
import {
  StrategyListData,
  StrategyVersionListData,
  SymbolAiSummaryData,
  SymbolDetailData,
  InternalBacktestExecutionResultData,
  InternalBacktestExecutionStatusData,
  SymbolStrategyApplicationCreateData,
  SymbolStrategyApplicationCsvImportData,
  SymbolStrategyApplicationItem,
  SymbolStrategyApplicationInternalBacktestData,
  SymbolStrategyApplicationInternalBacktestReportData,
  SymbolStrategyApplicationListData,
  SymbolStrategyApplicationMutateData,
} from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import SectionCard from '../components/ui/SectionCard';
import StatusBadge from '../components/ui/StatusBadge';
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
    '保存済み application から CSV取込へ進めます。内部バックテスト接続は後続タスクです。',
  savedApplicationsTitle: '保存済みストラテジー適用',
  savedApplicationsLoading: '保存済み application を読み込み中...',
  savedApplicationsError: '保存済み application を取得できませんでした。',
  noSavedApplications: '保存済み application はまだありません。',
  savedApplicationsStatusFilter: 'status',
  savedApplicationsStatusActive: 'active',
  savedApplicationsStatusArchived: 'archived',
  savedApplicationsStatusAll: 'all',
  savedApplicationsFilter: '表示対象',
  savedApplicationsFilterAll: 'すべて',
  savedApplicationsFilterWithReports: 'reportあり',
  savedApplicationsFilterWithoutReports: 'reportなし',
  savedApplicationsSourceFilter: 'source',
  savedApplicationsSourceAll: 'すべて',
  savedApplicationsSourceCsv: 'CSV',
  savedApplicationsSourceInternal: 'internal',
  savedApplicationsRunTypeFilter: 'latest run type',
  savedApplicationsRunStatusFilter: 'latest run status',
  savedApplicationsRunAll: 'すべて',
  savedApplicationsRunRunning: 'running',
  savedApplicationsRunSucceeded: 'succeeded',
  savedApplicationsRunFailed: 'failed',
  savedApplicationsSummary: '{status} application {shown} / {total} 件を表示中',
  savedApplicationsReportSummary: 'CSV report: {csv} / internal report: {internal}',
  noFilteredApplications: '条件に一致する application はありません。',
  latestRun: '最新run',
  latestBacktestReport: '最新検証レポート',
  reportPair: 'CSV / internal reports',
  csvImportReport: 'CSV import report',
  internalBacktestReport: 'internal backtest report',
  noLatestRun: '最新run はまだありません。',
  noLatestBacktestReport: '最新検証レポートはまだありません。',
  runCount: 'run count',
  csvImport: 'CSV取込',
  csvImportTitle: 'TradingView CSVを取り込む',
  csvFileName: 'ファイル名',
  csvText: 'CSVテキスト',
  runCsvImport: 'CSV取込を実行',
  csvImporting: 'CSV取込中...',
  csvImportSuccess: 'CSV取込が完了しました。',
  csvImportRefreshFailed: 'CSV取込が完了しました。一覧の再読み込みに失敗したため、ページを再読み込みしてください。',
  csvImportParseFailed: '解析失敗',
  csvImportError: 'CSV取込に失敗しました。',
  openBacktestDetail: '検証レポートを開く',
  internalBacktest: '内部バックテスト',
  internalBacktestDescription: '保存済み application 起点で internal backtest execution を作成します。succeeded execution は Backtest report 化できます。',
  internalBacktestFrom: '開始日',
  internalBacktestTo: '終了日',
  internalBacktestMode: 'summary_mode',
  runInternalBacktest: '内部バックテストを開始',
  internalBacktestStarting: '内部バックテスト開始中...',
  internalBacktestSuccess: '内部バックテストを開始しました。',
  internalBacktestRefreshFailed: '内部バックテストを開始しました。一覧の再読み込みに失敗したため、ページを再読み込みしてください。',
  internalBacktestError: '内部バックテストを開始できませんでした。',
  internalBacktestResultPending: '実行結果の詳細表示は後続タスクです。',
  internalBacktestResultTitle: '内部バックテスト結果',
  internalBacktestResultLoading: '内部バックテスト status を読み込み中...',
  internalBacktestResultStatusError: '内部バックテスト status を取得できませんでした。',
  internalBacktestResultResultLoading: '内部バックテスト result を読み込み中...',
  internalBacktestResultResultError: '内部バックテスト result を取得できませんでした。',
  internalBacktestResultNotReady: '実行結果はまだ準備中です。',
  internalBacktestResultReady: '実行結果 summary を表示しています。',
  internalBacktestResultUnavailable: '実行結果 summary はまだ利用できません。',
  internalBacktestResultFailed: '内部バックテストは failed です。',
  internalBacktestResultCanceled: '内部バックテストは canceled です。',
  internalBacktestResultStatus: 'execution status',
  createBacktestReport: 'Backtest report を作成',
  creatingBacktestReport: 'Backtest report 作成中...',
  backtestReportCreated: 'Backtest report を作成しました。',
  backtestReportRefreshFailed: 'Backtest report を作成しました。一覧の再読み込みに失敗したため、ページを再読み込みしてください。',
  backtestReportError: 'Backtest report を作成できませんでした。',
  backtestReportAlreadyCreated: 'Backtest report は作成済みです。',
  resultSummaryKind: 'summary_kind',
  resultPeriod: 'period',
  resultBarCount: 'bar_count',
  resultPriceChangePercent: 'price_change_percent',
  resultRangePercent: 'range_percent',
  resultFinishedAt: 'finished_at',
  archiveApplication: 'アーカイブ',
  archiveApplicationConfirm: 'この application をアーカイブしますか？',
  archiveApplicationSuccess: 'アーカイブしました。',
  archiveApplicationRefreshFailed: 'アーカイブしました。一覧の再読み込みに失敗したため、ページを再読み込みしてください。',
  archiveApplicationError: 'アーカイブに失敗しました。',
  restoreApplication: '復元',
  restoreApplicationConfirm: 'この application を復元しますか？',
  restoreApplicationSuccess: '復元しました。',
  restoreApplicationRefreshFailed: '復元しました。一覧の再読み込みに失敗したため、ページを再読み込みしてください。',
  restoreApplicationError: '復元に失敗しました。',
  executionId: 'execution_id',
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
  saveApplyRefreshFailed: '保存しました。一覧の再読み込みに失敗したため、ページを再読み込みしてください。',
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

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function reportOriginLabel(executionSource: string | null | undefined): string {
  if (executionSource === 'internal_backtest') return 'internal backtest report';
  if (executionSource === 'tradingview' || executionSource === 'csv_import') return 'CSV import report';
  return 'report';
}

function hasCsvReport(application: SymbolStrategyApplicationItem): boolean {
  return Boolean(application.latest_reports_by_source?.csv_import);
}

function hasInternalReport(application: SymbolStrategyApplicationItem): boolean {
  return Boolean(application.latest_reports_by_source?.internal_backtest);
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
    <SectionCard title={title} actions={actions}>
      {children}
    </SectionCard>
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

type CsvImportMessage = {
  type: 'success' | 'warning';
  text: string;
};

type ApplicationStatusFilter = 'active' | 'archived' | 'all';
type ApplicationReportFilter = 'all' | 'with_reports' | 'without_reports';
type ApplicationReportSourceFilter = 'all' | 'csv_import' | 'internal_backtest';
type ApplicationRunTypeFilter = 'all' | 'csv_import' | 'internal_backtest';
type ApplicationRunStatusFilter = 'all' | 'running' | 'succeeded' | 'failed';

function getApplicationStatusLabel(filter: ApplicationStatusFilter): string {
  if (filter === 'archived') return LABELS.savedApplicationsStatusArchived;
  if (filter === 'all') return LABELS.savedApplicationsStatusAll;
  return LABELS.savedApplicationsStatusActive;
}

function getApplicationReportPresenceQuery(filter: ApplicationReportFilter): string {
  if (filter === 'with_reports') return '&report_presence=with_reports';
  if (filter === 'without_reports') return '&report_presence=without_reports';
  return '';
}

function getApplicationReportSourceQuery(filter: ApplicationReportSourceFilter): string {
  if (filter === 'csv_import') return '&report_source=csv_import';
  if (filter === 'internal_backtest') return '&report_source=internal_backtest';
  return '';
}

function getApplicationRunTypeQuery(filter: ApplicationRunTypeFilter): string {
  if (filter === 'csv_import') return '&run_type=csv_import';
  if (filter === 'internal_backtest') return '&run_type=internal_backtest';
  return '';
}

function getApplicationRunStatusQuery(filter: ApplicationRunStatusFilter): string {
  if (filter === 'running') return '&run_status=running';
  if (filter === 'succeeded') return '&run_status=succeeded';
  if (filter === 'failed') return '&run_status=failed';
  return '';
}

function InternalBacktestResultPanel({
  applicationId,
  executionId,
  existingBacktestId,
  mutateApplications,
}: {
  applicationId: string;
  executionId: string;
  existingBacktestId: string | null;
  mutateApplications: () => Promise<SymbolStrategyApplicationListData | undefined>;
}) {
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [createdBacktestId, setCreatedBacktestId] = useState<string | null>(null);
  const {
    data: executionStatusData,
    error: executionStatusError,
    isLoading: isExecutionStatusLoading,
  } = useSWR<InternalBacktestExecutionStatusData>(
    `/api/internal-backtests/executions/${executionId}`,
    swrFetcher,
    {
      refreshInterval: (currentData) => {
        const status = currentData?.execution?.status;
        return status === 'queued' || status === 'running' ? 3000 : 0;
      },
    },
  );
  const executionStatus = executionStatusData?.execution?.status ?? null;
  const resultApiPath =
    executionStatus === 'succeeded'
      ? `/api/internal-backtests/executions/${executionId}/result`
      : null;
  const {
    data: executionResultData,
    error: executionResultError,
    isLoading: isExecutionResultLoading,
  } = useSWR<InternalBacktestExecutionResultData>(resultApiPath, swrFetcher);

  const metrics = executionResultData?.result_summary?.metrics ?? null;
  const period = executionResultData?.result_summary?.period ?? null;
  const backtestLink = existingBacktestId ?? createdBacktestId;
  const statusTone =
    executionStatus === 'failed' || executionStatus === 'canceled'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : executionStatus === 'succeeded'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-sky-200 bg-sky-50 text-sky-800';

  const createBacktestReport = async () => {
    if (executionStatus !== 'succeeded' || backtestLink) {
      return;
    }
    setIsCreatingReport(true);
    setReportMessage(null);
    setReportError(null);
    try {
      const result = await postApi<SymbolStrategyApplicationInternalBacktestReportData>(
        `/api/symbol-strategy-applications/${applicationId}/internal-backtests/${executionId}/report`,
        {},
      );
      setCreatedBacktestId(result.backtest.id);
      setReportMessage(LABELS.backtestReportCreated);
      try {
        await mutateApplications();
      } catch {
        setReportMessage(LABELS.backtestReportRefreshFailed);
      }
    } catch (error) {
      setReportError(getErrorMessage(error, LABELS.backtestReportError));
    } finally {
      setIsCreatingReport(false);
    }
  };

  return (
    <div className={`mt-3 rounded-lg border p-3 text-sm ${statusTone}`}>
      <h6 className="font-semibold">{LABELS.internalBacktestResultTitle}</h6>
      <div className="mt-1 text-xs leading-5">
        {LABELS.executionId}: {executionId}
      </div>
      {isExecutionStatusLoading ? (
        <p className="mt-2">{LABELS.internalBacktestResultLoading}</p>
      ) : executionStatusError ? (
        <p className="mt-2">{LABELS.internalBacktestResultStatusError}</p>
      ) : (
        <>
          <div className="mt-2 text-xs leading-5">
            {LABELS.internalBacktestResultStatus}: {executionStatus ?? '-'}
          </div>
          {executionStatus === 'queued' || executionStatus === 'running' ? (
            <p className="mt-2">{LABELS.internalBacktestResultNotReady}</p>
          ) : null}
          {executionStatus === 'failed' ? (
            <p className="mt-2">
              {LABELS.internalBacktestResultFailed}
              {executionStatusData?.execution?.error_message
                ? ` ${executionStatusData.execution.error_message}`
                : ''}
            </p>
          ) : null}
          {executionStatus === 'canceled' ? (
            <p className="mt-2">{LABELS.internalBacktestResultCanceled}</p>
          ) : null}
          {executionStatus === 'succeeded' ? (
            <div className="mt-2">
              {isExecutionResultLoading ? (
                <p>{LABELS.internalBacktestResultResultLoading}</p>
              ) : executionResultError ? (
                <p>{LABELS.internalBacktestResultResultError}</p>
              ) : metrics ? (
                <div>
                  <p>{LABELS.internalBacktestResultReady}</p>
                  <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold">{LABELS.resultSummaryKind}</dt>
                      <dd>{executionResultData?.result_summary?.summary_kind ?? '-'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">{LABELS.resultPeriod}</dt>
                      <dd>{period ? `${period.from} - ${period.to}` : '-'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">{LABELS.resultBarCount}</dt>
                      <dd>{formatNumber(metrics.bar_count, 0)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">{LABELS.resultPriceChangePercent}</dt>
                      <dd>{formatNumber(metrics.price_change_percent, 2)}%</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">{LABELS.resultRangePercent}</dt>
                      <dd>{formatNumber(metrics.range_percent, 2)}%</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">{LABELS.resultFinishedAt}</dt>
                      <dd>{formatDate(executionResultData?.finished_at ?? null)}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <p>{LABELS.internalBacktestResultUnavailable}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {backtestLink ? (
                  <>
                    <span className="text-xs font-medium">{LABELS.backtestReportAlreadyCreated}</span>
                    <TextLink href={`/backtests/${backtestLink}`}>{LABELS.openBacktestDetail}</TextLink>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={createBacktestReport}
                    disabled={isCreatingReport}
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    {isCreatingReport ? LABELS.creatingBacktestReport : LABELS.createBacktestReport}
                  </button>
                )}
              </div>
              {reportMessage ? (
                <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{reportMessage}</p>
              ) : null}
              {reportError ? (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{reportError}</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ApplicationSummaryHeader({
  application,
  isMutatingApplicationStatus,
  onApplicationStatusAction,
}: {
  application: SymbolStrategyApplicationItem;
  isMutatingApplicationStatus: boolean;
  onApplicationStatusAction: (nextAction: 'archive' | 'restore') => void;
}) {
  const nextStatusAction = application.status === 'archived' ? 'restore' : 'archive';
  const nextStatusLabel = nextStatusAction === 'restore' ? LABELS.restoreApplication : LABELS.archiveApplication;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-slate-900">{application.strategy.title}</h4>
        <KeyValueList className="mt-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
          <KeyValueRow label="application_id"><code>{application.id}</code></KeyValueRow>
          <KeyValueRow label="status"><StatusBadge status={application.status} className="px-2 py-0.5" /></KeyValueRow>
          <KeyValueRow label="source"><code>{application.source}</code></KeyValueRow>
          <KeyValueRow label={LABELS.runCount}>{application.run_count}</KeyValueRow>
          <KeyValueRow label="version_id"><code>{application.strategy_version.id}</code></KeyValueRow>
          <KeyValueRow label="version">
            {application.strategy_version.market} / {application.strategy_version.timeframe} / <StatusBadge status={application.strategy_version.status} className="px-2 py-0.5" />
          </KeyValueRow>
        </KeyValueList>
        {application.memo ? <p className="mt-2 text-sm text-slate-600">{application.memo}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <TextLink href={`/strategies/${application.strategy.id}`}>{LABELS.openStrategyDetail}</TextLink>
        <TextLink href={`/strategy-versions/${application.strategy_version.id}`}>{LABELS.openStrategyVersionDetail}</TextLink>
        <Button
          onClick={() => onApplicationStatusAction(nextStatusAction)}
          disabled={isMutatingApplicationStatus}
        >
          {nextStatusLabel}
        </Button>
      </div>
    </div>
  );
}

function ApplicationLatestRunCard({
  application,
  mutateApplications,
}: {
  application: SymbolStrategyApplicationItem;
  mutateApplications: () => Promise<SymbolStrategyApplicationListData | undefined>;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.latestRun}</h5>
      {application.latest_run ? (
        <div>
          <KeyValueList className="mt-2 gap-1 text-xs text-slate-500">
            <KeyValueRow label="run type"><code>{application.latest_run.run_type}</code></KeyValueRow>
            <KeyValueRow label="run status"><StatusBadge status={application.latest_run.status} className="px-2 py-0.5" /></KeyValueRow>
            <KeyValueRow label="updated">{formatDate(application.latest_run.updated_at)}</KeyValueRow>
            {application.latest_run.backtest_id ? (
              <KeyValueRow label="backtest_id"><code>{application.latest_run.backtest_id}</code></KeyValueRow>
            ) : null}
          </KeyValueList>
          {application.latest_run.internal_backtest_execution_id ? (
            <>
              <MetaText>{LABELS.executionId}: {application.latest_run.internal_backtest_execution_id}</MetaText>
              <InternalBacktestResultPanel
                key={application.latest_run.internal_backtest_execution_id}
                applicationId={application.id}
                executionId={application.latest_run.internal_backtest_execution_id}
                existingBacktestId={application.latest_run.backtest_id}
                mutateApplications={mutateApplications}
              />
            </>
          ) : null}
        </div>
      ) : (
        <EmptyText>{LABELS.noLatestRun}</EmptyText>
      )}
    </div>
  );
}

function ApplicationLatestReportCard({ application }: { application: SymbolStrategyApplicationItem }) {
  const reportPair = application.latest_reports_by_source;
  const reportPairItems = [
    { key: 'csv_import', label: LABELS.csvImportReport, report: reportPair?.csv_import ?? null },
    { key: 'internal_backtest', label: LABELS.internalBacktestReport, report: reportPair?.internal_backtest ?? null },
  ];
  const hasReportPair = reportPairItems.some((item) => item.report);

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.latestBacktestReport}</h5>
      {application.latest_backtest_report ? (
        <div>
          <p className="text-sm font-medium text-slate-800">{application.latest_backtest_report.title}</p>
          <KeyValueList className="mt-2 gap-1 text-xs text-slate-500">
            <KeyValueRow label="report type">{reportOriginLabel(application.latest_backtest_report.execution_source)}</KeyValueRow>
            <KeyValueRow label="source"><code>{application.latest_backtest_report.execution_source}</code></KeyValueRow>
            <KeyValueRow label="status"><StatusBadge status={application.latest_backtest_report.status} className="px-2 py-0.5" /></KeyValueRow>
            <KeyValueRow label="market / timeframe">
              {application.latest_backtest_report.market} / {application.latest_backtest_report.timeframe}
            </KeyValueRow>
            <KeyValueRow label="updated">{formatDate(application.latest_backtest_report.updated_at)}</KeyValueRow>
          </KeyValueList>
          <TextLink href={`/backtests/${application.latest_backtest_report.id}`}>{LABELS.openBacktestDetail}</TextLink>
        </div>
      ) : (
        <EmptyText>{LABELS.noLatestBacktestReport}</EmptyText>
      )}
      {hasReportPair ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.reportPair}</h6>
          <div className="mt-2 grid gap-2">
            {reportPairItems.map((item) => (
              item.report ? (
                <div key={item.key} className="rounded-md border border-slate-200 bg-white p-2">
                  <KeyValueList className="gap-1 text-xs text-slate-500">
                    <KeyValueRow label="report type">{item.label}</KeyValueRow>
                    <KeyValueRow label="source"><code>{item.report.execution_source}</code></KeyValueRow>
                    <KeyValueRow label="status"><StatusBadge status={item.report.status} className="px-2 py-0.5" /></KeyValueRow>
                    <KeyValueRow label="run status"><StatusBadge status={item.report.run_status} className="px-2 py-0.5" /></KeyValueRow>
                    <KeyValueRow label="updated">{formatDate(item.report.updated_at)}</KeyValueRow>
                  </KeyValueList>
                  <TextLink href={`/backtests/${item.report.backtest_id}`}>{item.report.title}</TextLink>
                </div>
              ) : null
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SavedApplicationRow({
  application,
  mutateApplications,
}: {
  application: SymbolStrategyApplicationItem;
  mutateApplications: () => Promise<SymbolStrategyApplicationListData | undefined>;
}) {
  const [fileName, setFileName] = useState('tradingview.csv');
  const [csvText, setCsvText] = useState('');
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvImportMessage, setCsvImportMessage] = useState<CsvImportMessage | null>(null);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const [csvBacktestLink, setCsvBacktestLink] = useState<string | null>(null);
  const [internalBacktestFrom, setInternalBacktestFrom] = useState('2025-01-01');
  const [internalBacktestTo, setInternalBacktestTo] = useState('2026-01-01');
  const [isStartingInternalBacktest, setIsStartingInternalBacktest] = useState(false);
  const [internalBacktestMessage, setInternalBacktestMessage] = useState<string | null>(null);
  const [internalBacktestError, setInternalBacktestError] = useState<string | null>(null);
  const [internalExecutionId, setInternalExecutionId] = useState<string | null>(null);
  const [isMutatingApplicationStatus, setIsMutatingApplicationStatus] = useState(false);
  const [applicationStatusMessage, setApplicationStatusMessage] = useState<string | null>(null);
  const [applicationStatusError, setApplicationStatusError] = useState<string | null>(null);

  const importCsv = async () => {
    const normalizedFileName = fileName.trim();
    const normalizedCsvText = csvText.trim();
    if (!normalizedFileName || !normalizedCsvText) {
      return;
    }
    setIsImportingCsv(true);
    setCsvImportMessage(null);
    setCsvImportError(null);
    setCsvBacktestLink(null);
    try {
      const result = await postApi<SymbolStrategyApplicationCsvImportData>(
        `/api/symbol-strategy-applications/${application.id}/csv-import`,
        {
          file_name: normalizedFileName,
          content_type: 'text/csv',
          csv_text: csvText,
        },
      );
      setCsvBacktestLink(result.backtest.id);
      if (result.import.parse_status === 'failed') {
        setCsvImportMessage({
          type: 'warning',
          text: `${LABELS.csvImportParseFailed}: ${result.import.parse_error ?? '-'}`,
        });
      } else {
        setCsvImportMessage({ type: 'success', text: LABELS.csvImportSuccess });
      }
      setCsvText('');
      try {
        await mutateApplications();
      } catch {
        setCsvImportMessage({ type: 'warning', text: LABELS.csvImportRefreshFailed });
      }
    } catch (error) {
      setCsvImportError(getErrorMessage(error, LABELS.csvImportError));
    } finally {
      setIsImportingCsv(false);
    }
  };

  const mutateApplicationStatus = async (nextAction: 'archive' | 'restore') => {
    const confirmMessage = nextAction === 'archive'
      ? LABELS.archiveApplicationConfirm
      : LABELS.restoreApplicationConfirm;
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
      return;
    }
    setIsMutatingApplicationStatus(true);
    setApplicationStatusMessage(null);
    setApplicationStatusError(null);
    try {
      await patchApi<SymbolStrategyApplicationMutateData>(
        `/api/symbol-strategy-applications/${application.id}/${nextAction}`,
        {},
      );
      setApplicationStatusMessage(
        nextAction === 'archive' ? LABELS.archiveApplicationSuccess : LABELS.restoreApplicationSuccess,
      );
      try {
        await mutateApplications();
      } catch {
        setApplicationStatusMessage(
          nextAction === 'archive' ? LABELS.archiveApplicationRefreshFailed : LABELS.restoreApplicationRefreshFailed,
        );
      }
    } catch (error) {
      setApplicationStatusError(
        getErrorMessage(
          error,
          nextAction === 'archive' ? LABELS.archiveApplicationError : LABELS.restoreApplicationError,
        ),
      );
    } finally {
      setIsMutatingApplicationStatus(false);
    }
  };

  const startInternalBacktest = async () => {
    if (!internalBacktestFrom.trim() || !internalBacktestTo.trim()) {
      return;
    }
    setIsStartingInternalBacktest(true);
    setInternalBacktestMessage(null);
    setInternalBacktestError(null);
    setInternalExecutionId(null);
    try {
      const result = await postApi<SymbolStrategyApplicationInternalBacktestData>(
        `/api/symbol-strategy-applications/${application.id}/internal-backtests`,
        {
          data_range: {
            from: internalBacktestFrom.trim(),
            to: internalBacktestTo.trim(),
          },
          engine_config: {
            summary_mode: 'engine_estimated',
          },
        },
      );
      setInternalExecutionId(result.execution.id);
      setInternalBacktestMessage(LABELS.internalBacktestSuccess);
      try {
        await mutateApplications();
      } catch {
        setInternalBacktestMessage(LABELS.internalBacktestRefreshFailed);
      }
    } catch (error) {
      setInternalBacktestError(getErrorMessage(error, LABELS.internalBacktestError));
    } finally {
      setIsStartingInternalBacktest(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <ApplicationSummaryHeader
        application={application}
        isMutatingApplicationStatus={isMutatingApplicationStatus}
        onApplicationStatusAction={mutateApplicationStatus}
      />
      {applicationStatusMessage ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{applicationStatusMessage}</p>
      ) : null}
      {applicationStatusError ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{applicationStatusError}</p>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ApplicationLatestRunCard application={application} mutateApplications={mutateApplications} />
        <ApplicationLatestReportCard application={application} />
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h5 className="text-sm font-semibold text-slate-900">{LABELS.csvImportTitle}</h5>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-sm text-slate-700">
            <span className="font-medium">{LABELS.csvFileName}</span>
            <input
              type="text"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            <span className="font-medium">{LABELS.csvText}</span>
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              rows={4}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              placeholder="TradingView CSV"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={importCsv}
            disabled={isImportingCsv || !fileName.trim() || !csvText.trim()}
            className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            {isImportingCsv ? LABELS.csvImporting : LABELS.runCsvImport}
          </button>
          {csvBacktestLink ? <TextLink href={`/backtests/${csvBacktestLink}`}>{LABELS.openBacktestDetail}</TextLink> : null}
        </div>
        {csvImportMessage ? (
          <p
            className={
              csvImportMessage.type === 'success'
                ? 'mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'
                : 'mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'
            }
          >
            {csvImportMessage.text}
          </p>
        ) : null}
        {csvImportError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{csvImportError}</p>
        ) : null}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h5 className="text-sm font-semibold text-slate-900">{LABELS.internalBacktest}</h5>
        <p className="mt-1 text-sm leading-6 text-slate-600">{LABELS.internalBacktestDescription}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm text-slate-700">
            <span className="font-medium">{LABELS.internalBacktestFrom}</span>
            <input
              type="date"
              value={internalBacktestFrom}
              onChange={(event) => setInternalBacktestFrom(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            <span className="font-medium">{LABELS.internalBacktestTo}</span>
            <input
              type="date"
              value={internalBacktestTo}
              onChange={(event) => setInternalBacktestTo(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>
        <MetaText>{LABELS.internalBacktestMode}: engine_estimated</MetaText>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={startInternalBacktest}
            disabled={isStartingInternalBacktest || !internalBacktestFrom.trim() || !internalBacktestTo.trim()}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            {isStartingInternalBacktest ? LABELS.internalBacktestStarting : LABELS.runInternalBacktest}
          </button>
          <span className="text-sm text-slate-500">{LABELS.internalBacktestResultPending}</span>
        </div>
        {internalExecutionId ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {LABELS.executionId}: {internalExecutionId}
          </p>
        ) : null}
        {internalBacktestMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{internalBacktestMessage}</p>
        ) : null}
        {internalBacktestError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{internalBacktestError}</p>
        ) : null}
      </div>
    </div>
  );
}

function SavedStrategyApplicationsPanel({
  applications,
  totalApplications,
  applicationStatusFilter,
  applicationFilter,
  applicationSourceFilter,
  applicationRunTypeFilter,
  applicationRunStatusFilter,
  onApplicationStatusFilterChange,
  onApplicationFilterChange,
  onApplicationSourceFilterChange,
  onApplicationRunTypeFilterChange,
  onApplicationRunStatusFilterChange,
  isLoading,
  error,
  mutateApplications,
}: {
  applications: SymbolStrategyApplicationItem[];
  totalApplications: number;
  applicationStatusFilter: ApplicationStatusFilter;
  applicationFilter: ApplicationReportFilter;
  applicationSourceFilter: ApplicationReportSourceFilter;
  applicationRunTypeFilter: ApplicationRunTypeFilter;
  applicationRunStatusFilter: ApplicationRunStatusFilter;
  onApplicationStatusFilterChange: (filter: ApplicationStatusFilter) => void;
  onApplicationFilterChange: (filter: ApplicationReportFilter) => void;
  onApplicationSourceFilterChange: (filter: ApplicationReportSourceFilter) => void;
  onApplicationRunTypeFilterChange: (filter: ApplicationRunTypeFilter) => void;
  onApplicationRunStatusFilterChange: (filter: ApplicationRunStatusFilter) => void;
  isLoading: boolean;
  error: unknown;
  mutateApplications: () => Promise<SymbolStrategyApplicationListData | undefined>;
}) {
  const reportCounts = applications.reduce(
    (acc, application) => {
      if (hasCsvReport(application)) acc.csv += 1;
      if (hasInternalReport(application)) acc.internal += 1;
      return acc;
    },
    { csv: 0, internal: 0 },
  );
  const statusFilterOptions = [
    { value: 'active' as const, label: LABELS.savedApplicationsStatusActive },
    { value: 'archived' as const, label: LABELS.savedApplicationsStatusArchived },
    { value: 'all' as const, label: LABELS.savedApplicationsStatusAll },
  ];
  const filterOptions = [
    { value: 'all' as const, label: LABELS.savedApplicationsFilterAll },
    { value: 'with_reports' as const, label: LABELS.savedApplicationsFilterWithReports },
    { value: 'without_reports' as const, label: LABELS.savedApplicationsFilterWithoutReports },
  ];
  const sourceFilterOptions = [
    { value: 'all' as const, label: LABELS.savedApplicationsSourceAll },
    { value: 'csv_import' as const, label: LABELS.savedApplicationsSourceCsv },
    { value: 'internal_backtest' as const, label: LABELS.savedApplicationsSourceInternal },
  ];
  const runTypeFilterOptions = [
    { value: 'all' as const, label: LABELS.savedApplicationsRunAll },
    { value: 'csv_import' as const, label: LABELS.savedApplicationsSourceCsv },
    { value: 'internal_backtest' as const, label: LABELS.savedApplicationsSourceInternal },
  ];
  const runStatusFilterOptions = [
    { value: 'all' as const, label: LABELS.savedApplicationsRunAll },
    { value: 'running' as const, label: LABELS.savedApplicationsRunRunning },
    { value: 'succeeded' as const, label: LABELS.savedApplicationsRunSucceeded },
    { value: 'failed' as const, label: LABELS.savedApplicationsRunFailed },
  ];
  const isDefaultEmptyState = applications.length === 0
    && applicationStatusFilter === 'active'
    && applicationFilter === 'all'
    && applicationSourceFilter === 'all'
    && applicationRunTypeFilter === 'all'
    && applicationRunStatusFilter === 'all';

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">{LABELS.savedApplicationsTitle}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{LABELS.strategyResultsPending}</p>
      {isLoading ? (
        <EmptyText>{LABELS.savedApplicationsLoading}</EmptyText>
      ) : error ? (
        <ErrorState title={LABELS.savedApplicationsError} className="mt-3" />
      ) : (
        <>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.savedApplicationsStatusFilter}</span>
              {statusFilterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={applicationStatusFilter === option.value ? 'primary' : 'secondary'}
                  onClick={() => onApplicationStatusFilterChange(option.value)}
                  className="py-1 text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.savedApplicationsFilter}</span>
              {filterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={applicationFilter === option.value ? 'primary' : 'secondary'}
                  onClick={() => onApplicationFilterChange(option.value)}
                  className="py-1 text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.savedApplicationsSourceFilter}</span>
              {sourceFilterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={applicationSourceFilter === option.value ? 'primary' : 'secondary'}
                  onClick={() => onApplicationSourceFilterChange(option.value)}
                  className="py-1 text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.savedApplicationsRunTypeFilter}</span>
              {runTypeFilterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={applicationRunTypeFilter === option.value ? 'primary' : 'secondary'}
                  onClick={() => onApplicationRunTypeFilterChange(option.value)}
                  className="py-1 text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.savedApplicationsRunStatusFilter}</span>
              {runStatusFilterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={applicationRunStatusFilter === option.value ? 'primary' : 'secondary'}
                  onClick={() => onApplicationRunStatusFilterChange(option.value)}
                  className="py-1 text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>
                {LABELS.savedApplicationsSummary
                  .replace('{status}', getApplicationStatusLabel(applicationStatusFilter))
                  .replace('{shown}', String(applications.length))
                  .replace('{total}', String(totalApplications))}
              </span>
              <span>
                {LABELS.savedApplicationsReportSummary
                  .replace('{csv}', String(reportCounts.csv))
                  .replace('{internal}', String(reportCounts.internal))}
              </span>
            </div>
          </div>
          {isDefaultEmptyState ? (
            <EmptyState title={LABELS.noSavedApplications} className="mt-3" />
          ) : applications.length === 0 ? (
            <EmptyState title={LABELS.noFilteredApplications} className="mt-3" />
          ) : (
            <div className="mt-3 grid gap-3">
              {applications.map((application) => (
                <SavedApplicationRow key={application.id} application={application} mutateApplications={mutateApplications} />
              ))}
            </div>
          )}
        </>
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
      setSaveApplicationMessage(LABELS.saveApplySuccess);
      setSelectedStrategyId(null);
      setSelectedVersionId(null);
    } catch (error) {
      setSaveApplicationError(getErrorMessage(error, 'application を保存できませんでした。'));
      setIsSavingApplication(false);
      return;
    }

    try {
      await mutateApplications();
    } catch {
      setSaveApplicationMessage(LABELS.saveApplyRefreshFailed);
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

      {selectedStrategy && selectedVersion ? (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{LABELS.unsaved}</span>
          <p className="mt-2 text-sm leading-6 text-amber-900">{LABELS.applyNotSaved}</p>
        </div>
      ) : null}

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
        <Button
          variant="primary"
          disabled={!selectedStrategy || !selectedVersion || isSavingApplication}
          onClick={saveApplication}
          className="py-2 disabled:bg-slate-300 disabled:text-slate-600 disabled:opacity-100"
        >
          {isSavingApplication ? '保存中...' : LABELS.saveApply}
        </Button>
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
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<ApplicationStatusFilter>('active');
  const [applicationFilter, setApplicationFilter] = useState<ApplicationReportFilter>('all');
  const [applicationSourceFilter, setApplicationSourceFilter] = useState<ApplicationReportSourceFilter>('all');
  const [applicationRunTypeFilter, setApplicationRunTypeFilter] = useState<ApplicationRunTypeFilter>('all');
  const [applicationRunStatusFilter, setApplicationRunStatusFilter] = useState<ApplicationRunStatusFilter>('all');

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
      ? `/api/symbols/${symbolId}/strategy-applications?status=${applicationStatusFilter}&page=1&limit=20&sort=updated_at&order=desc${getApplicationReportPresenceQuery(applicationFilter)}${getApplicationReportSourceQuery(applicationSourceFilter)}${getApplicationRunTypeQuery(applicationRunTypeFilter)}${getApplicationRunStatusQuery(applicationRunStatusFilter)}`
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
        <ErrorState title={`エラー: ${error.message}`} className="w-full p-6" />
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
            <EmptyState title={LABELS.noAlerts} />
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
                <Button
                  variant="primary"
                  onClick={() => handleGenerateThesis(true)}
                  disabled={isGeneratingThesis}
                  className="px-4 py-2 transition hover:bg-sky-800 disabled:bg-slate-400 disabled:opacity-100"
                >
                  {isGeneratingThesis ? LABELS.generating : LABELS.regenerateAi}
                </Button>
              </div>
            </InfoCard>
          ) : aiSummary?.status === 'unavailable' || aiSummaryError ? (
            <InfoCard>
              <EmptyText>{LABELS.unavailableAi}</EmptyText>
              <p className="mt-2 text-sm text-slate-500">{LABELS.emptyStateHint}</p>
              <div className="mt-4">
                <Button
                  variant="primary"
                  onClick={() => handleGenerateThesis(false)}
                  disabled={isGeneratingThesis}
                  className="px-4 py-2 transition hover:bg-sky-800 disabled:bg-slate-400 disabled:opacity-100"
                >
                  {isGeneratingThesis ? LABELS.generating : LABELS.generateAi}
                </Button>
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
              totalApplications={applicationListData?.pagination.total ?? applicationListData?.applications.length ?? 0}
              applicationStatusFilter={applicationStatusFilter}
              applicationFilter={applicationFilter}
              applicationSourceFilter={applicationSourceFilter}
              applicationRunTypeFilter={applicationRunTypeFilter}
              applicationRunStatusFilter={applicationRunStatusFilter}
              onApplicationStatusFilterChange={setApplicationStatusFilter}
              onApplicationFilterChange={setApplicationFilter}
              onApplicationSourceFilterChange={setApplicationSourceFilter}
              onApplicationRunTypeFilterChange={setApplicationRunTypeFilter}
              onApplicationRunStatusFilterChange={setApplicationRunStatusFilter}
              isLoading={isApplicationListLoading}
              error={applicationListError}
              mutateApplications={mutateApplicationList}
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
            <EmptyState title={LABELS.noResearchNote}>
              <p className="mt-2 text-sm text-slate-500">{LABELS.emptyStateHint}</p>
            </EmptyState>
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
