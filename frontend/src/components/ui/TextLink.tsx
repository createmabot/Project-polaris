import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link } from 'wouter';

type TextLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>;

const DEFAULT_CLASS_NAME = 'text-sky-700 no-underline hover:underline';

export default function TextLink({ href, children, className, ...anchorProps }: TextLinkProps) {
  const resolvedClassName = className ?? DEFAULT_CLASS_NAME;

  return (
    <Link href={href} className={resolvedClassName} {...anchorProps}>
      {children}
    </Link>
  );
}
