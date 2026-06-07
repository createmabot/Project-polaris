import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useLocation, useSearch } from 'wouter';
import { fetchApi, patchApi, postApi, swrFetcher } from '../api/client';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { TextArea } from '../components/ui/FormFields';
import InlineNotice from '../components/ui/InlineNotice';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import PineGenerationProgress from '../components/ui/PineGenerationProgress';
import StrategyVersionLineageTree from '../components/strategy/StrategyVersionLineageTree';
import { buildPineGenerationJobFailureMessage } from '../utils/pineGenerationJob';
import SectionCard from '../components/ui/SectionCard';
import StatusBadge from '../components/ui/StatusBadge';
import TextLink from '../components/ui/TextLink';
import {
  StrategyVersionData,
  StrategyVersionPineData,
  StrategyVersionPineJobData,
  StrategyVersionListData,
  BacktestDetailData,
  StrategyVersionRuleRewriteDraftData,
  StrategyRefinementCandidateData,
  NormalizedStrategySpecData,
  NormalizedStrategySpecGenerateData,
} from '../api/types';
import {
  buildStrategyVersionDetailUrl,
  parseStrategyVersionsListQuery,
} from './StrategyVersionList';

const PINE_GENERATION_POLL_INTERVAL_MS = 1200;
const PINE_GENERATION_POLL_MAX_ATTEMPTS = 900;

type StrategyVersionDetailProps = {
  params: { versionId: string };
};

function formatTimeframeLabel(value: string): string {
  if (value === '1D' || value === 'D') return '日足（D）';
  if (value === '4H') return '4時間足（4H）';
  if (value === '1H') return '1時間足（1H）';
  return value;
}

type DiffLine = {
  type: 'equal' | 'removed' | 'added';
  text: string;
};

type PineDiffSummary = {
  hasBase: boolean;
  currentExists: boolean;
  baseExists: boolean;
  changed: boolean;
  lineDelta: number;
  charDelta: number;
};

type PineDiffExcerpt = {
  kind: 'modified' | 'removed' | 'added';
  baseLine: string;
  currentLine: string;
};

type PineDiffSection = {
  kind: PineDiffExcerpt['kind'];
  label: string;
  items: PineDiffExcerpt[];
};

type RuleDiffSummary = {
  hasChanges: boolean;
  addedLines: number;
  removedLines: number;
};

type CompareSummaryItem = {
  key: 'rule' | 'pine' | 'status' | 'updated_at';
  label: string;
  changed: boolean;
  detail: string;
};

type ImproveApplicationContext = {
  symbolId: string;
  symbolCode: string;
  symbolName: string;
  applicationId: string | null;
  sourceVersionId: string | null;
  sourceBacktestId: string | null;
  refinementCandidateId: string | null;
  returnTo: string | null;
};

export const APPLY_IMPROVED_VERSION_SUCCESS_MESSAGE =
  '改善版をこの銘柄に適用しました。銘柄ページで確認できます。';

export function buildApplyImprovedVersionFailureMessage(): string {
  return 'この銘柄への改善版の適用に失敗しました。すでに適用済みの場合は銘柄ページで状態を確認してください。';
}

function buildDefaultVersionsReturnPath(strategyId: string): string {
  return `/strategies/${strategyId}/versions`;
}

const unsafeQueryTextPattern =
  /(https?:\/\/|file:\/\/|www\.|localhost|127\.0\.0\.1|::1|\/api\/|[a-z]:\\|\\|\/users\/|\/home\/|stack trace|traceback|endpoint|model|secret|token|api[_-]?key)/i;

function isSafeQueryText(value: string, maxLength: number): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return false;
  if (/[\r\n\t]/.test(trimmed)) return false;
  if (unsafeQueryTextPattern.test(trimmed)) return false;
  return true;
}

