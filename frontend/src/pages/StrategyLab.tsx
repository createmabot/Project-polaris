import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useLocation } from 'wouter';
import { ApiError, fetchApi, postApi, swrFetcher } from '../api/client';
import Button from '../components/ui/Button';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { SelectField, TextArea, TextInput } from '../components/ui/FormFields';
import InlineNotice from '../components/ui/InlineNotice';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import PaginationControls from '../components/ui/PaginationControls';
import PineGenerationProgress from '../components/ui/PineGenerationProgress';
import { buildPineGenerationJobFailureMessage } from '../utils/pineGenerationJob';
import SectionCard from '../components/ui/SectionCard';
import StatusBadge from '../components/ui/StatusBadge';
import Surface from '../components/ui/Surface';
import TextLink from '../components/ui/TextLink';
import {
  BacktestCreateData,
  BacktestImportData,
  StrategyCreateData,
  StrategyProposalCodexCliRequestData,
  StrategyProposalCandidate,
  StrategyProposalData,
  StrategyProposalHistoryDetailData,
  StrategyProposalHistoryListData,
  StrategyProposalProviderQualityTrendData,
  StrategyProposalSelectData,
  StrategyVersionData,
  StrategyVersionPineData,
  StrategyVersionPineJobData,
  StrategyVersionListData,
} from '../api/types';

const MARKET_OPTIONS = ['JP_STOCK', 'US_STOCK'];
const TIMEFRAME_OPTIONS = [
  { value: 'D', label: '日足（D）' },
  { value: '4H', label: '4時間足（4H）' },
  { value: '1H', label: '1時間足（1H）' },
];
const RISK_PREFERENCE_OPTIONS = [
  { value: 'balanced', label: 'balanced' },
  { value: 'conservative', label: 'conservative' },
  { value: 'aggressive', label: 'aggressive' },
];
const STRATEGY_TYPE_OPTIONS = [
  { value: 'any', label: 'any' },
  { value: 'trend_following', label: 'trend following' },
  { value: 'mean_reversion', label: 'mean reversion' },
  { value: 'breakout', label: 'breakout' },
  { value: 'momentum', label: 'momentum' },
  { value: 'volatility', label: 'volatility' },
  { value: 'risk_management', label: 'risk management' },
];

const PROPOSAL_HISTORY_LIMIT = 10;
const HISTORY_PROVIDER_OPTIONS = [
  { value: 'all', label: 'all providers' },
  { value: 'stub', label: 'stub' },
  { value: 'local_llm', label: 'local_llm' },
  { value: 'codex_cli_manual', label: 'codex_cli_manual' },
];
const HISTORY_STATUS_OPTIONS = [
  { value: 'all', label: 'all statuses' },
  { value: 'succeeded', label: 'succeeded' },
  { value: 'failed', label: 'failed' },
];
const HISTORY_SELECTED_OPTIONS = [
  { value: 'all', label: 'all selections' },
  { value: 'selected', label: 'selected' },
  { value: 'unselected', label: 'unselected' },
];
const HISTORY_ARCHIVED_OPTIONS = [
  { value: 'active', label: 'active' },
  { value: 'archived', label: 'archived' },
  { value: 'all', label: 'all' },
];

function formatTimeframeLabel(value: string): string {
  const normalized = value === '1D' ? 'D' : value;
  return TIMEFRAME_OPTIONS.find((option) => option.value === normalized)?.label ?? normalized;
}

export function buildProposalHistoryPath({
  page = 1,
  limit = PROPOSAL_HISTORY_LIMIT,
  q = '',
  provider = 'all',
  status = 'all',
  selected = 'all',
  archived = 'active',
}: {
  page?: number;
  limit?: number;
  q?: string;
  provider?: string;
  status?: string;
  selected?: string;
  archived?: string;
} = {}): string {
  const params = new URLSearchParams({
    page: String(Math.max(1, page)),
    limit: String(limit),
    sort: 'created_at',
    order: 'desc',
  });
  const trimmedQuery = q.trim();
  if (trimmedQuery) {
    params.set('q', trimmedQuery);
  }
  if (provider && provider !== 'all') {
    params.set('provider_name', provider);
  }
  if (status && status !== 'all') {
    params.set('status', status);
  }
  if (selected === 'selected') {
    params.set('selected', 'true');
  }
  if (selected === 'unselected') {
    params.set('selected', 'false');
  }
  if (archived && archived !== 'active') {
    params.set('archived', archived);
  }
  return `/api/strategy-lab/proposals?${params.toString()}`;
}

function buildCsvImportErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'CSV取込に失敗しました。入力内容を確認して再試行してください。';
  }
  if (error.status === 413) {
    return 'CSVファイルサイズが上限を超えています。不要な行を削除して再試行してください。';
  }
  if (error.status === 415) {
    return 'CSVの送信形式が不正です。`.csv` ファイルを選択して再試行してください。';
  }
  if (error.status === 400) {
    return 'CSV形式または入力内容に不備があります。必須列・空データ・ファイル形式を確認してください。';
  }
  if (error.status >= 500) {
    return 'サーバー側でCSV取込に失敗しました。時間をおいて再試行してください。';
  }
  return error.message || 'CSV取込に失敗しました。';
}

function readSafeRuleGenerationErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const message = error.message.trim();
  if (!message || message.length > 240) {
    return null;
  }
  if (!/(Pine生成|ルール生成)/.test(message)) {
    return null;
  }
  if (/(raw|endpoint|model|stack|token|secret|http:\/\/|https:\/\/|provider response|reviewer response)/i.test(message)) {
    return null;
  }
  return message;
}

export function buildRuleSubmitErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return readSafeRuleGenerationErrorMessage(error) ?? 'ルール生成に失敗しました。入力内容を確認して再試行してください。';
  }
  if (error.status === 413) {
    return '入力サイズが上限を超えています。ルール文を短くして再試行してください。';
  }
  if (error.status === 415) {
    return '送信形式が不正です。ページを再読み込みして再試行してください。';
  }
  if (error.status === 400) {
    return '入力内容に不備があります。タイトル・自然言語ルール・市場・時間足を確認してください。';
  }
  if (error.status >= 500) {
    return 'サーバー側でルール生成に失敗しました。時間をおいて再試行してください。';
  }
  return error.message || 'ルール生成に失敗しました。';
}

function readProviderObservationText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return /^[a-z_]+$/i.test(trimmed) && trimmed.length <= 60 ? trimmed : null;
}

