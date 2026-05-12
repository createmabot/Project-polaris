type JsonBlockProps = {
  value: unknown;
  title?: string;
  className?: string;
};

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '-';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '-';
  }
}

export default function JsonBlock({ value, title, className = '' }: JsonBlockProps): JSX.Element {
  return (
    <div className={className}>
      {title ? <strong>{title}</strong> : null}
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-800">
        <code>{formatJson(value)}</code>
      </pre>
    </div>
  );
}