function sanitizeQueryId(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (!isSafeQueryText(trimmed, 80)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeSymbolText(value: string | null, maxLength: number): string | null {
  const trimmed = value?.trim() ?? '';
  if (!isSafeQueryText(trimmed, maxLength)) return null;
  if (/[<>{}[\]`]/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeImproveApplicationReturnTo(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (!isSafeQueryText(trimmed, 240)) return null;
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('\\')) return null;

  const [pathPart, queryPart = ''] = trimmed.split('?', 2);
  const isSymbolReturn = /^\/symbols\/[A-Za-z0-9_.:-]+$/.test(pathPart);
  const isBacktestReturn = /^\/backtests\/[A-Za-z0-9_.:-]+$/.test(pathPart);
  if (!isSymbolReturn && !isBacktestReturn) return null;

  if (!queryPart) return pathPart;
  if (isBacktestReturn) return pathPart;

  const queryParams = new URLSearchParams(queryPart);
  const normalized = new URLSearchParams();
  const allowedKeys = new Set(['tab', 'application_id']);
  for (const [key, rawValue] of queryParams.entries()) {
    if (!allowedKeys.has(key)) continue;
    const safeValue = sanitizeQueryId(rawValue);
    if (safeValue) {
      normalized.set(key, safeValue);
    }
  }

  const normalizedQuery = normalized.toString();
  return normalizedQuery ? `${pathPart}?${normalizedQuery}` : pathPart;
}

export function parseImproveApplicationContext(search: string): ImproveApplicationContext | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (params.get('mode') !== 'improve_application') return null;

  const symbolId = sanitizeQueryId(params.get('symbol_id'));
  const symbolCode = sanitizeSymbolText(params.get('symbol_code'), 24);
  const symbolName = sanitizeSymbolText(params.get('symbol_name'), 80);
  if (!symbolId || !symbolCode || !symbolName) return null;

  return {
    symbolId,
    symbolCode,
    symbolName,
    applicationId: sanitizeQueryId(params.get('application_id')),
    sourceVersionId: sanitizeQueryId(params.get('source_version_id')),
    sourceBacktestId: sanitizeQueryId(params.get('source_backtest_id')),
    refinementCandidateId: sanitizeQueryId(params.get('refinement_candidate_id')),
    returnTo: sanitizeImproveApplicationReturnTo(params.get('return_to')),
  };
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function valueText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function compactSafeText(value: string | null | undefined, maxLength = 240): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (unsafeQueryTextPattern.test(normalized)) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
}

function stringField(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '-';
}

function normalizedSpecListLabel(item: Record<string, unknown>): string {
  const id = stringField(item, 'id');
  const type = stringField(item, 'type');
  const length = stringField(item, 'length');
  const rule = stringField(item, 'rule');
  const core = [type !== '-' ? type : null, id !== '-' ? id : null].filter(Boolean).join(' / ') || '-';
  const details = [length !== '-' ? `length ${length}` : null, rule !== '-' ? rule : null].filter(Boolean).join(' / ');
  return details ? `${core}: ${details}` : core;
}

function normalizedSpecRiskLabels(risk: Record<string, unknown> | null): string[] {
  if (!risk) return [];
  return Object.entries(risk).map(([key, value]) => {
    const record = asRecord(value);
    if (!record) return key;
    const type = stringField(record, 'type');
    const valueText = stringField(record, 'value');
    const bars = stringField(record, 'bars');
    const detail = valueText !== '-' ? valueText : bars !== '-' ? bars : '';
    return detail ? `${key}: ${type} ${detail}` : `${key}: ${type}`;
  });
}

function extractAiKeyPoints(structuredJson: Record<string, unknown> | null | undefined): string[] {
  const record = asRecord(structuredJson);
  if (!record) return [];
  const value = record.key_points ?? record.keyPoints;
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => compactSafeText(item, 160))
    .filter(Boolean)
    .slice(0, 4);
}

function extractStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => compactSafeText(item, 240))
    .filter(Boolean)
    .slice(0, limit);
}

type SourceBacktestMetricRow = {
  label: string;
  value: string;
};

function buildSourceBacktestMetricRows(sourceBacktest: BacktestDetailData): SourceBacktestMetricRow[] {
  const parsedSummary = sourceBacktest.latest_import?.parsed_summary;
  if (parsedSummary) {
    return [
      { label: '総取引数', value: valueText(parsedSummary.totalTrades) },
      { label: '勝率', value: valueText(parsedSummary.winRate) },
      { label: 'Profit Factor', value: valueText(parsedSummary.profitFactor) },
      { label: '最大ドローダウン', value: valueText(parsedSummary.maxDrawdown) },
      { label: '純利益', value: valueText(parsedSummary.netProfit) },
      { label: '対象期間', value: `${valueText(parsedSummary.periodFrom)} - ${valueText(parsedSummary.periodTo)}` },
    ].filter((row) => row.value !== '-');
  }

  const applicationMetrics = sourceBacktest.symbol_strategy_application?.current_report?.metrics;
  if (applicationMetrics) {
    return [
      { label: 'trade_count', value: valueText(applicationMetrics.trade_count) },
      { label: 'total_return_percent', value: valueText(applicationMetrics.total_return_percent) },
      { label: 'price_change_percent', value: valueText(applicationMetrics.price_change_percent) },
      { label: 'max_drawdown_percent', value: valueText(applicationMetrics.max_drawdown_percent) },
      { label: 'profit_factor', value: valueText(applicationMetrics.profit_factor) },
      { label: 'win_rate', value: valueText(applicationMetrics.win_rate) },
      { label: 'period', value: `${valueText(applicationMetrics.period_from)} - ${valueText(applicationMetrics.period_to)}` },
    ].filter((row) => row.value !== '-');
  }

  const resultSummary = asRecord(sourceBacktest.used_strategy.snapshot?.result_summary);
  const resultMetrics = asRecord(resultSummary?.metrics);
  if (resultMetrics) {
    return ['bar_count', 'price_change_percent', 'range_percent', 'total_return_percent', 'max_drawdown_percent', 'profit_factor', 'win_rate', 'trade_count']
      .map((key) => ({ label: key, value: valueText(resultMetrics[key] as number | string | null | undefined) }))
      .filter((row) => row.value !== '-');
  }

  return [];
}

function buildSourceBacktestAiSummaryExcerpt(aiReview: BacktestDetailData['ai_review']): string {
  if (aiReview.status !== 'available') return '';
  return compactSafeText(aiReview.body_markdown, 360);
}

function buildSourceBacktestAiSummaryMemoText(aiReview: BacktestDetailData['ai_review']): string {
  if (aiReview.status !== 'available') return '';
  const root = asRecord(aiReview.structured_json);
  const payload = asRecord(root?.payload);
  const ruleRefinementCandidates = Array.isArray(payload?.rule_refinement_candidates)
    ? payload.rule_refinement_candidates
        .map((item) => {
          const record = asRecord(item);
          if (!record) return '';
          const title = compactSafeText(typeof record.title === 'string' ? record.title : null, 120);
          const change = compactSafeText(typeof record.change_summary === 'string' ? record.change_summary : null, 260);
          const entry = compactSafeText(typeof record.entry_change === 'string' ? record.entry_change : null, 220);
          const exit = compactSafeText(typeof record.exit_change === 'string' ? record.exit_change : null, 220);
          const risk = compactSafeText(typeof record.risk_change === 'string' ? record.risk_change : null, 220);
          const validation = compactSafeText(typeof record.validation_plan === 'string' ? record.validation_plan : null, 220);
          const parts = [
            title ? `候補: ${title}` : '',
            change ? `変更: ${change}` : '',
            entry ? `entry: ${entry}` : '',
            exit ? `exit: ${exit}` : '',
            risk ? `risk: ${risk}` : '',
            validation ? `検証: ${validation}` : '',
          ].filter(Boolean);
          return parts.join(' / ');
        })
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const nextActions = extractStringList(payload?.next_actions, 5);
  const overallView = compactSafeText(typeof payload?.overall_view === 'string' ? payload.overall_view : null, 800);
  const risks = extractStringList(payload?.risks, 4);
  const strengths = extractStringList(payload?.strengths, 3);

  const structuredLines = [
    ruleRefinementCandidates.length > 0 ? `AI summary rule refinement candidates: ${ruleRefinementCandidates.join(' / ')}` : '',
    nextActions.length > 0 ? `AI summary next actions: ${nextActions.join(' / ')}` : '',
    overallView ? `AI summary improvement memo: ${overallView}` : '',
    risks.length > 0 ? `AI summary risks: ${risks.join(' / ')}` : '',
    strengths.length > 0 ? `AI summary strengths: ${strengths.join(' / ')}` : '',
  ].filter(Boolean);

  if (structuredLines.length > 0) {
    return structuredLines.join('\n');
  }

  return compactSafeText(aiReview.body_markdown, 1200);
}

export function buildSourceBacktestImprovementMemo(sourceBacktest: BacktestDetailData): string {
  const metrics = buildSourceBacktestMetricRows(sourceBacktest).slice(0, 6);
  const aiExcerpt = buildSourceBacktestAiSummaryMemoText(sourceBacktest.ai_review);
  const aiKeyPoints = extractAiKeyPoints(sourceBacktest.ai_review.structured_json);
  const safeTitle = compactSafeText(sourceBacktest.backtest.title, 160) || 'source backtest';
  const safeBacktestId = sanitizeQueryId(sourceBacktest.backtest.id) ?? 'unknown';
  const safeExecutionSource = compactSafeText(sourceBacktest.backtest.execution_source, 80) || '-';
  const safeStatus = compactSafeText(sourceBacktest.backtest.status, 80) || '-';
  const safeMarket = compactSafeText(sourceBacktest.backtest.market, 80) || '-';
  const safeTimeframe = compactSafeText(sourceBacktest.backtest.timeframe, 80) || '-';
  const lines = [
    `検証結果 ${safeTitle} (${safeBacktestId}) をもとに改善する。`,
    `実行ソース: ${safeExecutionSource} / 状態: ${safeStatus}`,
    `市場・時間足: ${safeMarket} / ${safeTimeframe}`,
  ];

  if (metrics.length > 0) {
    lines.push(`主要指標: ${metrics.map((metric) => `${metric.label}=${metric.value}`).join(', ')}`);
  }
  if (aiExcerpt) {
    lines.push(`AI summary excerpt: ${aiExcerpt}`);
  } else if (aiKeyPoints.length > 0) {
    lines.push(`AI summary key points: ${aiKeyPoints.join(' / ')}`);
  }
  lines.push('上記を踏まえ、過剰最適化を避けつつ entry / exit / risk 条件の改善案を反映してください。');
  return lines.join('\n');
}

export function findNextPriorityVersionId(
  currentVersionId: string,
  strategyVersions: Array<{
    id: string;
    is_derived: boolean;
    has_diff_from_clone: boolean | null;
    has_forward_validation_note: boolean;
  }>,
): string | null {
  const priorityIds = strategyVersions
    .filter(
      (version) =>
        version.is_derived &&
        version.has_diff_from_clone === true &&
        version.has_forward_validation_note,
    )
    .map((version) => version.id);

  if (priorityIds.length <= 1) {
    return null;
  }

  const currentIndex = priorityIds.indexOf(currentVersionId);
  if (currentIndex < 0) {
    return priorityIds[0];
  }

  return priorityIds[(currentIndex + 1) % priorityIds.length];
}

function normalizeStrategyVersionsReturnPath(decodedPath: string, strategyId: string): string | null {
  const trimmed = decodedPath.trim();
  if (!trimmed.startsWith('/')) return null;

  const [pathPart, queryPart = ''] = trimmed.split('?', 2);
  const expectedPath = buildDefaultVersionsReturnPath(strategyId);
  if (pathPart !== expectedPath) return null;

  const queryParams = new URLSearchParams(queryPart);
  const normalized = new URLSearchParams();
  const rawQ = (queryParams.get('q') ?? '').trim();
  if (rawQ) {
    normalized.set('q', rawQ);
  }
  const rawStatus = (queryParams.get('status') ?? '').trim();
  if (rawStatus) {
    normalized.set('status', rawStatus);
  }
  const rawPage = queryParams.get('page');
  if (rawPage !== null) {
    const page = Number(rawPage);
    if (Number.isInteger(page) && page > 0 && page !== 1) {
      normalized.set('page', String(page));
    }
  }
  const rawSort = (queryParams.get('sort') ?? '').trim();
  if (rawSort === 'updated_at') {
    normalized.set('sort', rawSort);
  }
  const rawOrder = (queryParams.get('order') ?? '').trim().toLowerCase();
  if (rawOrder === 'asc') {
    normalized.set('order', rawOrder);
  }

  const query = normalized.toString();
  return query ? `${expectedPath}?${query}` : expectedPath;
}

export function parseStrategyVersionsReturnPath(locationPath: string, strategyId: string): string | null {
  const search = locationPath.includes('?') ? locationPath.slice(locationPath.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  const encodedReturn = params.get('return');
  if (!encodedReturn) return null;

  let decoded = '';
  try {
    decoded = decodeURIComponent(encodedReturn);
  } catch {
    return null;
  }

  return normalizeStrategyVersionsReturnPath(decoded, strategyId);
}

function buildLineDiff(beforeText: string, afterText: string): DiffLine[] {
  const before = beforeText.split(/\r?\n/);
  const after = afterText.split(/\r?\n/);
  const dp: number[][] = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      if (before[i] === after[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      lines.push({ type: 'equal', text: before[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'removed', text: before[i] });
      i += 1;
    } else {
      lines.push({ type: 'added', text: after[j] });
      j += 1;
    }
  }

  while (i < before.length) {
    lines.push({ type: 'removed', text: before[i] });
    i += 1;
  }

  while (j < after.length) {
    lines.push({ type: 'added', text: after[j] });
    j += 1;
  }

  return lines;
}

function summarizeRuleDiff(diffLines: DiffLine[]): RuleDiffSummary {
  const addedLines = diffLines.filter((line) => line.type === 'added').length;
  const removedLines = diffLines.filter((line) => line.type === 'removed').length;
  return {
    hasChanges: addedLines > 0 || removedLines > 0,
    addedLines,
    removedLines,
  };
}

function summarizePineDiff(compareBasePine: string | null | undefined, currentPine: string | null | undefined): PineDiffSummary {
  const baseExists = typeof compareBasePine === 'string' && compareBasePine.length > 0;
  const currentExists = typeof currentPine === 'string' && currentPine.length > 0;

  if (!baseExists && !currentExists) {
    return {
      hasBase: true,
      baseExists,
      currentExists,
      changed: false,
      lineDelta: 0,
      charDelta: 0,
    };
  }

  const base = compareBasePine ?? '';
  const current = currentPine ?? '';

  return {
    hasBase: true,
    baseExists,
    currentExists,
    changed: base !== current,
    lineDelta: current.split(/\r?\n/).length - base.split(/\r?\n/).length,
    charDelta: current.length - base.length,
  };
}

function buildPineDiffExcerpt(
  compareBasePine: string | null | undefined,
  currentPine: string | null | undefined,
  limit = 5,
): PineDiffExcerpt[] {
  if (!compareBasePine && !currentPine) {
    return [];
  }

  const diffLines = buildLineDiff(compareBasePine ?? '', currentPine ?? '');
  const excerpts: PineDiffExcerpt[] = [];

  for (let i = 0; i < diffLines.length && excerpts.length < limit; i += 1) {
    const line = diffLines[i];
    if (line.type === 'equal') {
      continue;
    }

    if (line.type === 'removed') {
      const next = diffLines[i + 1];
      if (next?.type === 'added') {
        excerpts.push({ kind: 'modified', baseLine: line.text, currentLine: next.text });
        i += 1;
        continue;
      }
      excerpts.push({ kind: 'removed', baseLine: line.text, currentLine: '' });
      continue;
    }

    excerpts.push({ kind: 'added', baseLine: '', currentLine: line.text });
  }

  return excerpts;
}

function groupPineDiffExcerpt(excerpts: PineDiffExcerpt[]): PineDiffSection[] {
  const order: Array<{ kind: PineDiffExcerpt['kind']; label: string }> = [
    { kind: 'modified', label: '変更' },
    { kind: 'added', label: '追加' },
    { kind: 'removed', label: '削除' },
  ];
  return order
    .map(({ kind, label }) => ({
      kind,
      label,
      items: excerpts.filter((excerpt) => excerpt.kind === kind),
    }))
    .filter((section) => section.items.length > 0);
}

export default function StrategyVersionDetail({ params }: StrategyVersionDetailProps) {
  const { versionId } = params;
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const locationWithSearch = search ? `${location}?${search.startsWith('?') ? search.slice(1) : search}` : location;
  const { data, error, isLoading, mutate } = useSWR<StrategyVersionData>(`/api/strategy-versions/${versionId}`, swrFetcher);
  const { data: pineData, mutate: mutatePine } = useSWR<StrategyVersionPineData>(
    `/api/strategy-versions/${versionId}/pine`,
    swrFetcher,
  );
  const {
    data: normalizedSpecData,
    mutate: mutateNormalizedSpec,
  } = useSWR<NormalizedStrategySpecData>(
    `/api/strategy-versions/${versionId}/normalized-spec`,
    swrFetcher,
  );

  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [compileErrorText, setCompileErrorText] = useState('');
  const [validationNote, setValidationNote] = useState('');
  const [revisionRequest, setRevisionRequest] = useState('');
  const [pineRunMeta, setPineRunMeta] = useState<{
    failureReason: string | null;
    repairAttempts: number | null;
    invalidReasonCodes: string[];
  } | null>(null);
  const [pineGenerationJob, setPineGenerationJob] = useState<StrategyVersionPineJobData['job'] | null>(null);
  const [pineCopyFeedback, setPineCopyFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [applyingImprovedVersion, setApplyingImprovedVersion] = useState(false);
  const [applyImprovedVersionMessage, setApplyImprovedVersionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [sourceBacktestImprovementMemo, setSourceBacktestImprovementMemo] = useState('');
  const [sourceBacktestMemoSourceId, setSourceBacktestMemoSourceId] = useState<string | null>(null);
  const [ruleRewriteLoading, setRuleRewriteLoading] = useState(false);
  const [ruleRewriteError, setRuleRewriteError] = useState<string | null>(null);
  const [ruleRewriteWarnings, setRuleRewriteWarnings] = useState<string[]>([]);
  const [ruleRewriteMessage, setRuleRewriteMessage] = useState<string | null>(null);
  const ruleEditorSectionRef = useRef<HTMLDivElement | null>(null);

  const [savingRule, setSavingRule] = useState(false);
  const [saveRuleError, setSaveRuleError] = useState<string | null>(null);
  const [saveRuleMessage, setSaveRuleMessage] = useState<string | null>(null);
  const [generatingNormalizedSpec, setGeneratingNormalizedSpec] = useState(false);
  const [normalizedSpecError, setNormalizedSpecError] = useState<string | null>(null);
  const [normalizedSpecMessage, setNormalizedSpecMessage] = useState<string | null>(null);

  const [editingNaturalLanguageRule, setEditingNaturalLanguageRule] = useState('');

  const version = data?.strategy_version ?? null;
  const compareBase = data?.compare_base ?? null;
  const normalizedSpec = asRecord(normalizedSpecData?.normalized_spec);
  const normalizedSpecEntry = asRecord(normalizedSpec?.entry);
  const normalizedSpecExit = asRecord(normalizedSpec?.exit);
  const normalizedSpecRisk = asRecord(normalizedSpec?.risk);
  const normalizedSpecValidation = asRecord(normalizedSpec?.validation);
  const normalizedSpecIndicators = recordArray(normalizedSpec?.indicators);
  const normalizedSpecEntryConditions = recordArray(normalizedSpecEntry?.conditions);
  const normalizedSpecExitConditions = recordArray(normalizedSpecExit?.conditions);
  const normalizedSpecFilters = recordArray(normalizedSpec?.filters);
  const normalizedSpecWarnings = Array.isArray(normalizedSpec?.warnings)
    ? normalizedSpec.warnings.filter((item): item is string => typeof item === 'string')
    : [];
  const normalizedSpecAssumptions = Array.isArray(normalizedSpec?.assumptions)
    ? normalizedSpec.assumptions.filter((item): item is string => typeof item === 'string')
    : [];
  const normalizedSpecUnsupported = Array.isArray(normalizedSpecValidation?.unsupported_features)
    ? normalizedSpecValidation.unsupported_features.filter((item): item is string => typeof item === 'string')
    : [];
  const warnings = version && Array.isArray(version.warnings) ? version.warnings : [];
  const assumptions = version && Array.isArray(version.assumptions) ? version.assumptions : [];
  const pineState: 'unavailable' | 'generating' | 'warning' | 'failed' | 'available' = regenerating
    ? 'generating'
    : !version?.generated_pine && version?.status !== 'failed'
      ? 'unavailable'
      : version?.status === 'failed'
        ? 'failed'
        : warnings.length > 0
          ? 'warning'
          : 'available';
  const pineStateText =
    pineState === 'generating'
      ? '生成中'
      : pineState === 'unavailable'
        ? '未生成'
        : pineState === 'warning'
          ? '警告あり'
          : pineState === 'failed'
            ? 'failed'
            : '取得済み';
  const displayedPineScriptRaw = pineData?.generated_script ?? version?.generated_pine ?? '';
  const canCopyPine = pineState !== 'failed' && pineState !== 'generating' && displayedPineScriptRaw.trim().length > 0;
  const returnPath = version
    ? parseStrategyVersionsReturnPath(locationWithSearch, version.strategy_id) ?? buildDefaultVersionsReturnPath(version.strategy_id)
    : null;
  const returnQuery = parseStrategyVersionsListQuery(returnPath ?? '/strategies/_/versions');
  const priorityListApiPath = version
    ? `/api/strategies/${version.strategy_id}/versions?page=${returnQuery.page}&limit=20${
        returnQuery.q ? `&q=${encodeURIComponent(returnQuery.q)}` : ''
      }${returnQuery.status ? `&status=${encodeURIComponent(returnQuery.status)}` : ''}&sort=${returnQuery.sort}&order=${returnQuery.order}`
    : null;
  const { data: priorityListData } = useSWR<StrategyVersionListData>(priorityListApiPath, swrFetcher);
  const nextPriorityVersionId = version
    ? findNextPriorityVersionId(version.id, priorityListData?.strategy_versions ?? [])
    : null;
  const nextPriorityDetailUrl = version && nextPriorityVersionId
    ? buildStrategyVersionDetailUrl(
        version.strategy_id,
        nextPriorityVersionId,
        returnQuery.page,
        returnQuery.q,
        returnQuery.status,
        returnQuery.sort,
        returnQuery.order,
      )
    : null;
  const improveApplicationContext = useMemo(() => parseImproveApplicationContext(search), [search]);
  const sourceBacktestApiPath = improveApplicationContext?.sourceBacktestId
    ? `/api/backtests/${improveApplicationContext.sourceBacktestId}`
    : null;
  const refinementCandidateApiPath = improveApplicationContext?.refinementCandidateId
    ? `/api/strategy-refinement-candidates/${improveApplicationContext.refinementCandidateId}`
    : null;
  const {
    data: sourceBacktestData,
    error: sourceBacktestError,
  } = useSWR<BacktestDetailData>(sourceBacktestApiPath, swrFetcher);
  const {
    data: refinementCandidateData,
    error: refinementCandidateError,
  } = useSWR<{ refinement_candidate: StrategyRefinementCandidateData }>(refinementCandidateApiPath, swrFetcher);
  const sourceBacktestMemoText = useMemo(
    () => (sourceBacktestData ? buildSourceBacktestImprovementMemo(sourceBacktestData) : ''),
    [sourceBacktestData],
  );
  const sourceBacktestMetrics = useMemo(
    () => (sourceBacktestData ? buildSourceBacktestMetricRows(sourceBacktestData) : []),
    [sourceBacktestData],
  );
  const sourceBacktestAiKeyPoints = useMemo(
    () => extractAiKeyPoints(sourceBacktestData?.ai_review.structured_json),
    [sourceBacktestData?.ai_review.structured_json],
  );
  const sourceBacktestAiExcerpt = useMemo(
    () => (sourceBacktestData ? buildSourceBacktestAiSummaryExcerpt(sourceBacktestData.ai_review) : ''),
    [sourceBacktestData],
  );
  const effectiveSourceBacktestImprovementMemo = sourceBacktestImprovementMemo.trim() || sourceBacktestMemoText.trim();
  const hasSourceBacktestContext = Boolean(improveApplicationContext?.sourceBacktestId);

  useEffect(() => {
    if (version) {
      setEditingNaturalLanguageRule(version.natural_language_rule);
    }
  }, [version?.id, version?.natural_language_rule]);

  useEffect(() => {
    const latestRevisionInput = pineData?.latest_revision_input;
    if (!latestRevisionInput) {
      return;
    }
    if (!compileErrorText) {
      setCompileErrorText(latestRevisionInput.compile_error_text ?? '');
    }
    if (!validationNote) {
      setValidationNote(latestRevisionInput.validation_note ?? '');
    }
    if (!revisionRequest) {
      setRevisionRequest(latestRevisionInput.revision_request ?? '');
    }
  }, [pineData?.latest_revision_input?.id]);

  useEffect(() => {
    const sourceBacktestId = sourceBacktestData?.backtest.id ?? null;
    if (!sourceBacktestId || sourceBacktestMemoSourceId === sourceBacktestId) {
      return;
    }
    setSourceBacktestImprovementMemo(sourceBacktestMemoText);
    setSourceBacktestMemoSourceId(sourceBacktestId);
  }, [sourceBacktestData?.backtest.id, sourceBacktestMemoSourceId, sourceBacktestMemoText]);

  const ruleDiff = useMemo(() => {
    if (!version || !compareBase) {
      return [];
    }
    return buildLineDiff(compareBase.natural_language_rule, version.natural_language_rule);
  }, [version?.natural_language_rule, compareBase?.natural_language_rule]);

  const ruleDiffSummary = useMemo(() => summarizeRuleDiff(ruleDiff), [ruleDiff]);

  const pineDiff = useMemo(() => {
    if (!compareBase) {
      return {
        hasBase: false,
        baseExists: false,
        currentExists: Boolean(version?.generated_pine),
        changed: false,
        lineDelta: 0,
        charDelta: 0,
      } satisfies PineDiffSummary;
    }
    return summarizePineDiff(compareBase.generated_pine, version?.generated_pine);
  }, [compareBase, version?.generated_pine]);

  const pineDiffExcerpt = useMemo(() => {
    if (!compareBase || !pineDiff.changed) {
      return [];
    }
    return buildPineDiffExcerpt(compareBase.generated_pine, version?.generated_pine);
  }, [compareBase, pineDiff.changed, version?.generated_pine]);

  const pineDiffSections = useMemo(() => groupPineDiffExcerpt(pineDiffExcerpt), [pineDiffExcerpt]);

  const compareSummaryItems = useMemo(() => {
    if (!version || !compareBase) {
      return [] as CompareSummaryItem[];
    }
    const updatedAtChanged = compareBase.updated_at !== version.updated_at;
    const items: CompareSummaryItem[] = [
      {
        key: 'rule',
        label: 'naturalLanguageRule',
        changed: ruleDiffSummary.hasChanges,
        detail: ruleDiffSummary.hasChanges ? `+${ruleDiffSummary.addedLines} / -${ruleDiffSummary.removedLines}` : '差分なし',
      },
      {
        key: 'pine',
        label: 'Pine',
        changed: pineDiff.changed,
        detail: pineDiff.changed
          ? `行差分 ${pineDiff.lineDelta > 0 ? `+${pineDiff.lineDelta}` : pineDiff.lineDelta}, 文字差分 ${
              pineDiff.charDelta > 0 ? `+${pineDiff.charDelta}` : pineDiff.charDelta
            }`
          : '変更なし',
      },
      {
        key: 'status',
        label: 'status',
        changed: compareBase.status !== version.status,
        detail: `${compareBase.status} -> ${version.status}`,
      },
      {
        key: 'updated_at',
        label: 'updatedAt',
        changed: updatedAtChanged,
        detail: `${new Date(compareBase.updated_at).toLocaleString('ja-JP')} -> ${new Date(version.updated_at).toLocaleString('ja-JP')}`,
      },
    ];
    return items;
  }, [compareBase, pineDiff, ruleDiffSummary, version]);

  const firstChangedSummaryItem = compareSummaryItems.find((item) => item.changed) ?? null;

  const pollPineGenerationJob = async (jobId: string) => {
    for (let attempt = 0; attempt < PINE_GENERATION_POLL_MAX_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, PINE_GENERATION_POLL_INTERVAL_MS));
      const data = await fetchApi<StrategyVersionPineJobData>(
        `/api/strategy-versions/${versionId}/pine/generation-jobs/${jobId}`
      );
      setPineGenerationJob(data.job);
      if (data.job.status === 'succeeded' || data.job.status === 'failed') {
        return data.job;
      }
    }
    throw new Error('Pine生成の完了確認がタイムアウトしました。時間をおいて再読み込みしてください。');
  };

  const onGeneratePine = async () => {
    setRegenerating(true);
    setRegenerateError(null);
    setPineRunMeta(null);
    setPineGenerationJob(null);
    try {
      const response = await postApi<StrategyVersionPineJobData>(`/api/strategy-versions/${versionId}/pine/generation-jobs`, {});
      setPineGenerationJob(response.job);
      const completedJob = await pollPineGenerationJob(response.job.id);
      if (completedJob.status !== 'succeeded') {
        throw new Error(buildPineGenerationJobFailureMessage(completedJob.error, 'Pine の再生成に失敗しました。'));
      }
      await mutate();
      await mutatePine();
      setSaveRuleMessage(null);
    } catch (requestError: any) {
      setRegenerateError(requestError?.message ?? 'Pine の再生成に失敗しました。');
    } finally {
      setRegenerating(false);
      setPineGenerationJob(null);
    }
  };

  const onRegenerateWithRevision = async () => {
    setRegenerating(true);
    setRegenerateError(null);
    setPineRunMeta(null);
    setPineGenerationJob(null);
    try {
      const sourcePineScriptId = pineData?.pine_script_id;
      if (!sourcePineScriptId) {
        throw new Error('source_pine_script_id が未取得です。先に Pine を生成してください。');
      }
      const revisionRequestValue = revisionRequest.trim();
      if (!revisionRequestValue) {
        throw new Error('revision_request は必須です。');
      }

      const response = await postApi<StrategyVersionPineJobData>(
        `/api/strategy-versions/${versionId}/pine/regeneration-jobs`,
        {
          source_pine_script_id: sourcePineScriptId,
          compile_error_text: compileErrorText.trim() || undefined,
          validation_note: validationNote.trim() || undefined,
          revision_request: revisionRequestValue,
        },
      );
      setPineGenerationJob(response.job);
      const completedJob = await pollPineGenerationJob(response.job.id);
      if (completedJob.status !== 'succeeded') {
        throw new Error(buildPineGenerationJobFailureMessage(completedJob.error, 'Pine の修正再生成に失敗しました。'));
      }
      await mutate();
      await mutatePine();
      setSaveRuleMessage(null);
    } catch (requestError: any) {
      setRegenerateError(requestError?.message ?? 'Pine の修正再生成に失敗しました。');
    } finally {
      setRegenerating(false);
      setPineGenerationJob(null);
    }
  };

  const showPineCopyFeedback = (type: 'success' | 'error', text: string) => {
    setPineCopyFeedback({ type, text });
    window.setTimeout(() => {
      setPineCopyFeedback((current) => (current?.text === text ? null : current));
    }, 2400);
  };

  const onCopyPine = async () => {
    if (!canCopyPine) {
      showPineCopyFeedback('error', 'コピー対象のPineがありません。');
      return;
    }
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable');
      }
      await navigator.clipboard.writeText(displayedPineScriptRaw);
      showPineCopyFeedback('success', 'コピーしました');
    } catch (error) {
      console.error('Failed to copy pine script', error);
      showPineCopyFeedback('error', 'コピーに失敗しました。手動で選択してコピーしてください');
    }
  };

  const onCloneAsNewVersion = async () => {
    setCloning(true);
    setCloneError(null);
    try {
      const response = await postApi<StrategyVersionData>(`/api/strategy-versions/${versionId}/clone`, {});
      setLocation(`/strategy-versions/${response.strategy_version.id}`);
    } catch (requestError: any) {
      setCloneError(requestError?.message ?? '新しい version の作成に失敗しました。');
    } finally {
      setCloning(false);
    }
  };

  const onApplyImprovedVersion = async () => {
    if (!improveApplicationContext || !version) return;

    setApplyingImprovedVersion(true);
    setApplyImprovedVersionMessage(null);
    try {
      await postApi(`/api/symbols/${improveApplicationContext.symbolId}/strategy-applications`, {
        strategy_id: version.strategy_id,
        strategy_version_id: version.id,
      });
      setApplyImprovedVersionMessage({
        type: 'success',
        text: APPLY_IMPROVED_VERSION_SUCCESS_MESSAGE,
      });
    } catch {
      setApplyImprovedVersionMessage({
        type: 'error',
        text: buildApplyImprovedVersionFailureMessage(),
      });
    } finally {
      setApplyingImprovedVersion(false);
    }
  };

  const onRewriteNaturalLanguageRuleDraft = async () => {
    const memo = effectiveSourceBacktestImprovementMemo;
    if (!memo) return;
    setRuleRewriteLoading(true);
    setRuleRewriteError(null);
    setRuleRewriteWarnings([]);
    setRuleRewriteMessage(null);
    try {
      const response = await postApi<StrategyVersionRuleRewriteDraftData>(
        `/api/strategy-versions/${versionId}/natural-language-rule/rewrite-draft`,
        {
          source_backtest_id: improveApplicationContext?.sourceBacktestId ?? null,
          refinement_candidate_id: improveApplicationContext?.refinementCandidateId ?? null,
          improvement_memo: memo,
          current_rule: editingNaturalLanguageRule,
          mode: 'improvement_from_backtest',
        },
      );
      const draftRule = response.draft.natural_language_rule;
      const unchanged = draftRule.trim() === editingNaturalLanguageRule.trim();
      if (unchanged) {
        setRuleRewriteError('LLM draft は現在の自然言語ルール本文と同じ内容でした。改善メモを具体化して再実行してください。');
        return;
      }
      setEditingNaturalLanguageRule(draftRule);
      setRuleRewriteWarnings([...(response.draft.warnings ?? []), ...(response.draft.assumptions ?? [])].slice(0, 6));
      setRuleRewriteMessage('LLM draft を下の自然言語ルール本文に反映しました。内容を確認してから保存してください。');
      globalThis.setTimeout(() => {
        ruleEditorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        ruleEditorSectionRef.current?.querySelector('textarea')?.focus();
      }, 0);
    } catch (requestError: any) {
      setRuleRewriteError(requestError?.message ?? 'LLM rewrite draft の作成に失敗しました。');
    } finally {
      setRuleRewriteLoading(false);
    }
  };

  const onGenerateNormalizedSpec = async () => {
    setGeneratingNormalizedSpec(true);
    setNormalizedSpecError(null);
    setNormalizedSpecMessage(null);
    try {
      const response = await postApi<NormalizedStrategySpecGenerateData>(
        `/api/strategy-versions/${versionId}/normalized-spec/generate`,
        {},
      );
      await mutateNormalizedSpec({
        strategy_version_id: response.strategy_version.id,
        status: 'available',
        normalized_spec: response.normalized_spec,
        meta: {
          schema_name: 'normalized_strategy_spec',
          schema_version: '1.0',
          internal_backtest_ready: false,
          internal_backtest_ready_reason: 'normalized_strategy_spec v1 is a foundation artifact; internal backtest execution is not enabled.',
        },
      }, false);
      setNormalizedSpecMessage('構造化specを生成しました。表示だけではPine生成やbacktestは起動していません。');
    } catch (requestError: any) {
      setNormalizedSpecError(requestError?.message ?? '構造化specの生成に失敗しました。');
    } finally {
      setGeneratingNormalizedSpec(false);
    }
  };

  const onSaveRule = async () => {
    setSavingRule(true);
    setSaveRuleError(null);
    setSaveRuleMessage(null);
    try {
      const response = await patchApi<StrategyVersionData>(`/api/strategy-versions/${versionId}`, {
        natural_language_rule: editingNaturalLanguageRule,
      });
      await mutate(response, false);
      await mutateNormalizedSpec();
      setNormalizedSpecMessage(null);
      setSaveRuleMessage('ルール本文を保存しました。必要に応じて構造化specを再生成し、その後に Pine を作り直してください。');
    } catch (requestError: any) {
      setSaveRuleError(requestError?.message ?? 'ルール保存に失敗しました。');
    } finally {
      setSavingRule(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className='mx-auto max-w-5xl'>
          <LoadingState title='rule version を読み込み中...' />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className='mx-auto max-w-5xl'>
          <ErrorState title='rule version の取得に失敗しました'>
            エラー: {error.message}
          </ErrorState>
        </div>
      </AppLayout>
    );
  }

  if (!version) {
    return (
      <AppLayout>
        <div className='mx-auto max-w-5xl'>
          <EmptyState title='rule version が見つかりません' />
        </div>
      </AppLayout>
    );
  }
  const resolvedReturnPath = returnPath ?? buildDefaultVersionsReturnPath(version.strategy_id);
  const canRegenerateWithRevision = Boolean(pineData?.pine_script_id);
  const missingSourcePineScriptNotice = !canRegenerateWithRevision
    ? 'Pine 修正再生成には source_pine_script_id が必要です。現在の version では source Pine が未取得のため、既存 Pine を元にした修正再生成はできません。「保存済みルールから Pine を作り直す」は、保存済みの自然言語ルールから新しい Pine を生成する操作です。既存 Pine の細部を継承するとは限りません。'
    : null;

  return (
    <AppLayout>
      <div className='mx-auto max-w-5xl space-y-4'>
        <PageHeader
          title='rule version 詳細'
          description='自然言語ルールと Pine を同じ version 文脈で確認します。'
          actions={
            <>
              <TextLink href='/' className='text-sm text-slate-600 no-underline hover:underline'>ホームへ戻る</TextLink>
              <TextLink href='/strategy-lab' className='text-sm text-slate-600 no-underline hover:underline'>ルール検証ラボへ戻る</TextLink>
              <TextLink href={resolvedReturnPath} className='text-sm text-slate-600 no-underline hover:underline'>
                version 一覧へ
              </TextLink>
              {nextPriorityDetailUrl && (
                <TextLink href={nextPriorityDetailUrl} className='text-sm font-semibold text-rose-800 no-underline hover:underline'>
                  次の最優先確認へ
                </TextLink>
              )}
            </>
          }
        />
      {improveApplicationContext && (
        <section
          data-testid='improve-application-banner'
          style={{
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            background: '#eff6ff',
            padding: '0.85rem 1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#1e3a8a' }}>
                {improveApplicationContext.symbolCode} {improveApplicationContext.symbolName} の適用 strategy を改善中
              </div>
              <div style={{ marginTop: '0.3rem', color: '#334155', fontSize: '0.9rem' }}>
                source application: <code>{improveApplicationContext.applicationId ?? '-'}</code>
                {' / '}
                source version: <code>{improveApplicationContext.sourceVersionId ?? '-'}</code>
                {' / '}
                source backtest: <code>{improveApplicationContext.sourceBacktestId ?? '-'}</code>
              </div>
            </div>
            {improveApplicationContext.returnTo && (
              <TextLink href={improveApplicationContext.returnTo} className='text-sm font-semibold text-blue-800 no-underline hover:underline'>
                {improveApplicationContext.returnTo.startsWith('/backtests/') ? '検証結果へ戻る' : '銘柄ページへ戻る'}
              </TextLink>
            )}
          </div>
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant='primary'
              data-testid='apply-improved-version'
              onClick={onApplyImprovedVersion}
              disabled={applyingImprovedVersion}
            >
              {applyingImprovedVersion ? '適用中...' : 'この銘柄に改善版を適用'}
            </Button>
          </div>
          {applyImprovedVersionMessage && (
            <div
              data-testid='apply-improved-version-message'
              style={{
                marginTop: '0.65rem',
                padding: '0.65rem 0.75rem',
                borderRadius: '6px',
                border: applyImprovedVersionMessage.type === 'success' ? '1px solid #86efac' : '1px solid #fca5a5',
                background: applyImprovedVersionMessage.type === 'success' ? '#f0fdf4' : '#fff1f2',
                color: applyImprovedVersionMessage.type === 'success' ? '#166534' : '#9f1239',
                fontSize: '0.9rem',
              }}
            >
              {applyImprovedVersionMessage.text}
            </div>
          )}
          {sourceBacktestError && improveApplicationContext.sourceBacktestId ? (
            <InlineNotice tone='warning' className='mt-3'>
              元の検証結果メモを取得できませんでした。rule version の確認、編集、Pine 操作はこのまま利用できます。
            </InlineNotice>
          ) : null}
        </section>
      )}
      {sourceBacktestData ? (
        <SectionCard
          title='検証結果からの改善メモ'
          description='元 backtest report を read-only context として確認し、strategy logic の改善は自然言語ルール本文に反映します。表示だけでは保存、Pine 再生成、適用は行いません。'
          className='mt-4'
        >
          <KeyValueList className='mb-3 gap-x-4 gap-y-1 sm:grid-cols-2'>
            <KeyValueRow label='source backtest id'><code>{sourceBacktestData.backtest.id}</code></KeyValueRow>
            <KeyValueRow label='report title'>{compactSafeText(sourceBacktestData.backtest.title, 160) || '-'}</KeyValueRow>
            <KeyValueRow label='execution source'><code>{compactSafeText(sourceBacktestData.backtest.execution_source, 80) || '-'}</code></KeyValueRow>
            <KeyValueRow label='status'>
              <StatusBadge status={compactSafeText(sourceBacktestData.backtest.status, 80) || '-'}>
                {compactSafeText(sourceBacktestData.backtest.status, 80) || '-'}
              </StatusBadge>
            </KeyValueRow>
            <KeyValueRow label='market / timeframe'>
              {compactSafeText(sourceBacktestData.backtest.market, 80) || '-'} / {compactSafeText(sourceBacktestData.backtest.timeframe, 80) || '-'}
            </KeyValueRow>
            <KeyValueRow label='updated'>{formatDateTime(sourceBacktestData.backtest.updated_at)}</KeyValueRow>
            <KeyValueRow label='AI summary'><StatusBadge status={sourceBacktestData.ai_review.status} /></KeyValueRow>
            <KeyValueRow label='AI generated'>{formatDateTime(sourceBacktestData.ai_review.generated_at)}</KeyValueRow>
          </KeyValueList>
          <div className='mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700'>
            <div className='mb-2 font-semibold text-slate-900'>key metrics available</div>
            {sourceBacktestMetrics.length > 0 ? (
              <div className='grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]'>
                {sourceBacktestMetrics.map((metric) => (
                  <div key={metric.label} className='rounded-md border border-slate-200 bg-white p-2'>
                    <div className='text-xs text-slate-500'>{metric.label}</div>
                    <div className='mt-1 font-semibold text-slate-900'>{metric.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className='mb-0 text-slate-600'>表示可能な主要指標はありません。</p>
            )}
          </div>
          <div className='mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700'>
            <div className='mb-2 font-semibold text-slate-900'>AI summary context</div>
            {sourceBacktestData.ai_review.status === 'available' ? (
              <>
                <KeyValueList className='mb-2 gap-x-4 gap-y-1 sm:grid-cols-2'>
                  <KeyValueRow label='title'>{compactSafeText(sourceBacktestData.ai_review.title, 160) || '-'}</KeyValueRow>
                  <KeyValueRow label='generated'>{formatDateTime(sourceBacktestData.ai_review.generated_at)}</KeyValueRow>
                </KeyValueList>
                {sourceBacktestAiKeyPoints.length > 0 ? (
                  <ul className='mb-0 mt-2 pl-5'>
                    {sourceBacktestAiKeyPoints.map((point, index) => (
                      <li key={`${point}-${index}`}>{point}</li>
                    ))}
                  </ul>
                ) : (
                  <p className='mb-0 whitespace-pre-wrap'>{sourceBacktestAiExcerpt || '表示可能な本文抜粋はありません。'}</p>
                )}
              </>
            ) : (
              <p className='mb-0 text-slate-600'>保存済み AI summary は利用できません。</p>
            )}
          </div>
          {sourceBacktestData.symbol_strategy_application?.related_reports?.length ? (
            <InlineNotice tone='info' className='mb-3'>
              同じ application の関連レポートが {sourceBacktestData.symbol_strategy_application.related_reports.length} 件あります。詳細比較は元の BacktestDetail で確認します。
            </InlineNotice>
          ) : null}
          {refinementCandidateData?.refinement_candidate ? (
            <div className='mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate-700'>
              <div className='mb-2 font-semibold text-amber-900'>選択中の改善候補</div>
              <KeyValueList className='gap-x-4 gap-y-1 sm:grid-cols-2'>
                <KeyValueRow label='candidate'>
                  候補{refinementCandidateData.refinement_candidate.candidate_index}: {refinementCandidateData.refinement_candidate.title}
                </KeyValueRow>
                <KeyValueRow label='target'>{refinementCandidateData.refinement_candidate.target_area}</KeyValueRow>
                <KeyValueRow label='change'>{refinementCandidateData.refinement_candidate.change_summary}</KeyValueRow>
                <KeyValueRow label='validation'>{refinementCandidateData.refinement_candidate.validation_plan}</KeyValueRow>
              </KeyValueList>
              {refinementCandidateData.refinement_candidate.session_id ? (
                <div className='mt-3 rounded-md border border-amber-200 bg-white p-3'>
                  <TextLink
                    href={`/strategy-optimization-sessions/${encodeURIComponent(refinementCandidateData.refinement_candidate.session_id)}`}
                    className='font-semibold text-amber-900'
                  >
                    Optimization Session を開く
                  </TextLink>
                  <p className='mb-0 mt-1 text-slate-600'>
                    この候補を含む改善探索 session で、base version と候補 version の検証結果を比較できます。
                  </p>
                </div>
              ) : null}
              <p className='mb-0 mt-2 text-slate-600'>
                LLM rewrite ではこの候補を優先して、単一の自然言語ルール本文 draft を作ります。
              </p>
            </div>
          ) : null}
          {refinementCandidateError ? (
            <InlineNotice tone='warning' className='mb-3'>
              選択中の改善候補を取得できませんでした。source backtest context だけで編集を続行できます。
            </InlineNotice>
          ) : null}
          <TextArea
            label='改善メモ'
            value={sourceBacktestImprovementMemo}
            onChange={(event) => setSourceBacktestImprovementMemo(event.target.value)}
            rows={8}
            helpText='元ルール、検証結果、AI総評、改善メモをもとに、次のPine生成に使う単一の自然言語ルール本文 draft を作ります。'
          />
          <div className='mt-3 flex flex-wrap gap-2'>
            <Button
              variant='primary'
              data-testid='llm-rewrite-natural-language-rule'
              onClick={onRewriteNaturalLanguageRuleDraft}
              disabled={!effectiveSourceBacktestImprovementMemo || ruleRewriteLoading}
            >
              {ruleRewriteLoading ? 'LLM draft 作成中...' : 'LLMで新しいルール本文を作る'}
            </Button>
          </div>
          {ruleRewriteMessage ? (
            <InlineNotice tone='success' className='mt-3'>
              {ruleRewriteMessage}
            </InlineNotice>
          ) : null}
          {ruleRewriteError ? (
            <InlineNotice tone='warning' className='mt-3'>
              {ruleRewriteError}
            </InlineNotice>
          ) : null}
          {ruleRewriteWarnings.length > 0 ? (
            <InlineNotice tone='info' className='mt-3'>
              {ruleRewriteWarnings.join(' / ')}
            </InlineNotice>
          ) : null}
          <InlineNotice tone='info' className='mt-3'>
            押下だけでは保存・Pine生成・検証・適用は行いません。draft を確認してからルール本文を保存してください。
          </InlineNotice>
        </SectionCard>
      ) : null}
      <StrategyVersionLineageTree
        strategyId={version.strategy_id}
        currentVersionId={version.id}
        compact
        title='現在の branch'
        description='現在の version がどの branch にいるかを確認します。node を押すと該当 version 詳細へ移動します。'
      />
      <div ref={ruleEditorSectionRef}>
        <SectionCard
          title='自然言語ルール（編集）'
          description='改善 draft を確認し、自然言語ルール本文を保存してから Pine を作り直します。'
          className='mt-4'
        >
        {hasSourceBacktestContext ? (
          <InlineNotice tone='info' className='mb-3'>
            LLM rewrite で作った draft は保存されません。内容を確認して `ルール本文を保存` を押し、その後に Pine を作り直します。
          </InlineNotice>
        ) : null}
        <div style={{ marginBottom: '0.75rem', color: '#555', fontSize: '0.9rem' }}>
          `ルール本文を保存` は自然言語ルール本文だけを保存します。保存だけでは Pine は更新されません。`保存済みルールから Pine を作り直す` は、保存済みの自然言語ルールをもとに Pine を生成し直します。
        </div>
        <div style={{ marginBottom: '0.75rem', color: '#555', fontSize: '0.9rem' }}>
          Pine生成対象は JP_STOCK / US_STOCK、日足（D）/ 4時間足（4H）/ 1時間足（1H）です。生成したPineはTradingViewのsymbolとchart timeframe上で検証してください。internal backtestの対応範囲拡張ではありません。
        </div>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>1. ルール本文の編集</div>
            <TextArea
              label='自然言語ルール'
              value={editingNaturalLanguageRule}
              onChange={(event) => setEditingNaturalLanguageRule(event.target.value)}
              rows={7}
              helpText='本文を編集したら、先にルール本文を保存します。Pine は別操作で作り直します。'
            />

            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge
                data-testid='pine-generation-state'
                status={pineState === 'failed' ? 'failed' : pineState === 'generating' ? 'running' : pineState === 'warning' ? 'warning' : 'available'}
              >
                Pine 状態: {pineStateText}
              </StatusBadge>
              <Button
                variant='primary'
                onClick={onSaveRule}
                disabled={savingRule}
              >
                {savingRule ? '保存中...' : 'ルール本文を保存'}
              </Button>

              <Button
                variant='primary'
                onClick={onGeneratePine}
                disabled={regenerating}
              >
                {regenerating ? '再生成中...' : '保存済みルールから Pine を作り直す'}
              </Button>
            </div>
          </div>

        </div>
        {regenerating && (
          <PineGenerationProgress
            currentStage={pineGenerationJob?.current_stage ?? 'queued'}
            status={pineGenerationJob?.status ?? 'running'}
            stageHistory={pineGenerationJob?.stage_history ?? []}
            className='mt-3'
          />
        )}
        <div style={{ marginTop: '0.8rem', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '4px', background: '#fafafa' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Pine 実装修正</div>
          <p style={{ margin: '0 0 0.6rem', color: '#555', fontSize: '0.9rem' }}>
            TradingView の compile error や Pine 実装上の微修正に使います。戦略条件そのものを変える場合は、自然言語ルール本文を更新してから Pine を作り直してください。
          </p>
          {missingSourcePineScriptNotice ? (
            <InlineNotice tone='warning' className='mb-3'>
              {missingSourcePineScriptNotice}
            </InlineNotice>
          ) : null}
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            <TextArea
              label='compile_error_text（任意）'
              value={compileErrorText}
              onChange={(event) => setCompileErrorText(event.target.value)}
              rows={2}
              placeholder='例: Undeclared identifier "sma"'
            />
            <TextArea
              label='validation_note（任意）'
              value={validationNote}
              onChange={(event) => setValidationNote(event.target.value)}
              rows={2}
              placeholder='例: シグナルが遅い'
            />
            <TextArea
              label='revision_request（必須）'
              value={revisionRequest}
              onChange={(event) => setRevisionRequest(event.target.value)}
              rows={6}
              placeholder='修正したい内容を入力してください'
            />
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant='primary'
                data-testid='pine-regenerate-button'
                onClick={onRegenerateWithRevision}
                disabled={regenerating || !canRegenerateWithRevision}
              >
                {regenerating ? '再生成中...' : '修正依頼をもとに Pine を再生成'}
              </Button>
              <span style={{ fontSize: '0.85rem', color: '#555' }}>
                source_pine_script_id: <code>{pineData?.pine_script_id ?? '-'}</code>
              </span>
            </div>
          </div>
          {(pineData?.parent_pine_script_id || pineData?.latest_revision_input) && (
            <div data-testid='pine-lineage-summary' style={{ marginTop: '0.65rem', fontSize: '0.86rem', color: '#333' }}>
              <KeyValueList>
                <KeyValueRow label='parent_pine_script_id'><code>{pineData?.parent_pine_script_id ?? '-'}</code></KeyValueRow>
              {pineData?.latest_revision_input && (
                <>
                    <KeyValueRow label='latest_revision_input_id'><code>{pineData.latest_revision_input.id}</code></KeyValueRow>
                    <KeyValueRow label='latest_revision_request'>{pineData.latest_revision_input.revision_request}</KeyValueRow>
                </>
              )}
              </KeyValueList>
            </div>
          )}
        </div>
        </SectionCard>
      </div>

      <SectionCard
        title='構造化ルール spec'
        description='自然言語ルールを、将来の内部バックテストやPine生成補助に使える構造化specとして確認します。表示・生成だけではPine生成やbacktestは起動しません。'
        className='mt-4'
      >
        <div className='mb-3 flex flex-wrap items-center gap-2'>
          <StatusBadge status={normalizedSpecData?.status === 'available' ? 'available' : 'draft'}>
            {normalizedSpecData?.status === 'available' ? 'available' : 'unavailable'}
          </StatusBadge>
          <span className='text-sm text-slate-600'>
            schema: {normalizedSpecData?.meta.schema_name ?? 'normalized_strategy_spec'} / {normalizedSpecData?.meta.schema_version ?? '1.0'}
          </span>
          <span className='text-sm text-slate-600'>
            internal backtest ready: {normalizedSpecData?.meta.internal_backtest_ready ? 'true' : 'false'}
          </span>
        </div>
        <div className='mb-3 flex flex-wrap gap-2'>
          <Button
            variant='primary'
            data-testid='generate-normalized-spec-button'
            onClick={onGenerateNormalizedSpec}
            disabled={generatingNormalizedSpec}
          >
            {generatingNormalizedSpec ? '生成中...' : '構造化specを生成'}
          </Button>
        </div>
        {normalizedSpecMessage ? (
          <InlineNotice tone='success' className='mb-3'>
            {normalizedSpecMessage}
          </InlineNotice>
        ) : null}
        {normalizedSpecError ? (
          <InlineNotice tone='warning' className='mb-3'>
            {normalizedSpecError}
          </InlineNotice>
        ) : null}
        {!normalizedSpec ? (
          <EmptyState title='構造化specはまだありません'>
            `構造化specを生成` を押すと、保存済み自然言語ルールから normalized_strategy_spec v1 を作成します。
          </EmptyState>
        ) : (
          <div className='grid gap-4'>
            <KeyValueList className='gap-x-4 gap-y-1 sm:grid-cols-2'>
              <KeyValueRow label='market'>{stringField(normalizedSpec, 'market')}</KeyValueRow>
              <KeyValueRow label='timeframe'>{stringField(normalizedSpec, 'timeframe')}</KeyValueRow>
              <KeyValueRow label='side'>{stringField(normalizedSpec, 'side')}</KeyValueRow>
              <KeyValueRow label='strategy_family'>{stringField(normalizedSpec, 'strategy_family')}</KeyValueRow>
            </KeyValueList>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='rounded-lg border border-slate-200 bg-slate-50 p-3'>
                <div className='mb-2 font-semibold text-slate-900'>indicators</div>
                {normalizedSpecIndicators.length > 0 ? (
                  <ul className='mb-0 list-disc space-y-1 pl-5 text-sm text-slate-700'>
                    {normalizedSpecIndicators.map((item, index) => (
                      <li key={`indicator-${stringField(item, 'id')}-${index}`}>{normalizedSpecListLabel(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className='mb-0 text-sm text-slate-600'>抽出された indicator はありません。</p>
                )}
              </div>
              <div className='rounded-lg border border-slate-200 bg-slate-50 p-3'>
                <div className='mb-2 font-semibold text-slate-900'>filters</div>
                {normalizedSpecFilters.length > 0 ? (
                  <ul className='mb-0 list-disc space-y-1 pl-5 text-sm text-slate-700'>
                    {normalizedSpecFilters.map((item, index) => (
                      <li key={`filter-${stringField(item, 'id')}-${index}`}>{normalizedSpecListLabel(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className='mb-0 text-sm text-slate-600'>抽出された filter はありません。</p>
                )}
              </div>
              <div className='rounded-lg border border-slate-200 bg-slate-50 p-3'>
                <div className='mb-2 font-semibold text-slate-900'>entry</div>
                {normalizedSpecEntryConditions.length > 0 ? (
                  <ul className='mb-0 list-disc space-y-1 pl-5 text-sm text-slate-700'>
                    {normalizedSpecEntryConditions.map((item, index) => (
                      <li key={`entry-${stringField(item, 'id')}-${index}`}>{normalizedSpecListLabel(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className='mb-0 text-sm text-slate-600'>entry condition は未抽出です。</p>
                )}
              </div>
              <div className='rounded-lg border border-slate-200 bg-slate-50 p-3'>
                <div className='mb-2 font-semibold text-slate-900'>exit / risk</div>
                {normalizedSpecExitConditions.length > 0 ? (
                  <ul className='mb-2 list-disc space-y-1 pl-5 text-sm text-slate-700'>
                    {normalizedSpecExitConditions.map((item, index) => (
                      <li key={`exit-${stringField(item, 'id')}-${index}`}>{normalizedSpecListLabel(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className='mb-2 text-sm text-slate-600'>exit condition は未抽出です。</p>
                )}
                {normalizedSpecRiskLabels(normalizedSpecRisk).length > 0 ? (
                  <ul className='mb-0 list-disc space-y-1 pl-5 text-sm text-slate-700'>
                    {normalizedSpecRiskLabels(normalizedSpecRisk).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className='mb-0 text-sm text-slate-600'>risk rule は未抽出です。</p>
                )}
              </div>
            </div>
            {(normalizedSpecWarnings.length > 0 || normalizedSpecUnsupported.length > 0 || normalizedSpecAssumptions.length > 0) ? (
              <InlineNotice tone='info'>
                {[...normalizedSpecWarnings, ...normalizedSpecUnsupported, ...normalizedSpecAssumptions].join(' / ')}
              </InlineNotice>
            ) : null}
            <details className='rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700'>
              <summary className='cursor-pointer font-semibold text-slate-900'>raw JSON preview</summary>
              <pre className='mt-3 max-h-80 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100'>
                {JSON.stringify(normalizedSpec, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </SectionCard>

      {saveRuleError && (
        <div style={{ marginTop: '0.8rem', padding: '0.75rem', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000', borderRadius: '4px' }}>
          {saveRuleError}
        </div>
      )}
      {saveRuleMessage && (
        <div style={{ marginTop: '0.8rem', padding: '0.75rem', background: '#eef8ee', border: '1px solid #a9d5a9', color: '#1f6a1f', borderRadius: '4px' }}>
          {saveRuleMessage}
        </div>
      )}
      {regenerateError && (
        <div style={{ marginTop: '0.8rem', padding: '0.75rem', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000', borderRadius: '4px' }}>
          {regenerateError}
        </div>
      )}
      {pineRunMeta && (
        <div
          data-testid='pine-generation-meta'
          style={{
            marginTop: '0.8rem',
            padding: '0.75rem',
            background: '#f8f8f8',
            border: '1px solid #ddd',
            borderRadius: '4px',
            color: '#333',
            fontSize: '0.9rem',
          }}
        >
          <div>repair attempts: {pineRunMeta.repairAttempts ?? 0}</div>
          {pineRunMeta.failureReason && <div>failure reason: {pineRunMeta.failureReason}</div>}
          {pineRunMeta.invalidReasonCodes.length > 0 && (
            <div>invalid reason codes: {pineRunMeta.invalidReasonCodes.join(', ')}</div>
          )}
        </div>
      )}
      {cloneError && (
        <div style={{ marginTop: '0.8rem', padding: '0.75rem', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000', borderRadius: '4px' }}>
          {cloneError}
        </div>
      )}

      <details className='mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700'>
        <summary className='cursor-pointer font-semibold text-slate-900'>その他の version 操作</summary>
        <div className='mt-3'>
          <p className='mb-3 text-slate-600'>
            現在の version を元に別 version を作る明示操作です。保存や Pine 作り直しとは別です。
          </p>
          <Button
            onClick={onCloneAsNewVersion}
            disabled={cloning}
          >
            {cloning ? '作成中...' : 'この version を複製する'}
          </Button>
        </div>
      </details>

      <details className='mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700'>
        <summary className='cursor-pointer font-semibold text-slate-900'>詳細情報</summary>
        <KeyValueList className='mt-3'>
          <KeyValueRow label='version_id'><code>{version.id}</code></KeyValueRow>
          <KeyValueRow label='strategy_id'><code>{version.strategy_id}</code></KeyValueRow>
          <KeyValueRow label='clone元 version'><code>{version.cloned_from_version_id ?? '-'}</code></KeyValueRow>
          <KeyValueRow label='市場'>{version.market}</KeyValueRow>
          <KeyValueRow label='時間足'>{formatTimeframeLabel(version.timeframe)}</KeyValueRow>
          <KeyValueRow label='status'>
            <StatusBadge status={version.status}>
              <code>{version.status}</code>
            </StatusBadge>
          </KeyValueRow>
          <KeyValueRow label='作成'>{new Date(version.created_at).toLocaleString('ja-JP')}</KeyValueRow>
          <KeyValueRow label='更新'>{new Date(version.updated_at).toLocaleString('ja-JP')}</KeyValueRow>
        </KeyValueList>
      </details>

      <section style={{ marginTop: '1.2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>比較元との差分（最小）</h2>
        {!compareBase ? (
          <p style={{ color: '#666' }}>比較元の version はありません。</p>
        ) : (
          <div>
            <div style={{ marginBottom: '0.8rem', border: '1px solid #ddd', borderRadius: '4px', padding: '0.75rem', background: '#fafafa' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>比較サマリ</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '999px', background: (ruleDiffSummary.hasChanges || pineDiff.changed || compareBase.status !== version.status) ? '#fff3e6' : '#eef8ee', color: (ruleDiffSummary.hasChanges || pineDiff.changed || compareBase.status !== version.status) ? '#9a4d00' : '#1f6a1f', fontWeight: 600, fontSize: '0.8rem' }}>
                  全体: {(ruleDiffSummary.hasChanges || pineDiff.changed || compareBase.status !== version.status) ? '変更あり' : '変更なし'}
                </span>
                <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '999px', background: ruleDiffSummary.hasChanges ? '#fff3e6' : '#eef8ee', color: ruleDiffSummary.hasChanges ? '#9a4d00' : '#1f6a1f', fontWeight: 600, fontSize: '0.8rem' }}>
                  ルール文: {ruleDiffSummary.hasChanges ? '変更あり' : '変更なし'}
                </span>
                <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '999px', background: compareBase.status !== version.status ? '#fff3e6' : '#eef8ee', color: compareBase.status !== version.status ? '#9a4d00' : '#1f6a1f', fontWeight: 600, fontSize: '0.8rem' }}>
                  status: {compareBase.status !== version.status ? '変更あり' : '変更なし'}
                </span>
                <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '999px', background: pineDiff.changed ? '#fff3e6' : '#eef8ee', color: pineDiff.changed ? '#9a4d00' : '#1f6a1f', fontWeight: 600, fontSize: '0.8rem' }}>
                  Pine: {pineDiff.changed ? '変更あり' : '変更なし'}
                </span>
              </div>
              <div style={{ color: '#444', fontSize: '0.9rem' }}>
                ルール差分: +{ruleDiffSummary.addedLines} / -{ruleDiffSummary.removedLines}
              </div>
              <div style={{ marginTop: '0.5rem', padding: '0.6rem', borderRadius: '4px', background: '#fff' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>優先確認ポイント</div>
                <div style={{ marginBottom: '0.45rem', color: '#444', fontSize: '0.9rem' }}>
                  最初に確認: {firstChangedSummaryItem ? firstChangedSummaryItem.label : '差分は検出されていません'}
                </div>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', color: '#333', fontSize: '0.9rem' }}>
                  {compareSummaryItems.map((item) => (
                    <li key={item.key} style={{ marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 600 }}>{item.label}</span>
                      <span
                        style={{
                          display: 'inline-block',
                          marginLeft: '0.45rem',
                          padding: '0.05rem 0.4rem',
                          borderRadius: '999px',
                          background: item.changed ? '#fff3e6' : '#eef8ee',
                          color: item.changed ? '#9a4d00' : '#1f6a1f',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                        }}
                      >
                        {item.changed ? '変更あり' : '変更なし'}
                      </span>
                      <div style={{ marginTop: '0.12rem', color: '#555' }}>{item.detail}</div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.8rem' }}>
              <div><strong>比較元 version_id:</strong> <code>{compareBase.id}</code></div>
              <div><strong>status:</strong> <code>{compareBase.status}</code> → <code>{version.status}</code></div>
              <div>
                <strong>updatedAt:</strong> {new Date(compareBase.updated_at).toLocaleString('ja-JP')} → {new Date(version.updated_at).toLocaleString('ja-JP')}
              </div>
            </div>
            <div style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ padding: '0.6rem 0.75rem', background: '#f7f7f7', borderBottom: '1px solid #ddd', fontWeight: 600 }}>
                自然言語ルール差分
              </div>
              <pre style={{ margin: 0, padding: '0.75rem', overflowX: 'auto', background: '#fff' }}>
                {ruleDiff.length === 0
                  ? '差分はありません。'
                  : ruleDiff.map((line, index) => {
                      const prefix = line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  ';
                      const color = line.type === 'added' ? '#1f6a1f' : line.type === 'removed' ? '#a10000' : '#444';
                      const bg = line.type === 'added' ? '#f0fff0' : line.type === 'removed' ? '#fff5f5' : 'transparent';
                      return (
                        <div key={`${line.type}-${index}`} style={{ color, background: bg, whiteSpace: 'pre-wrap' }}>
                          {prefix}
                          {line.text || ' '}
                        </div>
                      );
                    })}
              </pre>
            </div>
            <div style={{ marginTop: '0.85rem', border: '1px solid #ddd', borderRadius: '4px', padding: '0.75rem', background: '#fafafa' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Pine 差分（最小）</div>
              <div><strong>比較元 Pine:</strong> {pineDiff.baseExists ? 'あり' : 'なし'}</div>
              <div><strong>現 version Pine:</strong> {pineDiff.currentExists ? 'あり' : 'なし'}</div>
              <div>
                <strong>変更有無:</strong> {pineDiff.changed ? '変更あり' : '変更なし'}
              </div>
              {pineDiff.baseExists && pineDiff.currentExists && pineDiff.changed && (
                <div style={{ marginTop: '0.35rem', color: '#444' }}>
                  行差分: {pineDiff.lineDelta > 0 ? `+${pineDiff.lineDelta}` : pineDiff.lineDelta} / 文字差分: {pineDiff.charDelta > 0 ? `+${pineDiff.charDelta}` : pineDiff.charDelta}
                </div>
              )}
              {pineDiff.changed && pineDiffExcerpt.length > 0 && (
                <div style={{ marginTop: '0.7rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>差分抜粋（先頭{pineDiffExcerpt.length}件）</div>
                  <div style={{ marginBottom: '0.4rem', color: '#444', fontSize: '0.9rem' }}>
                    確認順: 変更 → 追加 → 削除（存在する区分のみ表示）
                  </div>
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    {pineDiffSections.map((section) => (
                      <div key={section.kind} style={{ border: '1px solid #e5e5e5', borderRadius: '4px', padding: '0.5rem', background: '#fff' }}>
                        <div style={{ marginBottom: '0.35rem', fontSize: '0.9rem', color: '#333', fontWeight: 600 }}>
                          {section.label} ({section.items.length})
                        </div>
                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                          {section.items.map((excerpt, index) => (
                            <div key={`${section.kind}-${excerpt.baseLine}-${excerpt.currentLine}-${index}`} style={{ borderTop: index > 0 ? '1px dashed #ececec' : 'none', paddingTop: index > 0 ? '0.35rem' : 0 }}>
                              <div style={{ marginBottom: '0.25rem', fontSize: '0.82rem', color: '#555' }}>
                                区分: {excerpt.kind === 'modified' ? '変更' : excerpt.kind === 'added' ? '追加' : '削除'}
                              </div>
                              <div style={{ color: '#a10000', whiteSpace: 'pre-wrap' }}>
                                <strong>- base:</strong> {excerpt.baseLine || '(なし)'}
                              </div>
                              <div style={{ color: '#1f6a1f', whiteSpace: 'pre-wrap', marginTop: '0.2rem' }}>
                                <strong>+ current:</strong> {excerpt.currentLine || '(なし)'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <SectionCard title='警告' className='mt-4'>
        {warnings.length === 0 ? (
          <EmptyState title='なし' />
        ) : (
          <ul style={{ color: '#8a5b00' }}>
            {warnings.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title='前提' className='mt-4'>
        {assumptions.length === 0 ? (
          <EmptyState title='なし' />
        ) : (
          <ul>
            {assumptions.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title='generated pine'
        className='mt-4'
        actions={(
          <Button
            data-testid='strategy-version-copy-pine-button'
            onClick={onCopyPine}
            disabled={!canCopyPine}
          >
            コピー
          </Button>
        )}
      >
        {pineCopyFeedback && (
          <div
            data-testid='strategy-version-copy-pine-feedback'
            style={{
              marginBottom: '0.5rem',
              color: pineCopyFeedback.type === 'success' ? '#1f6a1f' : '#a10000',
              fontSize: '0.9rem',
            }}
          >
            {pineCopyFeedback.text}
          </div>
        )}
        {displayedPineScriptRaw.trim() ? (
          <pre style={{ margin: 0, padding: '1rem', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '4px', overflowX: 'auto' }}>
            <code>{displayedPineScriptRaw}</code>
          </pre>
        ) : (
          <EmptyState title='まだ生成されていません'>
            ルールを確認後に再生成してください。
          </EmptyState>
        )}
      </SectionCard>
      </div>
    </AppLayout>
  );
}

