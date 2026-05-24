import type { PineGenerationJobStage, PineGenerationStageEvent } from '../../api/types';

const PINE_PROGRESS_STEPS: Array<{ key: PineGenerationJobStage; label: string }> = [
  { key: 'queued', label: '受付' },
  { key: 'generating', label: 'LLMでPine生成' },
  { key: 'reviewing', label: '生成結果レビュー' },
  { key: 'repairing', label: '必要に応じて修正' },
  { key: 'validating', label: '最終確認' },
];

type PineGenerationProgressProps = {
  currentStage?: string | null;
  status?: string | null;
  stageHistory?: PineGenerationStageEvent[];
  className?: string;
};

function isKnownStage(value: string | null | undefined): value is PineGenerationJobStage {
  return PINE_PROGRESS_STEPS.some((step) => step.key === value) || value === 'succeeded' || value === 'failed';
}

function normalizeStage(value: string | null | undefined): PineGenerationJobStage | 'succeeded' | 'failed' {
  if (value === '生成リクエスト送信') return 'queued';
  if (value === 'LLMでPine生成') return 'generating';
  if (value === '生成結果レビュー') return 'reviewing';
  if (value === '必要に応じて修正') return 'repairing';
  if (value === '最終確認') return 'validating';
  if (isKnownStage(value)) return value;
  return 'queued';
}

function normalizeStageHistory(stageHistory: PineGenerationStageEvent[]): PineGenerationStageEvent[] {
  return stageHistory.map((event) => ({
    ...event,
    stage: normalizeStage(event.stage),
  }));
}

function resolveStepState(
  step: PineGenerationJobStage,
  currentStage: string | null | undefined,
  stageHistory: PineGenerationStageEvent[],
): 'active' | 'complete' | 'skipped' | 'pending' {
  const latestEvent = [...stageHistory].reverse().find((event) => event.stage === step);
  if (latestEvent?.status === 'skipped') return 'skipped';
  if (currentStage === step) return 'active';
  if (latestEvent?.status === 'completed') return 'complete';
  if (latestEvent?.status === 'running') return currentStage === step ? 'active' : 'complete';
  return 'pending';
}

export default function PineGenerationProgress({
  currentStage = 'queued',
  status = 'running',
  stageHistory = [],
  className = '',
}: PineGenerationProgressProps) {
  const safeCurrentStage = normalizeStage(currentStage);
  const normalizedStageHistory = normalizeStageHistory(stageHistory);
  const isFailed = status === 'failed' || safeCurrentStage === 'failed';
  const isSucceeded = status === 'succeeded' || safeCurrentStage === 'succeeded';

  return (
    <div
      role='status'
      aria-live='polite'
      data-testid='pine-generation-progress'
      className={`rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-sm text-sky-950 shadow-sm ${className}`.trim()}
    >
      <div className='flex items-start gap-2'>
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            isFailed ? 'bg-rose-500' : isSucceeded ? 'bg-emerald-500' : 'animate-pulse bg-sky-500'
          }`}
          aria-hidden='true'
        />
        <div className='min-w-0'>
          <div className='font-semibold'>{isFailed ? 'Pine生成に失敗しました' : isSucceeded ? 'Pine生成が完了しました' : 'Pine生成中です'}</div>
          <div className='mt-1 leading-6 text-sky-900'>
            実際の backend stage と同期して、LLM生成、レビュー、必要に応じた修正の進行状況を表示しています。
          </div>
        </div>
      </div>

      <ol className='mt-3 grid gap-1.5 sm:grid-cols-5' aria-label='Pine生成の進行状況'>
        {PINE_PROGRESS_STEPS.map((step, index) => {
          const stepState = resolveStepState(step.key, safeCurrentStage, normalizedStageHistory);
          const isActive = stepState === 'active';
          const isComplete = stepState === 'complete' || isSucceeded;
          const isSkipped = stepState === 'skipped';
          const stepClassName = isActive
            ? 'border-sky-300 bg-white font-semibold text-sky-900'
            : isComplete
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : isSkipped
                ? 'border-slate-200 bg-slate-50 text-slate-500'
                : 'border-slate-200 bg-white/60 text-slate-500';
          const markerClassName = isActive
            ? 'bg-sky-600 text-white'
            : isComplete
              ? 'bg-emerald-600 text-white'
              : isSkipped
                ? 'bg-slate-300 text-slate-700'
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
                {isComplete ? '✓' : isSkipped ? '-' : index + 1}
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>

      <div className='mt-2 text-xs leading-5 text-sky-800'>
        polling による状態確認です。provider接続情報、model実値、生のpromptや応答本文は表示しません。
      </div>
    </div>
  );
}
