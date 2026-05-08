import type { ReactNode } from 'react';
import Navigation from './Navigation';

type AppLayoutProps = {
  children: ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <Navigation />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
