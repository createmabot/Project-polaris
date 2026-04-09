import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link, useLocation } from 'wouter';
import { patchApi, postApi, swrFetcher } from '../api/client';
import {
  InternalBacktestEngineActualArtifactData,
  InternalBacktestExecutionCreateData,
  InternalBacktestExecutionResultData,
  InternalBacktestExecutionStatusData,
  StrategyVersionData,
  StrategyVersionListData,
} from '../api/types';
import {
  buildEngineActualRestorePayloadFromInputSnapshot,
  buildEngineActualPayload,
  buildEngineActualSummaryDisplay,
  createDefaultEngineActualFormState,
  ENGINE_ACTUAL_PRESETS,
  type EngineActualFormState,
  getInternalBacktestMessageText,
  getInternalBacktestResultViewModel,
  validateEngineActualForm,
} from './internalBacktestResultViewModel';
import {
  buildStrategyVersionDetailUrl,
  parseStrategyVersionsListQuery,
} from './StrategyVersionList';

type StrategyVersionDetailProps = {
  params: { versionId: string };
};

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

type EngineActualExecutionOverviewItem = {
  executionId: string;
  roleLabel: '比較元' | '再実行';
  presetLabel: string;
  ruleLabel: string;
  tradeCount: number | null;
  totalReturnPct: string | null;
  maxDrawdownPct: string | null;
  isCompareLinked: boolean;
};

