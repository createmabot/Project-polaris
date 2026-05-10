import type { ReactNode } from 'react';

type KeyValueListProps = {
  children: ReactNode;
  className?: string;
};

type KeyValueRowProps = {
  label: ReactNode;
  children: ReactNode;
  className?: string;
};

function KeyValueList({ children, className = '' }: KeyValueListProps): JSX.Element {
  const listClassName = `grid gap-2 text-sm text-slate-700 ${className}`.trim();

  return <div className={listClassName}>{children}</div>;
}

function KeyValueRow({ label, children, className = '' }: KeyValueRowProps): JSX.Element {
  const rowClassName = `leading-6 ${className}`.trim();

  return (
    <div className={rowClassName}>
      <strong>{label}:</strong> {children}
    </div>
  );
}

export { KeyValueList, KeyValueRow };
