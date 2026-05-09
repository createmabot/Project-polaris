import useSWR from 'swr';
import { swrFetcher } from '../api/client';
import { StrategyListData } from '../api/types';
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

function StrategyList(): JSX.Element {
  const { data, error, isLoading } = useSWR<StrategyListData>(
    '/api/strategies?page=1&limit=20&sort=updated_at&order=desc',
    swrFetcher,
  );
  const strategies = data?.strategies ?? [];

  return (
    <AppLayout>
      <div className="w-full space-y-5">
        <PageHeader
          title="ストラテジーリスト"
          description="再利用可能なストラテジー定義を一覧・詳細で扱う画面です。"
          backLink={{ href: '/', label: 'ホームへ戻る' }}
        />

        <section className={PANEL_CLASS}>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Strategy Definition 一覧</h2>
            <p className={MUTED_TEXT_CLASS}>
              再利用可能なストラテジー定義をここに集約します。
            </p>
            <p className={MUTED_TEXT_CLASS}>
              現在は既存の StrategyRule / StrategyRuleVersion の read-only 表示のみです。favorite / archive /
              delete、applied symbols、related reports は後続タスクで接続します。
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <TextLink
              href="/strategy-lab"
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white no-underline hover:no-underline"
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
            BacktestList は検証レポート一覧として継続し、この画面の代替にはしません。
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-lg font-semibold text-slate-900">既存ストラテジー</h2>
          {isLoading ? (
            <p className={MUTED_TEXT_CLASS}>ストラテジーを読み込み中...</p>
          ) : error ? (
            <p className="text-sm leading-7 text-red-700">ストラテジー一覧を取得できませんでした。</p>
          ) : strategies.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
              <p className={MUTED_TEXT_CLASS}>既存のストラテジー定義はまだありません。</p>
              <p className={MUTED_TEXT_CLASS}>
                StrategyLab で作成したルール定義と version は、後続でここに表示されます。
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {strategies.map((strategy) => (
                <article key={strategy.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <TextLink href={`/strategies/${strategy.id}`} className="text-base font-semibold text-sky-700 no-underline hover:underline">
                        {strategy.title}
                      </TextLink>
                      <p className="text-xs text-slate-500">strategy_id: {strategy.id}</p>
                    </div>
                    <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                      {strategy.status}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                    <div>
                      <dt className="text-xs font-medium text-slate-500">version count</dt>
                      <dd>{strategy.version_count}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">updated</dt>
                      <dd>{formatDate(strategy.updated_at ?? strategy.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">latest version</dt>
                      <dd>
                        {strategy.latest_version
                          ? `${strategy.latest_version.market} / ${strategy.latest_version.timeframe} / ${strategy.latest_version.status}`
                          : '未作成'}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

export default StrategyList;
