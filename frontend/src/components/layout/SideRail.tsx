import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '../../api/client';
import type { HomeData } from '../../api/types';
import TextLink from '../ui/TextLink';

type SideRailTab = 'watchlist' | 'positions';

const HOME_API_PATH = '/api/home?summary_type=latest';

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

export default function SideRail() {
  const [tab, setTab] = useState<SideRailTab>('watchlist');
  const [collapsed, setCollapsed] = useState(false);
  const { data, error, isLoading } = useSWR<HomeData>(HOME_API_PATH, swrFetcher);

  const watchlistDisplayNameById = new Map<string, string>();
  for (const symbol of data?.watchlist_symbols ?? []) {
    if (symbol?.symbol_id && symbol?.display_name) {
      watchlistDisplayNameById.set(symbol.symbol_id, symbol.display_name);
    }
  }

  const renderContent = () => {
    if (isLoading) {
      return <p className="text-sm text-slate-500">読み込み中...</p>;
    }
    if (error) {
      return <p className="text-sm text-red-600">SideRail の取得に失敗しました。</p>;
    }
    if (!data) return null;

    if (tab === 'watchlist') {
      if (data.watchlist_symbols.length === 0) {
        return <p className="text-sm text-slate-500">監視銘柄はまだありません。</p>;
      }
      return (
        <div className="space-y-2">
          {data.watchlist_symbols.map((symbol: any, index: number) => (
            <TextLink
              key={symbol.symbol_id ?? `watch-${index}`}
              href={symbol.symbol_id ? `/symbols/${symbol.symbol_id}` : '/watchlist'}
              className="block rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 no-underline hover:border-sky-300 hover:bg-sky-50"
            >
              <div className="font-medium">{symbol.display_name ?? symbol.symbol_id ?? '不明'}</div>
              <div className="mt-1 text-xs text-slate-500">
                価格: {formatNumber(symbol.latest_price, 2)} / 変化率:{' '}
                {symbol.change_rate === null || symbol.change_rate === undefined
                  ? '-'
                  : `${formatNumber(symbol.change_rate, 2)}%`}
              </div>
            </TextLink>
          ))}
        </div>
      );
    }

    if (data.positions.length === 0) {
      return <p className="text-sm text-slate-500">保有銘柄はまだありません。</p>;
    }

    return (
      <div className="space-y-2">
        {data.positions.map((position: any, index: number) => (
          <TextLink
            key={position.position_id ?? `position-${index}`}
            href={position.symbol_id ? `/symbols/${position.symbol_id}` : '/positions'}
            className="block rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 no-underline hover:border-sky-300 hover:bg-sky-50"
          >
            <div className="font-medium">{buildPositionDisplayName(position, watchlistDisplayNameById)}</div>
            <div className="mt-1 text-xs text-slate-500">
              数量: {formatNumber(position.quantity, 0)} / 現在値: {formatNumber(position.latest_price, 2)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              評価損益: {formatNumber(position.unrealized_pnl, 2)}
            </div>
          </TextLink>
        ))}
      </div>
    );
  };

  return (
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
                <TextLink
                  href="/watchlist"
                  className="inline-flex rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 no-underline hover:bg-slate-100"
                >
                  監視銘柄を追加
                </TextLink>
              ) : (
                <TextLink
                  href="/positions"
                  className="inline-flex rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 no-underline hover:bg-slate-100"
                >
                  保有銘柄を追加
                </TextLink>
              )}
              <p className="mt-2 text-xs leading-5 text-slate-500">
                PoC では既存管理画面への補助導線です。CRUD モーダルは未実装です。
              </p>
            </div>

            <div className="space-y-2">{renderContent()}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
