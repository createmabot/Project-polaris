import { FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useLocation } from 'wouter';
import { ApiError, postApi, swrFetcher } from '../api/client';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { SelectField, TextArea, TextInput } from '../components/ui/FormFields';
import InlineNotice from '../components/ui/InlineNotice';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import SectionCard from '../components/ui/SectionCard';
import StatusBadge from '../components/ui/StatusBadge';
import TextLink from '../components/ui/TextLink';
import {
  BacktestCreateData,
  BacktestImportData,
  StrategyCreateData,
  StrategyProposalData,
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

function buildProposalErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'ストラテジー候補の取得に失敗しました。入力内容を確認して再試行してください。';
  }
  if (error.status === 400) {
    return '候補生成の入力に不備があります。市場・時間足・リスク設定を確認してください。';
  }
  if (error.status >= 500) {
    return 'サーバー側で候補取得に失敗しました。時間をおいて再試行してください。';
  }
  return error.message || 'ストラテジー候補の取得に失敗しました。';
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
    } catch (proposalRequestError: unknown) {
      console.error('Strategy proposal request failed', proposalRequestError);
      setProposalError(buildProposalErrorMessage(proposalRequestError));
    } finally {
      setProposing(false);
    }
  };

  const onUseProposal = (candidate: StrategyProposalData['candidates'][number]) => {
    setTitle(candidate.title);
    setNaturalLanguageRule(candidate.suggested_natural_language_spec);
    setProposalError(null);
    setError(null);
    setResult(null);
    setStrategyId(null);
    setBacktest(null);
    setCsvFile(null);
    setImportState(null);
    setImportError(null);
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

          {proposalError && (
            <ErrorState title='候補取得に失敗しました'>
              {proposalError}
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
                      <Button onClick={() => onUseProposal(candidate)}>
                        この候補を使う
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
