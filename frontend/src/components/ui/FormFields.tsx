import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

type FieldTextProps = {
  label: ReactNode;
  helpText?: ReactNode;
  error?: ReactNode;
};

type TextInputProps = FieldTextProps & InputHTMLAttributes<HTMLInputElement>;
type TextAreaProps = FieldTextProps & TextareaHTMLAttributes<HTMLTextAreaElement>;
type SelectFieldProps = FieldTextProps & SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

const baseControlClassName =
  'w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';
const normalControlClassName = 'border-slate-300';
const errorControlClassName = 'border-rose-300';

function buildControlClassName(error: ReactNode, className = ''): string {
  return `${baseControlClassName} ${error ? errorControlClassName : normalControlClassName} ${className}`.trim();
}

function FieldText({ helpText, error }: Pick<FieldTextProps, 'helpText' | 'error'>): JSX.Element | null {
  if (error) {
    return <p className="text-sm text-rose-700">{error}</p>;
  }
  if (helpText) {
    return <p className="text-sm text-slate-600">{helpText}</p>;
  }
  return null;
}

export function TextInput({
  label,
  helpText,
  error,
  className = '',
  ...inputProps
}: TextInputProps): JSX.Element {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      <input className={buildControlClassName(error, className)} {...inputProps} />
      <FieldText helpText={helpText} error={error} />
    </label>
  );
}

export function TextArea({
  label,
  helpText,
  error,
  className = '',
  ...textareaProps
}: TextAreaProps): JSX.Element {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      <textarea className={buildControlClassName(error, `resize-y ${className}`)} {...textareaProps} />
      <FieldText helpText={helpText} error={error} />
    </label>
  );
}

export function SelectField({
  label,
  helpText,
  error,
  className = '',
  children,
  ...selectProps
}: SelectFieldProps): JSX.Element {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      <select className={buildControlClassName(error, className)} {...selectProps}>
        {children}
      </select>
      <FieldText helpText={helpText} error={error} />
    </label>
  );
}
