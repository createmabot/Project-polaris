import { type ReactNode, useState } from 'react';
import useSWR from 'swr';
import { Link, useLocation } from 'wouter';
import { postApi, swrFetcher } from '../api/client';
import { BacktestComparisonData, BacktestDetailData } from '../api/types';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import InlineNotice from '../components/ui/InlineNotice';
import JsonBlock from '../components/ui/JsonBlock';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import SectionCard from '../components/ui/SectionCard';
import StatusBadge from '../components/ui/StatusBadge';
import TextLink from '../components/ui/TextLink';

type BacktestDetailProps = {
  params: { backtestId: string };
};

const UNAVAILABLE_AI_REVIEW = {
  summary_id: null,
  title: null,
  body_markdown: null,
  structured_json: null,
  generated_at: null,
  status: 'unavailable' as const,
  insufficient_context: true,
};

function valueText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number(value).toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${Number(value).toFixed(2)}%`;
}

function formatDateTime(value: string | null | undefined): string {
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

function reportMetricsRootLabel(executionSource: string | null | undefined): string {
  if (executionSource === 'internal_backtest') return 'strategySnapshotJson.result_summary';
  if (executionSource === 'tradingview' || executionSource === 'csv_import') return 'BacktestImport parsed summary';
  return 'source summary';
}

function aiReviewInputDescription(isInternalBacktestReport: boolean): string {
  if (isInternalBacktestReport) {
    return 'internal_backtest report の AI summary input は strategySnapshotJson.result_summary / artifact_pointer / internal_backtest_execution_id が中心です。BacktestImport は作成されません。';
  }
  return 'CSV import / TradingView report の AI summary input は BacktestImport parsed summary、comparison diff、TradingView report 文脈が中心です。';
}

function aiReviewAutoEnqueueDescription(isInternalBacktestReport: boolean): string {
  if (isInternalBacktestReport) {
    return 'internal backtest report は、新規 report conversion 完了直後に AI summary 自動生成の対象です。既存 report を返す再実行では起動しません。';
  }
  return 'CSV import report は、parse_status=parsed になった直後に AI summary 自動生成の対象です。parse failed import は対象外です。';
}

function aiSummaryJobTriggerLabel(trigger: string | null | undefined): string {
  if (trigger === 'manual') return 'manual';
  if (trigger === 'csv_import_auto') return 'CSV import auto';
  if (trigger === 'internal_backtest_report_auto') return 'internal backtest report auto';
  return trigger || '-';
}

function aiSummaryJobStatusNote(status: string | null | undefined): string {
  if (status === 'queued') return 'AI summary job は queued です。必要なら少し待ってから手動再読み込みしてください。';
  if (status === 'running') return 'AI summary job は running です。この画面では live update は行いません。';
  if (status === 'succeeded') return '最新 AI summary job は succeeded です。保存済み summary がある場合は下に表示されます。';
  if (status === 'failed') return '最新 AI summary job は failed です。自動 retry は行いません。必要な場合は下の手動生成ボタンで再試行してください。';
  return '最新 AI summary job はまだありません。';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function recordText(record: Record<string, unknown> | null, key: string): string {
  if (!record) return '-';
  const value = record[key];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '-';
}

function displayUnknown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '-';
  }
}

function parseStatusText(status: string | null | undefined): string {
  if (status === 'parsed') return '解析成功';
  if (status === 'failed') return '解析失敗';
  if (status === 'pending') return '解析待ち';
  return valueText(status);
}

function metricCard(label: string, value: string) {
  return (
    <div
      style={{
        border: '1px solid #e2e2e2',
        borderRadius: '8px',
        padding: '0.75rem',
        background: '#fafafa',
      }}
    >
      <div style={{ fontSize: '0.85rem', color: '#666' }}>{label}</div>
      <div style={{ marginTop: '0.3rem', fontSize: '1.05rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

type ParsedImportSummary = NonNullable<BacktestDetailData['latest_import']>['parsed_summary'];

function toNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value);
}

function formatDifference(
  target: number | null | undefined,
  base: number | null | undefined,
  suffix = '',
): string {
  const targetNum = toNumber(target);
  const baseNum = toNumber(base);
  if (targetNum === null || baseNum === null) return '-';
  const diff = targetNum - baseNum;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(2)}${suffix}`;
}

function buildComparisonRows(base: ParsedImportSummary, target: ParsedImportSummary) {
  if (!base || !target) return [];
  return [
    {
      label: '総取引数',
      base: formatNumber(base.totalTrades, 0),
      target: formatNumber(target.totalTrades, 0),
      diff: formatDifference(target.totalTrades, base.totalTrades),
    },
    {
      label: '勝率',
      base: formatPercent(base.winRate),
      target: formatPercent(target.winRate),
      diff: formatDifference(target.winRate, base.winRate, 'pt'),
    },
    {
      label: 'Profit Factor',
      base: formatNumber(base.profitFactor, 2),
      target: formatNumber(target.profitFactor, 2),
      diff: formatDifference(target.profitFactor, base.profitFactor),
    },
    {
      label: '最大ドローダウン',
      base: formatNumber(base.maxDrawdown, 2),
      target: formatNumber(target.maxDrawdown, 2),
      diff: formatDifference(target.maxDrawdown, base.maxDrawdown),
    },
    {
      label: '純利益',
      base: formatNumber(base.netProfit, 2),
      target: formatNumber(target.netProfit, 2),
      diff: formatDifference(target.netProfit, base.netProfit),
    },
  ];
}

