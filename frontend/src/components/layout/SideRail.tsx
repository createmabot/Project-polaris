import { type FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { deleteApi, patchApi, postApi, swrFetcher } from '../../api/client';
import type { HomeData, PositionManagementData, PositionMutateData, WatchlistItemData, WatchlistItemMutateData } from '../../api/types';
import Modal from '../ui/Modal';
import TextLink from '../ui/TextLink';

type SideRailTab = 'watchlist' | 'positions';
type MessageState = { kind: 'success' | 'error'; text: string } | null;

type WatchlistDraft = {
  symbol_code: string;
  display_name: string;
  market_code: string;
  tradingview_symbol: string;
  priority: string;
  memo: string;
};

type PositionDraft = {
  symbol_code: string;
  display_name: string;
  market_code: string;
  tradingview_symbol: string;
  quantity: string;
  average_cost: string;
};

const HOME_API_PATH = '/api/home?summary_type=latest';
const WATCHLIST_API_PATH = '/api/watchlist-items';
const POSITIONS_API_PATH = '/api/positions';

const EMPTY_WATCHLIST_DRAFT: WatchlistDraft = {
  symbol_code: '',
  display_name: '',
  market_code: '',
  tradingview_symbol: '',
  priority: '',
  memo: '',
};

const EMPTY_POSITION_DRAFT: PositionDraft = {
  symbol_code: '',
  display_name: '',
  market_code: '',
  tradingview_symbol: '',
  quantity: '',
  average_cost: '',
};

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('ja-JP', { maximumFractionDigits: digits });
}

function buildPositionDisplayName(
  position: any,
  watchlistDisplayNameById: Map<string, string>,
): string {
  return (
    (position.symbol_id ? watchlistDisplayNameById.get(position.symbol_id) : null) ??
    position.display_name ??
    position.symbol_id ??
    '不明'
  );
}

function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toNullableIntegerText(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    throw new Error('priority は整数で入力してください。');
  }
  return parsed;
}

function toPositiveNumberText(value: string, fieldName: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} は 0 より大きい数値で入力してください。`);
  }
  return parsed;
}

function toNonNegativeNumberText(value: string, fieldName: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} は 0 以上の数値で入力してください。`);
  }
  return parsed;
}

