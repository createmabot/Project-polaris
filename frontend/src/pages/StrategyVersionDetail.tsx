import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useLocation } from 'wouter';
import { fetchApi, patchApi, postApi, swrFetcher } from '../api/client';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { TextArea } from '../components/ui/FormFields';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import PineGenerationProgress from '../components/ui/PineGenerationProgress';
import { buildPineGenerationJobFailureMessage } from '../utils/pineGenerationJob';
import SectionCard from '../components/ui/SectionCard';
import StatusBadge from '../components/ui/StatusBadge';
import TextLink from '../components/ui/TextLink';
import {
  StrategyVersionData,
  StrategyVersionPineData,
  StrategyVersionPineJobData,
  StrategyVersionListData,
} from '../api/types';
import {
  buildStrategyVersionDetailUrl,
  parseStrategyVersionsListQuery,
} from './StrategyVersionList';

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
  returnTo: string | null;
};

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
  if (!/^\/symbols\/[A-Za-z0-9_.:-]+$/.test(pathPart)) return null;

  if (!queryPart) return pathPart;

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

export function parseImproveApplicationContext(locationPath: string): ImproveApplicationContext | null {
  const search = locationPath.includes('?') ? locationPath.slice(locationPath.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
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
    returnTo: sanitizeImproveApplicationReturnTo(params.get('return_to')),
  };
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
  const { data, error, isLoading, mutate } = useSWR<StrategyVersionData>(`/api/strategy-versions/${versionId}`, swrFetcher);
  const { data: pineData, mutate: mutatePine } = useSWR<StrategyVersionPineData>(
    `/api/strategy-versions/${versionId}/pine`,
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

  const [savingRule, setSavingRule] = useState(false);
  const [saveRuleError, setSaveRuleError] = useState<string | null>(null);
  const [saveRuleMessage, setSaveRuleMessage] = useState<string | null>(null);
  const [savingForwardNote, setSavingForwardNote] = useState(false);
  const [saveForwardNoteError, setSaveForwardNoteError] = useState<string | null>(null);
  const [saveForwardNoteMessage, setSaveForwardNoteMessage] = useState<string | null>(null);

  const [editingNaturalLanguageRule, setEditingNaturalLanguageRule] = useState('');
  const [editingForwardValidationNote, setEditingForwardValidationNote] = useState('');

  const version = data?.strategy_version ?? null;
  const compareBase = data?.compare_base ?? null;
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
  const improveApplicationContext = useMemo(() => parseImproveApplicationContext(location), [location]);

  useEffect(() => {
    if (version) {
      setEditingNaturalLanguageRule(version.natural_language_rule);
      setEditingForwardValidationNote(version.forward_validation_note ?? '');
    }
  }, [version?.id, version?.natural_language_rule, version?.forward_validation_note]);

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
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 1200));
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
      setRevisionRequest('');
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

  return (
    <AppLayout>
      <div className='mx-auto max-w-5xl space-y-4'>
        <PageHeader
          title='rule version 詳細'
          description='自然言語ルール、Pine、検証ノートを同じ version 文脈で確認します。'
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
              </div>
            </div>
            {improveApplicationContext.returnTo && (
              <TextLink href={improveApplicationContext.returnTo} className='text-sm font-semibold text-blue-800 no-underline hover:underline'>
                銘柄ページへ戻る
              </TextLink>
            )}
          </div>
        </section>
      )}
      <SectionCard
        title='基本情報'
        description='strategy version の ID、対象、状態、更新時刻を確認します。'
      >
        <KeyValueList>
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
      </SectionCard>

      <SectionCard
        title='自然言語ルール（編集）'
        description='保存、Pine 再生成、修正再生成の導線は既存のまま維持します。'
        className='mt-4'
      >
        <TextArea
          label='自然言語ルール'
          value={editingNaturalLanguageRule}
          onChange={(event) => setEditingNaturalLanguageRule(event.target.value)}
          rows={7}
        />

        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
            {savingRule ? '保存中...' : '保存'}
          </Button>

          <Button
            variant='primary'
            onClick={onGeneratePine}
            disabled={regenerating}
          >
            {regenerating ? '再生成中...' : 'Pine を再生成'}
          </Button>

          <Button
            onClick={onCloneAsNewVersion}
            disabled={cloning}
          >
            {cloning ? '作成中...' : '新しい version を作る'}
          </Button>
        </div>

        <div style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
          保存はルール本文のみ更新します。再生成ボタンで更新済みルールから Pine を作り直します。
        </div>
        <div style={{ marginTop: '0.35rem', color: '#666', fontSize: '0.9rem' }}>
          Pine生成対象は JP_STOCK / US_STOCK、日足（D）/ 4時間足（4H）/ 1時間足（1H）です。生成したPineはTradingViewのsymbolとchart timeframe上で検証してください。internal backtestの対応範囲拡張ではありません。
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
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Pine 修正再生成（TradingView 検証結果を反映）</div>
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
              rows={3}
              placeholder='修正したい内容を入力してください'
            />
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant='primary'
                data-testid='pine-regenerate-button'
                onClick={onRegenerateWithRevision}
                disabled={regenerating || !pineData?.pine_script_id}
              >
                {regenerating ? '再生成中...' : 'Pine 修正再生成'}
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

      <SectionCard
        title='次の検証ノート'
        description='forward validation の確認内容を version 単位で記録します。'
        className='mt-4'
      >
        <KeyValueList className='mb-3'>
          <KeyValueRow label='現在のノート'>
            {version.forward_validation_note && version.forward_validation_note.trim() ? version.forward_validation_note : '未設定'}
          </KeyValueRow>
          <KeyValueRow label='ノート更新目安'>
            {version.forward_validation_note && version.forward_validation_note.trim()
              ? (version.forward_validation_note_updated_at
                  ? new Date(version.forward_validation_note_updated_at).toLocaleString('ja-JP')
                  : '-')
              : '-'}
          </KeyValueRow>
        </KeyValueList>
        <TextArea
          label='検証ノート'
          value={editingForwardValidationNote}
          onChange={(event) => setEditingForwardValidationNote(event.target.value)}
          rows={4}
          placeholder='次に検証したい条件や見直し方針を記録します'
        />
        <div style={{ marginTop: '0.7rem' }}>
          <Button
            variant='primary'
            onClick={onSaveForwardValidationNote}
            disabled={savingForwardNote}
          >
            {savingForwardNote ? '保存中...' : 'ノートを保存'}
          </Button>
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
      </SectionCard>

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

