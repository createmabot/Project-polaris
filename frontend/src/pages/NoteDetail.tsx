import React, { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { useRoute, useLocation, Link } from 'wouter';
import { swrFetcher, fetchApi } from '../api/client';
import { ResearchNoteDto, NoteRevisionDto } from '../api/types';

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

export default function NoteDetail() {
  const [isNewMatch, newParams] = useRoute('/symbols/:symbolId/note/new');
  const [isEditMatch, editParams] = useRoute('/notes/:noteId');
  const [, setLocation] = useLocation();

  const isNew = isNewMatch;
  const symbolId = isNewMatch ? newParams?.symbolId : null;
  const noteId = isEditMatch ? editParams?.noteId : null;

  const { data: note, error: noteError, isLoading: noteLoading } = useSWR<ResearchNoteDto>(
    isEditMatch && noteId ? `/api/notes/${noteId}` : null,
    swrFetcher
  );

  const { data: revisions, isLoading: revisionsLoading } = useSWR<NoteRevisionDto[]>(
    isEditMatch && noteId ? `/api/notes/${noteId}/revisions` : null,
    swrFetcher
  );

  const [formData, setFormData] = useState({
    title: '',
    thesisText: '',
    scenarioText: '',
    entryConditionText: '',
    takeProfitText: '',
    stopLossText: '',
    invalidationText: '',
    nextReviewAt: '',
    status: 'active',
    changeSummary: ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (note && isEditMatch) {
      setFormData({
        title: note.title || '',
        thesisText: note.thesisText || '',
        scenarioText: note.scenarioText || '',
        entryConditionText: note.entryConditionText || '',
        takeProfitText: note.takeProfitText || '',
        stopLossText: note.stopLossText || '',
        invalidationText: note.invalidationText || '',
        nextReviewAt: note.nextReviewAt ? note.nextReviewAt.substring(0, 10) : '',
        status: note.status || 'active',
        changeSummary: ''
      });
    }
  }, [note, isEditMatch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      if (isNew && symbolId) {
        const payload = {
          symbolId,
          title: formData.title,
          thesisText: formData.thesisText,
          scenarioText: formData.scenarioText,
          entryConditionText: formData.entryConditionText,
          takeProfitText: formData.takeProfitText,
          stopLossText: formData.stopLossText,
          invalidationText: formData.invalidationText,
          nextReviewAt: formData.nextReviewAt || undefined
        };
        const createdNote = await fetchApi<ResearchNoteDto>('/api/notes', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setLocation(`/notes/${createdNote.id}`);
      } else if (isEditMatch && noteId) {
        const payload = {
          title: formData.title,
          thesisText: formData.thesisText,
          scenarioText: formData.scenarioText,
          entryConditionText: formData.entryConditionText,
          takeProfitText: formData.takeProfitText,
          stopLossText: formData.stopLossText,
          invalidationText: formData.invalidationText,
          nextReviewAt: formData.nextReviewAt || undefined,
          status: formData.status,
          changeSummary: formData.changeSummary || '更新'
        };
        await fetchApi(`/api/notes/${noteId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        mutate(`/api/notes/${noteId}`);
        mutate(`/api/notes/${noteId}/revisions`);
        setFormData(prev => ({ ...prev, changeSummary: '' }));
        alert('保存しました');
      }
    } catch (err: any) {
      setSaveError(err.message || '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  if ((isEditMatch && noteLoading) || (!isNewMatch && !isEditMatch)) {
    return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  }

  if (isEditMatch && noteError) {
    return <div style={{ padding: '2rem', color: 'red' }}>エラーが発生しました: {noteError.message}</div>;
  }

  const targetSymbolId = isNew ? symbolId : note?.symbolId;
  const backLink = targetSymbolId ? `/symbols/${targetSymbolId}` : '/';

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif', display: 'flex', gap: '2rem' }}>
      
      {/* メイン編集エリア */}
      <div style={{ flex: '1 1 70%' }}>
        <div style={{ marginBottom: '1rem' }}>
          <Link href={backLink} style={{ color: '#666', textDecoration: 'none' }}>← 銘柄詳細へ戻る</Link>
        </div>

        <h1>{isNew ? '研究ノート作成' : '研究ノート編集'}</h1>

        {saveError && (
          <div style={{ padding: '1rem', background: '#fee', color: '#c00', marginBottom: '1rem', borderRadius: '4px' }}>
            {saveError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>タイトル <span style={{color:'red'}}>*</span></label>
            <input 
              name="title" 
              value={formData.title} 
              onChange={handleChange} 
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} 
              placeholder="例: 中期成長仮説"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>投資仮説 (Thesis)</label>
            <textarea 
              name="thesisText" 
              value={formData.thesisText} 
              onChange={handleChange} 
              rows={4}
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
              placeholder="なぜこの銘柄を買う/売るか？"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>基本シナリオ (Scenario)</label>
            <textarea 
              name="scenarioText" 
              value={formData.scenarioText} 
              onChange={handleChange} 
              rows={3}
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>エントリー条件</label>
              <textarea name="entryConditionText" value={formData.entryConditionText} onChange={handleChange} rows={2} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>利確条件 (Take Profit)</label>
              <textarea name="takeProfitText" value={formData.takeProfitText} onChange={handleChange} rows={2} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>損切条件 (Stop Loss)</label>
              <textarea name="stopLossText" value={formData.stopLossText} onChange={handleChange} rows={2} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>仮説崩壊条件 (Invalidation)</label>
              <textarea name="invalidationText" value={formData.invalidationText} onChange={handleChange} rows={2} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>再確認日</label>
              <input type="date" name="nextReviewAt" value={formData.nextReviewAt} onChange={handleChange} style={{ padding: '0.5rem' }} />
            </div>
            {!isNew && (
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>ステータス</label>
                <select name="status" value={formData.status} onChange={handleChange} style={{ padding: '0.5rem' }}>
                  <option value="active">Active (監視中)</option>
                  <option value="archived">Archived (終了)</option>
                </select>
              </div>
            )}
          </div>

          {!isNew && (
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', color: '#0066cc' }}>✏️ 変更内容の要約 (Change Summary)</label>
              <input 
                name="changeSummary" 
                value={formData.changeSummary} 
                onChange={handleChange} 
                style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box', border: '1px solid #0066cc' }} 
                placeholder="例: 損切ラインを切り上げ"
              />
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <button 
              onClick={handleSave} 
              disabled={isSaving || !formData.title}
              style={{
                background: '#0066cc', color: '#fff', border: 'none', padding: '0.75rem 2rem', 
                fontSize: '1rem', borderRadius: '4px', cursor: (isSaving || !formData.title) ? 'not-allowed' : 'pointer',
                opacity: (isSaving || !formData.title) ? 0.6 : 1
              }}
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>

      {/* サイドバー：更新履歴 */}
      {!isNew && (
        <div style={{ flex: '1 1 30%', background: '#f9f9f9', padding: '1.5rem', borderRadius: '8px', alignSelf: 'flex-start' }}>
          <h3 style={{ marginTop: 0 }}>更新履歴 (Revisions)</h3>
          {revisionsLoading ? (
            <p>読み込み中...</p>
          ) : revisions && revisions.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {revisions.map((rev) => (
                <li key={rev.id} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e0e0e0' }}>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
                    Rev.{rev.revisionNo} | {formatDate(rev.createdAt)}
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                    {rev.changeSummary || '更新'}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#666' }}>履歴はありません</p>
          )}
        </div>
      )}

    </div>
  );
}
