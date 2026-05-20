import type { ReactNode } from 'react';

type ErrorStateProps = {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
};

export default function ErrorState({ title, children, className = '' }: ErrorStateProps) {
  return (
    <div className={`rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 ${className}`.trim()}>
      <div className="font-medium">{title}</div>
      {children ? <div className="mt-1 leading-6 text-red-700">{children}</div> : null}
    </div>
  );
}
