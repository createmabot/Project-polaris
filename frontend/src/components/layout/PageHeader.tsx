import type { ReactNode } from 'react';
import TextLink from '../ui/TextLink';

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backLink?: {
    href: string;
    label: string;
  };
};

export default function PageHeader({ title, description, actions, backLink }: PageHeaderProps) {
  return (
    <div className="mb-4 rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm shadow-slate-200/70 backdrop-blur">
      {backLink ? (
        <div className="mb-3">
          <TextLink href={backLink.href} className="text-sm text-slate-600 no-underline hover:underline">
            {backLink.label}
          </TextLink>
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h1>
          {description ? <div className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
