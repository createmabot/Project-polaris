import { useEffect, useState } from 'react';

const PINE_PROGRESS_STEPS = [
  { key: 'request', label: '生成リクエスト送信', afterMs: 0 },
  { key: 'generate', label: 'LLMでPine生成', afterMs: 800 },
  { key: 'review', label: '生成結果レビュー', afterMs: 3500 },
  { key: 'repair', label: '必要に応じて修正', afterMs: 7000 },
  { key: 'finalize', label: '最終確認', afterMs: 11000 },
] as const;

type PineGenerationProgressProps = {
  className?: string;
};

export default function PineGenerationProgress({ className = '' }: PineGenerationProgressProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  useEffect(() => {
    const timers = PINE_PROGRESS_STEPS.slice(1).map((step, index) =>
      window.setTimeout(() => {
        setActiveStepIndex(index + 1);
      }, step.afterMs)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return (
    <div
      role='status'
      aria-live='polite'
      data-testid='pine-generation-progress'
      className={`rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-sm text-sky-950 shadow-sm ${className}`.trim()}
    >
      <div className='flex items-start gap-2'>
        <span className='mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-sky-500' aria-hidden='true' />
        <div className='min-w-0'>
          <div className='font-semibold'>Pine生成中です</div>
          <div className='mt-1 leading-6 text-sky-900'>
            LLM生成、レビュー、必要に応じた修正を行っています。通常より時間がかかる場合があります。
          </div>
        </div>
      </div>

      <ol className='mt-3 grid gap-1.5 sm:grid-cols-5' aria-label='Pine生成の進行目安'>
        {PINE_PROGRESS_STEPS.map((step, index) => {
          const isComplete = index < activeStepIndex;
          const isActive = index === activeStepIndex;
          const stepClassName = isActive
            ? 'border-sky-300 bg-white font-semibold text-sky-900'
            : isComplete
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 bg-white/60 text-slate-500';
          const markerClassName = isActive
            ? 'bg-sky-600 text-white'
            : isComplete
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-200 text-slate-600';

          return (
            <li
              key={step.key}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs ${stepClassName}`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.65rem] ${markerClassName}`}
                aria-hidden='true'
              >
                {isComplete ? '✓' : index + 1}
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>

      <div className='mt-2 text-xs leading-5 text-sky-800'>
        処理中の段階は同期API中の目安です。画面を閉じずにお待ちください。完了後に結果が表示されます。
      </div>
    </div>
  );
}
