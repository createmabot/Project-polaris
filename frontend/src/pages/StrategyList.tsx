import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import TextLink from '../components/ui/TextLink';

const PANEL_CLASS = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

function StrategyList(): JSX.Element {
  return (
    <AppLayout>
      <div className="w-full space-y-5">
        <PageHeader
          title="ストラテジーリスト"
          description="再利用可能なストラテジー定義を一覧・詳細で扱う予定の画面です。"
          backLink={{ href: '/', label: 'ホームへ戻る' }}
        />

        <section className={PANEL_CLASS}>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">準備中</h2>
            <p className="text-sm leading-7 text-slate-700">
              再利用可能なストラテジー定義をここに集約します。
            </p>
            <p className="text-sm leading-7 text-slate-600">
              現在は準備中です。StrategyLab で作成したルール定義、version、関連検証結果は後続タスクで接続します。
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
      </div>
    </AppLayout>
  );
}

export default StrategyList;
