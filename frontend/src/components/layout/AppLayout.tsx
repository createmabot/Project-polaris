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
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <Navigation />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {showSideRail ? (
          <div className="grid items-start gap-6 md:grid-cols-[18rem_minmax(0,1fr)]">
            <SideRail />
            <div className="min-w-0 self-start">{children}</div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
