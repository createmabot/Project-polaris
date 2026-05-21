import type { HTMLAttributes, ReactNode } from 'react';

type SurfaceElement = 'div' | 'article' | 'section' | 'pre';
type SurfaceVariant = 'card' | 'muted' | 'nested' | 'readable';

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: SurfaceElement;
  children: ReactNode;
  variant?: SurfaceVariant;
};

const SURFACE_CLASSES: Record<SurfaceVariant, string> = {
  card: 'rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60',
  muted: 'rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm shadow-slate-200/60',
  nested: 'rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-xs text-slate-600',
  readable: 'rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-700',
};

export default function Surface({
  as: Component = 'div',
  children,
  className = '',
  variant = 'card',
  ...props
}: SurfaceProps) {
  return (
    <Component className={`${SURFACE_CLASSES[variant]} ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}
