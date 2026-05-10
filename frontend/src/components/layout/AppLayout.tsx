import type { ReactNode } from 'react';
import type { KeyedMutator } from 'swr';
import type { HomeData } from '../../api/types';
import Navigation from './Navigation';
import SideRail from './SideRail';

type AppLayoutProps = {
  children: ReactNode;
  showSideRail?: boolean;
  sideRailHomeData?: HomeData;
  sideRailHomeError?: unknown;
  sideRailHomeIsLoading?: boolean;
  sideRailMutateHome?: KeyedMutator<HomeData>;
};

export default function AppLayout({
  children,
  showSideRail = false,
  sideRailHomeData,
  sideRailHomeError,
  sideRailHomeIsLoading,
  sideRailMutateHome,
}: AppLayoutProps) {
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
            <SideRail
              homeData={sideRailHomeData}
              homeError={sideRailHomeError}
              homeIsLoading={sideRailHomeIsLoading}
              mutateHome={sideRailMutateHome}
            />
            <div className="min-w-0 self-start">{children}</div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
