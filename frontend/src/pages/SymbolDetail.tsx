import { type ChangeEvent, type FormEvent, type ReactNode, useState } from 'react';
import useSWR from 'swr';
import { useRoute } from 'wouter';
import { patchApi, postApi, swrFetcher } from '../api/client';
import {
  StrategyListData,
  StrategyVersionListData,
  SymbolAiSummaryData,
  InvestmentCalendarData,
  InvestmentCalendarRefreshData,
  SymbolDetailData,
  SymbolReferenceRefreshData,
  SymbolStrategyApplicationCreateData,
  SymbolStrategyApplicationCsvImportData,
  SymbolStrategyApplicationItem,
  SymbolStrategyApplicationListData,
  SymbolStrategyApplicationMutateData,
} from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import InlineNotice from '../components/ui/InlineNotice';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import PaginationControls from '../components/ui/PaginationControls';
import SectionCard from '../components/ui/SectionCard';
import StatusBadge from '../components/ui/StatusBadge';
import Surface from '../components/ui/Surface';
import TextLink from '../components/ui/TextLink';
import InvestmentCalendarGrid, { formatProviderRefreshSummary } from '../components/investment-calendar/InvestmentCalendarGrid';

const LABELS = {
  compare: '比較画面に進む',
  code: 'コード',
  market: '市場',
  processingStatus: '処理状態',
  investmentCalendarTitle: '投資カレンダー',
  investmentCalendarDescription: 'この銘柄に関係する予定を確認します。取得元や更新タイミングにより差異があるため、重要日程は公式情報で確認してください。',
  refreshCalendar: 'カレンダーを更新',
  refreshingCalendar: '更新中...',
  calendarRefreshSuccess: '投資カレンダーを更新しました。追加 {saved} 件 / 更新 {updated} 件。',
  calendarRefreshError: '投資カレンダーを更新できませんでした。時間をおいて再実行してください。',
  noCalendarEvents: 'この銘柄の投資カレンダーはまだありません。手動更新で取得できる場合があります。',
  overviewTitle: '銘柄概要',
  snapshotUnavailable: '現在のスナップショットはまだありません。',
  latestAlertsTitle: '最新アラート',
  latestAiTitle: '最新AI論点カード',
  strategyResultsTitle: 'ストラテジー / 検証結果',
  strategyResultsIntro: 'この銘柄に適用したストラテジーと検証結果をここに集約します。',
  strategyResultsPending:
    '保存済み application から TradingView CSV取込へ進めます。内製バックテストの新規実行UIは閉じています。',
  savedApplicationsTitle: '保存済みストラテジー適用',
  savedApplicationsLoading: '保存済み application を読み込み中...',
  savedApplicationsError: '保存済み application を取得できませんでした。',
  noSavedApplications: '保存済み application はまだありません。',
  savedApplicationsStatusFilter: '状態',
  savedApplicationsStatusActive: 'active',
  savedApplicationsStatusArchived: 'archived',
  savedApplicationsStatusAll: 'all',
  savedApplicationsFilter: 'レポート',
  savedApplicationsFilterAll: 'すべて',
  savedApplicationsFilterWithReports: 'reportあり',
  savedApplicationsFilterWithoutReports: 'reportなし',
  savedApplicationsSourceFilter: 'source',
  savedApplicationsSourceAll: 'すべて',
  savedApplicationsSourceCsv: 'CSV',
  savedApplicationsRunTypeFilter: 'run',
  savedApplicationsRunStatusFilter: 'run status',
  savedApplicationsStrategyFilter: 'strategy',
  savedApplicationsVersionFilter: 'version',
  savedApplicationsStrategyPlaceholder: 'strategy id',
  savedApplicationsVersionPlaceholder: 'version id',
  savedApplicationsRunAll: 'すべて',
  savedApplicationsRunRunning: 'running',
  savedApplicationsRunSucceeded: 'succeeded',
  savedApplicationsRunFailed: 'failed',
  savedApplicationsSummary: '{status} application {shown} / {total} 件を表示中',
  savedApplicationsReportSummary: 'CSV report: {csv} / internal report: {internal}',
  noFilteredApplications: '条件に一致する application はありません。',
  latestRun: '最新run',
  latestBacktestReport: '最新検証レポート',
  verificationSummary: '検証サマリー',
  verificationHistoryNote: '詳細なrun / report履歴はApplicationDetail、個別レポートはBacktestDetailで確認します。',
  reportPair: 'CSV / internal reports',
  csvImportReport: 'CSV import report',
  internalBacktestReport: 'internal backtest report',
  noLatestRun: '最新run はまだありません。',
  noLatestBacktestReport: '最新検証レポートはまだありません。',
  runCount: 'run count',
  csvImport: 'CSV取込',
  csvImportTitle: 'TradingView CSVを取り込む',
  csvFile: 'CSVファイル',
  csvFileHelp: 'ファイルを選ぶとCSVテキスト欄に読み込みます。手入力も引き続き利用できます。',
  csvFileSelected: '選択中ファイル',
  csvFileReading: 'CSVファイルを読み込み中...',
  csvFileReadError: 'CSVファイルを読み込めませんでした。ファイルを確認するか、CSVテキスト欄へ貼り付けてください。',
  csvFileName: 'ファイル名',
  csvText: 'CSVテキスト',
  runCsvImport: 'CSV取込を実行',
  csvImporting: 'CSV取込中...',
  csvImportSuccess: 'CSV取込が完了しました。',
  csvImportRefreshFailed: 'CSV取込が完了しました。一覧の再読み込みに失敗したため、ページを再読み込みしてください。',
  csvImportParseFailed: '解析失敗',
  csvImportError: 'CSV取込に失敗しました。',
  openBacktestDetail: '検証レポートを開く',
  openApplicationRuns: 'run履歴を見る',
  openApplicationReports: 'report履歴を見る',
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
  strategySearch: 'strategy 検索',
  strategySearchPlaceholder: 'title を検索',
  strategySearchApply: '検索',
  strategySearchClear: 'クリア',
  strategyLimit: '表示件数',
  strategyResultSummary: 'strategy {shown} / {total} 件を表示中 (page {page})',
  strategyResultSummaryFiltered: 'strategy {shown} / {total} 件を表示中 (検索: {query}, page {page})',
  strategyPrevious: '前へ',
  strategyNext: '次へ',
  noFilteredStrategies: '条件に一致する active strategy はありません。',
  versionList: 'version 一覧',
  openStrategyDetail: 'StrategyDetail を開く',
  openStrategyVersionDetail: 'StrategyVersionDetail を開く',
  clearSelection: '選択解除',
  saveApplyPending: '適用を保存（準備中）',
  csvImportLater: 'CSV取込（後続）',
  openStrategyLab: 'ストラテジー作成を開く',
  openBacktestList: '検証レポート一覧を開く',
  researchNoteTitle: 'Research Note',
  referencesTitle: '関連参照情報',
  refreshReferences: '関連参照情報を再取得',
  refreshingReferences: '再取得中...',
  referencesRefreshRunning: '関連参照情報を再取得しています。完了後に一覧を再読み込みします。',
  referencesRefreshSuccess: '関連参照情報を再取得しました。追加 {saved} 件 / 重複 {skipped} 件。',
  referencesRefreshQueued: '関連参照情報の再取得はすでに実行中です。少し待ってからページを再読み込みしてください。',
  referencesRefreshError: '関連参照情報を再取得できませんでした。時間をおいて再実行してください。',
  currentPrice: '現在値',
  dayChange: '前日比',
  volume: '出来高',
  source: 'ソース',
  marketStatus: '市場状態',

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

function formatSymbolCalendarRefreshMessage(result: InvestmentCalendarRefreshData): string {
  const summary = formatProviderRefreshSummary(result);
  const zeroNote = result.saved_count === 0 && result.updated_count === 0
    ? 'この銘柄の対象期間には新しい予定がありませんでした。決算発表予定は、対象期間に該当銘柄がない場合 0 件になることがあります。'
    : '';
  const base = LABELS.calendarRefreshSuccess
    .replace('{saved}', String(result.saved_count))
    .replace('{updated}', String(result.updated_count));
  return `${base}${summary ? ` ${summary}` : ''}${zeroNote ? ` ${zeroNote}` : ''}`;
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
      if (!['news', 'disclosure', 'earnings'].includes(reference.reference_type ?? '')) acc.other += 1;
      return acc;
    },
    { news: 0, disclosure: 0, earnings: 0, other: 0 },
  );
}

