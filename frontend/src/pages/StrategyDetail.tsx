import useSWR from 'swr';
import { useRoute } from 'wouter';
import { swrFetcher } from '../api/client';
import { StrategyVersionListData } from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import TextLink from '../components/ui/TextLink';

const PANEL_CLASS = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';
const MUTED_TEXT_CLASS = 'text-sm leading-7 text-slate-600';

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '日時不明';
  }
  return date.toLocaleString('ja-JP');
}

function StrategyDetail(): JSX.Element {
  const [, params] = useRoute('/strategies/:strategyId') as [boolean, { strategyId?: string } | null];
  const strategyId = params?.strategyId ?? '-';
  const { data, error, isLoading } = useSWR<StrategyVersionListData>(
    strategyId === '-' ? null : `/api/strategies/${strategyId}/versions?page=1&limit=50&sort=updated_at&order=desc`,
    swrFetcher,
  );
  const strategy = data?.strategy;
  const versions = data?.strategy_versions ?? [];

  return (
    <AppLayout>
      <div className="w-full space-y-5">
        <PageHeader
          title="ストラテジー詳細"
          description="再利用可能なストラテジー定義の詳細、version、関連検証レポートを扱う画面です。"
          backLink={{ href: '/strategies', label: 'ストラテジーリストへ戻る' }}
        />

        <section className={PANEL_CLASS}>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              strategy_id: <code>{strategyId}</code>
            </p>
            {isLoading ? (
              <p className={MUTED_TEXT_CLASS}>ストラテジー詳細を読み込み中...</p>
            ) : error ? (
              <p className="text-sm leading-7 text-red-700">ストラテジー詳細を取得できませんでした。</p>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-slate-900">{strategy?.title ?? 'ストラテジー定義'}</h2>
                <dl className="grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium text-slate-500">status</dt>
                    <dd>{strategy?.status ?? '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">created</dt>
                    <dd>{formatDate(strategy?.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">updated</dt>
                    <dd>{formatDate(strategy?.updated_at)}</dd>
                  </div>
                </dl>
              </>
            )}
            <p className={MUTED_TEXT_CLASS}>
              このストラテジー定義の version、関連検証レポート、適用済み銘柄をここに集約します。
            </p>
            <p className={MUTED_TEXT_CLASS}>
              現在は既存 version の read-only 表示までです。関連検証レポート、適用済み銘柄、favorite / archive /
              delete は後続タスクで接続します。
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <TextLink
              href={`/strategies/${strategyId}/versions`}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white no-underline hover:no-underline"
            >
              version 一覧を開く
            </TextLink>
            <TextLink
              href="/strategy-lab"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 no-underline hover:no-underline"
            >
              ストラテジー作成を開く
            </TextLink>
            <TextLink
              href="/backtests"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 no-underline hover:no-underline"
            >
              検証レポート一覧を開く
            </TextLink>
          </div>

          <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            BacktestDetail は個別検証レポート詳細として継続し、この画面には吸収しません。
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-lg font-semibold text-slate-900">version 一覧</h2>
          {isLoading ? (
            <p className={MUTED_TEXT_CLASS}>version を読み込み中...</p>
          ) : error ? (
            <p className="text-sm leading-7 text-red-700">version 一覧を取得できませんでした。</p>
          ) : versions.length === 0 ? (
            <p className={MUTED_TEXT_CLASS}>このストラテジーにはまだ version がありません。</p>
          ) : (
            <div className="mt-4 space-y-3">
              {versions.map((version) => (
                <article key={version.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <TextLink href={`/strategy-versions/${version.id}`} className="font-semibold text-sky-700 no-underline hover:underline">
                        {version.id}
                      </TextLink>
                      <p className="text-xs text-slate-500">
                        {version.market} / {version.timeframe}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                      {version.status}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium text-slate-500">created</dt>
                      <dd>{formatDate(version.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">updated</dt>
                      <dd>{formatDate(version.updated_at)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-lg font-semibold text-slate-900">後続接続予定</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li>related reports は準備中です。</li>
            <li>applied symbols は準備中です。</li>
            <li>favorite / archive / delete は準備中です。</li>
          </ul>
        </section>
      </div>
    </AppLayout>
  );
}

export default StrategyDetail;
