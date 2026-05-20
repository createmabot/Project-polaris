import TextLink from '../ui/TextLink';

const NAV_ITEMS = [
  { href: '/', label: 'ホーム' },
  { href: '/strategies', label: 'ストラテジー' },
  { href: '/strategy-lab', label: 'ストラテジー作成' },
  { href: '/backtests', label: '検証レポート' },
];

export default function Navigation() {
  return (
    <nav aria-label="主要ナビゲーション" className="flex flex-wrap items-center gap-2">
      <div className="mr-3 flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
        北極星
      </div>
      {NAV_ITEMS.map((item) => (
        <TextLink
          key={item.href}
          href={item.href}
          className="inline-flex items-center rounded-full px-3 py-2 text-sm font-medium text-slate-700 no-underline transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
        >
          {item.label}
        </TextLink>
      ))}
    </nav>
  );
}