function getReferenceTypeLabel(type: string | null | undefined): string {
  if (type === 'news') return 'ニュース';
  if (type === 'disclosure') return '適時開示';
  if (type === 'earnings') return '決算関連';
  return 'その他';
}

function getReferenceTypeBadgeClass(type: string | null | undefined): string {
  if (type === 'news') return 'bg-sky-100 text-sky-800';
  if (type === 'disclosure') return 'bg-amber-100 text-amber-800';
  if (type === 'earnings') return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-100 text-slate-700';
}

function getReferenceSourceLabel(sourceName: string | null | undefined, referenceType: string | null | undefined): string | null {
  if (!sourceName) return null;
  const normalized = sourceName.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'tdnet') return 'TDnet';
  if (normalized === 'edinet') return 'EDINET';
  if (normalized === 'jquants') return 'J-Quants';
  if (normalized === 'news') return 'ニュース';
  if (normalized === 'disclosure') return '適時開示';
  if (normalized === 'earnings') return '決算関連';
  return getReferenceTypeLabel(referenceType);
}

function getSafeExternalUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') return sourceUrl;
  } catch {
    return null;
  }
  return null;
}

function decodeReferenceEntities(value: string): string {
  const entityMap: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return entityMap[normalized] ?? match;
  });
}

function getReferenceDisplayText(value: string | null | undefined): string | null {
  if (!value) return null;
  const sanitized = decodeReferenceEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/[\r\n\t\u00a0]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized.length > 0 ? sanitized : null;
}

function normalizeReferenceTextForCompare(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim()
    .toLowerCase();
}

function shouldShowReferenceSummary(title: string | null | undefined, summaryText: string | null | undefined): boolean {
  const normalizedSummary = normalizeReferenceTextForCompare(summaryText);
  if (!normalizedSummary) return false;

  const normalizedTitle = normalizeReferenceTextForCompare(title);
  if (!normalizedTitle) return true;
  if (normalizedSummary === normalizedTitle) return false;
  if (normalizedTitle.includes(normalizedSummary)) return false;
  if (normalizedSummary.includes(normalizedTitle) && normalizedSummary.length <= normalizedTitle.length + 30) return false;
  return true;
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
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

function DetailSection({ title, description, actions, children }: DetailSectionProps) {
  return (
    <SectionCard title={title} description={description} actions={actions}>
      {children}
    </SectionCard>
  );
}

function InfoCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-slate-50 p-3 ${className}`.trim()}>{children}</div>;
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-slate-500">{children}</p>;
}

function MetaText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-xs leading-5 text-slate-500 ${className}`.trim()}>{children}</div>;
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

