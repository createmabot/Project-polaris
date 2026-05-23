import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import useSWR, { type KeyedMutator } from 'swr';
import { deleteApi, patchApi, postApi, swrFetcher } from '../../api/client';
import type { HomeData, PositionManagementData, PositionMutateData, WatchlistItemData, WatchlistItemMutateData } from '../../api/types';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import LoadingState from '../ui/LoadingState';
import ModalShell from '../ui/ModalShell';
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

export const SIDE_RAIL_HOME_API_PATH = '/api/home?summary_type=latest';
const WATCHLIST_API_PATH = '/api/watchlist-items';
const POSITIONS_API_PATH = '/api/positions';

type SideRailProps = {
  collapsed?: boolean;
  homeData?: HomeData;
  homeError?: unknown;
  homeIsLoading?: boolean;
  mutateHome?: KeyedMutator<HomeData>;
  onCollapsedChange?: (collapsed: boolean) => void;
};

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

function getFriendlyMutationMessage(error: any, fallback: string): string {
  if (error?.code === 'VALIDATION_ERROR' && typeof error?.message === 'string') {
    return error.message;
  }
  return fallback;
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 13.5V16h2.5L15 7.5 12.5 5 4 13.5Z" />
      <path strokeLinecap="round" d="M11.5 6 14 8.5" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h12M8 6V4h4v2m-6 0 1 10h6l1-10" />
    </svg>
  );
}

function RailToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d={collapsed ? 'M7 5l5 5-5 5' : 'M13 5l-5 5 5 5'} />
    </svg>
  );
}

