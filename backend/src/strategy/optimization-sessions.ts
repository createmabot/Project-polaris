import { Prisma } from '@prisma/client';
import { AppError } from '../utils/response';

export type SanitizedRefinementCandidate = {
  title: string;
  target_area: string;
  rationale: string;
  change_summary: string;
  entry_change: string | null;
  exit_change: string | null;
  risk_change: string | null;
  validation_plan: string;
  expected_metric_effect: {
    profit_factor: string | null;
    win_rate: string | null;
    max_drawdown: string | null;
    trade_count: string | null;
  };
};

const UNSAFE_CANDIDATE_TEXT_PATTERN =
  /(https?:\/\/|file:\/\/|www\.|localhost|127\.0\.0\.1|::1|\/api\/|[a-z]:\\|\\|\/users\/|\/home\/|endpoint|model|secret|token|api[_-]?key|password|credential|stack trace|traceback|provider response|reviewer response|raw prompt|raw csv|raw import|raw pine|generated_pine|natural_language_rule)/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeOptimizationText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n/g, '\n').replace(/\t/g, ' ').trim();
  if (!normalized) return null;
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !UNSAFE_CANDIDATE_TEXT_PATTERN.test(line));
  const result = lines.join('\n').slice(0, maxLength).trim();
  return result || null;
}

const CANDIDATE_STATUSES = ['proposed', 'version_created', 'tested', 'selected', 'rejected', 'archived'] as const;

export type StrategyRefinementCandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export function sanitizeCandidateStatus(value: unknown): StrategyRefinementCandidateStatus {
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'status must be a string.');
  }
  const status = value.trim();
  if (!CANDIDATE_STATUSES.includes(status as StrategyRefinementCandidateStatus)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'status must be one of: proposed, version_created, tested, selected, rejected, archived.');
  }
  return status as StrategyRefinementCandidateStatus;
}

export function sanitizeRuleRefinementCandidate(value: unknown): SanitizedRefinementCandidate | null {
  if (!isRecord(value)) return null;
  const title = sanitizeOptimizationText(value.title, 120);
  const rationale = sanitizeOptimizationText(value.rationale, 300);
  const changeSummary = sanitizeOptimizationText(value.change_summary, 400);
  const targetArea = sanitizeOptimizationText(value.target_area, 40) ?? 'filter';
  const validationPlan = sanitizeOptimizationText(value.validation_plan, 300);
  if (!title || !rationale || !changeSummary) return null;

  const expected = isRecord(value.expected_metric_effect) ? value.expected_metric_effect : {};
  return {
    title,
    target_area: targetArea,
    rationale,
    change_summary: changeSummary,
    entry_change: sanitizeOptimizationText(value.entry_change, 320),
    exit_change: sanitizeOptimizationText(value.exit_change, 320),
    risk_change: sanitizeOptimizationText(value.risk_change, 320),
    validation_plan: validationPlan ?? '元versionと主要指標を比較する。',
    expected_metric_effect: {
      profit_factor: sanitizeOptimizationText(expected.profit_factor, 180),
      win_rate: sanitizeOptimizationText(expected.win_rate, 180),
      max_drawdown: sanitizeOptimizationText(expected.max_drawdown, 180),
      trade_count: sanitizeOptimizationText(expected.trade_count, 180),
    },
  };
}

export function extractRuleRefinementCandidatesFromSummary(
  structuredJson: unknown,
  limit = 4,
): SanitizedRefinementCandidate[] {
  if (!isRecord(structuredJson)) return [];
  const payload = isRecord(structuredJson.payload) ? structuredJson.payload : null;
  const candidates = Array.isArray(payload?.rule_refinement_candidates)
    ? payload.rule_refinement_candidates
    : [];
  return candidates
    .map((item) => sanitizeRuleRefinementCandidate(item))
    .filter((item): item is SanitizedRefinementCandidate => item !== null)
    .slice(0, limit);
}

export function candidateToJson(candidate: SanitizedRefinementCandidate): Prisma.InputJsonValue {
  return {
    title: candidate.title,
    target_area: candidate.target_area,
    rationale: candidate.rationale,
    change_summary: candidate.change_summary,
    entry_change: candidate.entry_change,
    exit_change: candidate.exit_change,
    risk_change: candidate.risk_change,
    validation_plan: candidate.validation_plan,
    expected_metric_effect: candidate.expected_metric_effect,
  };
}

