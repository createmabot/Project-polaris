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
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
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
  openBacktest: 'BacktestDetail を開く',
  openStrategy: 'StrategyDetail を開く',
  openVersion: 'StrategyVersionDetail を開く',
  runCount: 'run count',
  reportCount: 'report count',
  latestReadOnly: 'read-only foundation として application 単位の run / report 履歴を表示しています。',
} as const;

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

export default function ApplicationDetail() {
  const [, params] = useRoute('/symbol-strategy-applications/:applicationId');
  const applicationId = params?.applicationId;
  const runsPath = applicationId
    ? `/api/symbol-strategy-applications/${applicationId}/runs?page=1&limit=20&sort=created_at&order=desc`
    : null;
  const reportsPath = applicationId
    ? `/api/symbol-strategy-applications/${applicationId}/reports?page=1&limit=20&sort=created_at&order=desc`
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
          </SectionCard>
        </div>

        <div id="reports">
          <SectionCard title={LABELS.reports}>
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
                        <KeyValueRow label="status"><StatusBadge status={report.status} className="px-2 py-0.5" /></KeyValueRow>
                        <KeyValueRow label="run status"><StatusBadge status={report.linked_run.status} className="px-2 py-0.5" /></KeyValueRow>
                        <KeyValueRow label="updated">{formatDate(report.updated_at)}</KeyValueRow>
                      </KeyValueList>
                    </div>
                    <TextLink href={report.backtest_detail_link.path}>{LABELS.openBacktest}</TextLink>
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
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}