const STRATEGY_SELECTION_LIMIT_OPTIONS = [5, 10, 20] as const;
const DEFAULT_STRATEGY_SELECTION_LIMIT = 5;

export async function readCsvFileForImport(file: Pick<File, 'name' | 'text'>): Promise<{ fileName: string; csvText: string }> {
  return {
    fileName: file.name || 'tradingview.csv',
    csvText: await file.text(),
  };
}

export function buildStrategySelectionListPath({
  q,
  page,
  limit,
}: {
  q: string;
  page: number;
  limit: number;
}): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort: 'updated_at',
    order: 'desc',
    status: 'active',
  });
  const trimmedQuery = q.trim();
  if (trimmedQuery) {
    params.set('q', trimmedQuery);
  }
  return `/api/strategies?${params.toString()}`;
}

type ApplicationStatusFilter = 'active' | 'archived' | 'all';
type ApplicationReportFilter = 'all' | 'with_reports' | 'without_reports';
type ApplicationReportSourceFilter = 'all' | 'csv_import';
type ApplicationRunTypeFilter = 'all' | 'csv_import';
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
  return '';
}

function getApplicationRunTypeQuery(filter: ApplicationRunTypeFilter): string {
  if (filter === 'csv_import') return '&run_type=csv_import';
  return '';
}

function getApplicationRunStatusQuery(filter: ApplicationRunStatusFilter): string {
  if (filter === 'running') return '&run_status=running';
  if (filter === 'succeeded') return '&run_status=succeeded';
  if (filter === 'failed') return '&run_status=failed';
  return '';
}

