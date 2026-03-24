import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link, useLocation } from 'wouter';
import { patchApi, postApi, swrFetcher } from '../api/client';
import { StrategyVersionData } from '../api/types';

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
  baseLine: string;
  currentLine: string;
};

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
        excerpts.push({ baseLine: line.text, currentLine: next.text });
        i += 1;
        continue;
      }
      excerpts.push({ baseLine: line.text, currentLine: '' });
      continue;
    }

    excerpts.push({ baseLine: '', currentLine: line.text });
  }

  return excerpts;
}

export default function StrategyVersionDetail({ params }: StrategyVersionDetailProps) {
  const { versionId } = params;
  const [, setLocation] = useLocation();
  const { data, error, isLoading, mutate } = useSWR<StrategyVersionData>(`/api/strategy-versions/${versionId}`, swrFetcher);

  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const [savingRule, setSavingRule] = useState(false);
  const [saveRuleError, setSaveRuleError] = useState<string | null>(null);
  const [saveRuleMessage, setSaveRuleMessage] = useState<string | null>(null);

  const [editingNaturalLanguageRule, setEditingNaturalLanguageRule] = useState('');

  const version = data?.strategy_version ?? null;
  const compareBase = data?.compare_base ?? null;
  const warnings = version && Array.isArray(version.warnings) ? version.warnings : [];
  const assumptions = version && Array.isArray(version.assumptions) ? version.assumptions : [];

  useEffect(() => {
    if (version) {
      setEditingNaturalLanguageRule(version.natural_language_rule);
    }
  }, [version?.id, version?.natural_language_rule]);

  const ruleDiff = useMemo(() => {
    if (!version || !compareBase) {
      return [];
    }
    return buildLineDiff(compareBase.natural_language_rule, version.natural_language_rule);
  }, [version?.natural_language_rule, compareBase?.natural_language_rule]);

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

  if (isLoading) {
    return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  }

  if (!version) {
    return null;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '920px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホームへ戻る</Link>
        <Link href='/strategy-lab' style={{ color: '#666', textDecoration: 'none' }}>ルール検証ラボへ戻る</Link>
        <Link href={`/strategies/${version.strategy_id}/versions`} style={{ color: '#666', textDecoration: 'none' }}>
          version 一覧へ
        </Link>
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
        <h2 style={{ marginBottom: '0.5rem' }}>比較元との差分（最小）</h2>
        {!compareBase ? (
          <p style={{ color: '#666' }}>比較元の version はありません。</p>
        ) : (
          <div>
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
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    {pineDiffExcerpt.map((excerpt, index) => (
                      <div key={`${excerpt.baseLine}-${excerpt.currentLine}-${index}`} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '4px', padding: '0.5rem' }}>
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
