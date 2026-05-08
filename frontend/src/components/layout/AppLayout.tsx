import type { ReactNode } from 'react';
import Navigation from './Navigation';
import SideRail from './SideRail';

type AppLayoutProps = {
  children: ReactNode;
  showSideRail?: boolean;
};

export default function AppLayout({ children, showSideRail = false }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <Navigation />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {showSideRail ? (
          <div className="flex items-start gap-6">
            <SideRail />
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
