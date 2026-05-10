import type { ReactNode } from 'react';

type StatusBadgeTone = 'positive' | 'neutral' | 'info' | 'danger';

type StatusBadgeProps = {
  children?: ReactNode;
  status?: string | null;
  tone?: StatusBadgeTone;
  className?: string;
};

const TONE_CLASSES: Record<StatusBadgeTone, string> = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  neutral: 'border-slate-200 bg-white text-slate-700',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  danger: 'border-rose-200 bg-rose-50 text-rose-800',
};

function inferTone(status: string | null | undefined): StatusBadgeTone {
  const normalizedStatus = status?.toLowerCase() ?? '';
  if (['active', 'available', 'completed', 'generated', 'imported', 'parsed', 'ready', 'succeeded'].includes(normalizedStatus)) {
    return 'positive';
  }
  if (['failed', 'canceled', 'error', 'import_failed'].includes(normalizedStatus)) {
    return 'danger';
  }
  if (['pending', 'queued', 'running'].includes(normalizedStatus)) {
    return 'info';
  }
  return 'neutral';
}

function StatusBadge({ children, status, tone, className = '' }: StatusBadgeProps): JSX.Element {
  const displayValue = children ?? status ?? '-';
  const badgeTone = tone ?? inferTone(status ?? (typeof children === 'string' ? children : null));
  const badgeClassName = `inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium ${TONE_CLASSES[badgeTone]} ${className}`.trim();

  return <span className={badgeClassName}>{displayValue}</span>;
}

export default StatusBadge;
