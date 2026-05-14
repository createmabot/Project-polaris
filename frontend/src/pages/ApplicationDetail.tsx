import { useState } from 'react';
import useSWR from 'swr';
import { useRoute } from 'wouter';
import { swrFetcher } from '../api/client';
import {
  SymbolStrategyApplicationReportHistoryData,
  SymbolStrategyApplicationRunHistoryData,
} from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import FilterGroup from '../components/ui/FilterGroup';
import InlineNotice from '../components/ui/InlineNotice';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import PaginationControls from '../components/ui/PaginationControls';
import SectionCard from '../components/ui/SectionCard';
import StatusBadge from '../components/ui/StatusBadge';
import TextLink from '../components/ui/TextLink';

const LABELS = {
  title: 'Application Detail',
  backToHome: 'ホームへ戻る',
  backToSymbol: 'SymbolDetail に戻る',
  applicationLoading: 'application 履歴を読み込み中...',
  applicationError: 'application 履歴を取得できませんでした。',
  notFound: 'application が見つかりません。',
  summary: 'application summary',
  runs: 'run履歴',
  reports: 'report履歴',
  noRuns: 'run履歴はまだありません。',
  noReports: 'report履歴はまだありません。',
  runsFilter: 'run履歴 filter',
  runsTypeFilter: 'run type',
  runsStatusFilter: 'run status',
  runsAll: 'すべて',
  runsCsvImport: 'CSV',
  runsInternalBacktest: 'internal',
  runsQueued: 'queued',
  runsRunning: 'running',
  runsSucceeded: 'succeeded',
  runsFailed: 'failed',
  runsCanceled: 'canceled',
  runsSummary: 'run {shown} / {total} 件を表示中',
  reportsFilter: 'report履歴 filter',
  reportsSourceFilter: 'execution source',
  reportsStatusFilter: 'report status',
  reportsAll: 'すべて',
  reportsTradingView: 'TradingView',
  reportsInternalBacktest: 'internal',
  reportsImported: 'imported',
  reportsCompleted: 'completed',
  reportsImportFailed: 'import_failed',
  reportsFailed: 'failed',
  reportsSummary: 'report {shown} / {total} 件を表示中',
  metricsMissingNote:
    'metrics の - は、CSV parsed summary または internal result_summary から取得できない項目です。',
  metricsMissingDetail:
    'CSV import report は parsed summary、internal backtest report は result_summary がない場合に一部 metrics が未表示になります。',
  aiArtifactDetailNote:
    'AI summary 本文、available / unavailable、artifact metadata、raw artifact JSON の詳細確認は BacktestDetail で行います。この画面は report history の入口であり、report row では AI summary status や artifact path を表示せず、表示起点 enqueue もしません。',
  importlessReportNote:
    'importless_report は internal backtest 由来で BacktestImport を持たない report を示します。',
  reportComparisonHelperNote:
    'BacktestDetail で同一 application の関連 report と metrics を確認できます。',
  previousPage: '前へ',
  nextPage: '次へ',
  pageSummary: 'page {page}',
  openBacktest: 'BacktestDetail を開く',
  openBacktestComparisonHelper: 'BacktestDetail を開く（関連 report 確認）',
  openStrategy: 'StrategyDetail を開く',
  openVersion: 'StrategyVersionDetail を開く',
  runCount: 'run count',
  reportCount: 'report count',
  latestReadOnly: 'read-only foundation として application 単位の run / report 履歴を表示しています。',
} as const;

type RunTypeFilter = 'all' | 'csv_import' | 'internal_backtest';
type RunStatusFilter = 'all' | 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
type ReportExecutionSourceFilter = 'all' | 'tradingview' | 'internal_backtest';
type ReportStatusFilter = 'all' | 'imported' | 'completed' | 'import_failed' | 'failed';

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
}