export default function SideRail() {
  const [tab, setTab] = useState<SideRailTab>('watchlist');
  const [collapsed, setCollapsed] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const [watchlistModalMode, setWatchlistModalMode] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [positionModalMode, setPositionModalMode] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [watchlistDraft, setWatchlistDraft] = useState<WatchlistDraft>(EMPTY_WATCHLIST_DRAFT);
  const [positionDraft, setPositionDraft] = useState<PositionDraft>(EMPTY_POSITION_DRAFT);
  const [selectedWatchlistItemId, setSelectedWatchlistItemId] = useState<string | null>(null);
  const [selectedWatchlistLabel, setSelectedWatchlistLabel] = useState<string>('不明');
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [selectedPositionLabel, setSelectedPositionLabel] = useState<string>('不明');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, error, isLoading, mutate: mutateHome } = useSWR<HomeData>(HOME_API_PATH, swrFetcher);
  const {
    data: watchlistData,
    isLoading: isWatchlistLoading,
    mutate: mutateWatchlist,
  } = useSWR<WatchlistItemData>(WATCHLIST_API_PATH, swrFetcher);
  const {
    data: positionsData,
    isLoading: isPositionsLoading,
    mutate: mutatePositions,
  } = useSWR<PositionManagementData>(POSITIONS_API_PATH, swrFetcher);

  const watchlistActionsReady = Boolean(watchlistData);
  const positionActionsReady = Boolean(positionsData);

  const watchlistDisplayNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const symbol of data?.watchlist_symbols ?? []) {
      if (symbol?.symbol_id && symbol?.display_name) {
        map.set(symbol.symbol_id, symbol.display_name);
      }
    }
    return map;
  }, [data?.watchlist_symbols]);

  const refreshSideRail = async () => {
    await Promise.all([mutateHome(), mutateWatchlist(), mutatePositions()]);
  };

  const resetWatchlistModal = () => {
    setWatchlistModalMode(null);
    setSelectedWatchlistItemId(null);
    setSelectedWatchlistLabel('不明');
    setWatchlistDraft(EMPTY_WATCHLIST_DRAFT);
    setIsSubmitting(false);
  };

  const resetPositionModal = () => {
    setPositionModalMode(null);
    setSelectedPositionId(null);
    setSelectedPositionLabel('不明');
    setPositionDraft(EMPTY_POSITION_DRAFT);
    setIsSubmitting(false);
  };

  const openCreateWatchlistModal = () => {
    setMessage(null);
    setWatchlistDraft(EMPTY_WATCHLIST_DRAFT);
    setSelectedWatchlistItemId(null);
    setSelectedWatchlistLabel('不明');
    setWatchlistModalMode('create');
  };

  const openEditWatchlistModal = (symbol: any) => {
    if (!watchlistActionsReady) return;
    const item = watchlistData?.items.find((row) => row.symbol_id === symbol.symbol_id) ?? null;
    if (!item) {
      setMessage({ kind: 'error', text: '監視銘柄の編集情報を取得できませんでした。' });
      return;
    }
    setMessage(null);
    setSelectedWatchlistItemId(item.item_id);
    setSelectedWatchlistLabel(item.display_name ?? item.symbol_code ?? item.symbol_id ?? '不明');
    setWatchlistDraft({
      symbol_code: item.symbol_code ?? '',
      display_name: item.display_name ?? '',
      market_code: item.market_code ?? '',
      tradingview_symbol: item.tradingview_symbol ?? '',
      priority: item.priority === null ? '' : String(item.priority),
      memo: item.memo ?? '',
    });
    setWatchlistModalMode('edit');
  };

  const openDeleteWatchlistModal = (symbol: any) => {
    if (!watchlistActionsReady) return;
    const item = watchlistData?.items.find((row) => row.symbol_id === symbol.symbol_id) ?? null;
    if (!item) {
      setMessage({ kind: 'error', text: '監視銘柄の削除情報を取得できませんでした。' });
      return;
    }
    setMessage(null);
    setSelectedWatchlistItemId(item.item_id);
    setSelectedWatchlistLabel(item.display_name ?? item.symbol_code ?? item.symbol_id ?? '不明');
    setWatchlistModalMode('delete');
  };

  const openCreatePositionModal = () => {
    setMessage(null);
    setPositionDraft(EMPTY_POSITION_DRAFT);
    setSelectedPositionId(null);
    setSelectedPositionLabel('不明');
    setPositionModalMode('create');
  };

  const openEditPositionModal = (position: any) => {
    if (!positionActionsReady) return;
    const row = positionsData?.positions.find((item) => item.position_id === position.position_id) ?? null;
    if (!row) {
      setMessage({ kind: 'error', text: '保有銘柄の編集情報を取得できませんでした。' });
      return;
    }
    setMessage(null);
    setSelectedPositionId(row.position_id);
    setSelectedPositionLabel(row.display_name ?? row.symbol_code ?? row.symbol_id ?? '不明');
    setPositionDraft({
      symbol_code: row.symbol_code ?? '',
      display_name: row.display_name ?? '',
      market_code: row.market_code ?? '',
      tradingview_symbol: row.tradingview_symbol ?? '',
      quantity: row.quantity === null ? '' : String(row.quantity),
      average_cost: row.average_cost === null ? '' : String(row.average_cost),
    });
    setPositionModalMode('edit');
  };

  const openDeletePositionModal = (position: any) => {
    if (!positionActionsReady) return;
    const row = positionsData?.positions.find((item) => item.position_id === position.position_id) ?? null;
    if (!row) {
      setMessage({ kind: 'error', text: '保有銘柄の削除情報を取得できませんでした。' });
      return;
    }
    setMessage(null);
    setSelectedPositionId(row.position_id);
    setSelectedPositionLabel(row.display_name ?? row.symbol_code ?? row.symbol_id ?? '不明');
    setPositionModalMode('delete');
  };

  const handleWatchlistSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    try {
      setIsSubmitting(true);
      if (watchlistModalMode === 'create') {
        const result = await postApi<WatchlistItemMutateData>(WATCHLIST_API_PATH, {
          symbol_code: watchlistDraft.symbol_code.trim(),
          display_name: normalizeOptionalText(watchlistDraft.display_name),
          market_code: normalizeOptionalText(watchlistDraft.market_code),
          tradingview_symbol: normalizeOptionalText(watchlistDraft.tradingview_symbol),
          priority: toNullableIntegerText(watchlistDraft.priority),
          memo: normalizeOptionalText(watchlistDraft.memo),
        });
        await refreshSideRail();
        setMessage({
          kind: 'success',
          text:
            result.status === 'already_exists'
              ? '既存の監視銘柄です。重複追加は行いませんでした。'
              : '監視銘柄を追加しました。',
        });
      } else if (watchlistModalMode === 'edit' && selectedWatchlistItemId) {
        await patchApi<WatchlistItemMutateData>(`${WATCHLIST_API_PATH}/${selectedWatchlistItemId}`, {
          priority: toNullableIntegerText(watchlistDraft.priority),
          memo: watchlistDraft.memo,
        });
        await refreshSideRail();
        setMessage({ kind: 'success', text: '監視銘柄を更新しました。' });
      }
      resetWatchlistModal();
    } catch (submitError: any) {
      setMessage({ kind: 'error', text: submitError?.message ?? '監視銘柄の保存に失敗しました。' });
      setIsSubmitting(false);
    }
  };

  const handleWatchlistDelete = async () => {
    if (!selectedWatchlistItemId) return;
    try {
      setIsSubmitting(true);
      await deleteApi<{ deleted: boolean; item_id: string }>(`${WATCHLIST_API_PATH}/${selectedWatchlistItemId}`);
      await refreshSideRail();
      setMessage({ kind: 'success', text: '監視銘柄を削除しました。' });
      resetWatchlistModal();
    } catch (deleteError: any) {
      setMessage({ kind: 'error', text: deleteError?.message ?? '監視銘柄の削除に失敗しました。' });
      setIsSubmitting(false);
    }
  };

  const handlePositionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    try {
      setIsSubmitting(true);
      if (positionModalMode === 'create') {
        const result = await postApi<PositionMutateData>(POSITIONS_API_PATH, {
          symbol_code: positionDraft.symbol_code.trim(),
          display_name: normalizeOptionalText(positionDraft.display_name),
          market_code: normalizeOptionalText(positionDraft.market_code),
          tradingview_symbol: normalizeOptionalText(positionDraft.tradingview_symbol),
          quantity: toPositiveNumberText(positionDraft.quantity, 'quantity'),
          average_cost: toNonNegativeNumberText(positionDraft.average_cost, 'average_cost'),
        });
        await refreshSideRail();
        const actionText =
          result.action === 'created'
            ? '追加'
            : result.action === 'updated'
              ? '更新'
              : '変更なし';
        setMessage({ kind: 'success', text: `保有銘柄を${actionText}しました。` });
      } else if (positionModalMode === 'edit' && selectedPositionId) {
        await patchApi<PositionMutateData>(`${POSITIONS_API_PATH}/${selectedPositionId}`, {
          quantity: toPositiveNumberText(positionDraft.quantity, 'quantity'),
          average_cost: toNonNegativeNumberText(positionDraft.average_cost, 'average_cost'),
        });
        await refreshSideRail();
        setMessage({ kind: 'success', text: '保有銘柄を更新しました。' });
      }
      resetPositionModal();
    } catch (submitError: any) {
      setMessage({ kind: 'error', text: submitError?.message ?? '保有銘柄の保存に失敗しました。' });
      setIsSubmitting(false);
    }
  };

  const handlePositionDelete = async () => {
    if (!selectedPositionId) return;
    try {
      setIsSubmitting(true);
      await deleteApi<{ deleted: boolean; position_id: string }>(`${POSITIONS_API_PATH}/${selectedPositionId}`);
      await refreshSideRail();
      setMessage({ kind: 'success', text: '保有銘柄を削除しました。' });
      resetPositionModal();
    } catch (deleteError: any) {
      setMessage({ kind: 'error', text: deleteError?.message ?? '保有銘柄の削除に失敗しました。' });
      setIsSubmitting(false);
    }
  };

  const renderWatchlistRows = () => {
    if (!data) return null;
    if (data.watchlist_symbols.length === 0) {
      return <p className="text-sm text-slate-500">監視銘柄はまだありません。</p>;
    }
    return (
      <div className="space-y-2">
        {data.watchlist_symbols.map((symbol: any, index: number) => (
          <div key={symbol.symbol_id ?? `watch-${index}`} className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <TextLink
                href={symbol.symbol_id ? `/symbols/${symbol.symbol_id}` : '/watchlist'}
                className="block text-sm font-medium text-slate-900 no-underline hover:text-sky-700 hover:underline"
              >
                {symbol.display_name ?? symbol.symbol_id ?? '不明'}
              </TextLink>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => openEditWatchlistModal(symbol)}
                  disabled={!watchlistActionsReady}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => openDeleteWatchlistModal(symbol)}
                  disabled={!watchlistActionsReady}
                  className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  削除
                </button>
              </div>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              価格: {formatNumber(symbol.latest_price, 2)} / 変化率:{' '}
              {symbol.change_rate === null || symbol.change_rate === undefined
                ? '-'
                : `${formatNumber(symbol.change_rate, 2)}%`}
            </div>
            {!watchlistActionsReady && isWatchlistLoading ? (
              <p className="mt-2 text-[11px] text-slate-400">???????????????? / ???????????</p>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const renderPositionRows = () => {
    if (!data) return null;
    if (data.positions.length === 0) {
      return <p className="text-sm text-slate-500">保有銘柄はまだありません。</p>;
    }
    return (
      <div className="space-y-2">
        {data.positions.map((position: any, index: number) => (
          <div key={position.position_id ?? `position-${index}`} className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <TextLink
                href={position.symbol_id ? `/symbols/${position.symbol_id}` : '/positions'}
                className="block text-sm font-medium text-slate-900 no-underline hover:text-sky-700 hover:underline"
              >
                {buildPositionDisplayName(position, watchlistDisplayNameById)}
              </TextLink>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => openEditPositionModal(position)}
                  disabled={!positionActionsReady}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => openDeletePositionModal(position)}
                  disabled={!positionActionsReady}
                  className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  削除
                </button>
              </div>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              数量: {formatNumber(position.quantity, 0)} / 現在値: {formatNumber(position.latest_price, 2)}
            </div>
            <div className="mt-1 text-xs text-slate-500">評価損益: {formatNumber(position.unrealized_pnl, 2)}</div>
            {!positionActionsReady && isPositionsLoading ? (
              <p className="mt-2 text-[11px] text-slate-400">???????????????? / ???????????</p>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return <p className="text-sm text-slate-500">読み込み中...</p>;
    }
    if (error) {
      return <p className="text-sm text-red-600">SideRail の取得に失敗しました。</p>;
    }
    if (!data) return null;
    return tab === 'watchlist' ? renderWatchlistRows() : renderPositionRows();
  };

  const watchlistModalOpen = watchlistModalMode !== null;
  const positionModalOpen = positionModalMode !== null;

  return (
    <>
      <aside
        aria-label="共通サイドメニュー"
        className={collapsed ? 'sticky top-6 w-20 shrink-0 self-start' : 'sticky top-6 w-72 shrink-0 self-start'}
      >
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              {!collapsed ? <h2 className="text-sm font-semibold text-slate-900">共通サイドメニュー</h2> : null}
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                {collapsed ? '開く' : '折りたたむ'}
              </button>
            </div>
          </div>

          {collapsed ? (
            <div className="space-y-3 p-3 text-center text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setTab('watchlist')}
                className={`w-full rounded px-2 py-2 ${
                  tab === 'watchlist' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'
                }`}
              >
                監視
              </button>
              <button
                type="button"
                onClick={() => setTab('positions')}
                className={`w-full rounded px-2 py-2 ${
                  tab === 'positions' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'
                }`}
              >
                保有
              </button>
            </div>
          ) : (
            <div className="p-4">
              <div className="mb-3">
                {message ? (
                  <div
                    className={`rounded-md border px-3 py-2 text-xs ${
                      message.kind === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}
                  >
                    {message.text}
                  </div>
                ) : null}
              </div>

              <div className="mb-4 flex rounded-md bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setTab('watchlist')}
                  className={`flex-1 rounded px-3 py-2 text-sm ${
                    tab === 'watchlist' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  監視
                </button>
                <button
                  type="button"
                  onClick={() => setTab('positions')}
                  className={`flex-1 rounded px-3 py-2 text-sm ${
                    tab === 'positions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  保有
                </button>
              </div>

              <div className="mb-3">
                {tab === 'watchlist' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={openCreateWatchlistModal}
                      className="inline-flex rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    >
                      監視銘柄を追加
                    </button>
                    <TextLink
                      href="/watchlist"
                      className="text-xs text-slate-500 no-underline hover:underline"
                    >
                      詳細管理
                    </TextLink>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={openCreatePositionModal}
                      className="inline-flex rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    >
                      保有銘柄を追加
                    </button>
                    <TextLink
                      href="/positions"
                      className="text-xs text-slate-500 no-underline hover:underline"
                    >
                      詳細管理
                    </TextLink>
                  </div>
                )}
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  SideRail CRUD 後の再取得は `/api/home` 単位です。最適化は後続で行います。
                </p>
              </div>

              <div className="space-y-2">{renderContent()}</div>
            </div>
          )}
        </div>
      </aside>

      <Modal
        title={
          watchlistModalMode === 'create'
            ? '監視銘柄を追加'
            : watchlistModalMode === 'edit'
              ? '監視銘柄を編集'
              : '監視銘柄を削除'
        }
        open={watchlistModalOpen}
        onClose={resetWatchlistModal}
        footer={
          watchlistModalMode === 'delete' ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetWatchlistModal}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleWatchlistDelete}
                disabled={isSubmitting}
                className="rounded bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-700 disabled:bg-rose-300"
              >
                {isSubmitting ? '削除中...' : '削除する'}
              </button>
            </div>
          ) : undefined
        }
      >
        {watchlistModalMode === 'delete' ? (
          <p className="text-sm text-slate-700">
            {selectedWatchlistLabel} を監視銘柄から削除します。よければ実行してください。
          </p>
        ) : (
          <form className="grid gap-3" onSubmit={handleWatchlistSubmit}>
            <label className="grid gap-1 text-sm text-slate-700">
              symbol_code
              <input
                value={watchlistDraft.symbol_code}
                onChange={(event) => setWatchlistDraft((current) => ({ ...current, symbol_code: event.target.value }))}
                disabled={watchlistModalMode === 'edit'}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            {watchlistModalMode === 'create' ? (
              <>
                <label className="grid gap-1 text-sm text-slate-700">
                  display_name
                  <input
                    value={watchlistDraft.display_name}
                    onChange={(event) => setWatchlistDraft((current) => ({ ...current, display_name: event.target.value }))}
                    className="rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm text-slate-700">
                  market_code
                  <input
                    value={watchlistDraft.market_code}
                    onChange={(event) => setWatchlistDraft((current) => ({ ...current, market_code: event.target.value }))}
                    className="rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm text-slate-700">
                  tradingview_symbol
                  <input
                    value={watchlistDraft.tradingview_symbol}
                    onChange={(event) =>
                      setWatchlistDraft((current) => ({ ...current, tradingview_symbol: event.target.value }))
                    }
                    className="rounded border border-slate-300 px-3 py-2"
                  />
                </label>
              </>
            ) : null}
            <label className="grid gap-1 text-sm text-slate-700">
              priority
              <input
                value={watchlistDraft.priority}
                onChange={(event) => setWatchlistDraft((current) => ({ ...current, priority: event.target.value }))}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              memo
              <input
                value={watchlistDraft.memo}
                onChange={(event) => setWatchlistDraft((current) => ({ ...current, memo: event.target.value }))}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={resetWatchlistModal}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-800 disabled:bg-sky-300"
              >
                {isSubmitting
                  ? watchlistModalMode === 'create'
                    ? '追加中...'
                    : '保存中...'
                  : watchlistModalMode === 'create'
                    ? '追加'
                    : '保存'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        title={
          positionModalMode === 'create'
            ? '保有銘柄を追加'
            : positionModalMode === 'edit'
              ? '保有銘柄を編集'
              : '保有銘柄を削除'
        }
        open={positionModalOpen}
        onClose={resetPositionModal}
        footer={
          positionModalMode === 'delete' ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetPositionModal}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handlePositionDelete}
                disabled={isSubmitting}
                className="rounded bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-700 disabled:bg-rose-300"
              >
                {isSubmitting ? '削除中...' : '削除する'}
              </button>
            </div>
          ) : undefined
        }
      >
        {positionModalMode === 'delete' ? (
          <p className="text-sm text-slate-700">
            {selectedPositionLabel} を保有銘柄から削除します。よければ実行してください。
          </p>
        ) : (
          <form className="grid gap-3" onSubmit={handlePositionSubmit}>
            <label className="grid gap-1 text-sm text-slate-700">
              symbol_code
              <input
                value={positionDraft.symbol_code}
                onChange={(event) => setPositionDraft((current) => ({ ...current, symbol_code: event.target.value }))}
                disabled={positionModalMode === 'edit'}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            {positionModalMode === 'create' ? (
              <>
                <label className="grid gap-1 text-sm text-slate-700">
                  display_name
                  <input
                    value={positionDraft.display_name}
                    onChange={(event) => setPositionDraft((current) => ({ ...current, display_name: event.target.value }))}
                    className="rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm text-slate-700">
                  market_code
                  <input
                    value={positionDraft.market_code}
                    onChange={(event) => setPositionDraft((current) => ({ ...current, market_code: event.target.value }))}
                    className="rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm text-slate-700">
                  tradingview_symbol
                  <input
                    value={positionDraft.tradingview_symbol}
                    onChange={(event) =>
                      setPositionDraft((current) => ({ ...current, tradingview_symbol: event.target.value }))
                    }
                    className="rounded border border-slate-300 px-3 py-2"
                  />
                </label>
              </>
            ) : null}
            <label className="grid gap-1 text-sm text-slate-700">
              quantity
              <input
                value={positionDraft.quantity}
                onChange={(event) => setPositionDraft((current) => ({ ...current, quantity: event.target.value }))}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              average_cost
              <input
                value={positionDraft.average_cost}
                onChange={(event) =>
                  setPositionDraft((current) => ({ ...current, average_cost: event.target.value }))
                }
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={resetPositionModal}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-800 disabled:bg-sky-300"
              >
                {isSubmitting
                  ? positionModalMode === 'create'
                    ? '保存中...'
                    : '更新中...'
                  : positionModalMode === 'create'
                    ? '保存'
                    : '更新'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
