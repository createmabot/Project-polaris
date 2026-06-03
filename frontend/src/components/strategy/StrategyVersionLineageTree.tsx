import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'wouter';
import { swrFetcher } from '../../api/client';
import { StrategyVersionLineageData } from '../../api/types';
import {
  buildLineageLayout,
  buildStrategyVersionLineageApiPath,
  LINEAGE_NODE_HEIGHT,
  LINEAGE_NODE_WIDTH,
  lineageMetricBadges,
  resolveNextLineageZoom,
} from '../../utils/strategyVersionLineage';

type StrategyVersionLineageTreeProps = {
  strategyId: string;
  currentVersionId?: string | null;
  detailUrlBuilder?: (versionId: string) => string;
  compact?: boolean;
  className?: string;
  title?: string;
  description?: string;
};

function statusLabel(status: string): string {
  if (status === 'generated') return '生成済み';
  if (status === 'draft') return '下書き';
  if (status === 'failed') return '生成失敗';
  return status;
}

function defaultDetailUrl(versionId: string): string {
  return `/strategy-versions/${versionId}`;
}

export default function StrategyVersionLineageTree({
  strategyId,
  currentVersionId = null,
  detailUrlBuilder = defaultDetailUrl,
  compact = false,
  className,
  title = '履歴ツリー',
  description = 'clone 由来の version lineage と最新検証メタデータを確認します。表示だけでは生成・検証・適用は起動しません。',
}: StrategyVersionLineageTreeProps) {
  const [lineageZoom, setLineageZoom] = useState(1);
  const lineageApiPath = buildStrategyVersionLineageApiPath(strategyId);
  const { data: lineageData, error: lineageError } = useSWR<StrategyVersionLineageData>(lineageApiPath, swrFetcher);
  const lineageLayout = useMemo(() => buildLineageLayout(lineageData), [lineageData]);
  const viewportHeight = compact ? '260px' : '340px';

  return (
    <section
      className={className}
      style={{
        marginTop: compact ? '1rem' : '1.5rem',
        padding: compact ? '0.85rem' : '1rem',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: compact ? '1rem' : '1.1rem' }}>{title}</h2>
          <p style={{ margin: '0.25rem 0 0', color: '#555', fontSize: compact ? '0.84rem' : '0.9rem' }}>
            {description}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type='button'
            onClick={() => setLineageZoom((current) => resolveNextLineageZoom(current, 'out'))}
            style={{ padding: '0.25rem 0.5rem', border: '1px solid #ccd6e0', borderRadius: '4px', background: '#fff' }}
          >
            縮小
          </button>
          <button
            type='button'
            onClick={() => setLineageZoom((current) => resolveNextLineageZoom(current, 'reset'))}
            style={{ padding: '0.25rem 0.5rem', border: '1px solid #ccd6e0', borderRadius: '4px', background: '#fff' }}
          >
            100%
          </button>
          <button
            type='button'
            onClick={() => setLineageZoom((current) => resolveNextLineageZoom(current, 'in'))}
            style={{ padding: '0.25rem 0.5rem', border: '1px solid #ccd6e0', borderRadius: '4px', background: '#fff' }}
          >
            拡大
          </button>
          <span style={{ color: '#666', fontSize: '0.85rem' }}>zoom {Math.round(lineageZoom * 100)}%</span>
        </div>
      </div>

      {lineageError ? (
        <div style={{ marginTop: '0.8rem', color: '#8a1212' }}>履歴ツリーを読み込めませんでした。</div>
      ) : lineageLayout.nodes.length === 0 ? (
        <div style={{ marginTop: '0.8rem', color: '#666' }}>履歴ツリーに表示できる version はありません。</div>
      ) : (
        <>
          {lineageData?.meta.truncated && (
            <div style={{ marginTop: '0.6rem', color: '#755200', fontSize: '0.85rem' }}>
              version が多いため先頭 {lineageData.meta.limit} 件のみ表示しています。
            </div>
          )}
          <div
            style={{
              marginTop: compact ? '0.65rem' : '0.8rem',
              height: viewportHeight,
              overflow: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f6f9ff 100%)',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: `${lineageLayout.width * lineageZoom}px`,
                height: `${lineageLayout.height * lineageZoom}px`,
                transformOrigin: 'top left',
              }}
            >
              <svg
                width={lineageLayout.width * lineageZoom}
                height={lineageLayout.height * lineageZoom}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                aria-hidden='true'
              >
                {lineageLayout.edges.map((edge) => (
                  <line
                    key={`${edge.from_version_id}-${edge.to_version_id}`}
                    x1={edge.x1 * lineageZoom}
                    y1={edge.y1 * lineageZoom}
                    x2={edge.x2 * lineageZoom}
                    y2={edge.y2 * lineageZoom}
                    stroke='#90a4c2'
                    strokeWidth={2}
                  />
                ))}
              </svg>
              {lineageLayout.nodes.map((node) => {
                const metricBadges = lineageMetricBadges(node.latest_backtest_metrics);
                const isCurrent = node.id === currentVersionId;
                return (
                  <Link
                    key={node.id}
                    href={detailUrlBuilder(node.id)}
                    aria-current={isCurrent ? 'page' : undefined}
                    style={{
                      position: 'absolute',
                      left: `${node.x * lineageZoom}px`,
                      top: `${node.y * lineageZoom}px`,
                      width: `${LINEAGE_NODE_WIDTH * lineageZoom}px`,
                      minHeight: `${LINEAGE_NODE_HEIGHT * lineageZoom}px`,
                      boxSizing: 'border-box',
                      padding: `${0.55 * lineageZoom}rem`,
                      border: isCurrent
                        ? '2px solid #2563eb'
                        : node.annotation.is_favorite
                          ? '2px solid #e1a600'
                          : '1px solid #cbd5e1',
                      borderRadius: `${10 * lineageZoom}px`,
                      background: isCurrent ? '#eff6ff' : '#fff',
                      color: '#172033',
                      textDecoration: 'none',
                      boxShadow: isCurrent
                        ? '0 8px 22px rgba(37, 99, 235, 0.16)'
                        : '0 8px 18px rgba(31, 49, 82, 0.08)',
                      fontSize: `${0.78 * lineageZoom}rem`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', fontWeight: 700 }}>
                      <span>v:{node.id.slice(0, 8)}</span>
                      <span aria-label={node.annotation.is_favorite ? 'favorite' : 'not favorite'}>
                        {node.annotation.is_favorite ? '★' : '☆'}
                      </span>
                    </div>
                    {isCurrent && (
                      <div style={{ marginTop: '0.18rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.08rem 0.32rem',
                            borderRadius: '999px',
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            fontSize: `${0.68 * lineageZoom}rem`,
                            fontWeight: 700,
                          }}
                        >
                          現在表示中
                        </span>
                      </div>
                    )}
                    {node.annotation.label && (
                      <div style={{ marginTop: '0.2rem', color: '#0f3f75', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.annotation.label}
                      </div>
                    )}
                    <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <span>{statusLabel(node.status)}</span>
                      <span>{node.timeframe}</span>
                      {node.has_forward_validation_note && <span>検証ノート</span>}
                      {node.has_diff_from_clone && <span>差分</span>}
                    </div>
                    {metricBadges.length > 0 && (
                      <div style={{ marginTop: '0.28rem', display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }} aria-label='latest backtest metrics'>
                        {metricBadges.map((badge) => (
                          <span
                            key={badge}
                            style={{
                              padding: '0.08rem 0.28rem',
                              border: '1px solid #d7e3f2',
                              borderRadius: '999px',
                              background: '#f5f9ff',
                              color: '#29415f',
                              fontSize: `${0.68 * lineageZoom}rem`,
                              lineHeight: 1.35,
                            }}
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