function buildProviderObservationMessage(error: ApiError): string | null {
  const observation = error.details?.provider_observation;
  if (!observation || typeof observation !== 'object') {
    return null;
  }
  const data = observation as Record<string, unknown>;
  const status = readProviderObservationText(data.status) ?? 'unknown';
  const reason = readProviderObservationText(data.invalid_reason) ?? 'unknown';
  const latency = readProviderObservationText(data.latency_bucket) ?? 'unknown';
  const fallback = data.fallback_used === true ? ' / fallback used' : '';
  return `provider status: ${status} / reason: ${reason} / latency: ${latency}${fallback}`;
}

export function buildProposalErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'ストラテジー候補の取得に失敗しました。入力内容を確認して再試行してください。';
  }
  const providerObservationMessage = buildProviderObservationMessage(error);
  const appendProviderObservation = (message: string) =>
    providerObservationMessage ? `${message} (${providerObservationMessage})` : message;

  if (error.status === 400) {
    return appendProviderObservation('候補生成の入力に不備があります。市場・時間足・リスク設定を確認してください。');
  }
  if (error.status === 429) {
    return appendProviderObservation('短時間に候補取得が続いたため、少し時間をおいて再試行してください。');
  }
  if (error.status >= 500) {
    const providerObservation = error.details?.provider_observation;
    const invalidReason = providerObservation && typeof providerObservation === 'object'
      ? (providerObservation as Record<string, unknown>).invalid_reason
      : null;
    if (invalidReason === 'required_field_missing') {
      return appendProviderObservation('AI候補の形式が不完全だったため取得できませんでした。もう一度お試しください。');
    }
    return appendProviderObservation('サーバー側で候補取得に失敗しました。時間をおいて再試行してください。');
  }
  return appendProviderObservation(error.message || 'ストラテジー候補の取得に失敗しました。');
}

function buildCodexImportErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Codex CLI JSONの取り込みに失敗しました。JSON形式を確認してください。';
  }
  if (error.status === 413) {
    return 'Codex CLI JSONのサイズが上限を超えています。候補数や不要な出力を減らして再試行してください。';
  }
  if (error.status === 400) {
    const reason = readProviderObservationText(error.details?.invalid_reason) ?? null;
    return reason
      ? `Codex CLI JSONがschemaに合いません。reason: ${reason}`
      : 'Codex CLI JSONがschemaに合いません。必須項目・候補数・enum値を確認してください。';
  }
  if (error.status === 429) {
    return '短時間にJSON取り込みが続いたため、少し時間をおいて再試行してください。';
  }
  if (error.status >= 500) {
    return 'サーバー側でCodex CLI JSONの取り込みに失敗しました。時間をおいて再試行してください。';
  }
  return error.message || 'Codex CLI JSONの取り込みに失敗しました。';
}

function buildCsvParseGuidance(parseError: string | null): string[] {
  if (!parseError) {
    return [];
  }
  const message = parseError.toLowerCase();
  const guidance = [
    '対応形式: Performance Summary または List of Trades（英語ヘッダー / 日本語ヘッダー対応）。',
  ];
  if (message.includes('csv is empty')) {
    guidance.push('CSVが空です。TradingView のエクスポート内容が1行以上あることを確認してください。');
  }
  if (message.includes('header and one data row')) {
    guidance.push('ヘッダー行とデータ行が不足しています。エクスポート直後のCSVをそのまま使用してください。');
  }
  if (message.includes('missing required columns') || message.includes('unsupported csv header')) {
    guidance.push('必要列が不足しています。Performance Summary なら主要指標列、List of Trades なら約定列を含むCSVを使用してください。');
  }
  return guidance;
}

function getProposalRunIdFromRecord(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.proposal_run_id === 'string') {
    return record.proposal_run_id;
  }
  if (!record.history || typeof record.history !== 'object') {
    return null;
  }
  const history = record.history as Record<string, unknown>;
  return typeof history.proposal_run_id === 'string' ? history.proposal_run_id : null;
}

function getProposalRunId(data: StrategyProposalData | null): string | null {
  return getProposalRunIdFromRecord(data);
}

function getProposalErrorRunId(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  return getProposalRunIdFromRecord(error.details);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ja-JP');
}

function buildProposalSelectionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status >= 500) {
    return '候補の選択履歴を記録できませんでした。時間をおいて再試行してください。';
  }
  if (error instanceof ApiError && error.status === 404) {
    return '対象の提案履歴が見つかりませんでした。最新の履歴を再読み込みしてください。';
  }
  if (error instanceof ApiError && error.status === 400) {
    return '候補の選択履歴を記録できませんでした。候補を確認して再試行してください。';
  }
  return '候補の選択履歴を記録できませんでした。';
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function findCount(items: Array<{ value: string; count: number }>, value: string): number {
  return items.find((item) => item.value === value)?.count ?? 0;
}

function ProviderQualityTrendNote({
  data,
  error,
  isLoading,
}: {
  data?: StrategyProposalProviderQualityTrendData;
  error?: unknown;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <InlineNotice tone='info'>
        provider quality trend を読み込み中です。
      </InlineNotice>
    );
  }

  if (error) {
    return (
      <InlineNotice tone='warning'>
        provider quality trend を読み込めませんでした。候補生成と履歴表示は継続できます。
      </InlineNotice>
    );
  }

  if (!data?.summary || data.summary.total_runs === 0) {
    return (
      <InlineNotice tone='info'>
        provider quality trend はまだありません。提案履歴が蓄積されると sanitized metadata だけで集計します。
      </InlineNotice>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '0.65rem' }}>
      <InlineNotice tone='info'>
        provider quality trend は直近 {data.meta.limit} 件の sanitized proposal history から集計します。候補ランキングや投資判断ではありません。
      </InlineNotice>
      <KeyValueList className='sm:grid-cols-4'>
        <KeyValueRow label='runs'>{String(data.summary.total_runs)}</KeyValueRow>
        <KeyValueRow label='success'>{formatPercent(data.summary.success_rate)}</KeyValueRow>
        <KeyValueRow label='selected'>{formatPercent(data.summary.selected_rate)}</KeyValueRow>
        <KeyValueRow label='avg latency'>{`${data.summary.avg_elapsed_ms}ms`}</KeyValueRow>
      </KeyValueList>
      {data.by_provider.length > 0 && (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          {data.by_provider.slice(0, 3).map((provider) => (
            <div key={provider.provider_name} style={{ fontSize: '0.86rem', color: '#475569' }}>
              <strong>{provider.provider_name}</strong>: {provider.succeeded_runs}/{provider.run_count} success,
              {' '}selected {formatPercent(provider.selected_rate)},
              {' '}slow {findCount(provider.latency_buckets, 'slow')},
              {' '}timeout {findCount(provider.status_counts, 'timeout')},
              {' '}invalid {findCount(provider.status_counts, 'invalid_response')}
            </div>
          ))}
        </div>
      )}
      {data.recent_failures.length > 0 && (
        <div style={{ fontSize: '0.84rem', color: '#64748b' }}>
          recent failure: {data.recent_failures[0].provider_name} / {data.recent_failures[0].status} / {data.recent_failures[0].invalid_reason}
        </div>
      )}
    </div>
  );
}

