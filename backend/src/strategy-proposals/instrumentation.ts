import { AppError } from '../utils/response';
import type {
  StrategyProposalProviderMetadata,
  StrategyProposalProviderObservation,
} from './types';
import type { StrategyProposalProviderMode, StrategyProposalProviderSelection } from './provider';

export type StrategyProposalInvalidReason = StrategyProposalProviderObservation['invalid_reason'];

const PROVIDER_FAILURE_REASONS: StrategyProposalInvalidReason[] = [
  'schema_invalid',
  'malformed_json',
  'required_field_missing',
  'enum_invalid',
  'candidate_count_invalid',
  'web_research_basis_disabled',
  'provider_unavailable',
  'timeout',
  'unknown',
];

function readProviderFailureReason(error: AppError): StrategyProposalInvalidReason | null {
  const reason = error.details?.provider_failure_reason;
  if (typeof reason === 'string' && PROVIDER_FAILURE_REASONS.includes(reason as StrategyProposalInvalidReason)) {
    return reason as StrategyProposalInvalidReason;
  }
  return null;
}

export function classifyStrategyProposalInvalidReason(error: AppError): StrategyProposalInvalidReason {
  const providerReason = readProviderFailureReason(error);
  if (providerReason) {
    return providerReason;
  }

  const message = error.message.toLowerCase();
  if (message.includes('candidate count')) {
    return 'candidate_count_invalid';
  }
  if (message.includes('web research basis')) {
    return 'web_research_basis_disabled';
  }
  if (message.includes('unsupported')) {
    return 'enum_invalid';
  }
  if (message.includes('schema metadata') || message.includes('provider metadata') || message.includes('candidates must be an array')) {
    return 'schema_invalid';
  }
  if (
    message.includes('must be') ||
    message.includes('must contain') ||
    message.includes('must not be empty') ||
    message.includes('is too short') ||
    message.includes('is too long')
  ) {
    return 'required_field_missing';
  }
  return 'unknown';
}

export function statusForInvalidReason(
  reason: StrategyProposalInvalidReason,
): StrategyProposalProviderObservation['status'] {
  if (reason === 'provider_unavailable') {
    return 'provider_unavailable';
  }
  if (reason === 'timeout') {
    return 'timeout';
  }
  if (reason === 'unknown') {
    return 'provider_error';
  }
  return 'invalid_response';
}

export function getStrategyProposalModelCategory(mode: StrategyProposalProviderMode): StrategyProposalProviderObservation['model_category'] {
  if (mode !== 'local_llm') {
    return 'unknown';
  }
  return process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL?.trim() || process.env.PRIMARY_LOCAL_MODEL?.trim()
    ? 'configured'
    : 'default';
}

export function buildStrategyProposalObservation(params: {
  startedAtMs: number;
  selection: StrategyProposalProviderSelection;
  provider?: StrategyProposalProviderMetadata;
  status: StrategyProposalProviderObservation['status'];
  candidateCount: number;
  invalidReason?: StrategyProposalProviderObservation['invalid_reason'];
  validationErrorCount?: number;
  schemaValid?: boolean;
}): StrategyProposalProviderObservation {
  const elapsed = Math.max(0, Date.now() - params.startedAtMs);
  const elapsedMs = Math.round(elapsed / 10) * 10;
  const latencyBucket =
    params.status === 'timeout'
      ? 'timeout'
      : elapsedMs < 1000
        ? 'fast'
        : elapsedMs < 5000
          ? 'acceptable'
          : 'slow';

  return {
    provider_name: params.provider?.name ?? params.selection.mode,
    selected_by: params.selection.selectedBy,
    elapsed_ms: elapsedMs,
    latency_bucket: latencyBucket,
    status: params.status,
    candidate_count: params.candidateCount,
    invalid_reason: params.invalidReason ?? 'none',
    validation_error_count: params.validationErrorCount ?? 0,
    fallback_used: false,
    fallback_reason: null,
    schema_valid: params.schemaValid ?? params.status === 'succeeded',
    model_category: getStrategyProposalModelCategory(params.selection.mode),
  };
}
