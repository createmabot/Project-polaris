import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useLocation } from 'wouter';
import { ApiError, postApi, swrFetcher } from '../api/client';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { SelectField, TextArea, TextInput } from '../components/ui/FormFields';
import InlineNotice from '../components/ui/InlineNotice';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import SectionCard from '../components/ui/SectionCard';
import StatusBadge from '../components/ui/StatusBadge';
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
  StrategyVersionPineGenerateData,
  StrategyVersionListData,
} from '../api/types';

const MARKET_OPTIONS = ['JP_STOCK'];
const TIMEFRAME_OPTIONS = ['D'];
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

function buildRuleSubmitErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'ルール生成に失敗しました。入力内容を確認して再試行してください。';
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
  const [proposalData, setProposalData] = useState<StrategyProposalData | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [selectedProposalRunId, setSelectedProposalRunId] = useState<string | null>(null);
  const [proposalSelectionError, setProposalSelectionError] = useState<string | null>(null);
  const [selectingProposalCandidateId, setSelectingProposalCandidateId] = useState<string | null>(null);
  const [codexPromptData, setCodexPromptData] = useState<StrategyProposalCodexCliRequestData | null>(null);
  const [codexPromptError, setCodexPromptError] = useState<string | null>(null);
  const [codexPrompting, setCodexPrompting] = useState(false);
  const [codexImportText, setCodexImportText] = useState('');
  const [codexImportFileName, setCodexImportFileName] = useState<string | null>(null);
  const [codexImportError, setCodexImportError] = useState<string | null>(null);
  const [codexImporting, setCodexImporting] = useState(false);
  const [codexCopyFeedback, setCodexCopyFeedback] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StrategyVersionData['strategy_version'] | null>(null);
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [backtest, setBacktest] = useState<BacktestCreateData['backtest'] | null>(null);

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
  } = useSWR<StrategyProposalHistoryListData>('/api/strategy-lab/proposals?limit=5', swrFetcher);
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
        user_hint: naturalLanguageRule.trim() || null,
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
        user_hint: naturalLanguageRule.trim() || null,
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

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    setBacktest(null);
    setImportState(null);
    setImportError(null);

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

      const generated = await postApi<StrategyVersionPineGenerateData>(
        `/api/strategy-versions/${version.strategy_version.id}/pine/generate`,
        {}
      );
      setResult(generated.strategy_version);

      if (generated.pine.status === 'generated') {
        const createdBacktest = await postApi<BacktestCreateData>('/api/backtests', {
          strategy_version_id: generated.strategy_version.id,
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
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <TextLink href='/' className='text-slate-600 no-underline hover:underline'>ホームへ戻る</TextLink>
          <TextLink href='/backtests' className='text-slate-600 no-underline hover:underline'>履歴一覧を見る</TextLink>
        </div>
      </div>

      <h1>ルール検証ラボ（MVP）</h1>
      <p style={{ color: '#666' }}>
        自然言語ルールから Pine を生成し、その後 TradingView の検証CSVを取り込んで parse 状態を確認します。
      </p>

      <SectionCard
        title='ストラテジー候補の提案'
        description='AIによる検証候補を取得し、選択した候補を自然言語ルールへ反映します。投資助言ではなく、backtest前提のたたき台です。'
        className='mt-5'
      >
        <div style={{ display: 'grid', gap: '1rem' }}>
          <InlineNotice tone='warning'>
            候補は検証用のたたき台です。売買推奨ではありません。選択後に内容を確認し、Pine生成とbacktestで検証してください。
          </InlineNotice>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
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

          <Button onClick={onRequestProposals} disabled={proposing} variant='primary' className='w-fit'>
            {proposing ? '候補を取得中...' : 'ストラテジーを提案'}
          </Button>

          <div
            style={{
              border: '1px solid #d8dee4',
              borderRadius: '8px',
              padding: '0.85rem',
              display: 'grid',
              gap: '0.75rem',
              background: '#f8fafc',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Codex CLIで生成した候補JSONを取り込む</h3>
              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                Codex CLIはこの画面から自動実行されません。promptを手動で渡し、返却されたJSONを貼り付けてください。複数候補は candidates 配列で最大10件まで取り込めます。
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
          </div>

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
            <div style={{ display: 'grid', gap: '0.75rem' }}>
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
                  <div
                    key={candidate.candidate_id}
                    style={{
                      border: '1px solid #d8dee4',
                      borderRadius: '8px',
                      padding: '0.85rem',
                      display: 'grid',
                      gap: '0.55rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>{candidate.title}</h3>
                        <p style={{ margin: '0.25rem 0 0', color: '#475569' }}>{candidate.summary}</p>
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
                    <div style={{ fontSize: '0.9rem', color: '#334155' }}>
                      <strong>entry:</strong> {candidate.entry_logic.join(' / ')}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#334155' }}>
                      <strong>risk:</strong> {candidate.risk_management.join(' / ')}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      caution: {candidate.backtest_cautions.join(' / ')}
                    </div>
                  </div>
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
        title='最近の提案'
        description='直近の strategy proposal run を最小表示します。候補を使う操作は title と自然言語ルールへの反映に留めます。'
        className='mt-5'
      >
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          <ProviderQualityTrendNote
            data={proposalQualityTrendData}
            error={proposalQualityTrendError}
            isLoading={proposalQualityTrendLoading}
          />

          {proposalHistoryLoading && (
            <LoadingState title='提案履歴を読み込み中です' />
          )}

          {proposalHistoryError && (
            <ErrorState title='提案履歴を読み込めませんでした'>
              時間をおいて再試行してください。
            </ErrorState>
          )}

          {!proposalHistoryLoading && !proposalHistoryError && proposalHistoryData?.proposal_runs?.length === 0 && (
            <EmptyState title='最近の提案はありません'>
              候補を生成するとここに履歴が表示されます。
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
                </KeyValueList>
                <Button onClick={() => setSelectedProposalRunId(run.id)}>
                  候補を見る
                </Button>
              </div>

              {selectedProposalRunId === run.id && (
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  {selectedProposalDetailLoading && (
                    <LoadingState title='候補 detail を読み込み中です' />
                  )}
                  {selectedProposalDetailError && (
                    <ErrorState title='候補 detail を読み込めませんでした'>
                      時間をおいて再試行してください。
                    </ErrorState>
                  )}
                  {selectedProposalDetail?.candidates.length === 0 && (
                    <EmptyState title='履歴候補はありません'>
                      failed run または候補なしの run です。
                    </EmptyState>
                  )}
                  {selectedProposalDetail?.candidates.map((historyCandidate) => (
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
        </div>
      </SectionCard>

      <SectionCard
        title='ルール入力'
        description='自然言語ルール、対象市場、時間足を指定して Pine 生成まで実行します。'
        className='mt-5'
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
                <option key={option} value={option}>{option}</option>
              ))}
            </SelectField>
          </div>

          <div style={{ fontSize: '0.9rem', color: '#666' }}>
            MVP制約: 日本語入力中心 / 日足(D)中心 / long_only の基本条件（移動平均・RSI・出来高）を対象
          </div>

          {error && (
            <ErrorState title='ルール生成に失敗しました'>
              {error}
            </ErrorState>
          )}

          <Button type='submit' variant='primary' disabled={submitting} className='w-fit'>
            {submitting ? '生成中...' : '保存してPine生成'}
          </Button>
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
            <h3 style={{ marginBottom: '0.5rem' }}>warnings</h3>
            {result.warnings.length > 0 ? (
              <ul style={{ color: '#8a5b00' }}>
                {result.warnings.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            ) : (
              <EmptyState title='なし' />
            )}
          </div>

          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>assumptions</h3>
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
                warnings を確認してください。
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
            <KeyValueRow label='時間足'>{latestVersion.timeframe}</KeyValueRow>
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
  );
}
