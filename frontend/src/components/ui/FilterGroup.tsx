import type { ReactNode } from 'react';
import Button from './Button';

type FilterOption<T extends string> = {
  value: T;
  label: ReactNode;
};

type FilterGroupProps<T extends string> = {
  label: ReactNode;
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  className = '',
}: FilterGroupProps<T>): JSX.Element {
  const groupClassName = `flex flex-wrap items-center gap-2 ${className}`.trim();

  return (
    <div className={groupClassName}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {options.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? 'primary' : 'secondary'}
          onClick={() => onChange(option.value)}
          className="py-1 text-xs"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export default FilterGroup;
