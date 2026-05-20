import type { ReactNode } from 'react';

type LoadingStateProps = {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
};

export default function LoadingState({ title, children, className = '' }: LoadingStateProps) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm ${className}`.trim()}>
      <div className="flex items-center gap-2 font-medium text-slate-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
        <span>{title}</span>
      </div>
      {children ? <div className="mt-1 leading-6">{children}</div> : null}
    </div>
  );
}
