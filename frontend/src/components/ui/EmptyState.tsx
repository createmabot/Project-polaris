import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
};

export default function EmptyState({ title, children, className = '' }: EmptyStateProps) {
  return (
    <div className={`rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 ${className}`.trim()}>
      <div className="font-medium text-slate-700">{title}</div>
      {children ? <div className="mt-1 leading-6">{children}</div> : null}
    </div>
  );
}