function normalizeBacktestsReturnPath(decodedPath: string): string | null {
  const trimmed = decodedPath.trim();
  if (!trimmed.startsWith('/')) return null;

  const [pathPart, queryPart = ''] = trimmed.split('?', 2);
  if (pathPart !== '/backtests') return null;

  const params = new URLSearchParams(queryPart);
  const normalized = new URLSearchParams();

  const q = (params.get('q') ?? '').trim();
  if (q) normalized.set('q', q);
  const status = (params.get('status') ?? '').trim();
  if (status) normalized.set('status', status);

  const rawPage = params.get('page');
  if (rawPage !== null) {
    const page = Number(rawPage);
    if (Number.isInteger(page) && page > 0) {
      normalized.set('page', String(page));
    }
  }
  const sort = (params.get('sort') ?? '').trim();
  if (sort === 'updated_at') {
    normalized.set('sort', sort);
  }
  const order = (params.get('order') ?? '').trim().toLowerCase();
  if (order === 'asc') {
    normalized.set('order', order);
  }

  const query = normalized.toString();
  return query ? `/backtests?${query}` : '/backtests';
}

export function parseBacktestsReturnPath(locationPath: string): string | null {
  const search = locationPath.includes('?') ? locationPath.slice(locationPath.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  const encodedReturn = params.get('return');
  if (!encodedReturn) return null;

  let decodedReturn = '';
  try {
    decodedReturn = decodeURIComponent(encodedReturn);
  } catch {
    return null;
  }

  return normalizeBacktestsReturnPath(decodedReturn);
}

function parseBacktestComparisonId(locationPath: string): string | null {
  const search = locationPath.includes('?') ? locationPath.slice(locationPath.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  const comparisonId = (params.get('comparisonId') ?? '').trim();
  if (!comparisonId) return null;
  return comparisonId;
}

export function buildBacktestRuleLabVersionsPath(strategyId: string): string {
  const params = new URLSearchParams();
  params.set('sort', 'updated_at');
  params.set('order', 'desc');
  params.set('page', '1');
  return `/strategies/${strategyId}/versions?${params.toString()}`;
}

export function buildBacktestRuleLabVersionDetailPath(strategyId: string, strategyVersionId: string): string {
  const returnPath = buildBacktestRuleLabVersionsPath(strategyId);
  return `/strategy-versions/${strategyVersionId}?return=${encodeURIComponent(returnPath)}`;
}

type SymbolStrategyApplicationBacklink = NonNullable<BacktestDetailData['symbol_strategy_application']>;
type RelatedApplicationReport = NonNullable<SymbolStrategyApplicationBacklink['related_reports']>[number];
type ApplicationReportMetrics = NonNullable<SymbolStrategyApplicationBacklink['current_report']>['metrics'];

function BacklinkInfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: '0.75rem', border: '1px solid #e6e6e6', borderRadius: '6px', background: '#fafafa' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>{title}</div>
      {children}
    </div>
  );
}

function BacklinkActions({ symbolStrategyApplication }: { symbolStrategyApplication: SymbolStrategyApplicationBacklink }) {
  return (
    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
      <Link href={`/symbols/${symbolStrategyApplication.symbol.id}`} style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}>
        SymbolDetail に戻る
      </Link>
      <Link href={`/strategies/${symbolStrategyApplication.strategy.id}`} style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}>
        StrategyDetail に戻る
      </Link>
      <Link href={`/strategy-versions/${symbolStrategyApplication.strategy_version.id}`} style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}>
        StrategyVersionDetail に戻る
      </Link>
    </div>
  );
}

function RelatedApplicationReports({ relatedReports }: { relatedReports: NonNullable<SymbolStrategyApplicationBacklink['related_reports']> }) {
  if (relatedReports.length === 0) return null;

  return (
    <div style={{ marginTop: '1rem' }}>
      <h3 style={{ margin: '0 0 0.5rem' }}>同じ application の関連レポート</h3>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {relatedReports.map((report) => (
          <div key={report.backtest_id} style={{ padding: '0.75rem', border: '1px solid #e6e6e6', borderRadius: '6px', background: '#fafafa' }}>
            <Link href={`/backtests/${report.backtest_id}`} style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}>
              {report.title}
            </Link>
            <KeyValueList className="mt-2 gap-1 text-sm">
              <KeyValueRow label="report type">{reportOriginLabel(report.execution_source)}</KeyValueRow>
              <KeyValueRow label="source"><code>{report.execution_source}</code></KeyValueRow>
              <KeyValueRow label="status"><StatusBadge status={report.status} /></KeyValueRow>
              <KeyValueRow label="run type"><code>{report.run_type}</code></KeyValueRow>
              <KeyValueRow label="run status"><StatusBadge status={report.run_status} /></KeyValueRow>
              <KeyValueRow label="AI summary"><StatusBadge status={(report.ai_review ?? UNAVAILABLE_AI_REVIEW).status} /></KeyValueRow>
              <KeyValueRow label="updated">{formatDateTime(report.updated_at)}</KeyValueRow>
            </KeyValueList>
          </div>
        ))}
      </div>
    </div>
  );
}

type ReportWithAiReview = NonNullable<SymbolStrategyApplicationBacklink['current_report']> | RelatedApplicationReport;