function getApplicationTitle(data?: SymbolStrategyApplicationRunHistoryData | null) {
  if (!data) return LABELS.title;
  return `${data.application.symbol.display_name || data.application.symbol.symbol} / ${data.application.strategy.title}`;
}

function buildRunsPath(applicationId: string, page: number, runType: RunTypeFilter, runStatus: RunStatusFilter): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: '20',
    sort: 'created_at',
    order: 'desc',
  });
  if (runType !== 'all') {
    params.set('run_type', runType);
  }
  if (runStatus !== 'all') {
    params.set('run_status', runStatus);
  }
  return `/api/symbol-strategy-applications/${applicationId}/runs?${params.toString()}`;
}

function buildReportsPath(
  applicationId: string,
  page: number,
  executionSource: ReportExecutionSourceFilter,
  reportStatus: ReportStatusFilter,
): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: '20',
    sort: 'created_at',
    order: 'desc',
  });
  if (executionSource !== 'all') {
    params.set('execution_source', executionSource);
  }
  if (reportStatus !== 'all') {
    params.set('status', reportStatus);
  }
  return `/api/symbol-strategy-applications/${applicationId}/reports?${params.toString()}`;
}

export default function ApplicationDetail() {
  const [, params] = useRoute('/symbol-strategy-applications/:applicationId');
  const applicationId = params?.applicationId;
  const [runsPage, setRunsPage] = useState(1);
  const [runTypeFilter, setRunTypeFilter] = useState<RunTypeFilter>('all');
  const [runStatusFilter, setRunStatusFilter] = useState<RunStatusFilter>('all');
  const [reportsPage, setReportsPage] = useState(1);
  const [reportExecutionSourceFilter, setReportExecutionSourceFilter] = useState<ReportExecutionSourceFilter>('all');
  const [reportStatusFilter, setReportStatusFilter] = useState<ReportStatusFilter>('all');
  const runsPath = applicationId
    ? buildRunsPath(applicationId, runsPage, runTypeFilter, runStatusFilter)
    : null;
  const reportsPath = applicationId
    ? buildReportsPath(applicationId, reportsPage, reportExecutionSourceFilter, reportStatusFilter)
    : null;
  const {
    data: runsData,
    error: runsError,
    isLoading: isRunsLoading,
  } = useSWR<SymbolStrategyApplicationRunHistoryData>(runsPath, swrFetcher);
  const {
    data: reportsData,
    error: reportsError,
    isLoading: isReportsLoading,
  } = useSWR<SymbolStrategyApplicationReportHistoryData>(reportsPath, swrFetcher);

  if (isRunsLoading && !runsData) {
    return (
      <AppLayout showSideRail>
        <LoadingState title={LABELS.applicationLoading} className="w-full" />
      </AppLayout>
    );
  }

  if (runsError) {
    const isNotFound = runsError?.code === 'NOT_FOUND' || runsError?.status === 404;
    return (
      <AppLayout showSideRail>
        <ErrorState title={isNotFound ? LABELS.notFound : LABELS.applicationError} className="w-full">
          <TextLink href="/">{LABELS.backToHome}</TextLink>
        </ErrorState>
      </AppLayout>
    );
  }

  if (!runsData) return null;

  const application = runsData.application;
  const runTypeOptions = [
    { value: 'all' as const, label: LABELS.runsAll },
    { value: 'csv_import' as const, label: LABELS.runsCsvImport },
    { value: 'internal_backtest' as const, label: LABELS.runsInternalBacktest },
  ];
  const runStatusOptions = [
    { value: 'all' as const, label: LABELS.runsAll },
    { value: 'queued' as const, label: LABELS.runsQueued },
    { value: 'running' as const, label: LABELS.runsRunning },
    { value: 'succeeded' as const, label: LABELS.runsSucceeded },
    { value: 'failed' as const, label: LABELS.runsFailed },
    { value: 'canceled' as const, label: LABELS.runsCanceled },
  ];
  const reportExecutionSourceOptions = [
    { value: 'all' as const, label: LABELS.reportsAll },
    { value: 'tradingview' as const, label: LABELS.reportsTradingView },
    { value: 'internal_backtest' as const, label: LABELS.reportsInternalBacktest },
  ];
  const reportStatusOptions = [
    { value: 'all' as const, label: LABELS.reportsAll },
    { value: 'imported' as const, label: LABELS.reportsImported },
    { value: 'completed' as const, label: LABELS.reportsCompleted },
    { value: 'import_failed' as const, label: LABELS.reportsImportFailed },
    { value: 'failed' as const, label: LABELS.reportsFailed },
  ];

  function updateRunTypeFilter(nextFilter: RunTypeFilter) {
    setRunTypeFilter(nextFilter);
    setRunsPage(1);
  }

  function updateRunStatusFilter(nextFilter: RunStatusFilter) {
    setRunStatusFilter(nextFilter);
    setRunsPage(1);
  }

  function updateReportExecutionSourceFilter(nextFilter: ReportExecutionSourceFilter) {
    setReportExecutionSourceFilter(nextFilter);
    setReportsPage(1);
  }

  function updateReportStatusFilter(nextFilter: ReportStatusFilter) {
    setReportStatusFilter(nextFilter);
    setReportsPage(1);
  }

  return (
    <AppLayout showSideRail>
      <div className="w-full space-y-5">
        <PageHeader
          title={getApplicationTitle(runsData)}
          backLink={{ href: `/symbols/${application.symbol.id}`, label: LABELS.backToSymbol }}
          description={LABELS.latestReadOnly}
          actions={
            <>
              <TextLink href={`/strategies/${application.strategy.id}`}>{LABELS.openStrategy}</TextLink>
              <TextLink href={`/strategy-versions/${application.strategy_version.id}`}>{LABELS.openVersion}</TextLink>
            </>
          }
        />

        <SectionCard title={LABELS.summary}>
          <KeyValueList className="gap-x-6 gap-y-2 text-sm text-slate-600 sm:grid-cols-2">
            <KeyValueRow label="application_id"><code>{application.id}</code></KeyValueRow>
            <KeyValueRow label="status"><StatusBadge status={application.status} className="px-2 py-0.5" /></KeyValueRow>
            <KeyValueRow label="source"><code>{application.source}</code></KeyValueRow>
            <KeyValueRow label={LABELS.runCount}>{application.run_count}</KeyValueRow>
            <KeyValueRow label="symbol"><code>{application.symbol.symbol_code || application.symbol.symbol}</code></KeyValueRow>
            <KeyValueRow label="strategy">{application.strategy.title}</KeyValueRow>
            <KeyValueRow label="version_id"><code>{application.strategy_version.id}</code></KeyValueRow>
            <KeyValueRow label="market / timeframe">
              {application.strategy_version.market} / {application.strategy_version.timeframe}
            </KeyValueRow>
            <KeyValueRow label="updated">{formatDate(application.updated_at)}</KeyValueRow>
          </KeyValueList>
        </SectionCard>

        <div id="runs">
          <SectionCard title={LABELS.runs}>
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.runsFilter}</h3>
              <FilterGroup
                label={LABELS.runsTypeFilter}
                options={runTypeOptions}
                value={runTypeFilter}
                onChange={updateRunTypeFilter}
                className="mt-2"
              />
              <FilterGroup
                label={LABELS.runsStatusFilter}
                options={runStatusOptions}
                value={runStatusFilter}
                onChange={updateRunStatusFilter}
                className="mt-2"
              />
              <div className="mt-2 text-xs text-slate-500">
                {LABELS.runsSummary
                  .replace('{shown}', String(runsData.runs.length))
                  .replace('{total}', String(runsData.pagination.total))}
              </div>
            </div>
            {runsData.runs.length === 0 ? (
              <EmptyState title={LABELS.noRuns} />
            ) : (
              <div className="grid gap-3">
              {runsData.runs.map((run) => (
                <article key={run.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{run.run_type}</h3>
                      <KeyValueList className="mt-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
                        <KeyValueRow label="run_id"><code>{run.id}</code></KeyValueRow>
                        <KeyValueRow label="status"><StatusBadge status={run.status} className="px-2 py-0.5" /></KeyValueRow>
                        <KeyValueRow label="created">{formatDate(run.created_at)}</KeyValueRow>
                        <KeyValueRow label="finished">{formatDate(run.finished_at)}</KeyValueRow>
                        {run.error_code ? <KeyValueRow label="error_code"><code>{run.error_code}</code></KeyValueRow> : null}
                      </KeyValueList>
                    </div>
                    {run.linked_backtest ? (
                      <TextLink href={`/backtests/${run.linked_backtest.id}`}>{LABELS.openBacktest}</TextLink>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                      <strong className="block text-slate-700">linked backtest</strong>
                      {run.linked_backtest ? (
                        <KeyValueList className="mt-2 gap-1">
                          <KeyValueRow label="title">{run.linked_backtest.title}</KeyValueRow>
                          <KeyValueRow label="source"><code>{run.linked_backtest.execution_source}</code></KeyValueRow>
                          <KeyValueRow label="status"><StatusBadge status={run.linked_backtest.status} className="px-2 py-0.5" /></KeyValueRow>
                        </KeyValueList>
                      ) : (
                        <p className="mt-2">-</p>
                      )}
                    </div>
                    <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                      <strong className="block text-slate-700">linked import</strong>
                      {run.linked_backtest_import ? (
                        <KeyValueList className="mt-2 gap-1">
                          <KeyValueRow label="file">{run.linked_backtest_import.file_name}</KeyValueRow>
                          <KeyValueRow label="parse"><StatusBadge status={run.linked_backtest_import.parse_status} className="px-2 py-0.5" /></KeyValueRow>
                        </KeyValueList>
                      ) : (
                        <p className="mt-2">-</p>
                      )}
                    </div>
                    <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                      <strong className="block text-slate-700">linked execution</strong>
                      {run.linked_internal_backtest_execution ? (
                        <KeyValueList className="mt-2 gap-1">
                          <KeyValueRow label="execution_id"><code>{run.linked_internal_backtest_execution.id}</code></KeyValueRow>
                          <KeyValueRow label="status"><StatusBadge status={run.linked_internal_backtest_execution.status} className="px-2 py-0.5" /></KeyValueRow>
                          <KeyValueRow label="engine"><code>{run.linked_internal_backtest_execution.engine_version}</code></KeyValueRow>
                        </KeyValueList>
                      ) : (
                        <p className="mt-2">-</p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              </div>
            )}
            <PaginationControls
              page={runsData.pagination.page}
              hasPrev={runsData.pagination.has_prev}
              hasNext={runsData.pagination.has_next}
              onPrev={() => setRunsPage((page) => Math.max(1, page - 1))}
              onNext={() => setRunsPage((page) => page + 1)}
              summaryLabel={LABELS.pageSummary}
              previousLabel={LABELS.previousPage}
              nextLabel={LABELS.nextPage}
            />
          </SectionCard>
        </div>

        <div id="reports">
          <SectionCard title={LABELS.reports}>
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.reportsFilter}</h3>
              <FilterGroup
                label={LABELS.reportsSourceFilter}
                options={reportExecutionSourceOptions}
                value={reportExecutionSourceFilter}
                onChange={updateReportExecutionSourceFilter}
                className="mt-2"
              />
              <FilterGroup
                label={LABELS.reportsStatusFilter}
                options={reportStatusOptions}
                value={reportStatusFilter}
                onChange={updateReportStatusFilter}
                className="mt-2"
              />
              <div className="mt-2 text-xs text-slate-500">
                {reportsData
                  ? LABELS.reportsSummary
                    .replace('{shown}', String(reportsData.reports.length))
                    .replace('{total}', String(reportsData.pagination.total))
                  : LABELS.reportsSummary.replace('{shown}', '-').replace('{total}', '-')}
              </div>
            </div>
            <InlineNotice tone="warning" className="mb-3 text-xs leading-5">
              <p>{LABELS.metricsMissingNote}</p>
              <p>{LABELS.metricsMissingDetail}</p>
              <p>{LABELS.aiArtifactDetailNote}</p>
              <p>{LABELS.importlessReportNote}</p>
            </InlineNotice>
            {isReportsLoading ? (
              <LoadingState title={LABELS.applicationLoading} />
            ) : reportsError ? (
              <ErrorState title={LABELS.applicationError} />
            ) : !reportsData || reportsData.reports.length === 0 ? (
              <EmptyState title={LABELS.noReports} />
            ) : (
              <div className="grid gap-3">
              <div className="text-xs text-slate-500">{LABELS.reportCount}: {reportsData.application.report_count}</div>
              {reportsData.reports.map((report) => (
                <article key={report.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{report.title}</h3>
                      <KeyValueList className="mt-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
                        <KeyValueRow label="report_id"><code>{report.id}</code></KeyValueRow>
                        <KeyValueRow label="origin"><code>{report.report_origin}</code></KeyValueRow>
                        <KeyValueRow label="source"><code>{report.execution_source}</code></KeyValueRow>
                        <KeyValueRow label="importless_report">{report.importless_report ? 'true' : 'false'}</KeyValueRow>
                        <KeyValueRow label="status"><StatusBadge status={report.status} className="px-2 py-0.5" /></KeyValueRow>
                        <KeyValueRow label="run status"><StatusBadge status={report.linked_run.status} className="px-2 py-0.5" /></KeyValueRow>
                        <KeyValueRow label="updated">{formatDate(report.updated_at)}</KeyValueRow>
                      </KeyValueList>
                    </div>
                    <div className="max-w-xs text-right text-xs leading-5 text-slate-500">
                      <p>{LABELS.reportComparisonHelperNote}</p>
                      <TextLink href={report.backtest_detail_link.path}>{LABELS.openBacktestComparisonHelper}</TextLink>
                    </div>
                  </div>
                  {report.metrics ? (
                    <KeyValueList className="mt-3 gap-x-4 gap-y-1 rounded-md border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-3">
                      <KeyValueRow label="period">{report.metrics.period_from ?? '-'} / {report.metrics.period_to ?? '-'}</KeyValueRow>
                      <KeyValueRow label="trade_count">{formatNumber(report.metrics.trade_count)}</KeyValueRow>
                      <KeyValueRow label="total_return_percent">{formatNumber(report.metrics.total_return_percent)}</KeyValueRow>
                      <KeyValueRow label="price_change_percent">{formatNumber(report.metrics.price_change_percent)}</KeyValueRow>
                      <KeyValueRow label="max_drawdown_percent">{formatNumber(report.metrics.max_drawdown_percent)}</KeyValueRow>
                      <KeyValueRow label="profit_factor">{formatNumber(report.metrics.profit_factor)}</KeyValueRow>
                      <KeyValueRow label="win_rate">{formatNumber(report.metrics.win_rate)}</KeyValueRow>
                      <KeyValueRow label="metrics_source"><code>{report.metrics.source}</code></KeyValueRow>
                    </KeyValueList>
                  ) : null}
                </article>
              ))}
              </div>
            )}
            {reportsData ? (
              <PaginationControls
                page={reportsData.pagination.page}
                hasPrev={reportsData.pagination.has_prev}
                hasNext={reportsData.pagination.has_next}
                onPrev={() => setReportsPage((page) => Math.max(1, page - 1))}
                onNext={() => setReportsPage((page) => page + 1)}
                summaryLabel={LABELS.pageSummary}
                previousLabel={LABELS.previousPage}
                nextLabel={LABELS.nextPage}
              />
            ) : null}
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}