type IconButtonProps = {
  label: string;
  title?: string;
  variant?: 'neutral' | 'danger';
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function IconButton({ label, title = label, variant = 'neutral', disabled, onClick, children }: IconButtonProps) {
  const variantClass =
    variant === 'danger'
      ? 'border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-rose-500'
      : 'border-slate-200 text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-sky-500';
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border bg-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${variantClass}`}
    >
      {children}
    </button>
  );
}

export default function SideRail({
  collapsed,
  homeData,
  homeError,
  homeIsLoading,
  mutateHome: mutateProvidedHome,
  onCollapsedChange,
}: SideRailProps) {
  const [tab, setTab] = useState<SideRailTab>('watchlist');
  const [internalCollapsed, setInternalCollapsed] = useState(false);
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

  const shouldFetchHome = homeData === undefined;
  const {
    data: fetchedHomeData,
    error: fetchedHomeError,
    isLoading: fetchedHomeIsLoading,
    mutate: mutateFetchedHome,
  } = useSWR<HomeData>(shouldFetchHome ? SIDE_RAIL_HOME_API_PATH : null, swrFetcher);
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
  const data = homeData ?? fetchedHomeData;
  const error = homeError ?? fetchedHomeError;
  const isLoading = homeIsLoading ?? fetchedHomeIsLoading;

  const watchlistDisplayNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const symbol of data?.watchlist_symbols ?? []) {
      if (symbol?.symbol_id && symbol?.display_name) {
        map.set(symbol.symbol_id, symbol.display_name);
      }
    }
    return map;
  }, [data?.watchlist_symbols]);

  const refreshHome = async () => {
    if (mutateProvidedHome) {
      await mutateProvidedHome();
      return;
    }
    await mutateFetchedHome();
  };

  const refreshWatchlistSideRail = async () => {
    await Promise.all([refreshHome(), mutateWatchlist()]);
  };

  const refreshPositionsSideRail = async () => {
    await Promise.all([refreshHome(), mutatePositions()]);
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
    const item =
      watchlistData?.items.find((row) => row.item_id === symbol.item_id)
      ?? watchlistData?.items.find((row) => row.symbol_id === symbol.symbol_id)
      ?? null;
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
    const item =
      watchlistData?.items.find((row) => row.item_id === symbol.item_id)
      ?? watchlistData?.items.find((row) => row.symbol_id === symbol.symbol_id)
      ?? null;
    const itemId = symbol.item_id ?? item?.item_id ?? null;
    if (!itemId) {
      setMessage({ kind: 'error', text: '監視銘柄の削除情報を取得できませんでした。' });
      return;
    }
    setMessage(null);
    setSelectedWatchlistItemId(itemId);
    setSelectedWatchlistLabel(
      symbol.display_name ?? item?.display_name ?? symbol.symbol_code ?? item?.symbol_code ?? symbol.symbol_id ?? item?.symbol_id ?? '不明',
    );
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
    const row =
      positionsData?.positions.find((item) => item.position_id === position.position_id)
      ?? positionsData?.positions.find((item) => item.symbol_id === position.symbol_id)
      ?? null;
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
    const row =
      positionsData?.positions.find((item) => item.position_id === position.position_id)
      ?? positionsData?.positions.find((item) => item.symbol_id === position.symbol_id)
      ?? null;
    const positionId = position.position_id ?? row?.position_id ?? null;
    if (!positionId) {
      setMessage({ kind: 'error', text: '保有銘柄の削除情報を取得できませんでした。' });
      return;
    }
    setMessage(null);
    setSelectedPositionId(positionId);
    setSelectedPositionLabel(buildPositionDisplayName(position, watchlistDisplayNameById));
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
        await refreshWatchlistSideRail();
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
        await refreshWatchlistSideRail();
        setMessage({ kind: 'success', text: '監視銘柄を更新しました。' });
      }
      resetWatchlistModal();
    } catch (submitError: any) {
      setMessage({
        kind: 'error',
        text: getFriendlyMutationMessage(submitError, '監視銘柄の保存に失敗しました。入力内容を確認してください。'),
      });
      setIsSubmitting(false);
    }
  };

  const handleWatchlistDelete = async () => {
    if (!selectedWatchlistItemId) return;
    try {
      setIsSubmitting(true);
      await deleteApi<{ deleted: boolean; item_id: string }>(`${WATCHLIST_API_PATH}/${selectedWatchlistItemId}`);
      await refreshWatchlistSideRail();
      setMessage({ kind: 'success', text: '監視銘柄を削除しました。' });
      resetWatchlistModal();
    } catch (deleteError: any) {
      setMessage({ kind: 'error', text: '監視銘柄の削除に失敗しました。画面を更新してから再度お試しください。' });
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
        await refreshPositionsSideRail();
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
        await refreshPositionsSideRail();
        setMessage({ kind: 'success', text: '保有銘柄を更新しました。' });
      }
      resetPositionModal();
    } catch (submitError: any) {
      setMessage({
        kind: 'error',
        text: getFriendlyMutationMessage(submitError, '保有銘柄の保存に失敗しました。入力内容を確認してください。'),
      });
      setIsSubmitting(false);
    }
  };

  const handlePositionDelete = async () => {
    if (!selectedPositionId) return;
    try {
      setIsSubmitting(true);
      await deleteApi<{ deleted: boolean; position_id: string }>(`${POSITIONS_API_PATH}/${selectedPositionId}`);
      await refreshPositionsSideRail();
      setMessage({ kind: 'success', text: '保有銘柄を削除しました。' });
      resetPositionModal();
    } catch (deleteError: any) {
      setMessage({ kind: 'error', text: '保有銘柄の削除に失敗しました。画面を更新してから再度お試しください。' });
      setIsSubmitting(false);
    }
  };

  const renderWatchlistRows = () => {
    if (!data) return null;
    if (data.watchlist_symbols.length === 0) {
      return <EmptyState title="監視銘柄はまだありません。" />;
    }
    return (
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {data.watchlist_symbols.map((symbol: any, index: number) => (
          <div key={symbol.symbol_id ?? `watch-${index}`} className="px-2.5 py-2 transition hover:bg-sky-50/50">
            <div className="flex items-center justify-between gap-2">
              <TextLink
                href={symbol.symbol_id ? `/symbols/${symbol.symbol_id}` : '/watchlist'}
                className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 no-underline hover:text-sky-700 hover:underline"
              >
                {symbol.display_name ?? symbol.symbol_id ?? '不明'}
              </TextLink>
              <div className="flex shrink-0 gap-1">
                <IconButton
                  label="監視銘柄を編集"
                  title="監視銘柄を編集"
                  onClick={() => openEditWatchlistModal(symbol)}
                  disabled={!watchlistActionsReady}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                  label="監視銘柄を削除"
                  title="監視銘柄を削除"
                  variant="danger"
                  onClick={() => openDeleteWatchlistModal(symbol)}
                  disabled={!symbol.item_id && !watchlistActionsReady}
                >
                  <DeleteIcon />
                </IconButton>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] leading-4 text-slate-500">
              価格: {formatNumber(symbol.latest_price, 2)} / 変化率:{' '}
              {symbol.change_rate === null || symbol.change_rate === undefined
                ? '-'
                : `${formatNumber(symbol.change_rate, 2)}%`}
            </div>
            {!watchlistActionsReady && isWatchlistLoading ? (
              <div className="mt-2">
                <LoadingState title="監視銘柄の操作情報を読み込み中..." className="p-2 text-xs shadow-none" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const renderPositionRows = () => {
    if (!data) return null;
    if (data.positions.length === 0) {
      return <EmptyState title="保有銘柄はまだありません。" />;
    }
    return (
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {data.positions.map((position: any, index: number) => (
          <div key={position.position_id ?? `position-${index}`} className="px-2.5 py-2 transition hover:bg-sky-50/50">
            <div className="flex items-center justify-between gap-2">
              <TextLink
                href={position.symbol_id ? `/symbols/${position.symbol_id}` : '/positions'}
                className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 no-underline hover:text-sky-700 hover:underline"
              >
                {buildPositionDisplayName(position, watchlistDisplayNameById)}
              </TextLink>
              <div className="flex shrink-0 gap-1">
                <IconButton
                  label="保有銘柄を編集"
                  title="保有銘柄を編集"
                  onClick={() => openEditPositionModal(position)}
                  disabled={!positionActionsReady}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                  label="保有銘柄を削除"
                  title="保有銘柄を削除"
                  variant="danger"
                  onClick={() => openDeletePositionModal(position)}
                  disabled={!position.position_id && !positionActionsReady}
                >
                  <DeleteIcon />
                </IconButton>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] leading-4 text-slate-500">
              <span>数量: {formatNumber(position.quantity, 0)}</span>
              <span>現在値: {formatNumber(position.latest_price, 2)}</span>
              <span>評価損益: {formatNumber(position.unrealized_pnl, 2)}</span>
            </div>
            {!positionActionsReady && isPositionsLoading ? (
              <div className="mt-2">
                <LoadingState title="保有銘柄の操作情報を読み込み中..." className="p-2 text-xs shadow-none" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return <LoadingState title="読み込み中..." className="shadow-none" />;
    }
    if (error) {
      return <ErrorState title="SideRail の取得に失敗しました。" />;
    }
    if (!data) return <EmptyState title="SideRail データが見つかりません。" />;
    return tab === 'watchlist' ? renderWatchlistRows() : renderPositionRows();
  };

  const watchlistModalOpen = watchlistModalMode !== null;
  const positionModalOpen = positionModalMode !== null;
  const watchlistModalTitle =
    watchlistModalMode === 'create'
      ? '監視銘柄を追加'
      : watchlistModalMode === 'edit'
        ? '監視銘柄を編集'
        : '監視銘柄を削除';
  const positionModalTitle =
    positionModalMode === 'create'
      ? '保有銘柄を追加'
      : positionModalMode === 'edit'
        ? '保有銘柄を編集'
        : '保有銘柄を削除';
  const isCollapsed = collapsed ?? internalCollapsed;

  const toggleCollapsed = () => {
    const nextCollapsed = !isCollapsed;
    setInternalCollapsed(nextCollapsed);
    onCollapsedChange?.(nextCollapsed);
  };

  return (
    <>
      <aside
        aria-label="共通サイドメニュー"
        className="sticky top-24 max-h-[calc(100vh-7rem)] w-full shrink-0 self-start overflow-y-auto pr-1"
      >
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/70">
          <div className="border-b border-slate-100 p-2">
            <div className="flex justify-end">
              <IconButton
                label={isCollapsed ? 'サイドレールを開く' : 'サイドレールを折りたたむ'}
                title={isCollapsed ? 'サイドレールを開く' : 'サイドレールを折りたたむ'}
                onClick={toggleCollapsed}
              >
                <RailToggleIcon collapsed={isCollapsed} />
              </IconButton>
            </div>
          </div>

          {isCollapsed ? (
            <div className="space-y-2 p-2 text-center text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setTab('watchlist')}
                className={`w-full rounded px-1.5 py-1.5 ${
                  tab === 'watchlist' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'
                }`}
              >
                監視
              </button>
              <button
                type="button"
                onClick={() => setTab('positions')}
                className={`w-full rounded px-1.5 py-1.5 ${
                  tab === 'positions' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'
                }`}
              >
                保有
              </button>
            </div>
          ) : (
            <div className="p-3">
              <div className="mb-2">
                {message ? (
                  <div
                    className={`rounded-md border px-2.5 py-1.5 text-xs ${
                      message.kind === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}
                  >
                    {message.text}
                  </div>
                ) : null}
              </div>

            <div className="mb-3 flex rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setTab('watchlist')}
                  className={`flex-1 rounded-md px-2 py-1 text-xs font-medium ${
                    tab === 'watchlist' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  監視
                </button>
                <button
                  type="button"
                  onClick={() => setTab('positions')}
                  className={`flex-1 rounded-md px-2 py-1 text-xs font-medium ${
                    tab === 'positions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  保有
                </button>
              </div>

              <div className="mb-2">
                {tab === 'watchlist' ? (
                  <div className="flex items-center justify-end">
                    <Button
                      onClick={openCreateWatchlistModal}
                      aria-label="監視銘柄を追加"
                      title="監視銘柄を追加"
                      className="px-2 py-1 text-xs"
                    >
                      + 監視
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end">
                    <Button
                      onClick={openCreatePositionModal}
                      aria-label="保有銘柄を追加"
                      title="保有銘柄を追加"
                      className="px-2 py-1 text-xs"
                    >
                      + 保有
                    </Button>
                  </div>
                )}
              </div>

              <div>{renderContent()}</div>
            </div>
          )}
        </div>
      </aside>

      <ModalShell
        title={watchlistModalTitle}
        open={watchlistModalOpen}
        onClose={resetWatchlistModal}
        actions={
          watchlistModalMode === 'delete' ? (
            <>
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
            </>
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
      </ModalShell>

      <ModalShell
        title={positionModalTitle}
        open={positionModalOpen}
        onClose={resetPositionModal}
        actions={
          positionModalMode === 'delete' ? (
            <>
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
            </>
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
      </ModalShell>
    </>
  );
}