function reportAiSummaryExcerpt(body: string | null): string {
  if (!body) return '';
  const normalized = body.replace(/\s+/g, ' ').trim();
  return normalized.length > 420 ? `${normalized.slice(0, 420)}...` : normalized;
}

function ReportAiSummaryCard({ title, report }: { title: string; report: ReportWithAiReview }) {
  const aiReview = report.ai_review ?? UNAVAILABLE_AI_REVIEW;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-1 text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-sm font-semibold text-sky-700">{report.title}</div>
      <KeyValueList className="mt-2 gap-1 text-sm">
        <KeyValueRow label="report type">{reportOriginLabel(report.execution_source)}</KeyValueRow>
        <KeyValueRow label="source"><code>{report.execution_source}</code></KeyValueRow>
        <KeyValueRow label="AI summary"><StatusBadge status={aiReview.status} /></KeyValueRow>
        <KeyValueRow label="generated">{formatDateTime(aiReview.generated_at)}</KeyValueRow>
      </KeyValueList>
      {aiReview.status === 'available' ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
          {aiReview.title ? (
            <div className="mb-1 font-semibold text-slate-900">{aiReview.title}</div>
          ) : null}
          <div>{reportAiSummaryExcerpt(aiReview.body_markdown)}</div>
        </div>
      ) : (
        <p className="mt-3 mb-0 text-sm text-slate-600">
          保存済み AI summary はまだ表示できません。自動生成が未完了、queued / running 中、または failed の可能性があります。
        </p>
      )}
    </div>
  );
}

function ApplicationReportAiSummaryComparison({
  currentReport,
  relatedReports,
}: {
  currentReport: SymbolStrategyApplicationBacklink['current_report'];
  relatedReports: NonNullable<SymbolStrategyApplicationBacklink['related_reports']>;
}) {
  const relatedReport =
    relatedReports.find((report) => (report.ai_review ?? UNAVAILABLE_AI_REVIEW).status === 'available')
    ?? relatedReports[0]
    ?? null;
  if (!currentReport || !relatedReport) return null;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-base font-semibold text-slate-900">AI summary 横並び確認</h3>
      <InlineNotice tone="info" className="mb-3">
        同じ application 配下の current report と related report の保存済み AI summary を read-only に並べます。
        CSV import report は BacktestImport parsed summary / comparison diff、internal backtest report は result_summary / artifact_pointer を主な input とします。
        ここでは新規生成、自動比較生成、polling、artifact diff は行いません。
      </InlineNotice>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        <ReportAiSummaryCard title="current report AI summary" report={currentReport} />
        <ReportAiSummaryCard title="related report AI summary" report={relatedReport} />
      </div>
    </div>
  );
}

const METRIC_COMPARISON_ROWS: Array<{ key: keyof ApplicationReportMetrics; label: string }> = [
  { key: 'period_from', label: 'period from' },
  { key: 'period_to', label: 'period to' },
  { key: 'trade_count', label: 'trade_count' },
  { key: 'total_return_percent', label: 'total_return_percent' },
  { key: 'price_change_percent', label: 'price_change_percent' },
  { key: 'max_drawdown_percent', label: 'max_drawdown_percent' },
  { key: 'profit_factor', label: 'profit_factor' },
  { key: 'win_rate', label: 'win_rate' },
];

function ReportMetricCard({
  title,
  report,
}: {
  title: string;
  report: NonNullable<SymbolStrategyApplicationBacklink['current_report']> | RelatedApplicationReport;
}) {
  const metrics = report.metrics;
  return (
    <div style={{ padding: '0.75rem', border: '1px solid #e6e6e6', borderRadius: '6px', background: '#fafafa' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{title}</div>
      <Link href={`/backtests/${report.backtest_id}`} style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}>
        {report.title}
      </Link>
      <KeyValueList className="mt-2 gap-1 text-sm">
        <KeyValueRow label="report type">{reportOriginLabel(report.execution_source)}</KeyValueRow>
        <KeyValueRow label="source"><code>{report.execution_source}</code></KeyValueRow>
        <KeyValueRow label="metrics root">{reportMetricsRootLabel(report.execution_source)}</KeyValueRow>
        <KeyValueRow label="status"><StatusBadge status={report.status} /></KeyValueRow>
        {METRIC_COMPARISON_ROWS.map((row) => (
          <KeyValueRow key={row.key} label={row.label}>{valueText(metrics?.[row.key])}</KeyValueRow>
        ))}
        <KeyValueRow label="updated">{formatDateTime(report.updated_at)}</KeyValueRow>
      </KeyValueList>
    </div>
  );
}

function ApplicationReportMetricsComparison({
  currentReport,
  relatedReports,
}: {
  currentReport: SymbolStrategyApplicationBacklink['current_report'];
  relatedReports: NonNullable<SymbolStrategyApplicationBacklink['related_reports']>;
}) {
  const relatedReport = relatedReports.find((report) => report.metrics) ?? null;
  if (!currentReport || !relatedReport) return null;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-base font-semibold text-slate-900">metrics 横並び比較</h3>
      <InlineNotice tone="info" className="mb-3">
        同じ application 配下の current report と related report を、既存 response で取得できる主要 metrics だけで比較します。
        CSV import report は BacktestImport parsed summary、internal backtest report は strategySnapshotJson.result_summary 由来です。
        `-` は取得元に該当 metric がないことを示します。
      </InlineNotice>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <ReportMetricCard title="current report" report={currentReport} />
        <ReportMetricCard title="related report" report={relatedReport} />
      </div>
    </div>
  );
}