export default function StrategyLab() {
  const [, setLocation] = useLocation();
  const [title, setTitle] = useState('監視銘柄比較ルール');
  const [naturalLanguageRule, setNaturalLanguageRule] = useState(
    '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が5日線を下回ったら手仕舞い。'
  );
  const [market, setMarket] = useState('JP_STOCK');
  const [timeframe, setTimeframe] = useState('D');
  const [proposalRiskPreference, setProposalRiskPreference] = useState('balanced');
  const [proposalStrategyType, setProposalStrategyType] = useState('any');
  const [proposalUserHint, setProposalUserHint] = useState('');
  const [proposalData, setProposalData] = useState<StrategyProposalData | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [selectedProposalRunId, setSelectedProposalRunId] = useState<string | null>(null);
  const [proposalSelectionError, setProposalSelectionError] = useState<string | null>(null);
  const [selectingProposalCandidateId, setSelectingProposalCandidateId] = useState<string | null>(null);
  const [codexPromptData, setCodexPromptData] = useState<StrategyProposalCodexCliRequestData | null>(null);
  const [codexPromptError, setCodexPromptError] = useState<string | null>(null);
  const [codexPrompting, setCodexPrompting] = useState(false);
  const [codexWebSearchPrompt, setCodexWebSearchPrompt] = useState(false);
  const [codexImportText, setCodexImportText] = useState('');
  const [codexImportFileName, setCodexImportFileName] = useState<string | null>(null);
  const [codexImportError, setCodexImportError] = useState<string | null>(null);
  const [codexImporting, setCodexImporting] = useState(false);
  const [codexCopyFeedback, setCodexCopyFeedback] = useState<string | null>(null);
  const [historySearchDraft, setHistorySearchDraft] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyProvider, setHistoryProvider] = useState('all');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [historySelected, setHistorySelected] = useState('all');
  const [historyArchived, setHistoryArchived] = useState('active');
  const [historyPage, setHistoryPage] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StrategyVersionData['strategy_version'] | null>(null);
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [backtest, setBacktest] = useState<BacktestCreateData['backtest'] | null>(null);
  const [pineGenerationJob, setPineGenerationJob] = useState<StrategyVersionPineJobData['job'] | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<BacktestImportData['import'] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pineCopyFeedback, setPineCopyFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showPineCopyFeedback = (type: 'success' | 'error', text: string) => {
    setPineCopyFeedback({ type, text });
    window.setTimeout(() => {
      setPineCopyFeedback((current) => (current?.text === text ? null : current));
    }, 2400);
  };

  const { data: versionsData } = useSWR<StrategyVersionListData>(
    strategyId ? `/api/strategies/${strategyId}/versions` : null,
    swrFetcher
  );
  const {
    data: proposalHistoryData,
    error: proposalHistoryError,
    isLoading: proposalHistoryLoading,
    mutate: mutateProposalHistory,
  } = useSWR<StrategyProposalHistoryListData>(buildProposalHistoryPath({
    page: historyPage,
    limit: PROPOSAL_HISTORY_LIMIT,
    q: historyQuery,
    provider: historyProvider,
    status: historyStatus,
    selected: historySelected,
    archived: historyArchived,
  }), swrFetcher);
  const {
    data: proposalQualityTrendData,
    error: proposalQualityTrendError,
    isLoading: proposalQualityTrendLoading,
    mutate: mutateProposalQualityTrend,
  } = useSWR<StrategyProposalProviderQualityTrendData>('/api/strategy-lab/proposals/provider-quality-trend?limit=50', swrFetcher);
  const {
    data: selectedProposalDetail,
    error: selectedProposalDetailError,
    isLoading: selectedProposalDetailLoading,
    mutate: mutateSelectedProposalDetail,
  } = useSWR<StrategyProposalHistoryDetailData>(
    selectedProposalRunId ? `/api/strategy-lab/proposals/${selectedProposalRunId}` : null,
    swrFetcher
  );

  const latestVersion = useMemo(() => versionsData?.strategy_versions?.[0] ?? null, [versionsData]);

  const onRequestProposals = async () => {
    setProposing(true);
    setProposalError(null);
    setProposalData(null);

    try {
      const proposals = await postApi<StrategyProposalData>('/api/strategy-lab/proposals', {
        market,
        timeframe,
        risk_preference: proposalRiskPreference,
        strategy_type_bias: proposalStrategyType,
        proposal_count: 5,
        user_hint: proposalUserHint.trim() || null,
      });
      setProposalData(proposals);
      setSelectedProposalRunId(getProposalRunId(proposals));
      void mutateProposalHistory();
      void mutateProposalQualityTrend();
    } catch (proposalRequestError: unknown) {
      console.error('Strategy proposal request failed', proposalRequestError);
      setProposalError(buildProposalErrorMessage(proposalRequestError));
      if (getProposalErrorRunId(proposalRequestError)) {
        void mutateProposalHistory();
        void mutateProposalQualityTrend();
      }
    } finally {
      setProposing(false);
    }
  };

  const onBuildCodexPrompt = async () => {
    setCodexPrompting(true);
    setCodexPromptError(null);
    try {
      const promptData = await postApi<StrategyProposalCodexCliRequestData>('/api/strategy-lab/proposals/codex-cli/request', {
        market,
        timeframe,
        risk_preference: proposalRiskPreference,
        strategy_type_bias: proposalStrategyType,
        proposal_count: 5,
        user_hint: proposalUserHint.trim() || null,
        web_search_prompt: codexWebSearchPrompt,
      });
      setCodexPromptData(promptData);
      setCodexCopyFeedback(null);
    } catch (promptError: unknown) {
      console.error('Codex CLI prompt request failed', promptError);
      setCodexPromptError(buildProposalErrorMessage(promptError));
    } finally {
      setCodexPrompting(false);
    }
  };

  const onCopyCodexPrompt = async () => {
    if (!codexPromptData?.prompt) {
      return;
    }
    try {
      await navigator.clipboard.writeText(codexPromptData.prompt);
      setCodexCopyFeedback('promptをコピーしました。');
    } catch {
      setCodexCopyFeedback('promptをコピーできませんでした。textareaから手動でコピーしてください。');
    }
  };

  const onImportCodexJson = async () => {
    setCodexImporting(true);
    setCodexImportError(null);
    setProposalError(null);
    try {
      const imported = await postApi<StrategyProposalData>('/api/strategy-lab/proposals/codex-cli/import', {
        source: codexImportFileName ? 'file' : 'paste',
        result_json_text: codexImportText,
        file_name: codexImportFileName,
      });
      setProposalData(imported);
      setSelectedProposalRunId(getProposalRunId(imported));
      setCodexImportText('');
      setCodexImportFileName(null);
      void mutateProposalHistory();
      void mutateProposalQualityTrend();
    } catch (importError: unknown) {
      console.error('Codex CLI import failed', importError);
      setCodexImportError(buildCodexImportErrorMessage(importError));
    } finally {
      setCodexImporting(false);
    }
  };

  const onCodexImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      setCodexImportText(text);
      setCodexImportFileName(file.name);
      setCodexImportError(null);
    } catch {
      setCodexImportError('Codex CLI JSONファイルを読み込めませんでした。ファイルを確認してください。');
    }
  };

  const applyProposalCandidate = (candidate: StrategyProposalCandidate) => {
    setTitle(candidate.title);
    setNaturalLanguageRule(candidate.suggested_natural_language_spec);
    setProposalError(null);
    setProposalSelectionError(null);
    setError(null);
    setResult(null);
    setStrategyId(null);
    setBacktest(null);
    setCsvFile(null);
    setImportState(null);
    setImportError(null);
  };

  const recordProposalSelection = async (
    proposalRunId: string,
    body: { candidate_id?: string; proposal_candidate_id?: string },
    selectingId: string,
  ) => {
    setSelectingProposalCandidateId(selectingId);
    setProposalSelectionError(null);
    try {
      await postApi<StrategyProposalSelectData>(`/api/strategy-lab/proposals/${proposalRunId}/select`, body);
      void mutateProposalHistory();
      void mutateSelectedProposalDetail();
      void mutateProposalQualityTrend();
      return true;
    } catch (selectionError: unknown) {
      console.error('Strategy proposal selection failed', selectionError);
      setProposalSelectionError(buildProposalSelectionErrorMessage(selectionError));
      return false;
    } finally {
      setSelectingProposalCandidateId(null);
    }
  };

  const onUseProposal = async (candidate: StrategyProposalCandidate) => {
    const proposalRunId = getProposalRunId(proposalData);
    if (proposalRunId) {
      const recorded = await recordProposalSelection(
        proposalRunId,
        { candidate_id: candidate.candidate_id },
        candidate.candidate_id,
      );
      if (!recorded) {
        return;
      }
    }
    applyProposalCandidate(candidate);
  };

  const onUseHistoryProposal = async (proposalRunId: string, proposalCandidateId: string, candidate: StrategyProposalCandidate) => {
    const recorded = await recordProposalSelection(
      proposalRunId,
      { proposal_candidate_id: proposalCandidateId },
      proposalCandidateId,
    );
    if (!recorded) {
      return;
    }
    applyProposalCandidate(candidate);
  };

  const onArchiveProposalRun = async (proposalRunId: string, archive: boolean) => {
    try {
      await postApi<{ proposal_run: StrategyProposalHistoryDetailData['proposal_run'] }>(
        `/api/strategy-lab/proposals/${proposalRunId}/${archive ? 'archive' : 'unarchive'}`,
        {},
      );
      void mutateProposalHistory();
      void mutateSelectedProposalDetail();
      resetHistoryDetail();
    } catch (archiveError: unknown) {
      console.error('Strategy proposal archive state change failed', archiveError);
      setProposalSelectionError('提案履歴のアーカイブ状態を更新できませんでした。時間をおいて再試行してください。');
    }
  };

  const resetHistoryDetail = () => {
    setSelectedProposalRunId(null);
  };

  const applyHistorySearch = () => {
    setHistoryQuery(historySearchDraft.trim());
    setHistoryPage(1);
    resetHistoryDetail();
  };

  const clearHistoryFilters = () => {
    setHistorySearchDraft('');
    setHistoryQuery('');
    setHistoryProvider('all');
    setHistoryStatus('all');
    setHistorySelected('all');
    setHistoryArchived('active');
    setHistoryPage(1);
    resetHistoryDetail();
  };

  const hasHistoryFilter =
    Boolean(historyQuery.trim()) ||
    historyProvider !== 'all' ||
    historyStatus !== 'all' ||
    historySelected !== 'all' ||
    historyArchived !== 'active';

  const pollPineGenerationJob = async (versionId: string, jobId: string) => {
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

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    setBacktest(null);
    setImportState(null);
    setImportError(null);
    setPineGenerationJob(null);

    try {
      const strategy = await postApi<StrategyCreateData>('/api/strategies', {
        title: title.trim(),
      });

      setStrategyId(strategy.strategy.id);

      const version = await postApi<StrategyVersionData>(`/api/strategies/${strategy.strategy.id}/versions`, {
        natural_language_rule: naturalLanguageRule.trim(),
        market,
        timeframe,
      });

      const started = await postApi<StrategyVersionPineJobData>(
        `/api/strategy-versions/${version.strategy_version.id}/pine/generation-jobs`,
        {}
      );
      setPineGenerationJob(started.job);
      const completedJob = await pollPineGenerationJob(version.strategy_version.id, started.job.id);
      if (completedJob.status !== 'succeeded') {
        throw new Error(buildPineGenerationJobFailureMessage(completedJob.error));
      }

      const [latestVersion, latestPine] = await Promise.all([
        fetchApi<StrategyVersionData>(`/api/strategy-versions/${version.strategy_version.id}`),
        fetchApi<StrategyVersionPineData>(`/api/strategy-versions/${version.strategy_version.id}/pine`),
      ]);
      setResult(latestVersion.strategy_version);

      if (latestPine.status === 'available') {
        const createdBacktest = await postApi<BacktestCreateData>('/api/backtests', {
          strategy_version_id: latestVersion.strategy_version.id,
          title: `${title.trim()} / ${market} / ${timeframe}`,
          execution_source: 'tradingview',
          market,
          timeframe,
        });
        setBacktest(createdBacktest.backtest);
      }
    } catch (submitError: any) {
      console.error('Rule submit failed', submitError);
      setError(buildRuleSubmitErrorMessage(submitError));
    } finally {
      setSubmitting(false);
      setPineGenerationJob(null);
    }
  };

  const onImportCsv = async () => {
    if (!backtest) {
      setImportError('先にルール生成を完了して backtest を作成してください。');
      return;
    }
    if (!csvFile) {
      setImportError('CSVファイルを選択してください。');
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportState(null);

    try {
      const csvText = await csvFile.text();
      const imported = await postApi<BacktestImportData>(`/api/backtests/${backtest.id}/imports`, {
        file_name: csvFile.name,
        content_type: csvFile.type || 'text/csv',
        csv_text: csvText,
      });
      setImportState(imported.import);
    } catch (requestError: any) {
      console.error('CSV import failed', requestError);
      setImportError(buildCsvImportErrorMessage(requestError));
    } finally {
      setImporting(false);
    }
  };

  const onCopyGeneratedPine = async () => {
    const pine = result?.generated_pine ?? '';
    if (!pine.trim()) {
      showPineCopyFeedback('error', 'コピー対象のPineがありません。');
      return;
    }
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable');
      }
      await navigator.clipboard.writeText(pine);
      showPineCopyFeedback('success', 'コピーしました');
    } catch (error) {
      console.error('Failed to copy pine script', error);
      showPineCopyFeedback('error', 'コピーに失敗しました。手動で選択してコピーしてください');
    }
  };

  return (
    <AppLayout>
      <div className='mx-auto max-w-5xl'>
        <PageHeader
          title='ルール検証ラボ（MVP）'
          description='自然言語ルールから Pine を生成し、その後 TradingView の検証CSVを取り込んで parse 状態を確認します。'
          actions={
            <>
              <TextLink href='/' className='rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 no-underline shadow-sm hover:bg-slate-50'>ホームへ戻る</TextLink>
              <TextLink href='/backtests' className='rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 no-underline shadow-sm hover:bg-slate-50'>履歴一覧を見る</TextLink>
            </>
          }
        />

      <SectionCard
        title='ストラテジー候補の提案'
        description='AIによる検証候補を取得し、選択した候補を自然言語ルールへ反映します。投資助言ではなく、backtest前提のたたき台です。'
        className='mt-4'
      >
        <div className='grid gap-3'>
          <InlineNotice tone='warning'>
            候補は検証用のたたき台です。売買推奨ではありません。選択後に内容を確認し、Pine生成とbacktestで検証してください。
          </InlineNotice>

          <div className='grid gap-3 lg:grid-cols-3'>
            <SelectField
              label='提案用時間足'
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value)}
            >
              {TIMEFRAME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectField>

            <SelectField
              label='リスク設定'
              value={proposalRiskPreference}
              onChange={(event) => setProposalRiskPreference(event.target.value)}
            >
              {RISK_PREFERENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectField>

            <SelectField
              label='戦略タイプ'
              value={proposalStrategyType}
              onChange={(event) => setProposalStrategyType(event.target.value)}
            >
              {STRATEGY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectField>
          </div>

          <InlineNotice tone='info'>
            時間足により提案される戦略候補の前提や注意点が変わります。1D は選択肢に出さず、API入力時は D と同義に扱います。
          </InlineNotice>

          <TextArea
            label='提案用ヒント（任意）'
            value={proposalUserHint}
            onChange={(event) => setProposalUserHint(event.target.value)}
            rows={3}
            placeholder='例: 高値更新後の押し目買い、出来高急増を使った短期戦略、売買回数少なめの日足戦略など。'
            helpText='提案の方向性を絞りたい場合だけ入力します。空欄なら市場・時間足・リスク・戦略タイプから幅広く候補を出します。Pine生成用ルール文とは別に扱います。'
          />

          <Button onClick={onRequestProposals} disabled={proposing} variant='primary' className='w-fit'>
            {proposing ? '候補を取得中...' : 'ストラテジーを提案'}
          </Button>

          <Surface variant='muted' className='grid gap-2 p-3'>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Codex CLIで生成した候補JSONを取り込む</h3>
              <p className='mt-1 text-sm leading-6 text-slate-600'>
                Codex CLIはこの画面から自動実行されません。promptを手動で渡し、返却されたJSONを貼り付けてください。複数候補は candidates 配列で最大10件まで取り込めます。
              </p>
            </div>

            <label className='grid gap-1.5 text-sm font-medium text-slate-800'>
              <span className='flex items-center gap-2'>
                <input
                  type='checkbox'
                  checked={codexWebSearchPrompt}
                  onChange={(event) => setCodexWebSearchPrompt(event.target.checked)}
                />
                Codex CLI側でWeb検索を使う前提のpromptにする
              </span>
              <span className='text-sm text-slate-600' style={{ fontWeight: 400 }}>
                Codex CLIがWeb検索を利用できる環境の場合のみ有効です。北極星はWeb検索を自動実行せず、取り込み時にもWeb検索済みかどうかは判定しません。
              </span>
            </label>

            <div className='flex flex-wrap gap-3'>
              <Button onClick={onBuildCodexPrompt} disabled={codexPrompting}>
                {codexPrompting ? 'prompt作成中...' : 'Codex CLI用プロンプトを作成'}
              </Button>
              {codexPromptData?.prompt && (
                <Button onClick={() => void onCopyCodexPrompt()}>
                  promptをコピー
                </Button>
              )}
            </div>

            {codexPromptError && (
              <ErrorState title='Codex CLI prompt作成に失敗しました'>
                {codexPromptError}
              </ErrorState>
            )}

            {codexPromptData?.prompt && (
              <TextArea
                label='Codex CLI用プロンプト'
                value={codexPromptData.prompt}
                readOnly
                rows={8}
                helpText='このpromptをCodex CLIへ手動で渡してください。'
              />
            )}

            {codexCopyFeedback && (
              <InlineNotice tone='info'>
                {codexCopyFeedback}
              </InlineNotice>
            )}

            <TextArea
              label='Codex CLI出力JSON'
              value={codexImportText}
              onChange={(event) => {
                setCodexImportText(event.target.value);
                setCodexImportFileName(null);
              }}
              rows={8}
              placeholder='{"schema_name":"strategy_proposal_candidates", ... }'
              helpText='raw outputは保存されません。validation後のnormalized candidateのみproposal historyへ保存します。'
            />

            <label className='grid gap-1.5 text-sm font-medium text-slate-800'>
              <span>JSONファイルから読み込む（任意）</span>
              <input type='file' accept='.json,application/json' onChange={(event) => void onCodexImportFileChange(event)} />
              {codexImportFileName && (
                <span className='text-sm text-slate-600'>読み込み済み: {codexImportFileName}</span>
              )}
            </label>

            <Button
              onClick={() => void onImportCodexJson()}
              disabled={codexImporting || codexImportText.trim().length === 0}
              variant='secondary'
              className='w-fit'
            >
              {codexImporting ? 'JSONを取り込み中...' : 'JSONを取り込む'}
            </Button>

            {codexImportError && (
              <ErrorState title='Codex CLI JSONの取り込みに失敗しました'>
                {codexImportError}
              </ErrorState>
            )}
          </Surface>

          {proposalError && (
            <ErrorState title='候補取得に失敗しました'>
              {proposalError}
            </ErrorState>
          )}

          {proposalSelectionError && (
            <ErrorState title='候補選択の記録に失敗しました'>
              {proposalSelectionError}
            </ErrorState>
          )}

          {proposalData && (
            <div className='grid gap-2'>
              <KeyValueList className='sm:grid-cols-2'>
                <KeyValueRow label='provider'>{proposalData.provider.name} / {proposalData.provider.mode}</KeyValueRow>
                <KeyValueRow label='web search'>{proposalData.provider.web_search ? 'enabled' : 'disabled'}</KeyValueRow>
                <KeyValueRow label='保存'>{proposalData.provider.persisted ? 'あり' : 'なし'}</KeyValueRow>
                <KeyValueRow label='候補数'>{String(proposalData.candidates.length)}</KeyValueRow>
                {proposalData.provider_observation && (
                  <>
                    <KeyValueRow label='provider status'>{proposalData.provider_observation.status}</KeyValueRow>
                    <KeyValueRow label='latency'>{proposalData.provider_observation.latency_bucket} / {proposalData.provider_observation.elapsed_ms}ms</KeyValueRow>
                    <KeyValueRow label='fallback'>{proposalData.provider_observation.fallback_used ? 'used' : 'none'}</KeyValueRow>
                    <KeyValueRow label='schema'>{proposalData.provider_observation.schema_valid ? 'valid' : 'invalid'}</KeyValueRow>
                  </>
                )}
              </KeyValueList>

              {proposalData.candidates.length === 0 ? (
                <EmptyState title='候補がありません'>
                  入力条件を変えて再試行してください。
                </EmptyState>
              ) : (
                proposalData.candidates.map((candidate) => (
                  <Surface
                    key={candidate.candidate_id}
                    className='grid gap-2'
                  >
                    <div className='flex flex-wrap justify-between gap-3'>
                      <div>
                        <h3 className='text-base font-semibold text-slate-950'>{candidate.title}</h3>
                        <p className='mt-1 text-sm leading-6 text-slate-600'>{candidate.summary}</p>
                      </div>
                      <Button
                        onClick={() => void onUseProposal(candidate)}
                        disabled={selectingProposalCandidateId === candidate.candidate_id}
                      >
                        {selectingProposalCandidateId === candidate.candidate_id ? '記録中...' : 'この候補を使う'}
                      </Button>
                    </div>
                    <KeyValueList className='sm:grid-cols-3'>
                      <KeyValueRow label='type'><StatusBadge status={candidate.strategy_type}>{candidate.strategy_type}</StatusBadge></KeyValueRow>
                      <KeyValueRow label='confidence'>{candidate.confidence}</KeyValueRow>
                      <KeyValueRow label='Pine feasibility'>{candidate.pine_feasibility}</KeyValueRow>
                    </KeyValueList>
                    <div className='text-sm leading-6 text-slate-700'>
                      <strong>entry:</strong> {candidate.entry_logic.join(' / ')}
                    </div>
                    <div className='text-sm leading-6 text-slate-700'>
                      <strong>risk:</strong> {candidate.risk_management.join(' / ')}
                    </div>
                    <div className='rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500'>
                      caution: {candidate.backtest_cautions.join(' / ')}
                    </div>
                  </Surface>
                ))
              )}

              <InlineNotice tone='info'>
                {proposalData.disclaimer}
              </InlineNotice>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title='提案履歴'
        description='保存済み strategy proposal run を provider / status / selected / search で絞り込みます。候補を使う操作は title と自然言語ルールへの反映に留めます。'
        className='mt-4'
      >
        <div className='grid gap-3'>
          <ProviderQualityTrendNote
            data={proposalQualityTrendData}
            error={proposalQualityTrendError}
            isLoading={proposalQualityTrendLoading}
          />

          <Surface variant='muted' className='grid gap-2 p-3'>
            <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-5'>
              <TextInput
                label='履歴検索'
                value={historySearchDraft}
                onChange={(event) => setHistorySearchDraft(event.target.value)}
                placeholder='run id / provider / metadata'
              />
              <SelectField
                label='provider'
                value={historyProvider}
                onChange={(event) => {
                  setHistoryProvider(event.target.value);
                  setHistoryPage(1);
                  resetHistoryDetail();
                }}
              >
                {HISTORY_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </SelectField>
              <SelectField
                label='status'
                value={historyStatus}
                onChange={(event) => {
                  setHistoryStatus(event.target.value);
                  setHistoryPage(1);
                  resetHistoryDetail();
                }}
              >
                {HISTORY_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </SelectField>
              <SelectField
                label='selected'
                value={historySelected}
                onChange={(event) => {
                  setHistorySelected(event.target.value);
                  setHistoryPage(1);
                  resetHistoryDetail();
                }}
              >
                {HISTORY_SELECTED_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </SelectField>
              <SelectField
                label='archive'
                value={historyArchived}
                onChange={(event) => {
                  setHistoryArchived(event.target.value);
                  setHistoryPage(1);
                  resetHistoryDetail();
                }}
              >
                {HISTORY_ARCHIVED_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </SelectField>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button variant='secondary' onClick={applyHistorySearch}>履歴を絞り込む</Button>
              {hasHistoryFilter && (
                <Button variant='secondary' onClick={clearHistoryFilters}>絞り込みをクリア</Button>
              )}
            </div>
            <InlineNotice tone='info'>
              archive は削除ではなく通常一覧から隠す操作です。履歴検索は run id / provider / input metadata を対象にし、candidate本文、providerやCodexの生出力、内部診断、秘密値は表示しません。
            </InlineNotice>
          </Surface>

          {proposalHistoryLoading && (
            <LoadingState title='提案履歴を読み込み中です' />
          )}

          {proposalHistoryError && (
            <ErrorState title='提案履歴を読み込めませんでした'>
              時間をおいて再試行してください。
            </ErrorState>
          )}

          {!proposalHistoryLoading && !proposalHistoryError && proposalHistoryData?.proposal_runs?.length === 0 && (
            <EmptyState title='提案履歴はありません'>
              条件に合う履歴がないか、まだ候補が生成されていません。
            </EmptyState>
          )}

          {proposalHistoryData?.proposal_runs?.map((run) => (
            <div
              key={run.id}
              style={{
                border: '1px solid #d8dee4',
                borderRadius: '8px',
                padding: '0.85rem',
                display: 'grid',
                gap: '0.55rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <KeyValueList className='sm:grid-cols-2'>
                  <KeyValueRow label='status'><StatusBadge status={run.status}>{run.status}</StatusBadge></KeyValueRow>
                  <KeyValueRow label='created'>{formatDateTime(run.created_at)}</KeyValueRow>
                  <KeyValueRow label='provider'>{run.provider_name}</KeyValueRow>
                  <KeyValueRow label='candidate count'>{String(run.candidate_count)}</KeyValueRow>
                  <KeyValueRow label='selected'>{run.selected_candidate_id ? 'あり' : 'なし'}</KeyValueRow>
                  <KeyValueRow label='archive'>{run.is_archived ? 'アーカイブ済み' : 'active'}</KeyValueRow>
                </KeyValueList>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <Button onClick={() => setSelectedProposalRunId(run.id)}>
                    候補を見る
                  </Button>
                  <Button variant='secondary' onClick={() => void onArchiveProposalRun(run.id, !run.is_archived)}>
                    {run.is_archived ? '戻す' : 'アーカイブ'}
                  </Button>
                </div>
              </div>

              {selectedProposalRunId === run.id && (
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  {selectedProposalDetail?.proposal_run?.is_archived && (
                    <InlineNotice tone='info'>
                      この proposal run はアーカイブ済みです。候補選択は可能ですが、自動で通常一覧へ戻しません。
                    </InlineNotice>
                  )}
                  {selectedProposalDetailLoading && (
                    <LoadingState title='候補 detail を読み込み中です' />
                  )}
                  {selectedProposalDetailError && (
                    <ErrorState title='候補 detail を読み込めませんでした'>
                      時間をおいて再試行してください。
                    </ErrorState>
                  )}
                  {selectedProposalDetail?.proposal_run?.id === run.id && selectedProposalDetail.candidates.length === 0 && (
                    <EmptyState title='履歴候補はありません'>
                      failed run または候補なしの run です。
                    </EmptyState>
                  )}
                  {selectedProposalDetail?.proposal_run?.id === run.id && selectedProposalDetail.candidates.map((historyCandidate) => (
                    <div
                      key={historyCandidate.id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        display: 'grid',
                        gap: '0.45rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1rem' }}>{historyCandidate.candidate.title}</h3>
                          <p style={{ margin: '0.25rem 0 0', color: '#475569' }}>{historyCandidate.candidate.summary}</p>
                        </div>
                        <Button
                          onClick={() => void onUseHistoryProposal(run.id, historyCandidate.id, historyCandidate.candidate)}
                          disabled={selectingProposalCandidateId === historyCandidate.id}
                        >
                          {selectingProposalCandidateId === historyCandidate.id ? '記録中...' : 'この候補を使う'}
                        </Button>
                      </div>
                      <KeyValueList className='sm:grid-cols-3'>
                        <KeyValueRow label='rank'>{String(historyCandidate.rank)}</KeyValueRow>
                        <KeyValueRow label='type'><StatusBadge status={historyCandidate.candidate.strategy_type}>{historyCandidate.candidate.strategy_type}</StatusBadge></KeyValueRow>
                        <KeyValueRow label='selected'>{historyCandidate.selected_at ? 'あり' : 'なし'}</KeyValueRow>
                      </KeyValueList>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {proposalHistoryData?.pagination && (
            <PaginationControls
              page={proposalHistoryData.pagination.page}
              hasPrev={proposalHistoryData.pagination.has_previous}
              hasNext={proposalHistoryData.pagination.has_next}
              onPrev={() => {
                setHistoryPage((page) => Math.max(1, page - 1));
                resetHistoryDetail();
              }}
              onNext={() => {
                setHistoryPage((page) => page + 1);
                resetHistoryDetail();
              }}
              summaryLabel={`page {page} / total ${proposalHistoryData.pagination.total_count}`}
              previousLabel='前へ'
              nextLabel='次へ'
            />
          )}
        </div>
      </SectionCard>

      <SectionCard
        title='ルール入力'
        description='自然言語ルール、対象市場、時間足を指定して Pine 生成まで実行します。'
        className='mt-4'
      >
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <TextInput
            label='戦略タイトル'
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />

          <TextArea
            label='自然言語ルール'
            value={naturalLanguageRule}
            onChange={(event) => setNaturalLanguageRule(event.target.value)}
            rows={7}
          />

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
            <SelectField
              label='市場'
              value={market}
              onChange={(event) => setMarket(event.target.value)}
            >
              {MARKET_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </SelectField>

            <SelectField
              label='時間足'
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value)}
            >
              {TIMEFRAME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectField>
          </div>

          <div style={{ fontSize: '0.9rem', color: '#666' }}>
            Pine生成対象: JP_STOCK / US_STOCK、日足（D）/ 4時間足（4H）/ 1時間足（1H）。生成したPineはTradingViewのsymbolとchart timeframe上で検証してください。internal backtestの対応範囲拡張ではありません。
          </div>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>
            時間足により提案される戦略候補の前提・注意点が変わります。APIや既存履歴から 1D が来た場合は D と同義に扱います。
          </div>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>
            MVP制約: 日本語入力中心 / long_only の基本条件（移動平均・RSI・出来高）を対象
          </div>

          {error && (
            <ErrorState title='ルール生成に失敗しました'>
              {error}
            </ErrorState>
          )}

          <Button type='submit' variant='primary' disabled={submitting} className='w-fit'>
            {submitting ? '生成中...' : '保存してPine生成'}
          </Button>

          {submitting && (
            <PineGenerationProgress
              currentStage={pineGenerationJob?.current_stage ?? 'queued'}
              status={pineGenerationJob?.status ?? 'running'}
              stageHistory={pineGenerationJob?.stage_history ?? []}
              className='mt-2'
            />
          )}
        </form>
      </SectionCard>

      {result && (
        <SectionCard title='生成結果' className='mt-8'>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <KeyValueList>
              <KeyValueRow label='strategy_id'><code>{strategyId ?? '-'}</code></KeyValueRow>
              <KeyValueRow label='version_id'><code>{result.id}</code></KeyValueRow>
              <KeyValueRow label='status'><StatusBadge status={result.status}><code>{result.status}</code></StatusBadge></KeyValueRow>
              <KeyValueRow label='backtest_id'><code>{backtest?.id ?? '-'}</code></KeyValueRow>
            </KeyValueList>

          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            {strategyId && (
              <TextLink
                href={`/strategies/${strategyId}/versions`}
                className='font-semibold text-sky-700 no-underline hover:underline'
              >
                version 一覧を開く
              </TextLink>
            )}
            <TextLink
              href={`/strategy-versions/${result.id}`}
              className='font-semibold text-sky-700 no-underline hover:underline'
            >
              この version 詳細を開く
            </TextLink>
          </div>

          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>警告</h3>
            {result.warnings.length > 0 ? (
              <ul style={{ color: '#8a5b00' }}>
                {result.warnings.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            ) : (
              <EmptyState title='なし' />
            )}
          </div>

          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>前提</h3>
            {result.assumptions.length > 0 ? (
              <ul>
                {result.assumptions.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            ) : (
              <EmptyState title='なし' />
            )}
          </div>

          <div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>generated pine</h3>
              <Button
                data-testid='strategy-lab-copy-pine-button'
                onClick={onCopyGeneratedPine}
                disabled={!result.generated_pine}
              >
                コピー
              </Button>
            </div>
            {pineCopyFeedback && (
              <div
                style={{
                  marginBottom: '0.5rem',
                  color: pineCopyFeedback.type === 'success' ? '#1f6a1f' : '#a10000',
                  fontSize: '0.9rem',
                }}
              >
                {pineCopyFeedback.text}
              </div>
            )}
            {result.generated_pine ? (
              <pre style={{ margin: 0, padding: '1rem', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '4px', overflowX: 'auto' }}>
                <code>{result.generated_pine}</code>
              </pre>
            ) : (
              <EmptyState title='生成に失敗しました'>
                警告を確認してください。
              </EmptyState>
            )}
          </div>
          </div>
        </SectionCard>
      )}

      {latestVersion && (
        <SectionCard title='保存済み version（最新）' className='mt-6'>
          <KeyValueList className='sm:grid-cols-2'>
            <KeyValueRow label='id'><code>{latestVersion.id}</code></KeyValueRow>
            <KeyValueRow label='市場'>{latestVersion.market}</KeyValueRow>
            <KeyValueRow label='時間足'>{formatTimeframeLabel(latestVersion.timeframe)}</KeyValueRow>
            <KeyValueRow label='状態'><StatusBadge status={latestVersion.status}><code>{latestVersion.status}</code></StatusBadge></KeyValueRow>
            <KeyValueRow label='warnings'>{latestVersion.has_warnings ? 'あり' : 'なし'}</KeyValueRow>
          </KeyValueList>
        </SectionCard>
      )}

      {backtest && (
        <SectionCard title='CSV取込（MVP）' className='mt-8'>
          <div style={{ display: 'grid', gap: '0.8rem' }}>
          <p style={{ margin: 0, color: '#666' }}>
            対応CSV: Performance Summary（英語・日本語ヘッダー）/ List of Trades（英語・日本語ヘッダー）。
          </p>

          <input
            type='file'
            accept='.csv,text/csv'
            onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
          />

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button
              onClick={onImportCsv}
              disabled={importing}
              variant='primary'
            >
              {importing ? '取込中...' : 'CSVを取込'}
            </Button>

            <Button
              onClick={() => setLocation(`/backtests/${backtest.id}`)}
            >
              検証レポートを開く
            </Button>
          </div>

          {importError && (
            <ErrorState title='CSV取込に失敗しました'>
              {importError}
            </ErrorState>
          )}

          {importState && (
            <div style={{ padding: '1rem', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '4px' }}>
              <KeyValueList>
                <KeyValueRow label='import_id'><code>{importState.id}</code></KeyValueRow>
                <KeyValueRow label='parse_status'><StatusBadge status={importState.parse_status}><code>{importState.parse_status}</code></StatusBadge></KeyValueRow>
              </KeyValueList>
              {importState.parse_error && (
                <div style={{ color: '#a10000' }}><strong>parse_error:</strong> {importState.parse_error}</div>
              )}
              {importState.parse_status === 'failed' && (
                <div
                  style={{
                    marginTop: '0.6rem',
                    padding: '0.65rem',
                    borderRadius: '4px',
                    border: '1px solid #f1b4b4',
                    background: '#fff3f3',
                    color: '#7a1f1f',
                    fontSize: '0.9rem',
                  }}
                >
                  {buildCsvParseGuidance(importState.parse_error).map((item) => (
                    <div key={item} style={{ marginBottom: '0.25rem' }}>{item}</div>
                  ))}
                </div>
              )}
              {importState.parsed_summary && (
                <div style={{ marginTop: '0.6rem' }}>
                  <KeyValueList>
                    <KeyValueRow label='totalTrades'>{String(importState.parsed_summary.totalTrades)}</KeyValueRow>
                    <KeyValueRow label='winRate'>{String(importState.parsed_summary.winRate)}</KeyValueRow>
                    <KeyValueRow label='profitFactor'>{String(importState.parsed_summary.profitFactor)}</KeyValueRow>
                    <KeyValueRow label='maxDrawdown'>{String(importState.parsed_summary.maxDrawdown)}</KeyValueRow>
                    <KeyValueRow label='netProfit'>{String(importState.parsed_summary.netProfit)}</KeyValueRow>
                    <KeyValueRow label='periodFrom'>{importState.parsed_summary.periodFrom ?? '-'}</KeyValueRow>
                    <KeyValueRow label='periodTo'>{importState.parsed_summary.periodTo ?? '-'}</KeyValueRow>
                  </KeyValueList>
                </div>
              )}
            </div>
          )}
          </div>
        </SectionCard>
      )}
      </div>
    </AppLayout>
  );
}
