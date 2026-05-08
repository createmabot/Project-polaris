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
    <div className="mb-6">
      {backLink ? (
        <div className="mb-4">
          <TextLink href={backLink.href} className="text-sm text-slate-600 no-underline hover:underline">
            {backLink.label}
          </TextLink>
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{title}</h1>
          {description ? <div className="mt-2 text-sm text-slate-600">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