function SymbolStrategyApplicationBacklinkSection({
  symbolStrategyApplication,
}: {
  symbolStrategyApplication: SymbolStrategyApplicationBacklink;
}) {
  return (
    <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
      <h2 style={{ marginTop: 0 }}>銘柄起点の適用情報</h2>
      <p style={{ marginTop: 0, color: '#666', fontSize: '0.92rem' }}>
        この検証レポートは、保存済み Symbol Strategy Application の run から作成されています。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
        <BacklinkInfoCard title="Application">
          <KeyValueList>
            <KeyValueRow label="application ID"><code>{symbolStrategyApplication.application_id}</code></KeyValueRow>
            <KeyValueRow label="status"><StatusBadge status={symbolStrategyApplication.application_status} /></KeyValueRow>
            <KeyValueRow label="source"><code>{symbolStrategyApplication.application_source}</code></KeyValueRow>
            <KeyValueRow label="updated">{formatDateTime(symbolStrategyApplication.application_updated_at)}</KeyValueRow>
            {symbolStrategyApplication.application_memo ? (
              <KeyValueRow label="memo">{symbolStrategyApplication.application_memo}</KeyValueRow>
            ) : null}
          </KeyValueList>
        </BacklinkInfoCard>
        <BacklinkInfoCard title="Application Run">
          <KeyValueList>
            <KeyValueRow label="run ID"><code>{symbolStrategyApplication.run_id}</code></KeyValueRow>
            <KeyValueRow label="run type"><code>{symbolStrategyApplication.run_type}</code></KeyValueRow>
            <KeyValueRow label="run status"><StatusBadge status={symbolStrategyApplication.run_status} /></KeyValueRow>
            <KeyValueRow label="updated">{formatDateTime(symbolStrategyApplication.run_updated_at)}</KeyValueRow>
          </KeyValueList>
        </BacklinkInfoCard>
        <BacklinkInfoCard title="Symbol">
          <KeyValueList>
            <KeyValueRow label="display">{symbolStrategyApplication.symbol.display_name ?? symbolStrategyApplication.symbol.symbol_code ?? symbolStrategyApplication.symbol.symbol}</KeyValueRow>
            <KeyValueRow label="symbol"><code>{symbolStrategyApplication.symbol.symbol}</code></KeyValueRow>
            <KeyValueRow label="symbol_code"><code>{symbolStrategyApplication.symbol.symbol_code ?? '-'}</code></KeyValueRow>
            <KeyValueRow label="market_code"><code>{symbolStrategyApplication.symbol.market_code ?? '-'}</code></KeyValueRow>
          </KeyValueList>
        </BacklinkInfoCard>
        <BacklinkInfoCard title="Strategy">
          <KeyValueList>
            <KeyValueRow label="title">{symbolStrategyApplication.strategy.title}</KeyValueRow>
            <KeyValueRow label="strategy ID"><code>{symbolStrategyApplication.strategy.id}</code></KeyValueRow>
            <KeyValueRow label="version ID"><code>{symbolStrategyApplication.strategy_version.id}</code></KeyValueRow>
            <KeyValueRow label="market / timeframe">
              {symbolStrategyApplication.strategy_version.market} / {symbolStrategyApplication.strategy_version.timeframe}
            </KeyValueRow>
          </KeyValueList>
        </BacklinkInfoCard>
      </div>
      <BacklinkActions symbolStrategyApplication={symbolStrategyApplication} />
      <RelatedApplicationReports relatedReports={symbolStrategyApplication.related_reports ?? []} />
      <ApplicationReportMetricsComparison
        currentReport={symbolStrategyApplication.current_report}
        relatedReports={symbolStrategyApplication.related_reports ?? []}
      />
      <ApplicationReportAiSummaryComparison
        currentReport={symbolStrategyApplication.current_report}
        relatedReports={symbolStrategyApplication.related_reports ?? []}
      />
      <p style={{ marginBottom: 0, marginTop: '0.6rem', color: '#666', fontSize: '0.9rem' }}>
        BacktestDetail は検証レポート詳細として維持し、application parent への backlink だけを表示します。
      </p>
    </section>
  );
}

type BacktestStrategySnapshot = NonNullable<BacktestDetailData['used_strategy']['snapshot']>;

const ARTIFACT_PRIMARY_KEYS = [
  'kind',
  'type',
  'execution_id',
  'path',
  'source',
  'summary_mode',
  'generated_at',
  'created_at',
] as const;

function isArtifactPathKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return normalizedKey === 'path' || normalizedKey === 'file_path' || normalizedKey === 'absolute_path' || normalizedKey.endsWith('_path');
}

function displayArtifactMetadataValue(key: string, value: unknown): string {
  if (isArtifactPathKey(key) && typeof value === 'string' && value.trim() !== '') {
    return '非表示（artifact path）';
  }
  return displayUnknown(value);
}

function sanitizeArtifactMetadataForDisplay(value: unknown, key = ''): unknown {
  if (isArtifactPathKey(key) && typeof value === 'string' && value.trim() !== '') {
    return '非表示（artifact path）';
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeArtifactMetadataForDisplay(item));
  }
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeArtifactMetadataForDisplay(entryValue, entryKey),
    ]),
  );
}

