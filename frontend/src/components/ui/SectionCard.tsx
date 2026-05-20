import type { ReactNode } from 'react';

type SectionCardProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headingClassName?: string;
};

export default function SectionCard({
  title,
  description,
  actions,
  children,
  className = '',
  headingClassName = 'text-lg font-semibold text-slate-900',
}: SectionCardProps) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/70 ${className}`.trim()}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="min-w-0">
          <h2 className={headingClassName}>{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
