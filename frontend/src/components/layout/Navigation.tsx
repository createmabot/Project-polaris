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
      {NAV_ITEMS.map((item) => (
        <TextLink
          key={item.href}
          href={item.href}
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-slate-700 no-underline hover:bg-slate-100 hover:text-slate-900"
        >
          {item.label}
        </TextLink>
      ))}
    </nav>
  );
}