function buildArtifactRows(
  artifactPointer: Record<string, unknown> | null,
  resultSummary: Record<string, unknown> | null,
) {
  if (!artifactPointer) return [];
  const rows = ARTIFACT_PRIMARY_KEYS.map((key) => {
    if (key === 'summary_mode') {
      return {
        key,
        value: displayUnknown(artifactPointer.summary_mode ?? resultSummary?.summary_kind),
      };
    }
    return {
      key,
      value: displayArtifactMetadataValue(key, artifactPointer[key]),
    };
  }).filter((row) => row.value !== '-');

  const known = new Set<string>(ARTIFACT_PRIMARY_KEYS);
  const extraRows = Object.entries(artifactPointer)
    .filter(([key, value]) => !known.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    .map(([key, value]) => ({ key, value: displayArtifactMetadataValue(key, value) }));

  return [...rows, ...extraRows];
}

function ArtifactPointerPanel({
  artifactPointer,
  resultSummary,
}: {
  artifactPointer: Record<string, unknown> | null;
  resultSummary: Record<string, unknown> | null;
}) {
  const artifactRows = buildArtifactRows(artifactPointer, resultSummary);
  const sanitizedArtifactPointer = sanitizeArtifactMetadataForDisplay(artifactPointer);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <strong className="text-sm text-slate-900">artifact_pointer</strong>
      <InlineNotice tone="info" className="my-3">
        internal backtest の artifact pointer を metadata として表示します。artifact path は非表示化し、artifact file の実体読込、download、diff は行いません。
      </InlineNotice>
      {!artifactPointer ? (
        <p className="m-0 text-sm text-slate-600">artifact metadata は未生成、または strategy snapshot に保存されていません。</p>
      ) : (
        <>
          {artifactRows.length > 0 ? (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
              {artifactRows.map((row) => (
                <div
                  key={row.key}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="text-xs text-slate-500">{row.key}</div>
                  <div className="mt-1 break-words text-base font-semibold text-slate-900">
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 text-sm text-slate-600">表示できる代表 field はありません。raw JSON を確認してください。</p>
          )}
          <p className="mb-0 mt-3 text-sm text-slate-600">
            raw artifact JSON は保存済み pointer metadata の確認用です。path 系 metadata は非表示化し、file 内容の読み込み、download、JSON diff は後続判断です。
          </p>
          <JsonBlock value={sanitizedArtifactPointer} title="raw artifact JSON" className="mt-3" />
        </>
      )}
    </div>
  );
}

function InternalBacktestReportSection({ snapshot }: { snapshot: BacktestStrategySnapshot | null }) {
  const resultSummary = asRecord(snapshot?.result_summary ?? null);
  const period = asRecord(resultSummary?.period ?? null);
  const metrics = asRecord(resultSummary?.metrics ?? null);
  const artifactPointer = asRecord(snapshot?.artifact_pointer ?? null);

  return (
    <SectionCard
      title="internal backtest report"
      description="この report は internal backtest result から作成されています。internal_backtest report では BacktestImport は作成されません。"
      className="mt-4"
    >
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        {metricCard('execution_id', valueText(snapshot?.internal_backtest_execution_id))}
        {metricCard('summary_kind', recordText(resultSummary, 'summary_kind'))}
        {metricCard('period from', recordText(period, 'from'))}
        {metricCard('period to', recordText(period, 'to'))}
        {metricCard('bar_count', recordText(metrics, 'bar_count'))}
        {metricCard('price_change_percent', recordText(metrics, 'price_change_percent'))}
        {metricCard('range_percent', recordText(metrics, 'range_percent'))}
        {metricCard('reported_at', formatDateTime(snapshot?.reported_at))}
      </div>
      {resultSummary ? null : (
        <p className="mb-0 mt-3 text-sm text-slate-600">
          result_summary は strategy snapshot に保存されていません。
        </p>
      )}
      <ArtifactPointerPanel artifactPointer={artifactPointer} resultSummary={resultSummary} />
    </SectionCard>
  );
}

export default function BacktestDetail({ params }: BacktestDetailProps) {
  const { backtestId } = params;
  const [location] = useLocation();
  const { data, error, isLoading, mutate } = useSWR<BacktestDetailData>(`/api/backtests/${backtestId}`, swrFetcher);
  const [selectedComparisonImportId, setSelectedComparisonImportId] = useState<string>('');
  const [isSavingComparison, setIsSavingComparison] = useState(false);
  const [saveComparisonError, setSaveComparisonError] = useState<string | null>(null);
  const [savedComparisonId, setSavedComparisonId] = useState<string | null>(null);
  const [isGeneratingAiReview, setIsGeneratingAiReview] = useState(false);
  const [generateAiReviewError, setGenerateAiReviewError] = useState<string | null>(null);
  const returnPath = parseBacktestsReturnPath(location) ?? '/backtests';
  const comparisonIdFromQuery = parseBacktestComparisonId(location);
  const effectiveComparisonId = savedComparisonId ?? comparisonIdFromQuery;
  const comparisonApiPath = effectiveComparisonId ? `/api/backtest-comparisons/${effectiveComparisonId}` : null;
  const {
    data: savedComparisonData,
    error: savedComparisonError,
    mutate: mutateSavedComparison,
    isLoading: isSavedComparisonLoading,
  } = useSWR<BacktestComparisonData>(comparisonApiPath, swrFetcher);

  if (isLoading) {
    return (
      <div style={{ padding: '2rem' }}>
        <LoadingState title="読み込み中..." />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: '2rem' }}>
        <ErrorState title={`エラー: ${error.message}`} />
      </div>
    );
  }
  if (!data) return null;

  const latestImport = data.latest_import;
  const latestStatus = parseStatusText(latestImport?.parse_status);
  const summary = latestImport?.parsed_summary;
  const parsedImports = data.imports.filter((item) => item.parsed_summary);
  const parsedImportCount = data.imports.filter((item) => item.parse_status === 'parsed').length;
  const failedImportCount = data.imports.filter((item) => item.parse_status === 'failed').length;
  const baseImport = parsedImports[0] ?? null;
  const comparisonCandidates = parsedImports.filter((item) => item.id !== baseImport?.id);
  const effectiveComparisonImportId = selectedComparisonImportId || comparisonCandidates[0]?.id || null;
  const targetImport = effectiveComparisonImportId
    ? comparisonCandidates.find((item) => item.id === effectiveComparisonImportId) ?? null
    : null;
  const comparisonRows = baseImport?.parsed_summary && targetImport?.parsed_summary
    ? buildComparisonRows(baseImport.parsed_summary, targetImport.parsed_summary)
    : [];
  const usedStrategy = data.used_strategy;
  const snapshot = usedStrategy.snapshot;
  const isInternalBacktestReport =
    data.backtest.execution_source === 'internal_backtest' || snapshot?.execution_source === 'internal_backtest';
  const latestAiSummaryJob = data.latest_ai_summary_job ?? null;
  const symbolStrategyApplication = data.symbol_strategy_application;
  const strategyVersionsPath = usedStrategy.strategy_id ? buildBacktestRuleLabVersionsPath(usedStrategy.strategy_id) : null;
  const strategyVersionDetailPath =
    usedStrategy.strategy_id && usedStrategy.strategy_version_id
      ? buildBacktestRuleLabVersionDetailPath(usedStrategy.strategy_id, usedStrategy.strategy_version_id)
      : null;

  const onSaveComparison = async () => {
    if (!baseImport?.id || !targetImport?.id) return;
    setIsSavingComparison(true);
    setSaveComparisonError(null);
    try {
      const response = await postApi<BacktestComparisonData>('/api/backtest-comparisons', {
        base_import_id: baseImport.id,
        target_import_id: targetImport.id,
        include_ai_summary: true,
      });
      setSavedComparisonId(response.comparison.comparison_id);
      await mutateSavedComparison(response, { revalidate: false });
    } catch (error: any) {
      setSaveComparisonError(error?.message ?? '比較結果の保存に失敗しました。');
    } finally {
      setIsSavingComparison(false);
    }
  };

  const onGenerateAiReview = async () => {
    setIsGeneratingAiReview(true);
    setGenerateAiReviewError(null);
    try {
      await postApi(`/api/backtests/${backtestId}/summary/generate`, {});
      await mutate();
    } catch (error: any) {
      setGenerateAiReviewError(error?.message ?? 'AI総評の生成に失敗しました。');
    } finally {
      setIsGeneratingAiReview(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホームへ戻る</Link>
        <Link href='/strategy-lab' style={{ color: '#666', textDecoration: 'none' }}>ルール検証ラボへ戻る</Link>
        <Link href={returnPath} style={{ color: '#666', textDecoration: 'none' }}>履歴一覧へ</Link>
      </div>

      <h1>検証レポート（詳細）</h1>
      <p style={{ marginTop: '-0.35rem', marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
        まず「基本情報 / 主指標」を確認し、次に「AI 総評」と「import 履歴」を確認してください。
      </p>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>基本情報</h2>
        <KeyValueList>
          <KeyValueRow label="backtest ID"><code>{data.backtest.id}</code></KeyValueRow>
          <KeyValueRow label="strategy version"><code>{data.backtest.strategy_version_id}</code></KeyValueRow>
          <KeyValueRow label="実行名">{data.backtest.title}</KeyValueRow>
          <KeyValueRow label="実行ソース">{data.backtest.execution_source}</KeyValueRow>
          <KeyValueRow label="市場">{data.backtest.market}</KeyValueRow>
          <KeyValueRow label="時間軸">{data.backtest.timeframe}</KeyValueRow>
          <KeyValueRow label="状態"><StatusBadge status={data.backtest.status} /></KeyValueRow>
        </KeyValueList>
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>使用した Strategy</h2>
        <div><strong>Strategy ID:</strong> <code>{usedStrategy.strategy_id ?? '-'}</code></div>
        <div><strong>Strategy Version ID:</strong> <code>{usedStrategy.strategy_version_id ?? '-'}</code></div>
        {snapshot ? (
          <>
            <div><strong>市場:</strong> {snapshot.market}</div>
            <div><strong>時間軸:</strong> {snapshot.timeframe}</div>
            <div><strong>snapshot captured at:</strong> {snapshot.captured_at ?? '-'}</div>
            <div style={{ marginTop: '0.6rem' }}>
              <strong>実行時ルール（自然言語）</strong>
              <pre style={{ margin: '0.4rem 0 0', padding: '0.8rem', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                <code>{snapshot.natural_language_rule}</code>
              </pre>
            </div>
            <div style={{ marginTop: '0.6rem' }}>
              <strong>実行時 Pine:</strong>
              {snapshot.generated_pine ? (
                <pre style={{ margin: '0.4rem 0 0', padding: '0.8rem', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                  <code>{snapshot.generated_pine}</code>
                </pre>
              ) : (
                <div style={{ marginTop: '0.4rem', color: '#666' }}>-</div>
              )}
            </div>
          </>
        ) : (
          <p style={{ marginBottom: 0, color: '#666' }}>実行時 strategy snapshot はありません。</p>
        )}

        <div style={{ marginTop: '0.8rem', padding: '0.75rem', border: '1px solid #e6e6e6', borderRadius: '6px', background: '#fafafa' }}>
          <div style={{ fontWeight: 600 }}>次アクション（Rule Lab）</div>
          <div style={{ marginTop: '0.35rem', color: '#555', fontSize: '0.92rem' }}>
            この backtest の元になった version の確認・再生成へ戻れます。
          </div>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
            {strategyVersionDetailPath && (
              <Link href={strategyVersionDetailPath} style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}>
                この version を Rule Lab で確認
              </Link>
            )}
            {strategyVersionsPath && (
              <Link href={strategyVersionsPath} style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}>
                同一 Strategy の version 一覧を見る
              </Link>
            )}
          </div>
        </div>
      </section>

      {symbolStrategyApplication ? (
        <SymbolStrategyApplicationBacklinkSection symbolStrategyApplication={symbolStrategyApplication} />
      ) : null}

      {isInternalBacktestReport ? <InternalBacktestReportSection snapshot={snapshot} /> : null}

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>取込状態</h2>
        {!latestImport ? (
          <EmptyState title="取込データはまだありません。">
            {isInternalBacktestReport ? (
              <p style={{ marginTop: 0 }}>internal_backtest report のため BacktestImport は作成されません。</p>
            ) : null}
            <p style={{ marginBottom: 0 }}>`/strategy-lab` で backtest を作成し、CSV を取り込んでください。</p>
          </EmptyState>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div><strong>最新 import ID:</strong> <code>{latestImport.id}</code></div>
              <StatusBadge status={latestImport.parse_status}>{latestStatus}</StatusBadge>
            </div>

            <div style={{ marginTop: '0.8rem', fontSize: '0.95rem', color: '#444' }}>
              <div><strong>解析成功済みの取込:</strong> {parsedImportCount} 件</div>
              {failedImportCount > 0 && (
                <div style={{ marginTop: '0.2rem' }}><strong>失敗した取込:</strong> {failedImportCount} 件</div>
              )}
            </div>

            {latestImport.parse_status === 'failed' && parsedImportCount > 0 && (
              <div
                style={{
                  marginTop: '0.8rem',
                  padding: '0.75rem',
                  background: '#fff8e6',
                  border: '1px solid #f2db94',
                  borderRadius: '6px',
                  color: '#8a6d3b',
                  fontSize: '0.9rem',
                }}
              >
                <strong>💡 補足:</strong> 最新のCSV取込は失敗しましたが、過去に解析成功した取込結果があります。主要指標や比較・AI総評では解析済みデータを確認できます。
              </div>
            )}

            {latestImport.parse_error && (
              <div
                style={{
                  marginTop: '0.8rem',
                  color: '#a10000',
                  background: '#fff3f3',
                  border: '1px solid #f1b4b4',
                  borderRadius: '6px',
                  padding: '0.75rem',
                }}
              >
                <strong>解析エラー:</strong> {latestImport.parse_error}
              </div>
            )}
          </>
        )}
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>主要指標</h2>
        {!summary ? (
          <EmptyState title="解析済みサマリーはまだありません。" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {metricCard('総取引数', formatNumber(summary.totalTrades, 0))}
            {metricCard('勝率', formatPercent(summary.winRate))}
            {metricCard('Profit Factor', formatNumber(summary.profitFactor, 2))}
            {metricCard('最大ドローダウン', formatNumber(summary.maxDrawdown, 2))}
            {metricCard('純利益', formatNumber(summary.netProfit, 2))}
            {metricCard('対象期間（開始）', valueText(summary.periodFrom))}
            {metricCard('対象期間（終了）', valueText(summary.periodTo))}
          </div>
        )}
      </section>

      <SectionCard
        title="バックテスト比較 inline"
        description="比較元 run と比較対象 run の parsed summary を同一画面で確認できます（read-only）。"
        className="mt-4"
      >
        {!baseImport || comparisonCandidates.length === 0 ? (
          <p style={{ margin: 0, color: '#666' }}>
            比較可能な run が不足しています。解析済み import が2件以上あると比較できます。
          </p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div>
                <div style={{ fontSize: '0.82rem', color: '#666' }}>比較元 run</div>
                <div><code>{baseImport.id}</code></div>
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', color: '#666' }}>比較対象 run</div>
                <select
                  aria-label='比較対象 run'
                  value={effectiveComparisonImportId ?? ''}
                  onChange={(event) => setSelectedComparisonImportId(event.target.value)}
                  style={{ minWidth: '220px', padding: '0.35rem' }}
                >
                  {comparisonCandidates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!targetImport ? (
              <p style={{ margin: 0, color: '#666' }}>比較対象 run を選択してください。</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <Button
                    onClick={onSaveComparison}
                    disabled={isSavingComparison}
                  >
                    {isSavingComparison ? '比較保存中...' : 'この2件で比較を保存する'}
                  </Button>
                  {effectiveComparisonId && (
                    <TextLink href={`/backtest-comparisons/${effectiveComparisonId}`}>
                      保存済み比較を見る
                    </TextLink>
                  )}
                </div>
                {saveComparisonError && (
                  <InlineNotice tone="danger" className="mb-3">{saveComparisonError}</InlineNotice>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                        <th style={{ padding: '0.5rem' }}>指標</th>
                        <th style={{ padding: '0.5rem' }}>比較元</th>
                        <th style={{ padding: '0.5rem' }}>比較対象</th>
                        <th style={{ padding: '0.5rem' }}>差分（対象-元）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((row) => (
                        <tr key={row.label} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem' }}>{row.label}</td>
                          <td style={{ padding: '0.5rem' }}>{row.base}</td>
                          <td style={{ padding: '0.5rem' }}>{row.target}</td>
                          <td style={{ padding: '0.5rem' }}>{row.diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {effectiveComparisonId && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      border: '1px solid #e6e6e6',
                      borderRadius: '6px',
                      background: '#fafafa',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>保存済み比較（要約）</div>
                    {isSavedComparisonLoading ? (
                      <LoadingState title="保存済み比較を読み込み中..." />
                    ) : savedComparisonError ? (
                      <div style={{ color: '#a10000' }}>保存済み比較の取得に失敗しました: {savedComparisonError.message}</div>
                    ) : savedComparisonData ? (
                      <>
                        <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                          比較ID: <code>{savedComparisonData.comparison.comparison_id}</code>
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            padding: '0.6rem',
                            background: '#fff',
                            border: '1px solid #e6e6e6',
                            borderRadius: '4px',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {savedComparisonData.comparison.tradeoff_summary}
                        </pre>
                        <div style={{ marginTop: '0.5rem', color: '#555', whiteSpace: 'pre-wrap' }}>
                          {savedComparisonData.comparison.ai_summary ?? 'AI比較総評は未保存です。'}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: '#666' }}>保存済み比較はまだありません。</div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </SectionCard>

      <SectionCard title="AI 総評" className="mt-4">
        <InlineNotice tone="info" className="mb-3 space-y-1">
          <p>{aiReviewInputDescription(isInternalBacktestReport)}</p>
          <p>{aiReviewAutoEnqueueDescription(isInternalBacktestReport)}</p>
          <p>
            この画面は polling / live update を行いません。job 状態は手動再読み込み時点の read-only 表示です。
          </p>
        </InlineNotice>
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="mb-2 font-semibold text-slate-900">latest AI summary job</div>
          {latestAiSummaryJob ? (
            <>
              <KeyValueList className="gap-x-4 gap-y-1 sm:grid-cols-2">
                <KeyValueRow label="status"><StatusBadge status={latestAiSummaryJob.status} /></KeyValueRow>
                <KeyValueRow label="trigger">{aiSummaryJobTriggerLabel(latestAiSummaryJob.trigger)}</KeyValueRow>
                <KeyValueRow label="created">{formatDateTime(latestAiSummaryJob.created_at)}</KeyValueRow>
                <KeyValueRow label="completed">{formatDateTime(latestAiSummaryJob.completed_at)}</KeyValueRow>
              </KeyValueList>
              <p className="mb-0 mt-2 text-slate-600">{aiSummaryJobStatusNote(latestAiSummaryJob.status)}</p>
              {latestAiSummaryJob.status === 'failed' ? (
                <p className="mb-0 mt-2 text-slate-600">
                  失敗理由は provider error の詳細を出しすぎない範囲で扱います。必要なら手動生成で retry してください。
                </p>
              ) : null}
            </>
          ) : (
            <p className="mb-0 text-slate-600">{aiSummaryJobStatusNote(null)}</p>
          )}
        </div>
        {data.ai_review.status === 'available' ? (
          <>
            {data.ai_review.title && (
              <div className="mb-2 font-semibold text-slate-900">{data.ai_review.title}</div>
            )}
            {data.ai_review.generated_at && (
              <div className="mb-3 text-sm text-slate-600">
                生成日時: {data.ai_review.generated_at}
              </div>
            )}
            <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 leading-7 text-slate-800">
              {data.ai_review.body_markdown}
            </div>
          </>
        ) : (
          <EmptyState title="AI総評は未生成です。">
            <p style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              AI総評はまだ表示可能な summary として保存されていません。自動生成が未完了、queued / running 中、または provider failure により failed job として残っている可能性があります。
            </p>
            <p style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              failed の場合も、既存の「AI総評を生成」から手動生成 / 再生成に進めます。failed job auto retry、表示起点 enqueue、polling は行いません。
            </p>
            <Button
              onClick={onGenerateAiReview}
              disabled={isGeneratingAiReview}
            >
              {isGeneratingAiReview ? '生成中...' : 'AI総評を生成'}
            </Button>
            {generateAiReviewError && (
              <InlineNotice tone="danger" className="mt-3">{generateAiReviewError}</InlineNotice>
            )}
          </EmptyState>
        )}
      </SectionCard>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>import 履歴</h2>
        {data.imports.length === 0 ? (
          <p style={{ margin: 0, color: '#666' }}>履歴はありません。</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1rem' }}>
            {data.imports.map((item) => (
              <li key={item.id} style={{ marginBottom: '0.4rem' }}>
                <code>{item.id}</code> / {item.file_name} / <StatusBadge status={item.parse_status}>{parseStatusText(item.parse_status)}</StatusBadge>
                {item.parse_error ? ` / エラー: ${item.parse_error}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
