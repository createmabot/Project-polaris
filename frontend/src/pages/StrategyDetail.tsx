import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import TextLink from '../components/ui/TextLink';
import { useRoute } from 'wouter';

const PANEL_CLASS = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

function StrategyDetail(): JSX.Element {
  const [, params] = useRoute('/strategies/:strategyId') as [boolean, { strategyId?: string } | null];
  const strategyId = params?.strategyId ?? '-';

  return (
    <AppLayout>
      <div className="w-full space-y-5">
        <PageHeader
          title="ストラテジー詳細"
          description="再利用可能なストラテジー定義の詳細、version、関連検証レポートを扱う予定の画面です。"
          backLink={{ href: '/strategies', label: 'ストラテジーリストへ戻る' }}
        />

        <section className={PANEL_CLASS}>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              strategy_id: <code>{strategyId}</code>
            </p>
            <p className="text-sm leading-7 text-slate-700">
              このストラテジー定義の version、関連検証レポート、適用済み銘柄をここに集約します。
            </p>
            <p className="text-sm leading-7 text-slate-600">
              現在は準備中です。version 一覧、関連検証レポート、適用済み銘柄、favorite / archive / delete
              は後続タスクで接続します。
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
      </div>
    </AppLayout>
  );
}

export default StrategyDetail;
