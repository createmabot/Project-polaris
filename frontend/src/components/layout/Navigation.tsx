import TextLink from '../ui/TextLink';

const NAV_ITEMS = [
  { href: '/', label: 'ホーム' },
  { href: '/strategy-lab', label: 'ストラテジー作成' },
  { href: '/backtests', label: '検証レポート' },
  { href: '/watchlist', label: '監視銘柄管理' },
  { href: '/positions', label: '保有銘柄管理' },
];

export default function Navigation() {
  return (
    <nav aria-label="主要ナビゲーション" className="flex flex-wrap items-center gap-4 text-sm">
      {NAV_ITEMS.map((item) => (
        <TextLink key={item.href} href={item.href}>
          {item.label}
        </TextLink>
      ))}
    </nav>
  );
}
