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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#e0f2fe_0,_transparent_32rem),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 py-3">
          <Navigation />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-7">
        {showSideRail ? (
          <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
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
