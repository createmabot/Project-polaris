import { useState } from 'react';
import useSWR from 'swr';
import { Link, useLocation } from 'wouter';
import { swrFetcher } from '../api/client';
import { BacktestDetailData } from '../api/types';

type BacktestDetailProps = {
  params: { backtestId: string };
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

function parseStatusText(status: string | null | undefined): string {
  if (status === 'parsed') return '解析成功';
  if (status === 'failed') return '解析失敗';
  if (status === 'pending') return '解析待ち';
  return valueText(status);
}

function parseStatusStyle(status: string | null | undefined): { background: string; color: string } {
  if (status === 'parsed') return { background: '#e8f6ea', color: '#176b2d' };
  if (status === 'failed') return { background: '#fdeaea', color: '#9f1c1c' };
  if (status === 'pending') return { background: '#eef4ff', color: '#144b9a' };
  return { background: '#f2f2f2', color: '#444' };
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

export default function BacktestDetail({ params }: BacktestDetailProps) {
  const { backtestId } = params;
  const [location] = useLocation();
  const { data, error, isLoading } = useSWR<BacktestDetailData>(`/api/backtests/${backtestId}`, swrFetcher);
  const returnPath = parseBacktestsReturnPath(location) ?? '/backtests';

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  if (!data) return null;

  const latestImport = data.latest_import;
  const latestStatus = parseStatusText(latestImport?.parse_status);
  const latestStatusStyle = parseStatusStyle(latestImport?.parse_status);
  const summary = latestImport?.parsed_summary;
  const parsedImports = data.imports.filter((item) => item.parsed_summary);
  const baseImport = parsedImports[0] ?? null;
  const comparisonCandidates = parsedImports.filter((item) => item.id !== baseImport?.id);
  const [selectedComparisonImportId, setSelectedComparisonImportId] = useState<string>('');
  const effectiveComparisonImportId = selectedComparisonImportId || comparisonCandidates[0]?.id || null;
  const targetImport = effectiveComparisonImportId
    ? comparisonCandidates.find((item) => item.id === effectiveComparisonImportId) ?? null
    : null;
  const comparisonRows = baseImport?.parsed_summary && targetImport?.parsed_summary
    ? buildComparisonRows(baseImport.parsed_summary, targetImport.parsed_summary)
    : [];
  const usedStrategy = data.used_strategy;
  const snapshot = usedStrategy.snapshot;
  const strategyVersionsPath = usedStrategy.strategy_id ? buildBacktestRuleLabVersionsPath(usedStrategy.strategy_id) : null;
  const strategyVersionDetailPath =
    usedStrategy.strategy_id && usedStrategy.strategy_version_id
      ? buildBacktestRuleLabVersionDetailPath(usedStrategy.strategy_id, usedStrategy.strategy_version_id)
      : null;

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
        <div><strong>backtest ID:</strong> <code>{data.backtest.id}</code></div>
        <div><strong>strategy version:</strong> <code>{data.backtest.strategy_version_id}</code></div>
        <div><strong>実行名:</strong> {data.backtest.title}</div>
        <div><strong>実行ソース:</strong> {data.backtest.execution_source}</div>
        <div><strong>市場:</strong> {data.backtest.market}</div>
        <div><strong>時間軸:</strong> {data.backtest.timeframe}</div>
        <div><strong>状態:</strong> <code>{data.backtest.status}</code></div>
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

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>取込状態</h2>
        {!latestImport ? (
          <div style={{ color: '#666' }}>
            <p style={{ marginTop: 0 }}>取込データはまだありません。</p>
            <p style={{ marginBottom: 0 }}>`/strategy-lab` で backtest を作成し、CSV を取り込んでください。</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div><strong>最新 import ID:</strong> <code>{latestImport.id}</code></div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: '999px',
                  padding: '0.2rem 0.6rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  ...latestStatusStyle,
                }}
              >
                {latestStatus}
              </div>
            </div>
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
          <p style={{ margin: 0, color: '#666' }}>解析済みサマリーはまだありません。</p>
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

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>バックテスト比較 inline</h2>
        <p style={{ marginTop: 0, marginBottom: '0.75rem', color: '#666', fontSize: '0.92rem' }}>
          比較元 run と比較対象 run の parsed summary を同一画面で確認できます（read-only）。
        </p>
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
            )}
          </>
        )}
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>AI 総評</h2>
        {data.ai_review ? (
          <>
            {data.ai_review.title && (
              <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{data.ai_review.title}</div>
            )}
            {data.ai_review.generated_at && (
              <div style={{ marginBottom: '0.6rem', color: '#666', fontSize: '0.9rem' }}>
                生成日時: {data.ai_review.generated_at}
              </div>
            )}
            <div
              style={{
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
                background: '#fafafa',
                border: '1px solid #e6e6e6',
                borderRadius: '6px',
                padding: '0.75rem',
              }}
            >
              {data.ai_review.body_markdown}
            </div>
          </>
        ) : (
          <p style={{ margin: 0, color: '#666' }}>AI総評はまだ生成されていません。</p>
        )}
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>import 履歴</h2>
        {data.imports.length === 0 ? (
          <p style={{ margin: 0, color: '#666' }}>履歴はありません。</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1rem' }}>
            {data.imports.map((item) => (
              <li key={item.id} style={{ marginBottom: '0.4rem' }}>
                <code>{item.id}</code> / {item.file_name} / <code>{parseStatusText(item.parse_status)}</code>
                {item.parse_error ? ` / エラー: ${item.parse_error}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