export function toOptimizationCandidateResponse(candidate: any, extra: Record<string, unknown> = {}) {
  const expected = isRecord(candidate.expectedMetricEffectJson) ? candidate.expectedMetricEffectJson : {};
  return {
    id: candidate.id,
    session_id: candidate.sessionId,
    source_backtest_id: candidate.sourceBacktestId ?? null,
    parent_strategy_version_id: candidate.parentStrategyVersionId,
    created_strategy_version_id: candidate.createdStrategyRuleVersionId ?? null,
    candidate_index: candidate.candidateIndex,
    status: candidate.status,
    title: candidate.title,
    target_area: candidate.targetArea,
    rationale: candidate.rationale,
    change_summary: candidate.changeSummary,
    entry_change: candidate.entryChange ?? null,
    exit_change: candidate.exitChange ?? null,
    risk_change: candidate.riskChange ?? null,
    validation_plan: candidate.validationPlan,
    expected_metric_effect: {
      profit_factor: sanitizeOptimizationText(expected.profit_factor, 180),
      win_rate: sanitizeOptimizationText(expected.win_rate, 180),
      max_drawdown: sanitizeOptimizationText(expected.max_drawdown, 180),
      trade_count: sanitizeOptimizationText(expected.trade_count, 180),
    },
    selected_at: candidate.selectedAt ?? null,
    created_at: candidate.createdAt,
    updated_at: candidate.updatedAt,
    ...extra,
  };
}

export function toOptimizationSessionResponse(session: any, candidates: any[] = [], extra: Record<string, unknown> = {}) {
  return {
    id: session.id,
    symbol_id: session.symbolId ?? null,
    strategy_rule_id: session.strategyRuleId,
    base_strategy_version_id: session.baseStrategyVersionId,
    source_backtest_id: session.sourceBacktestId ?? null,
    source_ai_summary_id: session.sourceAiSummaryId ?? null,
    objective_type: session.objectiveType,
    status: session.status,
    candidate_count: candidates.length,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    candidates: candidates.map((candidate) => toOptimizationCandidateResponse(candidate)),
    ...extra,
  };
}

export function candidateToRewriteMemo(candidate: any): string {
  const parts = [
    `refinement candidate: ${sanitizeOptimizationText(candidate.title, 120) ?? '-'}`,
    sanitizeOptimizationText(candidate.changeSummary, 400),
    sanitizeOptimizationText(candidate.entryChange, 320) ? `entry: ${sanitizeOptimizationText(candidate.entryChange, 320)}` : '',
    sanitizeOptimizationText(candidate.exitChange, 320) ? `exit: ${sanitizeOptimizationText(candidate.exitChange, 320)}` : '',
    sanitizeOptimizationText(candidate.riskChange, 320) ? `risk: ${sanitizeOptimizationText(candidate.riskChange, 320)}` : '',
    sanitizeOptimizationText(candidate.validationPlan, 300) ? `validation: ${sanitizeOptimizationText(candidate.validationPlan, 300)}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

export function candidateToRewriteContext(candidate: any): SanitizedRefinementCandidate {
  return {
    title: sanitizeOptimizationText(candidate.title, 120) ?? 'refinement candidate',
    target_area: sanitizeOptimizationText(candidate.targetArea, 40) ?? 'filter',
    rationale: sanitizeOptimizationText(candidate.rationale, 300) ?? '検証候補として扱います。',
    change_summary: sanitizeOptimizationText(candidate.changeSummary, 400) ?? 'entry / exit / risk 条件を分けて改善します。',
    entry_change: sanitizeOptimizationText(candidate.entryChange, 320),
    exit_change: sanitizeOptimizationText(candidate.exitChange, 320),
    risk_change: sanitizeOptimizationText(candidate.riskChange, 320),
    validation_plan: sanitizeOptimizationText(candidate.validationPlan, 300) ?? '元versionと主要指標を比較します。',
    expected_metric_effect: isRecord(candidate.expectedMetricEffectJson)
      ? {
          profit_factor: sanitizeOptimizationText(candidate.expectedMetricEffectJson.profit_factor, 180),
          win_rate: sanitizeOptimizationText(candidate.expectedMetricEffectJson.win_rate, 180),
          max_drawdown: sanitizeOptimizationText(candidate.expectedMetricEffectJson.max_drawdown, 180),
          trade_count: sanitizeOptimizationText(candidate.expectedMetricEffectJson.trade_count, 180),
        }
      : {
          profit_factor: null,
          win_rate: null,
          max_drawdown: null,
          trade_count: null,
        },
  };
}
