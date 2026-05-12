import type { ReactNode } from 'react';

type InlineNoticeTone = 'info' | 'warning' | 'success' | 'danger';

type InlineNoticeProps = {
  children: ReactNode;
  tone?: InlineNoticeTone;
  className?: string;
};

const TONE_CLASSES: Record<InlineNoticeTone, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
};

export default function InlineNotice({
  children,
  tone = 'info',
  className = '',
}: InlineNoticeProps) {
  return (
    <div className={`rounded-lg border p-3 text-sm leading-6 ${TONE_CLASSES[tone]} ${className}`.trim()}>
      {children}
    </div>
  );
}
