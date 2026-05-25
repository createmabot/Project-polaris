import type { PineGenerationJob } from '../api/types';

const UNSAFE_DETAIL_PATTERN = /raw|endpoint|model|stack|token|secret|credential|local path|http:\/\/|https:\/\/|provider response|reviewer response/i;

const REVIEWER_ISSUE_LABELS: Record<string, string> = {
  setup_trigger_state_risk: 'setup 条件と trigger 条件の状態保持が不十分',
  setup_trigger_same_bar: 'setup 条件と trigger 条件が同一足で矛盾する可能性',
  stop_order_semantics_risk: '損切り注文の表現が不安定',
  uninitialized_stop_loss_price: '損切り価格が未初期化になる可能性',
  unsupported_adx_function: '未対応の ADX 関数表現',
  unsupported_plot_style: '未対応の plot style',
  unsupported_color_alias: '未対応の color 指定',
  dmi_property_access: 'DMI の参照方法が不安定',
  block_local_variable_scope_risk: 'block 内変数の参照 scope が不安定',
  na_type_inference_risk: 'na 初期化の型推論が不安定',
  below_vs_crossunder_mismatch: '「下回る」と crossunder の解釈が不一致',
  oscillator_plot_overlay_risk: '価格チャート上に oscillator plot が混入',
  entry_price_reference_risk: 'entry price の参照方法が不安定',
  unused_state_variable: '不要な state 変数が残っている',
  narrative_comment: '生成 script 内に説明コメントが多い',
  long_only_violation: 'long-only 指示に反する entry がある',
};

function safeCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return /^[a-z0-9_]+$/i.test(trimmed) && trimmed.length <= 80 ? trimmed : null;
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.length > 180 || UNSAFE_DETAIL_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function labelForCode(code: string): string {
  return REVIEWER_ISSUE_LABELS[code] ?? `reviewer issue: ${code}`;
}

export function buildPineGenerationJobFailureMessage(
  error: PineGenerationJob['error'] | null | undefined,
  fallback = 'Pine生成に失敗しました。条件を見直して再試行してください。',
): string {
  const safeMessage = safeText(error?.message) ?? fallback;
  const reviewerIssues = Array.isArray(error?.pine_reviewer_issues)
    ? error.pine_reviewer_issues
        .flatMap((issue) => {
          const code = safeCode(issue?.code);
          const hint = safeText(issue?.repair_hint);
          if (!code) {
            return [];
          }
          return [hint ? `${labelForCode(code)}（${hint}）` : labelForCode(code)];
        })
        .slice(0, 3)
    : [];

  const reasonCodes = reviewerIssues.length > 0
    ? []
    : Array.isArray(error?.invalid_reason_codes)
      ? error.invalid_reason_codes.flatMap((code) => {
          const safe = safeCode(code);
          return safe ? [labelForCode(safe.replace(/^reviewer_/, ''))] : [];
        }).slice(0, 3)
      : [];

  const reasons = reviewerIssues.length > 0 ? reviewerIssues : reasonCodes;
  if (reasons.length === 0) {
    return safeMessage;
  }

  const messageWithHints = `${safeMessage} 原因: ${reasons.join('、')}。`;
  if (messageWithHints.length <= 220) {
    return messageWithHints;
  }
  const compactReasons = reasons.map((reason) => reason.split('（')[0]);
  return `${safeMessage} 原因: ${compactReasons.join('、')}。`;
}
