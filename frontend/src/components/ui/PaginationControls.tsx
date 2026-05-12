import type { ReactNode } from 'react';
import Button from './Button';

type PaginationControlsProps = {
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  summaryLabel: ReactNode;
  previousLabel: ReactNode;
  nextLabel: ReactNode;
  className?: string;
};

function PaginationControls({
  page,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  summaryLabel,
  previousLabel,
  nextLabel,
  className = '',
}: PaginationControlsProps): JSX.Element {
  const wrapperClassName = `mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 ${className}`.trim();
  const renderedSummary =
    typeof summaryLabel === 'string' ? summaryLabel.replace('{page}', String(page)) : summaryLabel;

  return (
    <div className={wrapperClassName}>
      <div className="text-xs text-slate-500">{renderedSummary}</div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onPrev} disabled={!hasPrev} className="py-1 text-xs">
          {previousLabel}
        </Button>
        <Button variant="secondary" onClick={onNext} disabled={!hasNext} className="py-1 text-xs">
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}

export default PaginationControls;