function getApplicationIdQuery(strategyId: string, strategyVersionId: string): string {
  const params = new URLSearchParams();
  const trimmedStrategyId = strategyId.trim();
  const trimmedStrategyVersionId = strategyVersionId.trim();
  if (trimmedStrategyId) {
    params.set('strategy_id', trimmedStrategyId);
  }
  if (trimmedStrategyVersionId) {
    params.set('strategy_version_id', trimmedStrategyVersionId);
  }
  const query = params.toString();
  return query ? `&${query}` : '';
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

function ApplicationReportSourceItem({
  label,
  report,
}: {
  label: string;
  report: NonNullable<NonNullable<SymbolStrategyApplicationItem['latest_reports_by_source']>['csv_import']>;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">{label}</span>
          <StatusBadge status={report.status} className="px-2 py-0.5" />
          <StatusBadge status={report.run_status} className="px-2 py-0.5" />
        </div>
        <span className="text-xs text-slate-500">{formatDate(report.updated_at)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>source: <code>{report.execution_source}</code></span>
        <span>run: <code>{report.run_type}</code></span>
        <TextLink href={`/backtests/${report.backtest_id}`}>{report.title}</TextLink>
      </div>
    </div>
  );
}

function ApplicationVerificationSummary({ application }: { application: SymbolStrategyApplicationItem }) {
  const reportPair = application.latest_reports_by_source;
  const reportPairItems = [
    { key: 'csv_import', label: LABELS.csvImportReport, report: reportPair?.csv_import ?? null },
    { key: 'internal_backtest', label: LABELS.internalBacktestReport, report: reportPair?.internal_backtest ?? null },
  ];
  const hasReportPair = reportPairItems.some((item) => item.report);

  return (
    <Surface variant="nested" className="mt-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.verificationSummary}</h5>
          <p className="mt-1 text-xs text-slate-500">{LABELS.verificationHistoryNote}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TextLink href={`/symbol-strategy-applications/${application.id}#runs`}>{LABELS.openApplicationRuns}</TextLink>
          <TextLink href={`/symbol-strategy-applications/${application.id}#reports`}>{LABELS.openApplicationReports}</TextLink>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
          <h6 className="text-xs font-semibold text-slate-600">{LABELS.latestRun}</h6>
          {application.latest_run ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>run type: <code>{application.latest_run.run_type}</code></span>
              <span>run status: <StatusBadge status={application.latest_run.status} className="px-2 py-0.5" /></span>
              <span>updated: {formatDate(application.latest_run.updated_at)}</span>
              {application.latest_run.backtest_id ? (
                <TextLink href={`/backtests/${application.latest_run.backtest_id}`}>{LABELS.openBacktestDetail}</TextLink>
              ) : null}
            </div>
          ) : (
            <EmptyText>{LABELS.noLatestRun}</EmptyText>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
          <h6 className="text-xs font-semibold text-slate-600">{LABELS.latestBacktestReport}</h6>
          {application.latest_backtest_report ? (
            <div className="mt-1 space-y-1 text-xs text-slate-500">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-slate-800">{application.latest_backtest_report.title}</span>
                <span>{reportOriginLabel(application.latest_backtest_report.execution_source)}</span>
                <StatusBadge status={application.latest_backtest_report.status} className="px-2 py-0.5" />
                <span>{application.latest_backtest_report.market} / {application.latest_backtest_report.timeframe}</span>
                <span>updated: {formatDate(application.latest_backtest_report.updated_at)}</span>
              </div>
              <TextLink href={`/backtests/${application.latest_backtest_report.id}`}>{LABELS.openBacktestDetail}</TextLink>
            </div>
          ) : (
            <EmptyText>{LABELS.noLatestBacktestReport}</EmptyText>
          )}
        </div>
      </div>

      {hasReportPair ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LABELS.reportPair}</h6>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {reportPairItems.map((item) => (
              item.report ? (
                <ApplicationReportSourceItem key={item.key} label={item.label} report={item.report} />
              ) : null
            ))}
          </div>
        </div>
      ) : null}
    </Surface>
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
  const [selectedCsvFileName, setSelectedCsvFileName] = useState<string | null>(null);
  const [isReadingCsvFile, setIsReadingCsvFile] = useState(false);
  const [csvFileReadError, setCsvFileReadError] = useState<string | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvImportMessage, setCsvImportMessage] = useState<CsvImportMessage | null>(null);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const [csvBacktestLink, setCsvBacktestLink] = useState<string | null>(null);
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
      setSelectedCsvFileName(null);
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

  const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    setIsReadingCsvFile(true);
    setCsvFileReadError(null);
    setCsvImportMessage(null);
    setCsvImportError(null);
    setSelectedCsvFileName(file.name || null);
    try {
      const result = await readCsvFileForImport(file);
      setFileName(result.fileName);
      setCsvText(result.csvText);
    } catch {
      setCsvFileReadError(LABELS.csvFileReadError);
    } finally {
      setIsReadingCsvFile(false);
      event.target.value = '';
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

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
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

      <ApplicationVerificationSummary application={application} />

      <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900 marker:hidden">
          <span>{LABELS.csvImportTitle}</span>
          <span className="ml-2 text-xs font-normal text-slate-500">必要なときだけ展開してCSVファイルまたはCSVテキストを取り込みます。</span>
        </summary>
        <div className="mt-3 grid gap-2">
          <label className="grid gap-1 text-sm text-slate-700">
            <span className="font-medium">{LABELS.csvFile}</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={handleCsvFileChange}
              disabled={isReadingCsvFile || isImportingCsv}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
            <span className="text-xs text-slate-500">{LABELS.csvFileHelp}</span>
          </label>
          {selectedCsvFileName ? (
            <p className="text-sm text-slate-600">
              {LABELS.csvFileSelected}: <code>{selectedCsvFileName}</code>
            </p>
          ) : null}
          {isReadingCsvFile ? <p className="text-sm text-slate-600">{LABELS.csvFileReading}</p> : null}
          {csvFileReadError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{csvFileReadError}</p>
          ) : null}
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
            disabled={isImportingCsv || isReadingCsvFile || !fileName.trim() || !csvText.trim()}
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
      </details>

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
  applicationStrategyIdFilter,
  applicationStrategyVersionIdFilter,
  onApplicationStatusFilterChange,
  onApplicationFilterChange,
  onApplicationSourceFilterChange,
  onApplicationRunTypeFilterChange,
  onApplicationRunStatusFilterChange,
  onApplicationStrategyIdFilterChange,
  onApplicationStrategyVersionIdFilterChange,
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
  applicationStrategyIdFilter: string;
  applicationStrategyVersionIdFilter: string;
  onApplicationStatusFilterChange: (filter: ApplicationStatusFilter) => void;
  onApplicationFilterChange: (filter: ApplicationReportFilter) => void;
  onApplicationSourceFilterChange: (filter: ApplicationReportSourceFilter) => void;
  onApplicationRunTypeFilterChange: (filter: ApplicationRunTypeFilter) => void;
  onApplicationRunStatusFilterChange: (filter: ApplicationRunStatusFilter) => void;
  onApplicationStrategyIdFilterChange: (value: string) => void;
  onApplicationStrategyVersionIdFilterChange: (value: string) => void;
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
  ];
  const runTypeFilterOptions = [
    { value: 'all' as const, label: LABELS.savedApplicationsRunAll },
    { value: 'csv_import' as const, label: LABELS.savedApplicationsSourceCsv },
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
    && applicationRunStatusFilter === 'all'
    && applicationStrategyIdFilter.trim() === ''
    && applicationStrategyVersionIdFilter.trim() === '';

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="text-base font-semibold text-slate-900">{LABELS.savedApplicationsTitle}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{LABELS.strategyResultsPending}</p>
      {isLoading ? (
        <EmptyText>{LABELS.savedApplicationsLoading}</EmptyText>
      ) : error ? (
        <ErrorState title={LABELS.savedApplicationsError} className="mt-3" />
      ) : (
        <>
          <Surface variant="muted" className="mt-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="mr-1 font-semibold text-slate-700">絞り込み</span>
              <span className="font-semibold uppercase tracking-wide text-slate-500">{LABELS.savedApplicationsStatusFilter}</span>
              {statusFilterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={applicationStatusFilter === option.value ? 'primary' : 'secondary'}
                  onClick={() => onApplicationStatusFilterChange(option.value)}
                  className="px-2 py-1 text-xs"
                >
                  {option.label}
                </Button>
              ))}
              <span className="ml-1 font-semibold uppercase tracking-wide text-slate-500">{LABELS.savedApplicationsFilter}</span>
              {filterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={applicationFilter === option.value ? 'primary' : 'secondary'}
                  onClick={() => onApplicationFilterChange(option.value)}
                  className="px-2 py-1 text-xs"
                >
                  {option.label}
                </Button>
              ))}
              <span className="ml-1 font-semibold uppercase tracking-wide text-slate-500">{LABELS.savedApplicationsSourceFilter}</span>
              {sourceFilterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={applicationSourceFilter === option.value ? 'primary' : 'secondary'}
                  onClick={() => onApplicationSourceFilterChange(option.value)}
                  className="px-2 py-1 text-xs"
                >
                  {option.label}
                </Button>
              ))}
              <span className="ml-1 font-semibold uppercase tracking-wide text-slate-500">{LABELS.savedApplicationsRunTypeFilter}</span>
              {runTypeFilterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={applicationRunTypeFilter === option.value ? 'primary' : 'secondary'}
                  onClick={() => onApplicationRunTypeFilterChange(option.value)}
                  className="px-2 py-1 text-xs"
                >
                  {option.label}
                </Button>
              ))}
              <span className="ml-1 font-semibold uppercase tracking-wide text-slate-500">{LABELS.savedApplicationsRunStatusFilter}</span>
              {runStatusFilterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={applicationRunStatusFilter === option.value ? 'primary' : 'secondary'}
                  onClick={() => onApplicationRunStatusFilterChange(option.value)}
                  className="px-2 py-1 text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {LABELS.savedApplicationsStrategyFilter}
                <input
                  type="text"
                  value={applicationStrategyIdFilter}
                  onChange={(event) => onApplicationStrategyIdFilterChange(event.target.value)}
                  onBlur={(event) => onApplicationStrategyIdFilterChange(event.target.value.trim())}
                  placeholder={LABELS.savedApplicationsStrategyPlaceholder}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-slate-900 shadow-sm"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {LABELS.savedApplicationsVersionFilter}
                <input
                  type="text"
                  value={applicationStrategyVersionIdFilter}
                  onChange={(event) => onApplicationStrategyVersionIdFilterChange(event.target.value)}
                  onBlur={(event) => onApplicationStrategyVersionIdFilterChange(event.target.value.trim())}
                  placeholder={LABELS.savedApplicationsVersionPlaceholder}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-slate-900 shadow-sm"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
              <span className="rounded-full bg-white px-2 py-0.5">
                {LABELS.savedApplicationsSummary
                  .replace('{status}', getApplicationStatusLabel(applicationStatusFilter))
                  .replace('{shown}', String(applications.length))
                  .replace('{total}', String(totalApplications))}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5">
                {LABELS.savedApplicationsReportSummary
                  .replace('{csv}', String(reportCounts.csv))
                  .replace('{internal}', String(reportCounts.internal))}
              </span>
            </div>
          </Surface>
          {isDefaultEmptyState ? (
            <EmptyState title={LABELS.noSavedApplications} className="mt-3" />
          ) : applications.length === 0 ? (
            <EmptyState title={LABELS.noFilteredApplications} className="mt-3" />
          ) : (
            <div className="mt-3 grid gap-2">
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

type StrategySelectionItem = StrategyListData['strategies'][number];
type StrategyVersionSelectionItem = StrategyVersionListData['strategy_versions'][number];

function StrategyApplySelectionPanel({
  symbolId,
  mutateApplications,
}: {
  symbolId: string;
  mutateApplications: () => Promise<SymbolStrategyApplicationListData | undefined>;
}) {
  const [strategySearchInput, setStrategySearchInput] = useState('');
  const [strategyQuery, setStrategyQuery] = useState('');
  const [strategyPage, setStrategyPage] = useState(1);
  const [strategyLimit, setStrategyLimit] = useState(DEFAULT_STRATEGY_SELECTION_LIMIT);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategySelectionItem | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<StrategyVersionSelectionItem | null>(null);
  const [isSavingApplication, setIsSavingApplication] = useState(false);
  const [saveApplicationError, setSaveApplicationError] = useState<string | null>(null);
  const [saveApplicationMessage, setSaveApplicationMessage] = useState<string | null>(null);
  const strategyListPath = buildStrategySelectionListPath({
    q: strategyQuery,
    page: strategyPage,
    limit: strategyLimit,
  });
  const {
    data: strategyListData,
    error: strategyListError,
    isLoading: isStrategyListLoading,
  } = useSWR<StrategyListData>(strategyListPath, swrFetcher);

  const strategies = strategyListData?.strategies ?? [];
  const strategyPagination = strategyListData?.pagination;
  const shownStrategyCount = strategies.length;

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

  const chooseStrategy = (strategy: StrategySelectionItem) => {
    setSelectedStrategy(strategy);
    setSelectedVersion(null);
    setSaveApplicationError(null);
    setSaveApplicationMessage(null);
  };

  const chooseVersion = (version: StrategyVersionSelectionItem) => {
    setSelectedVersion(version);
    setSaveApplicationError(null);
    setSaveApplicationMessage(null);
  };

  const clearSelection = () => {
    setSelectedStrategy(null);
    setSelectedVersion(null);
    setSaveApplicationError(null);
  };

  const submitStrategySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStrategyQuery(strategySearchInput.trim());
    setStrategyPage(1);
  };

  const clearStrategySearch = () => {
    setStrategySearchInput('');
    setStrategyQuery('');
    setStrategyPage(1);
  };

  const changeStrategyLimit = (event: ChangeEvent<HTMLSelectElement>) => {
    setStrategyLimit(Number(event.target.value));
    setStrategyPage(1);
  };

  const strategySummaryLabel = (strategyQuery ? LABELS.strategyResultSummaryFiltered : LABELS.strategyResultSummary)
    .replace('{shown}', String(shownStrategyCount))
    .replace('{total}', String(strategyPagination?.total ?? shownStrategyCount))
    .replace('{query}', strategyQuery)
    .replace('{page}', String(strategyPagination?.page ?? strategyPage));

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
      setSelectedStrategy(null);
      setSelectedVersion(null);
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
    <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-white p-3">
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">{LABELS.chooseApplyCandidate}</h4>
            <p className="mt-1 text-xs text-slate-500">{LABELS.strategyList}</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span>{LABELS.strategyLimit}</span>
            <select
              value={strategyLimit}
              onChange={changeStrategyLimit}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
            >
              {STRATEGY_SELECTION_LIMIT_OPTIONS.map((limit) => (
                <option key={limit} value={limit}>{limit}</option>
              ))}
            </select>
          </label>
        </div>
        <form onSubmit={submitStrategySearch} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
            <span>{LABELS.strategySearch}</span>
            <input
              type="search"
              value={strategySearchInput}
              onChange={(event) => setStrategySearchInput(event.target.value)}
              placeholder={LABELS.strategySearchPlaceholder}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <Button type="submit" variant="secondary" className="py-2">
            {LABELS.strategySearchApply}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={clearStrategySearch}
            disabled={!strategyQuery && !strategySearchInput}
            className="py-2"
          >
            {LABELS.strategySearchClear}
          </Button>
        </form>
        {isStrategyListLoading ? (
          <EmptyText>strategy 候補を読み込み中...</EmptyText>
        ) : strategyListError ? (
          <p className="text-sm text-rose-700">strategy 候補を取得できませんでした。</p>
        ) : strategies.length === 0 ? (
          <EmptyText>{strategyQuery ? LABELS.noFilteredStrategies : 'active strategy はまだありません。'}</EmptyText>
        ) : (
          <>
            <div className="mt-3 grid gap-2">
              {strategies.map((strategy) => {
                const isSelected = selectedStrategy?.id === strategy.id;
                return (
                  <button
                    key={strategy.id}
                    type="button"
                    onClick={() => chooseStrategy(strategy)}
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
            <PaginationControls
              page={strategyPagination?.page ?? strategyPage}
              hasPrev={Boolean(strategyPagination?.has_prev)}
              hasNext={Boolean(strategyPagination?.has_next)}
              onPrev={() => setStrategyPage((page) => Math.max(1, page - 1))}
              onNext={() => setStrategyPage((page) => page + 1)}
              summaryLabel={strategySummaryLabel}
              previousLabel={LABELS.strategyPrevious}
              nextLabel={LABELS.strategyNext}
              className="mt-2"
            />
          </>
        )}
      </div>

      {selectedStrategy ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
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
                    onClick={() => chooseVersion(version)}
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
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
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
      </div>
    </div>
  );
}

export default function SymbolDetail() {
  const [, params] = useRoute('/symbols/:symbolId');
  const symbolId = params?.symbolId;
  const [isGeneratingThesis, setIsGeneratingThesis] = useState(false);
  const [generateThesisError, setGenerateThesisError] = useState<string | null>(null);
  const [isRefreshingReferences, setIsRefreshingReferences] = useState(false);
  const [isRefreshingCalendar, setIsRefreshingCalendar] = useState(false);
  const [calendarRefreshMessage, setCalendarRefreshMessage] = useState<string | null>(null);
  const [calendarRefreshError, setCalendarRefreshError] = useState<string | null>(null);
  const [referenceRefreshMessage, setReferenceRefreshMessage] = useState<string | null>(null);
  const [referenceRefreshTone, setReferenceRefreshTone] = useState<'info' | 'success'>('info');
  const [referenceRefreshError, setReferenceRefreshError] = useState<string | null>(null);
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<ApplicationStatusFilter>('active');
  const [applicationFilter, setApplicationFilter] = useState<ApplicationReportFilter>('all');
  const [applicationSourceFilter, setApplicationSourceFilter] = useState<ApplicationReportSourceFilter>('all');
  const [applicationRunTypeFilter, setApplicationRunTypeFilter] = useState<ApplicationRunTypeFilter>('all');
  const [applicationRunStatusFilter, setApplicationRunStatusFilter] = useState<ApplicationRunStatusFilter>('all');
  const [applicationStrategyIdFilter, setApplicationStrategyIdFilter] = useState('');
  const [applicationStrategyVersionIdFilter, setApplicationStrategyVersionIdFilter] = useState('');

  const {
    data,
    error,
    isLoading,
    mutate: mutateSymbolDetail,
  } = useSWR<SymbolDetailData>(
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
      ? `/api/symbols/${symbolId}/strategy-applications?status=${applicationStatusFilter}&page=1&limit=20&sort=updated_at&order=desc${getApplicationReportPresenceQuery(applicationFilter)}${getApplicationReportSourceQuery(applicationSourceFilter)}${getApplicationRunTypeQuery(applicationRunTypeFilter)}${getApplicationRunStatusQuery(applicationRunStatusFilter)}${getApplicationIdQuery(applicationStrategyIdFilter, applicationStrategyVersionIdFilter)}`
      : null,
    swrFetcher,
  );
  const {
    data: calendarData,
    error: calendarError,
    mutate: mutateCalendar,
  } = useSWR<InvestmentCalendarData>(
    symbolId ? `/api/symbols/${symbolId}/calendar-events?limit=20` : null,
    swrFetcher,
  );

  if (isLoading) {
    return (
      <AppLayout showSideRail>
        <LoadingState title={LABELS.loadSymbol} className="w-full" />
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

  async function handleRefreshReferences() {
    if (!symbolId) return;
    setIsRefreshingReferences(true);
    setReferenceRefreshError(null);
    setReferenceRefreshTone('info');
    setReferenceRefreshMessage(LABELS.referencesRefreshRunning);
    try {
      const result = await postApi<SymbolReferenceRefreshData>(`/api/symbols/${symbolId}/references/refresh`, {});
      if (result.status === 'queued' || result.status === 'running') {
        setReferenceRefreshTone('info');
        setReferenceRefreshMessage(LABELS.referencesRefreshQueued);
      } else {
        setReferenceRefreshTone('success');
        setReferenceRefreshMessage(
          LABELS.referencesRefreshSuccess
            .replace('{saved}', String(result.saved_count ?? 0))
            .replace('{skipped}', String(result.skipped_count ?? 0)),
        );
        await mutateSymbolDetail();
      }
    } catch {
      setReferenceRefreshMessage(null);
      setReferenceRefreshError(LABELS.referencesRefreshError);
    } finally {
      setIsRefreshingReferences(false);
    }
  }

  async function handleRefreshCalendar() {
    if (!symbolId) return;
    setIsRefreshingCalendar(true);
    setCalendarRefreshMessage(null);
    setCalendarRefreshError(null);
    try {
      const result = await postApi<InvestmentCalendarRefreshData>(`/api/symbols/${symbolId}/calendar-events/refresh`, {});
      setCalendarRefreshMessage(formatSymbolCalendarRefreshMessage(result));
      await mutateCalendar();
    } catch {
      setCalendarRefreshError(LABELS.calendarRefreshError);
    } finally {
      setIsRefreshingCalendar(false);
    }
  }

  return (
    <AppLayout showSideRail>
      <div className="w-full space-y-4">
        <DetailSection
          title={LABELS.overviewTitle}
          actions={<TextLink href={`/compare?symbolIds=${encodeURIComponent(data.symbol.symbol_code || data.symbol.symbol)}`}>{LABELS.compare}</TextLink>}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
            <InfoCard className="bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-slate-950">{data.symbol.display_name || data.symbol.symbol}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">{LABELS.code}: <code>{data.symbol.symbol_code || data.symbol.symbol}</code></span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">{LABELS.market}: <code>{data.symbol.market_code || '-'}</code></span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">{LABELS.processingStatus}: <code>{data.latest_processing_status}</code></span>
                    {data.symbol.tradingview_symbol ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">TradingView: <code>{data.symbol.tradingview_symbol}</code></span>
                    ) : null}
                  </div>
                </div>
              </div>
            </InfoCard>
            <InfoCard className="bg-white">
              {data.current_snapshot ? (
                <>
                  <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div>
                      {LABELS.currentPrice}: <strong className="text-base text-slate-900">{formatNumber(data.current_snapshot.last_price, 3)}</strong>
                    </div>
                    <div>
                      {LABELS.dayChange} {formatNumber(data.current_snapshot.change, 3)} ({data.current_snapshot.change_percent === null ? '-' : `${formatNumber(data.current_snapshot.change_percent, 2)}%`})
                    </div>
                    <div>{LABELS.volume}: {formatNumber(data.current_snapshot.volume, 0)}</div>
                    <div>{LABELS.source}: <code>{data.current_snapshot.source_name}</code></div>
                  </div>
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <MetaText>
                      asOf: {formatDate(data.current_snapshot.as_of)} | {LABELS.marketStatus}: <code>{data.current_snapshot.market_status}</code>
                    </MetaText>
                  </div>
                </>
              ) : (
                <EmptyText>{LABELS.snapshotUnavailable}</EmptyText>
              )}
            </InfoCard>
          </div>
        </DetailSection>

        <DetailSection
          title={LABELS.investmentCalendarTitle}
          description={LABELS.investmentCalendarDescription}
          actions={
            <Button variant="secondary" onClick={handleRefreshCalendar} disabled={isRefreshingCalendar}>
              {isRefreshingCalendar ? LABELS.refreshingCalendar : LABELS.refreshCalendar}
            </Button>
          }
        >
          {calendarError ? <InlineNotice tone="warning" className="mb-3">{LABELS.calendarRefreshError}</InlineNotice> : null}
          <InvestmentCalendarGrid
            events={calendarData?.events ?? []}
            meta={calendarData?.meta}
            emptyTitle={LABELS.noCalendarEvents}
            monthEmptyNote="この月の銘柄イベントはありません。前月・次月で表示月を切り替えられます。"
            refreshMessage={calendarRefreshMessage}
            refreshError={calendarRefreshError}
          />
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
                  className="px-3 py-1.5 transition hover:bg-sky-800 disabled:bg-slate-400 disabled:opacity-100"
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
                  className="px-3 py-1.5 transition hover:bg-sky-800 disabled:bg-slate-400 disabled:opacity-100"
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

        <DetailSection title={LABELS.latestAlertsTitle}>
          {data.recent_alerts.length === 0 ? (
            <EmptyState title={LABELS.noAlerts} />
          ) : (
            <div className="grid gap-2">
              {data.recent_alerts.map((alert) => (
                <article key={alert.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
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

        <DetailSection
          title={LABELS.strategyResultsTitle}
          actions={
            <>
              <TextLink href="/strategy-lab" className="rounded bg-sky-700 px-3 py-1.5 text-white no-underline hover:no-underline">
                {LABELS.openStrategyLab}
              </TextLink>
              <TextLink href="/backtests" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-700 no-underline hover:no-underline">
                {LABELS.openBacktestList}
              </TextLink>
            </>
          }
        >
          <InfoCard>
            <p className="text-sm leading-6 text-slate-700">{LABELS.strategyResultsIntro}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{LABELS.strategyResultsPending}</p>
            <SavedStrategyApplicationsPanel
              applications={applicationListData?.applications ?? []}
              totalApplications={applicationListData?.pagination.total ?? applicationListData?.applications.length ?? 0}
              applicationStatusFilter={applicationStatusFilter}
              applicationFilter={applicationFilter}
              applicationSourceFilter={applicationSourceFilter}
              applicationRunTypeFilter={applicationRunTypeFilter}
              applicationRunStatusFilter={applicationRunStatusFilter}
              applicationStrategyIdFilter={applicationStrategyIdFilter}
              applicationStrategyVersionIdFilter={applicationStrategyVersionIdFilter}
              onApplicationStatusFilterChange={setApplicationStatusFilter}
              onApplicationFilterChange={setApplicationFilter}
              onApplicationSourceFilterChange={setApplicationSourceFilter}
              onApplicationRunTypeFilterChange={setApplicationRunTypeFilter}
              onApplicationRunStatusFilterChange={setApplicationRunStatusFilter}
              onApplicationStrategyIdFilterChange={setApplicationStrategyIdFilter}
              onApplicationStrategyVersionIdFilterChange={setApplicationStrategyVersionIdFilter}
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
          title={LABELS.referencesTitle}
          actions={
            <Button
              variant="secondary"
              onClick={handleRefreshReferences}
              disabled={isRefreshingReferences}
              className="px-3 py-1.5 disabled:bg-slate-300 disabled:text-slate-600 disabled:opacity-100"
            >
              {isRefreshingReferences ? LABELS.refreshingReferences : LABELS.refreshReferences}
            </Button>
          }
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
              <span className="font-semibold text-slate-700">{LABELS.breakdown}</span>
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">ニュース {referenceBreakdown.news}件</span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">適時開示 {referenceBreakdown.disclosure}件</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">決算関連 {referenceBreakdown.earnings}件</span>
              {referenceBreakdown.other > 0 ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">その他 {referenceBreakdown.other}件</span>
              ) : null}
            </div>
            {referenceRefreshMessage ? (
              <InlineNotice tone={referenceRefreshTone}>{referenceRefreshMessage}</InlineNotice>
            ) : null}
            {referenceRefreshError ? (
              <InlineNotice tone="danger">{referenceRefreshError}</InlineNotice>
            ) : null}
            {data.related_references.length === 0 ? (
              <InfoCard>
                <EmptyText>{LABELS.noReferences}</EmptyText>
                <p className="mt-2 text-sm text-slate-500">{LABELS.emptyStateHint}</p>
              </InfoCard>
            ) : (
              <div className="grid gap-2">
                {data.related_references.map((reference) => {
                  const sourceLabel = getReferenceSourceLabel(reference.source_name, reference.reference_type);
                  const safeSourceUrl = getSafeExternalUrl(reference.source_url);
                  const displayTitle = getReferenceDisplayText(reference.title) ?? getReferenceTypeLabel(reference.reference_type);
                  const sanitizedSummary = getReferenceDisplayText(reference.summary_text);
                  const displaySummary = shouldShowReferenceSummary(displayTitle, sanitizedSummary) ? sanitizedSummary : null;
                  return (
                    <article key={reference.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getReferenceTypeBadgeClass(reference.reference_type)}`}>
                          {getReferenceTypeLabel(reference.reference_type)}
                        </span>
                        <MetaText>{formatDate(reference.published_at)}</MetaText>
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-900">
                        {safeSourceUrl ? (
                          <a href={safeSourceUrl} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">
                            {displayTitle}
                            <span className="ml-1 text-xs font-normal text-slate-500">外部リンク</span>
                          </a>
                        ) : (
                          <strong>{displayTitle}</strong>
                        )}
                      </div>
                      {displaySummary ? <p className="mt-2 text-sm leading-6 text-slate-700">{displaySummary}</p> : null}
                      {sourceLabel ? <MetaText className="mt-2">取得元: {sourceLabel}</MetaText> : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </DetailSection>
        <DetailSection
          title={LABELS.researchNoteTitle}
          actions={
            data.latest_active_note ? (
              <TextLink href={`/notes/${data.latest_active_note.id}`} className="rounded bg-sky-700 px-3 py-1.5 text-white no-underline hover:no-underline">
                {LABELS.openNote}
              </TextLink>
            ) : (
              <TextLink href={`/symbols/${symbolId}/note/new`} className="rounded bg-emerald-600 px-3 py-1.5 text-white no-underline hover:no-underline">
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

      </div>
    </AppLayout>
  );
}
