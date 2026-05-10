import { useState } from 'react';
import useSWR from 'swr';
import { useRoute } from 'wouter';
import { patchApi, swrFetcher } from '../api/client';
import {
  StrategyMutateData,
  StrategySymbolApplicationsData,
  StrategyVersionListData,
  SymbolStrategyApplicationMutateData,
} from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import StatusBadge from '../components/ui/StatusBadge';
import TextLink from '../components/ui/TextLink';

const PANEL_CLASS = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';
const MUTED_TEXT_CLASS = 'text-sm leading-7 text-slate-600';
type ApplicationStatusFilter = 'active' | 'archived' | 'all';

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時不明';
  return date.toLocaleString('ja-JP');
}

function reportOriginLabel(executionSource: string | null | undefined): string {
  if (executionSource === 'internal_backtest') return 'internal backtest report';
  if (executionSource === 'tradingview' || executionSource === 'csv_import') return 'CSV import report';
  return 'report';
}

function StrategyDetail(): JSX.Element {
  const [, params] = useRoute('/strategies/:strategyId') as [boolean, { strategyId?: string } | null];
  const strategyId = params?.strategyId ?? '-';
  const [isMutatingStatus, setIsMutatingStatus] = useState(false);
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<ApplicationStatusFilter>('active');
  const [mutatingApplicationId, setMutatingApplicationId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useSWR<StrategyVersionListData>(
    strategyId === '-' ? null : `/api/strategies/${strategyId}/versions?page=1&limit=50&sort=updated_at&order=desc`,
    swrFetcher,
  );
  const {
    data: symbolApplicationsData,
    error: symbolApplicationsError,
    isLoading: isSymbolApplicationsLoading,
    mutate: mutateSymbolApplications,
  } = useSWR<StrategySymbolApplicationsData>(
    strategyId === '-'
      ? null
      : `/api/strategies/${strategyId}/symbol-applications?status=${applicationStatusFilter}&page=1&limit=20&sort=updated_at&order=desc`,
    swrFetcher,
  );
  const strategy = data?.strategy;
  const versions = data?.strategy_versions ?? [];
  const symbolApplications = symbolApplicationsData?.applications ?? [];
  const relatedReports = symbolApplications.filter((application) => application.latest_backtest_report);

  const handleArchiveRestore = async (nextAction: 'archive' | 'restore') => {
    if (strategyId === '-') return;
    const confirmMessage = nextAction === 'archive'
      ? 'このストラテジーをアーカイブしますか？'
      : 'このストラテジーを復元しますか？';
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;
    setIsMutatingStatus(true);
    setActionError(null);
    try {
      await patchApi<StrategyMutateData>(`/api/strategies/${strategyId}/${nextAction}`, {});
      await mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'ストラテジーの更新に失敗しました。');
    } finally {
      setIsMutatingStatus(false);
    }
  };

  const handleApplicationArchiveRestore = async (applicationId: string, nextAction: 'archive' | 'restore') => {
    const confirmMessage = nextAction === 'archive'
      ? 'この application をアーカイブしますか？'
      : 'この application を復元しますか？';
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;
    setMutatingApplicationId(applicationId);
    setActionError(null);
    try {
      await patchApi<SymbolStrategyApplicationMutateData>(
        `/api/symbol-strategy-applications/${applicationId}/${nextAction}`,
        {},
      );
      await mutateSymbolApplications();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'application の更新に失敗しました。');
    } finally {
      setMutatingApplicationId(null);
    }
  };

  return (
    <AppLayout>
      <div className="w-full space-y-5">
        <PageHeader
          title="ストラテジー詳細"
          description="再利用可能なストラテジー定義の詳細、version、関連検証レポート、適用済み銘柄を扱う画面です。"
          backLink={{ href: '/strategies', label: 'ストラテジーリストへ戻る' }}
        />

        <section className={PANEL_CLASS}>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              strategy_id: <code>{strategyId}</code>
            </p>
            {isLoading ? (
              <LoadingState title="ストラテジー詳細を読み込み中..." />
            ) : error ? (
              <ErrorState title="ストラテジー詳細を取得できませんでした。" />
            ) : (
              <>
                <h2 className="text-xl font-semibold text-slate-900">{strategy?.title ?? 'ストラテジー定義'}</h2>
                <dl className="grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium text-slate-500">status</dt>
                    <dd>
                      <StatusBadge status={strategy?.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">created</dt>
                    <dd>{formatDate(strategy?.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">updated</dt>
                    <dd>{formatDate(strategy?.updated_at)}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center gap-3">
                  {strategy?.status === 'archived' ? (
                    <Button
                      disabled={isMutatingStatus}
                      onClick={() => handleArchiveRestore('restore')}
                    >
                      復元
                    </Button>
                  ) : (
                    <Button
                      disabled={isMutatingStatus}
                      onClick={() => handleArchiveRestore('archive')}
                    >
                      アーカイブ
                    </Button>
                  )}
                  {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}
                </div>
              </>
            )}
            <p className={MUTED_TEXT_CLASS}>
              このストラテジー定義の version、関連検証レポート、適用済み銘柄をここに集約します。
            </p>
            <p className={MUTED_TEXT_CLASS}>
              現在は既存 version と銘柄起点 application の read-only 表示までです。favorite / hard delete は後続タスクで接続します。archive / restore は status 操作として利用できます。
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <TextLink
              href={`/strategies/${strategyId}/versions`}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white no-underline hover:no-underline"
            >
              version 一覧を開く
            </TextLink>
            <TextLink
              href="/strategy-lab"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 no-underline hover:no-underline"
            >
              ストラテジー作成を開く
            </TextLink>
            <TextLink
              href="/backtests"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 no-underline hover:no-underline"
            >
              検証レポート一覧を開く
            </TextLink>
          </div>

          <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            BacktestDetail は個別検証レポート詳細として継続し、この画面には吸収しません。
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-lg font-semibold text-slate-900">version 一覧</h2>
          {isLoading ? (
            <LoadingState title="version を読み込み中..." className="mt-4" />
          ) : error ? (
            <ErrorState title="version 一覧を取得できませんでした。" className="mt-4" />
          ) : versions.length === 0 ? (
            <EmptyState title="このストラテジーにはまだ version がありません。" className="mt-4" />
          ) : (
            <div className="mt-4 space-y-3">
              {versions.map((version) => (
                <article key={version.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <TextLink href={`/strategy-versions/${version.id}`} className="font-semibold text-sky-700 no-underline hover:underline">
                        {version.id}
                      </TextLink>
                      <p className="text-xs text-slate-500">
                        {version.market} / {version.timeframe}
                      </p>
                    </div>
                    <StatusBadge status={version.status} />
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium text-slate-500">created</dt>
                      <dd>{formatDate(version.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">updated</dt>
                      <dd>{formatDate(version.updated_at)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-lg font-semibold text-slate-900">適用済み銘柄</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-700">表示対象</span>
            {([
              ['active', '有効'],
              ['archived', 'アーカイブ'],
              ['all', 'すべて'],
            ] as Array<[ApplicationStatusFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setApplicationStatusFilter(value)}
                className={
                  applicationStatusFilter === value
                    ? 'rounded-md bg-sky-700 px-3 py-1.5 font-medium text-white'
                    : 'rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700'
                }
              >
                {label}
              </button>
            ))}
          </div>
          {isSymbolApplicationsLoading ? (
            <LoadingState title="適用済み銘柄を読み込み中..." className="mt-4" />
          ) : symbolApplicationsError ? (
            <ErrorState title="適用済み銘柄を取得できませんでした。" className="mt-4" />
          ) : symbolApplications.length === 0 ? (
            <EmptyState title="この strategy はまだ銘柄に適用されていません。" className="mt-4" />
          ) : (
            <div className="mt-4 space-y-3">
              {symbolApplications.map((application) => (
                <article key={application.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <TextLink href={`/symbols/${application.symbol.id}`} className="font-semibold text-sky-700 no-underline hover:underline">
                        {application.symbol.display_name ?? application.symbol.symbol_code ?? application.symbol.symbol}
                      </TextLink>
                      <p className="mt-1 text-xs text-slate-500">
                        application: <code>{application.id}</code> / status: {application.status}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                      runs: {application.run_count}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {application.status === 'archived' ? (
                      <Button
                        onClick={() => handleApplicationArchiveRestore(application.id, 'restore')}
                        disabled={mutatingApplicationId === application.id}
                      >
                        復元
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleApplicationArchiveRestore(application.id, 'archive')}
                        disabled={mutatingApplicationId === application.id}
                      >
                        アーカイブ
                      </Button>
                    )}
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium text-slate-500">strategy version</dt>
                      <dd>
                        <TextLink href={`/strategy-versions/${application.strategy_version.id}`}>
                          {application.strategy_version.id}
                        </TextLink>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">latest run</dt>
                      <dd>{application.latest_run ? `${application.latest_run.run_type} / ${application.latest_run.status}` : '-'}</dd>
                    </div>
                  </dl>
                  {application.latest_backtest_report ? (
                    <div className="mt-3 rounded-lg border border-white bg-white p-3 text-sm text-slate-700">
                      <div className="text-xs font-medium text-slate-500">latest report</div>
                      <TextLink href={`/backtests/${application.latest_backtest_report.id}`} className="font-semibold text-sky-700 no-underline hover:underline">
                        {application.latest_backtest_report.title}
                      </TextLink>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-lg font-semibold text-slate-900">関連検証レポート</h2>
          {isSymbolApplicationsLoading ? (
            <LoadingState title="関連検証レポートを読み込み中..." className="mt-4" />
          ) : symbolApplicationsError ? (
            <ErrorState title="関連検証レポートを取得できませんでした。" className="mt-4" />
          ) : relatedReports.length === 0 ? (
            <EmptyState title="関連検証レポートはまだありません。" className="mt-4" />
          ) : (
            <div className="mt-4 space-y-3">
              {relatedReports.map((application) => {
                const report = application.latest_backtest_report;
                if (!report) return null;
                return (
                  <article key={`${application.id}-${report.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <TextLink href={`/backtests/${report.id}`} className="font-semibold text-sky-700 no-underline hover:underline">
                      {report.title}
                    </TextLink>
                    <KeyValueList className="mt-2 gap-1 text-sm text-slate-600 sm:grid-cols-2">
                      <KeyValueRow label="report type">{reportOriginLabel(report.execution_source)}</KeyValueRow>
                      <KeyValueRow label="source"><code>{report.execution_source}</code></KeyValueRow>
                      <KeyValueRow label="status"><StatusBadge status={report.status} className="px-2 py-0.5" /></KeyValueRow>
                      <KeyValueRow label="market / timeframe">{report.market} / {report.timeframe}</KeyValueRow>
                    </KeyValueList>
                    <p className="mt-1 text-xs text-slate-500">
                      symbol: {application.symbol.display_name ?? application.symbol.symbol_code ?? application.symbol.symbol}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-lg font-semibold text-slate-900">後続接続予定</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li>favorite / hard delete は準備中です。</li>
            <li>application archive / restore は status 操作として利用できます。</li>
            <li>internal execution result detail は後続タスクで接続します。</li>
          </ul>
        </section>
      </div>
    </AppLayout>
  );
}

export default StrategyDetail;