function buildDefaultVersionsReturnPath(strategyId: string): string {
  return `/strategies/${strategyId}/versions`;
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

function parseInternalExecutionId(locationPath: string): string | null {
  const search = locationPath.includes('?') ? locationPath.slice(locationPath.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  const rawExecutionId = (params.get('internalExecutionId') ?? '').trim();
  return rawExecutionId.length > 0 ? rawExecutionId : null;
}

function parseInternalCompareSourceExecutionId(locationPath: string): string | null {
  const search = locationPath.includes('?') ? locationPath.slice(locationPath.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  const rawExecutionId = (params.get('internalCompareSourceExecutionId') ?? '').trim();
  return rawExecutionId.length > 0 ? rawExecutionId : null;
}

function resolveEngineActualArtifactApiPath(
  executionId: string,
  artifactPointerPath: unknown,
): string {
  if (typeof artifactPointerPath === 'string' && artifactPointerPath.trim().length > 0) {
    const trimmed = artifactPointerPath.trim();
    if (trimmed.startsWith('/api/')) {
      return trimmed;
    }
    if (trimmed.startsWith('/internal-backtests/')) {
      return `/api${trimmed}`;
    }
  }
  return `/api/internal-backtests/executions/${executionId}/artifacts/engine_actual/trades-and-equity`;
}

function getDefaultDateRangeForInternalBacktest() {
  const to = new Date();
  const from = new Date(to.getTime());
  from.setDate(from.getDate() - 365);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function toEngineActualPresetLabel(
  restorePayload: ReturnType<typeof buildEngineActualRestorePayloadFromInputSnapshot>,
): string {
  if (!restorePayload) {
    return 'preset不明';
  }
  const preset = ENGINE_ACTUAL_PRESETS.find((item) => item.id === restorePayload.form.presetId);
  return preset?.label ?? 'preset不明';
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
  const { data, error, isLoading, mutate } = useSWR<StrategyVersionData>(`/api/strategy-versions/${versionId}`, swrFetcher);

  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const [savingRule, setSavingRule] = useState(false);
  const [saveRuleError, setSaveRuleError] = useState<string | null>(null);
  const [saveRuleMessage, setSaveRuleMessage] = useState<string | null>(null);
  const [savingForwardNote, setSavingForwardNote] = useState(false);
  const [saveForwardNoteError, setSaveForwardNoteError] = useState<string | null>(null);
  const [saveForwardNoteMessage, setSaveForwardNoteMessage] = useState<string | null>(null);

  const [editingNaturalLanguageRule, setEditingNaturalLanguageRule] = useState('');
  const [editingForwardValidationNote, setEditingForwardValidationNote] = useState('');
  const [startingInternalBacktest, setStartingInternalBacktest] = useState(false);
  const [startInternalBacktestError, setStartInternalBacktestError] = useState<string | null>(null);
  const [internalBacktestSymbol, setInternalBacktestSymbol] = useState('7203');
  const [summaryMode, setSummaryMode] = useState<'engine_estimated' | 'engine_actual'>('engine_estimated');
  const [engineActualForm, setEngineActualForm] = useState<EngineActualFormState>(
    () => createDefaultEngineActualFormState(),
  );
  const [engineActualFormError, setEngineActualFormError] = useState<string | null>(null);
  const [internalExecutionId, setInternalExecutionId] = useState<string | null>(() => parseInternalExecutionId(location));
  const [pendingEngineActualCompareSourceExecutionId, setPendingEngineActualCompareSourceExecutionId] = useState<
    string | null
  >(null);
  const [engineActualCompareSourceExecutionId, setEngineActualCompareSourceExecutionId] = useState<string | null>(
    () => parseInternalCompareSourceExecutionId(location),
  );

  const version = data?.strategy_version ?? null;
  const compareBase = data?.compare_base ?? null;
  const warnings = version && Array.isArray(version.warnings) ? version.warnings : [];
  const assumptions = version && Array.isArray(version.assumptions) ? version.assumptions : [];
  const returnPath = version
    ? parseStrategyVersionsReturnPath(location, version.strategy_id) ?? buildDefaultVersionsReturnPath(version.strategy_id)
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
  const { from: defaultRangeFrom, to: defaultRangeTo } = useMemo(
    () => getDefaultDateRangeForInternalBacktest(),
    [],
  );
  const [internalBacktestRangeFrom, setInternalBacktestRangeFrom] = useState(defaultRangeFrom);
  const [internalBacktestRangeTo, setInternalBacktestRangeTo] = useState(defaultRangeTo);
  const internalExecutionStatusApiPath = internalExecutionId
    ? `/api/internal-backtests/executions/${internalExecutionId}`
    : null;
  const { data: internalExecutionStatusData, error: internalExecutionStatusError } = useSWR<InternalBacktestExecutionStatusData>(
    internalExecutionStatusApiPath,
    swrFetcher,
    {
      refreshInterval: (currentData) => {
        const currentStatus = currentData?.execution?.status;
        return currentStatus === 'queued' || currentStatus === 'running' ? 1500 : 0;
      },
    },
  );
  const internalExecutionStatus = internalExecutionStatusData?.execution?.status ?? null;
  const internalExecutionResultApiPath = internalExecutionId && internalExecutionStatus === 'succeeded'
    ? `/api/internal-backtests/executions/${internalExecutionId}/result`
    : null;
  const { data: internalExecutionResultData, error: internalExecutionResultError } = useSWR<InternalBacktestExecutionResultData>(
    internalExecutionResultApiPath,
    swrFetcher,
  );
  const isEngineActualResult = internalExecutionResultData?.result_summary?.summary_kind === 'engine_actual';
  const persistedCompareBaseExecutionId = useMemo(() => {
    const inputSnapshot = internalExecutionResultData?.input_snapshot as
      | { engine_config?: { compare_base_execution_id?: unknown } | null }
      | null
      | undefined;
    const rawValue = inputSnapshot?.engine_config?.compare_base_execution_id;
    if (typeof rawValue !== 'string') {
      return null;
    }
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [internalExecutionResultData?.input_snapshot]);
  const resolvedCompareSourceExecutionId =
    engineActualCompareSourceExecutionId ??
    (isEngineActualResult ? persistedCompareBaseExecutionId : null);
  const compareSourceExecutionStatusApiPath = resolvedCompareSourceExecutionId
    ? `/api/internal-backtests/executions/${resolvedCompareSourceExecutionId}`
    : null;
  const {
    data: compareSourceExecutionStatusData,
    error: compareSourceExecutionStatusError,
  } = useSWR<InternalBacktestExecutionStatusData>(compareSourceExecutionStatusApiPath, swrFetcher);
  const compareSourceExecutionStatus = compareSourceExecutionStatusData?.execution?.status ?? null;
  const compareSourceExecutionResultApiPath = resolvedCompareSourceExecutionId &&
    compareSourceExecutionStatus === 'succeeded'
      ? `/api/internal-backtests/executions/${resolvedCompareSourceExecutionId}/result`
      : null;
  const {
    data: compareSourceExecutionResultData,
    error: compareSourceExecutionResultError,
  } = useSWR<InternalBacktestExecutionResultData>(compareSourceExecutionResultApiPath, swrFetcher);
  const isComparableEngineActualExecution =
    internalExecutionStatus === 'succeeded' &&
    compareSourceExecutionStatus === 'succeeded' &&
    internalExecutionResultData?.result_summary?.summary_kind === 'engine_actual' &&
    compareSourceExecutionResultData?.result_summary?.summary_kind === 'engine_actual';
  const internalEngineActualArtifactApiPath = internalExecutionId && internalExecutionStatus === 'succeeded' && isEngineActualResult
    ? resolveEngineActualArtifactApiPath(internalExecutionId, internalExecutionResultData?.artifact_pointer?.path)
    : null;
  const {
    data: internalEngineActualArtifactData,
    error: internalEngineActualArtifactError,
    isLoading: internalEngineActualArtifactLoading,
  } = useSWR<InternalBacktestEngineActualArtifactData>(internalEngineActualArtifactApiPath, swrFetcher);
  const internalEngineActualArtifactErrorCode =
    (internalEngineActualArtifactError as { code?: string } | null)?.code ?? null;
  const isEngineActualArtifactNotReady = internalEngineActualArtifactErrorCode === 'RESULT_NOT_READY';
  const isEngineActualArtifactNotFound = internalEngineActualArtifactErrorCode === 'NOT_FOUND';
  const internalExecutionViewModel = useMemo(
    () =>
      getInternalBacktestResultViewModel({
        status: internalExecutionStatus ?? 'not_ready',
        errorCode: internalExecutionStatusData?.execution?.error_code ?? null,
        summaryKind: internalExecutionResultData?.result_summary?.summary_kind ?? null,
        metricsBarCount: internalExecutionResultData?.result_summary?.metrics?.bar_count ?? null,
        snapshotBarCount: internalExecutionResultData?.input_snapshot?.data_source_snapshot?.bar_count ?? null,
      }),
    [internalExecutionResultData, internalExecutionStatus, internalExecutionStatusData?.execution?.error_code],
  );
  const internalExecutionMessageText = getInternalBacktestMessageText(
    internalExecutionViewModel.recommendedMessageKey,
  );
  const engineActualSummaryDisplay = useMemo(() => {
    if (!isEngineActualResult) {
      return null;
    }
    return buildEngineActualSummaryDisplay(
      internalExecutionResultData?.result_summary?.metrics,
      (internalExecutionResultData?.input_snapshot as { actual_rules?: Array<{ kind: string; [key: string]: unknown }> | null } | null | undefined)?.actual_rules,
    );
  }, [
    isEngineActualResult,
    internalExecutionResultData?.result_summary?.metrics,
    internalExecutionResultData?.input_snapshot,
  ]);
  const compareSourceEngineActualSummaryDisplay = useMemo(() => {
    if (!isComparableEngineActualExecution) {
      return null;
    }
    return buildEngineActualSummaryDisplay(
      compareSourceExecutionResultData?.result_summary?.metrics,
      (compareSourceExecutionResultData?.input_snapshot as {
        actual_rules?: Array<{ kind: string; [key: string]: unknown }> | null;
      } | null | undefined)?.actual_rules,
    );
  }, [compareSourceExecutionResultData, isComparableEngineActualExecution]);
  const showEngineActualComparison =
    isComparableEngineActualExecution &&
    engineActualSummaryDisplay !== null &&
    compareSourceEngineActualSummaryDisplay !== null &&
    internalExecutionId !== null &&
    resolvedCompareSourceExecutionId !== null;
  const engineActualRestorePayload = useMemo(
    () => buildEngineActualRestorePayloadFromInputSnapshot(internalExecutionResultData?.input_snapshot),
    [internalExecutionResultData?.input_snapshot],
  );
  const compareSourceEngineActualRestorePayload = useMemo(
    () => buildEngineActualRestorePayloadFromInputSnapshot(compareSourceExecutionResultData?.input_snapshot),
    [compareSourceExecutionResultData?.input_snapshot],
  );
  const engineActualExecutionOverviewItems = useMemo<EngineActualExecutionOverviewItem[]>(() => {
    if (
      !isEngineActualResult ||
      !internalExecutionId ||
      !engineActualSummaryDisplay
    ) {
      return [];
    }

    const rows: EngineActualExecutionOverviewItem[] = [];
    if (
      resolvedCompareSourceExecutionId &&
      compareSourceEngineActualSummaryDisplay
    ) {
      rows.push({
        executionId: resolvedCompareSourceExecutionId,
        roleLabel: '比較元',
        presetLabel: toEngineActualPresetLabel(compareSourceEngineActualRestorePayload),
        ruleLabel: compareSourceEngineActualSummaryDisplay.rulePatternLabel,
        tradeCount: compareSourceEngineActualSummaryDisplay.tradeCount,
        totalReturnPct: compareSourceEngineActualSummaryDisplay.totalReturnPct,
        maxDrawdownPct: compareSourceEngineActualSummaryDisplay.maxDrawdownPct,
        isCompareLinked: true,
      });
    }
    rows.push({
      executionId: internalExecutionId,
      roleLabel: '再実行',
      presetLabel: toEngineActualPresetLabel(engineActualRestorePayload),
      ruleLabel: engineActualSummaryDisplay.rulePatternLabel,
      tradeCount: engineActualSummaryDisplay.tradeCount,
      totalReturnPct: engineActualSummaryDisplay.totalReturnPct,
      maxDrawdownPct: engineActualSummaryDisplay.maxDrawdownPct,
      isCompareLinked: Boolean(resolvedCompareSourceExecutionId),
    });
    return rows;
  }, [
    compareSourceEngineActualRestorePayload,
    compareSourceEngineActualSummaryDisplay,
    engineActualRestorePayload,
    engineActualSummaryDisplay,
    internalExecutionId,
    isEngineActualResult,
    resolvedCompareSourceExecutionId,
  ]);

  useEffect(() => {
    setInternalExecutionId(parseInternalExecutionId(location));
    setEngineActualCompareSourceExecutionId(parseInternalCompareSourceExecutionId(location));
    setStartInternalBacktestError(null);
  }, [location, versionId]);

  useEffect(() => {
    setInternalBacktestRangeFrom(defaultRangeFrom);
    setInternalBacktestRangeTo(defaultRangeTo);
  }, [defaultRangeFrom, defaultRangeTo]);

  useEffect(() => {
    if (version) {
      setEditingNaturalLanguageRule(version.natural_language_rule);
      setEditingForwardValidationNote(version.forward_validation_note ?? '');
    }
  }, [version?.id, version?.natural_language_rule, version?.forward_validation_note]);

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

  const onRegenerate = async () => {
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const response = await postApi<StrategyVersionData>(`/api/strategy-versions/${versionId}/pine/generate`, {});
      await mutate(response, false);
      setSaveRuleMessage(null);
    } catch (requestError: any) {
      setRegenerateError(requestError?.message ?? 'Pine の再生成に失敗しました。');
    } finally {
      setRegenerating(false);
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

  const onSaveRule = async () => {
    setSavingRule(true);
    setSaveRuleError(null);
    setSaveRuleMessage(null);
    try {
      const response = await patchApi<StrategyVersionData>(`/api/strategy-versions/${versionId}`, {
        natural_language_rule: editingNaturalLanguageRule,
      });
      await mutate(response, false);
      setSaveRuleMessage('ルール本文を保存しました。必要に応じて Pine を再生成してください。');
    } catch (requestError: any) {
      setSaveRuleError(requestError?.message ?? 'ルール保存に失敗しました。');
    } finally {
      setSavingRule(false);
    }
  };

  const onSaveForwardValidationNote = async () => {
    setSavingForwardNote(true);
    setSaveForwardNoteError(null);
    setSaveForwardNoteMessage(null);
    try {
      const response = await patchApi<StrategyVersionData>(`/api/strategy-versions/${versionId}`, {
        forward_validation_note: editingForwardValidationNote,
      });
      await mutate(response, false);
      await mutate(response, false);
      setSaveForwardNoteMessage('フォワード検証ノートを保存しました。');
    } catch (requestError: any) {
      setSaveForwardNoteError(requestError?.message ?? 'フォワード検証ノート保存に失敗しました。');
    } finally {
      setSavingForwardNote(false);
    }
  };

  const onStartInternalBacktest = async () => {
    if (!version) return;

    if (summaryMode === 'engine_actual') {
      const formError = validateEngineActualForm(engineActualForm);
      if (formError) {
        setEngineActualFormError(formError);
        return;
      }
      setEngineActualFormError(null);
    }

    setStartingInternalBacktest(true);
    setStartInternalBacktestError(null);
    try {
      const { actual_rules, costs } = summaryMode === 'engine_actual'
        ? buildEngineActualPayload(engineActualForm)
        : { actual_rules: undefined, costs: undefined };

      const engineConfig: Record<string, unknown> = {
        summary_mode: summaryMode,
      };
      if (summaryMode === 'engine_actual' && actual_rules !== undefined) {
        engineConfig['actual_rules'] = actual_rules;
      }
      if (summaryMode === 'engine_actual' && costs !== undefined) {
        engineConfig['costs'] = costs;
      }
      if (summaryMode === 'engine_actual' && pendingEngineActualCompareSourceExecutionId) {
        engineConfig['compare_base_execution_id'] = pendingEngineActualCompareSourceExecutionId;
      }

      const response = await postApi<InternalBacktestExecutionCreateData>('/api/internal-backtests/executions', {
        strategy_rule_version_id: version.id,
        market: version.market,
        timeframe: version.timeframe,
        data_range: {
          from: internalBacktestRangeFrom,
          to: internalBacktestRangeTo,
        },
        execution_target: {
          symbol: internalBacktestSymbol.trim(),
          source_kind: 'daily_ohlcv',
        },
        engine_config: engineConfig,
      });
      setInternalExecutionId(response.execution.id);
      if (summaryMode === 'engine_actual' && pendingEngineActualCompareSourceExecutionId) {
        setEngineActualCompareSourceExecutionId(pendingEngineActualCompareSourceExecutionId);
      } else {
        setEngineActualCompareSourceExecutionId(null);
      }
      setPendingEngineActualCompareSourceExecutionId(null);
    } catch (requestError: any) {
      setStartInternalBacktestError(requestError?.message ?? '内製バックテストの開始に失敗しました。');
    } finally {
      setStartingInternalBacktest(false);
    }
  };

  const onRestoreEngineActualPreset = () => {
    if (!engineActualRestorePayload) {
      return;
    }
    setSummaryMode('engine_actual');
    setEngineActualForm(engineActualRestorePayload.form);
    if (engineActualRestorePayload.symbol) {
      setInternalBacktestSymbol(engineActualRestorePayload.symbol);
    }
    if (engineActualRestorePayload.dataRange) {
      setInternalBacktestRangeFrom(engineActualRestorePayload.dataRange.from);
      setInternalBacktestRangeTo(engineActualRestorePayload.dataRange.to);
    }
    setEngineActualFormError(null);
    setStartInternalBacktestError(null);
    setPendingEngineActualCompareSourceExecutionId(internalExecutionId);
  };

  if (isLoading) {
    return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  }

  if (!version) {
    return null;
  }
  const resolvedReturnPath = returnPath ?? buildDefaultVersionsReturnPath(version.strategy_id);

  return (
    <div style={{ padding: '2rem', maxWidth: '920px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホームへ戻る</Link>
        <Link href='/strategy-lab' style={{ color: '#666', textDecoration: 'none' }}>ルール検証ラボへ戻る</Link>
        <Link href={resolvedReturnPath} style={{ color: '#666', textDecoration: 'none' }}>
          version 一覧へ
        </Link>
        {nextPriorityDetailUrl && (
          <Link href={nextPriorityDetailUrl} style={{ color: '#8a1212', textDecoration: 'none', fontWeight: 600 }}>
            次の最優先確認へ
          </Link>
        )}
      </div>

      <h1>rule version 詳細</h1>
      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.4rem', fontSize: '0.95rem' }}>
        <div><strong>version_id:</strong> <code>{version.id}</code></div>
        <div><strong>strategy_id:</strong> <code>{version.strategy_id}</code></div>
        <div><strong>clone元 version:</strong> <code>{version.cloned_from_version_id ?? '-'}</code></div>
        <div><strong>市場:</strong> {version.market}</div>
        <div><strong>時間足:</strong> {version.timeframe}</div>
        <div><strong>status:</strong> <code>{version.status}</code></div>
        <div><strong>作成:</strong> {new Date(version.created_at).toLocaleString('ja-JP')}</div>
        <div><strong>更新:</strong> {new Date(version.updated_at).toLocaleString('ja-JP')}</div>
      </div>

      <section style={{ marginTop: '1.2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>自然言語ルール（編集）</h2>
        <textarea
          value={editingNaturalLanguageRule}
          onChange={(event) => setEditingNaturalLanguageRule(event.target.value)}
          rows={7}
          style={{ width: '100%', padding: '0.7rem', borderRadius: '4px', border: '1px solid #ccc', resize: 'vertical' }}
        />

        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type='button'
            onClick={onSaveRule}
            disabled={savingRule}
            style={{
              padding: '0.55rem 0.95rem',
              border: 'none',
              borderRadius: '4px',
              background: savingRule ? '#9cbbe0' : '#0a5bb5',
              color: '#fff',
              cursor: savingRule ? 'default' : 'pointer',
            }}
          >
            {savingRule ? '保存中...' : '保存'}
          </button>

          <button
            type='button'
            onClick={onRegenerate}
            disabled={regenerating}
            style={{
              padding: '0.55rem 0.95rem',
              border: 'none',
              borderRadius: '4px',
              background: regenerating ? '#9cbbe0' : '#0a5bb5',
              color: '#fff',
              cursor: regenerating ? 'default' : 'pointer',
            }}
          >
            {regenerating ? '再生成中...' : 'Pine を再生成'}
          </button>

          <button
            type='button'
            onClick={onCloneAsNewVersion}
            disabled={cloning}
            style={{
              padding: '0.55rem 0.95rem',
              border: '1px solid #0a5bb5',
              borderRadius: '4px',
              background: '#fff',
              color: '#0a5bb5',
              cursor: cloning ? 'default' : 'pointer',
            }}
          >
            {cloning ? '作成中...' : '新しい version を作る'}
          </button>
        </div>

        <div style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
          保存はルール本文のみ更新します。再生成ボタンで更新済みルールから Pine を作り直します。
        </div>
      </section>

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
      {cloneError && (
        <div style={{ marginTop: '0.8rem', padding: '0.75rem', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000', borderRadius: '4px' }}>
          {cloneError}
        </div>
      )}

      <section style={{ marginTop: '1.2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>次の検証ノート</h2>
        <div style={{ marginBottom: '0.6rem', color: '#444', fontSize: '0.92rem' }}>
          現在のノート: {version.forward_validation_note && version.forward_validation_note.trim() ? version.forward_validation_note : '未設定'}
        </div>
        <div style={{ marginBottom: '0.6rem', color: '#444', fontSize: '0.88rem' }}>
          ノート更新目安: {version.forward_validation_note && version.forward_validation_note.trim()
            ? (version.forward_validation_note_updated_at
                ? new Date(version.forward_validation_note_updated_at).toLocaleString('ja-JP')
                : '-')
            : '-'}
        </div>
        <textarea
          value={editingForwardValidationNote}
          onChange={(event) => setEditingForwardValidationNote(event.target.value)}
          rows={4}
          placeholder='次に検証したい条件や見直し方針を記録します'
          style={{ width: '100%', padding: '0.7rem', borderRadius: '4px', border: '1px solid #ccc', resize: 'vertical' }}
        />
        <div style={{ marginTop: '0.7rem' }}>
          <button
            type='button'
            onClick={onSaveForwardValidationNote}
            disabled={savingForwardNote}
            style={{
              padding: '0.55rem 0.95rem',
              border: 'none',
              borderRadius: '4px',
              background: savingForwardNote ? '#9cbbe0' : '#0a5bb5',
              color: '#fff',
              cursor: savingForwardNote ? 'default' : 'pointer',
            }}
          >
            {savingForwardNote ? '保存中...' : 'ノートを保存'}
          </button>
        </div>
        {saveForwardNoteError && (
          <div style={{ marginTop: '0.8rem', padding: '0.75rem', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000', borderRadius: '4px' }}>
            {saveForwardNoteError}
          </div>
        )}
        {saveForwardNoteMessage && (
          <div style={{ marginTop: '0.8rem', padding: '0.75rem', background: '#eef8ee', border: '1px solid #a9d5a9', color: '#1f6a1f', borderRadius: '4px' }}>
            {saveForwardNoteMessage}
          </div>
        )}
      </section>

      <section style={{ marginTop: '1.2rem', border: '1px solid #ddd', borderRadius: '6px', padding: '0.85rem', background: '#fafafa' }}>
        <h2 style={{ marginTop: 0, marginBottom: '0.6rem' }}>内製バックテスト（最小）</h2>
        <div style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.7rem', fontSize: '0.9rem' }}>
          <div><strong>execution_id:</strong> <code>{internalExecutionId ?? '-'}</code></div>
          <div><strong>status:</strong> <code>{internalExecutionStatus ?? '-'}</code></div>
          <div><strong>state_label:</strong> <code>{internalExecutionViewModel.stateLabel}</code></div>
          <div><strong>判定カテゴリ:</strong> <code>{internalExecutionViewModel.interpretation}</code></div>
          <div><strong>ガイド:</strong> {internalExecutionMessageText}</div>
        </div>

        <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span>symbol</span>
            <input
              value={internalBacktestSymbol}
              onChange={(event) => setInternalBacktestSymbol(event.target.value)}
              placeholder='例: 7203'
              style={{ border: '1px solid #bbb', borderRadius: '4px', padding: '0.35rem 0.45rem', minWidth: '9rem' }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span>モード</span>
            <select
              data-testid='summary-mode-select'
              value={summaryMode}
              onChange={(event) => {
                const val = event.target.value as 'engine_estimated' | 'engine_actual';
                setSummaryMode(val);
                setEngineActualFormError(null);
              }}
              style={{ border: '1px solid #bbb', borderRadius: '4px', padding: '0.35rem 0.4rem' }}
            >
              <option value='engine_estimated'>engine_estimated</option>
              <option value='engine_actual'>engine_actual</option>
            </select>
          </label>
        </div>

        {summaryMode === 'engine_actual' && (
          <div
            data-testid='engine-actual-form'
            style={{
              marginTop: '0.55rem',
              padding: '0.6rem 0.75rem',
              background: '#f0f4ff',
              border: '1px solid #b8cef4',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}>engine_actual ルール設定</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <span>preset</span>
              <select
                data-testid='engine-actual-preset-select'
                value={engineActualForm.presetId}
                onChange={(event) => {
                  setEngineActualForm((prev) => ({
                    ...prev,
                    presetId: event.target.value as EngineActualFormState['presetId'],
                  }));
                  setEngineActualFormError(null);
                }}
                style={{ border: '1px solid #bbb', borderRadius: '4px', padding: '0.3rem 0.4rem' }}
              >
                {ENGINE_ACTUAL_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ marginTop: '0.3rem', color: '#555', fontSize: '0.84rem' }}>
              {ENGINE_ACTUAL_PRESETS.find((p) => p.id === engineActualForm.presetId)?.description}
            </div>

            {ENGINE_ACTUAL_PRESETS.find((p) => p.id === engineActualForm.presetId)?.needsPeriod && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.9rem' }}>
                <span>period (2-200)</span>
                <input
                  data-testid='engine-actual-period-input'
                  type='number'
                  min={2}
                  max={200}
                  step={1}
                  value={engineActualForm.smaPeriod}
                  onChange={(event) => {
                    setEngineActualForm((prev) => ({ ...prev, smaPeriod: event.target.value }));
                    setEngineActualFormError(null);
                  }}
                  placeholder='例: 25'
                  style={{ border: '1px solid #bbb', borderRadius: '4px', padding: '0.3rem 0.4rem', width: '6rem' }}
                />
              </label>
            )}

            {ENGINE_ACTUAL_PRESETS.find((p) => p.id === engineActualForm.presetId)?.needsThreshold && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.9rem' }}>
                <span>threshold</span>
                <input
                  data-testid='engine-actual-threshold-input'
                  type='number'
                  min={0}
                  step='any'
                  value={engineActualForm.thresholdValue}
                  onChange={(event) => {
                    setEngineActualForm((prev) => ({ ...prev, thresholdValue: event.target.value }));
                    setEngineActualFormError(null);
                  }}
                  placeholder='例: 500'
                  style={{ border: '1px solid #bbb', borderRadius: '4px', padding: '0.3rem 0.4rem', width: '8rem' }}
                />
              </label>
            )}

            <div style={{ marginTop: '0.45rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                <span>fee rate (bps)</span>
                <input
                  data-testid='engine-actual-fee-bps-input'
                  type='number'
                  min={0}
                  step='any'
                  value={engineActualForm.feeRateBps}
                  onChange={(event) => {
                    setEngineActualForm((prev) => ({ ...prev, feeRateBps: event.target.value }));
                    setEngineActualFormError(null);
                  }}
                  placeholder='例: 10'
                  style={{ border: '1px solid #bbb', borderRadius: '4px', padding: '0.3rem 0.4rem', width: '7rem' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                <span>slippage (bps)</span>
                <input
                  data-testid='engine-actual-slippage-bps-input'
                  type='number'
                  min={0}
                  step='any'
                  value={engineActualForm.slippageBps}
                  onChange={(event) => {
                    setEngineActualForm((prev) => ({ ...prev, slippageBps: event.target.value }));
                    setEngineActualFormError(null);
                  }}
                  placeholder='例: 5'
                  style={{ border: '1px solid #bbb', borderRadius: '4px', padding: '0.3rem 0.4rem', width: '7rem' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                <span>max_holding_bars</span>
                <input
                  data-testid='engine-actual-max-holding-bars-input'
                  type='number'
                  min={1}
                  step={1}
                  value={engineActualForm.maxHoldingBars}
                  onChange={(event) => {
                    setEngineActualForm((prev) => ({ ...prev, maxHoldingBars: event.target.value }));
                    setEngineActualFormError(null);
                  }}
                  placeholder='例: 20'
                  style={{ border: '1px solid #bbb', borderRadius: '4px', padding: '0.3rem 0.4rem', width: '7rem' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                <span>take_profit_percent</span>
                <input
                  data-testid='engine-actual-take-profit-percent-input'
                  type='number'
                  min={0}
                  step='any'
                  value={engineActualForm.takeProfitPercent}
                  onChange={(event) => {
                    setEngineActualForm((prev) => ({ ...prev, takeProfitPercent: event.target.value }));
                    setEngineActualFormError(null);
                  }}
                  placeholder='例: 8'
                  style={{ border: '1px solid #bbb', borderRadius: '4px', padding: '0.3rem 0.4rem', width: '7rem' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                <span>stop_loss_percent</span>
                <input
                  data-testid='engine-actual-stop-loss-percent-input'
                  type='number'
                  min={0}
                  step='any'
                  value={engineActualForm.stopLossPercent}
                  onChange={(event) => {
                    setEngineActualForm((prev) => ({ ...prev, stopLossPercent: event.target.value }));
                    setEngineActualFormError(null);
                  }}
                  placeholder='例: 4'
                  style={{ border: '1px solid #bbb', borderRadius: '4px', padding: '0.3rem 0.4rem', width: '7rem' }}
                />
              </label>
            </div>

            {engineActualFormError && (
              <div
                data-testid='engine-actual-form-error'
                style={{ marginTop: '0.4rem', color: '#a10000', fontSize: '0.88rem' }}
              >
                {engineActualFormError}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '0.55rem', display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
          <button
            type='button'
            onClick={onStartInternalBacktest}
            disabled={startingInternalBacktest}
            style={{
              padding: '0.45rem 0.75rem',
              border: 'none',
              borderRadius: '4px',
              background: startingInternalBacktest ? '#9cbbe0' : '#0a5bb5',
              color: '#fff',
              cursor: startingInternalBacktest ? 'default' : 'pointer',
            }}
          >
            {startingInternalBacktest ? '開始中...' : `内製バックテストを開始 (${summaryMode})`}
          </button>
        </div>
        <div style={{ marginTop: '0.3rem', color: '#666', fontSize: '0.85rem' }}>
          期間: {internalBacktestRangeFrom} 〜 {internalBacktestRangeTo}
        </div>
        {isEngineActualResult && (
          <div
            data-testid='engine-actual-execution-overview'
            style={{
              marginTop: '0.75rem',
              padding: '0.65rem',
              borderRadius: '4px',
              border: '1px solid #d9e3f5',
              background: '#fff',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.6rem',
                flexWrap: 'wrap',
                marginBottom: '0.5rem',
              }}
            >
              <div style={{ fontWeight: 600 }}>engine_actual 実行一覧（比較文脈）</div>
              {engineActualRestorePayload ? (
                <button
                  type='button'
                  data-testid='engine-actual-restore-button'
                  onClick={onRestoreEngineActualPreset}
                  style={{
                    padding: '0.35rem 0.65rem',
                    border: '1px solid #0a5bb5',
                    borderRadius: '4px',
                    background: '#fff',
                    color: '#0a5bb5',
                    cursor: 'pointer',
                  }}
                >
                  この条件で再実行
                </button>
              ) : (
                <div data-testid='engine-actual-restore-unavailable' style={{ color: '#9a4d00', fontSize: '0.85rem' }}>
                  この execution のルール条件は preset 復元できません。
                </div>
              )}
            </div>
            <table
              data-testid='engine-actual-execution-overview-table'
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>execution</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>preset / rule</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>trade_count</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>total_return_percent</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>max_drawdown_percent</th>
                </tr>
              </thead>
              <tbody>
                {engineActualExecutionOverviewItems.map((item, index) => (
                  <tr key={`${item.executionId}-${item.roleLabel}-${index}`}>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.25rem 0' }}>
                      <code>{item.executionId}</code>{' '}
                      <span
                        data-testid={
                          item.roleLabel === '比較元'
                            ? 'engine-actual-overview-role-base'
                            : 'engine-actual-overview-role-rerun'
                        }
                        style={{
                          display: 'inline-block',
                          marginLeft: '0.35rem',
                          padding: '0.05rem 0.4rem',
                          borderRadius: '999px',
                          background: item.roleLabel === '比較元' ? '#eef3ff' : '#eaf7ea',
                          color: item.roleLabel === '比較元' ? '#3457a4' : '#1f6a1f',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        {item.roleLabel}
                      </span>
                      {item.isCompareLinked && (
                        <span
                          data-testid='engine-actual-overview-compare-linkage'
                          style={{
                            display: 'inline-block',
                            marginLeft: '0.35rem',
                            padding: '0.05rem 0.4rem',
                            borderRadius: '999px',
                            background: '#fff6e8',
                            color: '#9a4d00',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          比較リンクあり
                        </span>
                      )}
                    </td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.25rem 0' }}>
                      <div style={{ fontWeight: 600 }}>{item.presetLabel}</div>
                      <div style={{ color: '#555' }}>{item.ruleLabel}</div>
                    </td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.25rem 0' }}>
                      {item.tradeCount ?? '-'}
                    </td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.25rem 0' }}>
                      {item.totalReturnPct ?? '-'}
                    </td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.25rem 0' }}>
                      {item.maxDrawdownPct ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {internalExecutionViewModel.canShowMetrics && internalExecutionResultData?.result_summary?.metrics && (
          <div style={{ marginTop: '0.75rem', padding: '0.65rem', borderRadius: '4px', background: '#fff', border: '1px solid #ececec' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>metrics</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '0.25rem 0.8rem', fontSize: '0.9rem' }}>
              <div>bar_count: {internalExecutionResultData.result_summary.metrics.bar_count}</div>
              <div>first_close: {internalExecutionResultData.result_summary.metrics.first_close}</div>
              <div>last_close: {internalExecutionResultData.result_summary.metrics.last_close}</div>
              <div>price_change: {internalExecutionResultData.result_summary.metrics.price_change}</div>
              <div>price_change_percent: {internalExecutionResultData.result_summary.metrics.price_change_percent}</div>
              <div>range_percent: {internalExecutionResultData.result_summary.metrics.range_percent}</div>
            </div>
          </div>
        )}

        {showEngineActualComparison && (
          <div
            data-testid='engine-actual-rerun-compare'
            style={{
              marginTop: '0.75rem',
              padding: '0.65rem',
              borderRadius: '4px',
              background: '#fff',
              border: '1px solid #d9e3f5',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
              engine_actual 再実行比較（元 execution vs 再実行 execution）
            </div>
            <div style={{ fontSize: '0.88rem', color: '#444', marginBottom: '0.5rem' }}>
              元: <code>{resolvedCompareSourceExecutionId}</code> / 再実行: <code>{internalExecutionId}</code>
            </div>
            <table
              data-testid='engine-actual-rerun-compare-table'
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>項目</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>元 execution</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>再実行 execution</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>rule</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {compareSourceEngineActualSummaryDisplay.rulePatternLabel}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {engineActualSummaryDisplay.rulePatternLabel}
                  </td>
                </tr>
                <tr>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>trade_count</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {compareSourceEngineActualSummaryDisplay.tradeCount ?? '-'}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {engineActualSummaryDisplay.tradeCount ?? '-'}
                  </td>
                </tr>
                <tr>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>win_rate</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {compareSourceEngineActualSummaryDisplay.winRatePct ?? '-'}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {engineActualSummaryDisplay.winRatePct ?? '-'}
                  </td>
                </tr>
                <tr>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>total_return_percent</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {compareSourceEngineActualSummaryDisplay.totalReturnPct ?? '-'}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {engineActualSummaryDisplay.totalReturnPct ?? '-'}
                  </td>
                </tr>
                <tr>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>max_drawdown_percent</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {compareSourceEngineActualSummaryDisplay.maxDrawdownPct ?? '-'}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {engineActualSummaryDisplay.maxDrawdownPct ?? '-'}
                  </td>
                </tr>
                <tr>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>fee_rate_bps</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {compareSourceEngineActualSummaryDisplay.feeRateBps ?? 0}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {engineActualSummaryDisplay.feeRateBps ?? 0}
                  </td>
                </tr>
                <tr>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>slippage_bps</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {compareSourceEngineActualSummaryDisplay.slippageBps ?? 0}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {engineActualSummaryDisplay.slippageBps ?? 0}
                  </td>
                </tr>
                <tr>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>
                    average_trade_return_percent
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {compareSourceEngineActualSummaryDisplay.averageTradeReturnPct ?? '-'}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>
                    {engineActualSummaryDisplay.averageTradeReturnPct ?? '-'}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.2rem 0' }}>profit_factor</td>
                  <td style={{ textAlign: 'right', padding: '0.2rem 0' }}>
                    {compareSourceEngineActualSummaryDisplay.profitFactor ?? '-'}
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.2rem 0' }}>
                    {engineActualSummaryDisplay.profitFactor ?? '-'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {isEngineActualResult && (
          <div
            data-testid='engine-actual-artifact-section'
            style={{ marginTop: '0.75rem', padding: '0.65rem', borderRadius: '4px', background: '#fff', border: '1px solid #ececec' }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>engine_actual artifact（最小）</div>

            {/* summary card: artifact 取得成功時のみ先頭に表示 */}
            {!internalEngineActualArtifactLoading && internalEngineActualArtifactData && engineActualSummaryDisplay && (
              <div
                data-testid='engine-actual-summary-card'
                style={{
                  marginBottom: '0.75rem',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '4px',
                  background: '#f5f8ff',
                  border: '1px solid #c5d8f8',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem', color: '#0a3d7a' }}>実行サマリー</div>
                <div style={{ marginBottom: '0.35rem', fontSize: '0.88rem', color: '#333' }}>
                  <strong>ルールパターン: </strong>
                  <span data-testid='engine-actual-rule-pattern'>{engineActualSummaryDisplay.rulePatternLabel}</span>
                </div>
                {(engineActualSummaryDisplay.feeRateBps !== null || engineActualSummaryDisplay.slippageBps !== null) && (
                  <div style={{ marginBottom: '0.35rem', fontSize: '0.85rem', color: '#4b5f80' }}>
                    コスト前提: fee {engineActualSummaryDisplay.feeRateBps ?? 0} bps / slippage{' '}
                    {engineActualSummaryDisplay.slippageBps ?? 0} bps
                  </div>
                )}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(160px, 1fr))',
                    gap: '0.2rem 0.8rem',
                    fontSize: '0.88rem',
                  }}
                >
                  <div>
                    取引数:{' '}
                    <strong data-testid='engine-actual-trade-count'>
                      {engineActualSummaryDisplay.tradeCount !== null ? engineActualSummaryDisplay.tradeCount : '-'}
                    </strong>
                  </div>
                  <div>
                    勝率:{' '}
                    <strong data-testid='engine-actual-win-rate'>
                      {engineActualSummaryDisplay.winRatePct ?? '-'}
                    </strong>
                  </div>
                  <div>
                    総リターン:{' '}
                    <strong
                      data-testid='engine-actual-total-return'
                      style={{
                        color:
                          engineActualSummaryDisplay.totalReturnPct !== null
                            ? engineActualSummaryDisplay.totalReturnPct.startsWith('+')
                              ? '#1f6a1f'
                              : '#a10000'
                            : undefined,
                      }}
                    >
                      {engineActualSummaryDisplay.totalReturnPct ?? '-'}
                    </strong>
                  </div>
                  <div>
                    最大DD:{' '}
                    <strong data-testid='engine-actual-max-drawdown'>
                      {engineActualSummaryDisplay.maxDrawdownPct ?? '-'}
                    </strong>
                  </div>
                  {engineActualSummaryDisplay.holdingAvgBars !== null && (
                    <div>
                      平均保有期間:{' '}
                      <strong>{engineActualSummaryDisplay.holdingAvgBars} bar</strong>
                    </div>
                  )}
                  {engineActualSummaryDisplay.firstTradeAt && (
                    <div>
                      初回取引:{' '}
                      <strong>{engineActualSummaryDisplay.firstTradeAt}</strong>
                    </div>
                  )}
                  {engineActualSummaryDisplay.lastTradeAt && (
                    <div>
                      最終取引:{' '}
                      <strong>{engineActualSummaryDisplay.lastTradeAt}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {internalEngineActualArtifactLoading && (
              <div data-testid='engine-actual-artifact-loading' style={{ color: '#444' }}>artifact を読み込み中です。</div>
            )}
            {!internalEngineActualArtifactLoading && internalEngineActualArtifactData && (
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>
                    trades ({internalEngineActualArtifactData.artifact.trades.length})
                  </div>
                  {internalEngineActualArtifactData.artifact.trades.length === 0 ? (
                    <div data-testid='engine-actual-artifact-no-trade' style={{ color: '#1f6a1f' }}>
                      no-trade（trades は 0 件）です。
                    </div>
                  ) : (
                    <table data-testid='engine-actual-artifact-trades' style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>entry_at</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>entry_price</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>exit_at</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>exit_price</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>return_percent</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>holding_bars</th>
                        </tr>
                      </thead>
                      <tbody>
                        {internalEngineActualArtifactData.artifact.trades.slice(0, 20).map((trade, index) => (
                          <tr key={`${trade.entry_at}-${trade.exit_at}-${index}`}>
                            <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>{trade.entry_at}</td>
                            <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>{trade.entry_price}</td>
                            <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>{trade.exit_at}</td>
                            <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>{trade.exit_price}</td>
                            <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>{trade.return_percent}</td>
                            <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>{trade.holding_bars}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>
                    equity_curve ({internalEngineActualArtifactData.artifact.equity_curve.length})
                  </div>
                  {internalEngineActualArtifactData.artifact.equity_curve.length === 0 ? (
                    <div data-testid='engine-actual-artifact-equity-empty' style={{ color: '#555' }}>
                      equity_curve は 0 件です。
                    </div>
                  ) : (
                    <table data-testid='engine-actual-artifact-equity' style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>at</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>equity_index</th>
                        </tr>
                      </thead>
                      <tbody>
                        {internalEngineActualArtifactData.artifact.equity_curve.slice(0, 20).map((point, index) => (
                          <tr key={`${point.at}-${index}`}>
                            <td style={{ borderBottom: '1px solid #f0f0f0', padding: '0.2rem 0' }}>{point.at}</td>
                            <td style={{ borderBottom: '1px solid #f0f0f0', textAlign: 'right', padding: '0.2rem 0' }}>{point.equity_index}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
            {!internalEngineActualArtifactLoading && isEngineActualArtifactNotReady && (
              <div data-testid='engine-actual-artifact-not-ready' style={{ color: '#0a4a99' }}>
                artifact はまだ利用できません（RESULT_NOT_READY）。
              </div>
            )}
            {!internalEngineActualArtifactLoading && isEngineActualArtifactNotFound && (
              <div data-testid='engine-actual-artifact-not-found' style={{ color: '#9a4d00' }}>
                artifact は見つかりません（NOT_FOUND）。
              </div>
            )}
            {!internalEngineActualArtifactLoading &&
              internalEngineActualArtifactError &&
              !isEngineActualArtifactNotReady &&
              !isEngineActualArtifactNotFound && (
                <div data-testid='engine-actual-artifact-error' style={{ color: '#a10000' }}>
                  artifact 取得に失敗しました: {internalEngineActualArtifactError.message}
                </div>
              )}
          </div>
        )}

        {internalExecutionViewModel.interpretation === 'success_no_data' && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem', borderRadius: '4px', background: '#eef8ee', border: '1px solid #a9d5a9', color: '#1f6a1f' }}>
            対象期間のデータがありません（empty bars success）。
          </div>
        )}
        {internalExecutionViewModel.interpretation === 'data_source_unavailable' && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem', borderRadius: '4px', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000' }}>
            データ取得に失敗しました。symbol / market / timeframe を確認して再試行してください。
          </div>
        )}
        {internalExecutionViewModel.interpretation === 'not_ready' && internalExecutionId && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem', borderRadius: '4px', background: '#f0f6ff', border: '1px solid #bed6f8', color: '#0a4a99' }}>
            実行中です。完了までお待ちください。
          </div>
        )}
        {internalExecutionViewModel.interpretation === 'internal_failure' && internalExecutionId && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem', borderRadius: '4px', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000' }}>
            内部エラーが発生しました。時間をおいて再試行してください。
          </div>
        )}
        {startInternalBacktestError && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem', borderRadius: '4px', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000' }}>
            {startInternalBacktestError}
          </div>
        )}
        {internalExecutionStatusError && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem', borderRadius: '4px', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000' }}>
            status 取得に失敗しました: {internalExecutionStatusError.message}
          </div>
        )}
        {internalExecutionResultError && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem', borderRadius: '4px', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000' }}>
            result 取得に失敗しました: {internalExecutionResultError.message}
          </div>
        )}
        {compareSourceExecutionStatusError && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem', borderRadius: '4px', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000' }}>
            比較元 status 取得に失敗しました: {compareSourceExecutionStatusError.message}
          </div>
        )}
        {compareSourceExecutionResultError && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem', borderRadius: '4px', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000' }}>
            比較元 result 取得に失敗しました: {compareSourceExecutionResultError.message}
          </div>
        )}
      </section>

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

      <section style={{ marginTop: '1.2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>warnings</h2>
        {warnings.length === 0 ? (
          <p style={{ color: '#666' }}>なし</p>
        ) : (
          <ul style={{ color: '#8a5b00' }}>
            {warnings.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1.2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>assumptions</h2>
        {assumptions.length === 0 ? (
          <p style={{ color: '#666' }}>なし</p>
        ) : (
          <ul>
            {assumptions.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1.2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>generated pine</h2>
        {version.generated_pine ? (
          <pre style={{ margin: 0, padding: '1rem', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '4px', overflowX: 'auto' }}>
            <code>{version.generated_pine}</code>
          </pre>
        ) : (
          <p style={{ color: '#666' }}>まだ生成されていません。ルールを確認後に再生成してください。</p>
        )}
      </section>
    </div>
  );
}
