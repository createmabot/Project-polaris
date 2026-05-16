import { AppError } from '../utils/response';
import {
  buildStrategyProposalObservation,
  classifyStrategyProposalInvalidReason,
  statusForInvalidReason,
} from './instrumentation';
import {
  createStrategyProposalProvider,
  type StrategyProposalProviderMode,
  type StrategyProposalProviderSelection,
} from './provider';
import type {
  StrategyProposalCandidate,
  StrategyProposalData,
  StrategyProposalProviderObservation,
} from './types';
import { validateStrategyProposalData } from './validation';
import {
  type StrategyProposalBenchmarkScenario,
  toStrategyProposalBenchmarkRequest,
} from './benchmark-scenarios';

type StrategyProposalBenchmarkCandidateSummary = {
  title: string;
  strategy_type: StrategyProposalCandidate['strategy_type'];
  confidence: StrategyProposalCandidate['confidence'];
  pine_feasibility: StrategyProposalCandidate['pine_feasibility'];
  backtest_caution_count: number;
};

export type StrategyProposalBenchmarkResult = {
  scenario_id: string;
  provider_name: string;
  selected_by: StrategyProposalProviderObservation['selected_by'];
  status: StrategyProposalProviderObservation['status'];
  latency_bucket: StrategyProposalProviderObservation['latency_bucket'];
  candidate_count: number;
  invalid_reason: StrategyProposalProviderObservation['invalid_reason'];
  validation_error_count: number;
  fallback_used: boolean;
  fallback_reason: string | null;
  schema_valid: boolean;
  model_category: StrategyProposalProviderObservation['model_category'];
  candidates: StrategyProposalBenchmarkCandidateSummary[];
  error_code: string | null;
};

export type StrategyProposalBenchmarkRunOptions = {
  providerMode?: StrategyProposalProviderMode;
};

const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(?:api[_-]?key|credential|password|secret|token)\b\s*[:=]\s*["']?[^"'\s,;}]+/gi;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"'<>]+/g;
const POSIX_PATH_PATTERN = /(?:^|\s)\/(?:Users|home|var|tmp|etc)\/[^\s"'<>]+/g;

export function sanitizeStrategyProposalBenchmarkText(value: string): string {
  return value
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, '[redacted-sensitive]')
    .replace(URL_PATTERN, '[redacted-url]')
    .replace(WINDOWS_PATH_PATTERN, '[redacted-path]')
    .replace(POSIX_PATH_PATTERN, ' [redacted-path]')
    .slice(0, 160);
}

function resolveSelection(options: StrategyProposalBenchmarkRunOptions): StrategyProposalProviderSelection {
  if (options.providerMode) {
    return { mode: options.providerMode, selectedBy: 'config' };
  }
  return { mode: 'stub', selectedBy: 'default' };
}

function summarizeCandidates(
  candidates: StrategyProposalCandidate[],
): StrategyProposalBenchmarkCandidateSummary[] {
  return candidates.map((candidate) => ({
    title: sanitizeStrategyProposalBenchmarkText(candidate.title),
    strategy_type: candidate.strategy_type,
    confidence: candidate.confidence,
    pine_feasibility: candidate.pine_feasibility,
    backtest_caution_count: candidate.backtest_cautions.length,
  }));
}

function buildResult(params: {
  scenarioId: string;
  observation: StrategyProposalProviderObservation;
  candidates?: StrategyProposalCandidate[];
  errorCode?: string;
}): StrategyProposalBenchmarkResult {
  return {
    scenario_id: params.scenarioId,
    provider_name: params.observation.provider_name,
    selected_by: params.observation.selected_by,
    status: params.observation.status,
    latency_bucket: params.observation.latency_bucket,
    candidate_count: params.observation.candidate_count,
    invalid_reason: params.observation.invalid_reason,
    validation_error_count: params.observation.validation_error_count,
    fallback_used: params.observation.fallback_used,
    fallback_reason: params.observation.fallback_reason,
    schema_valid: params.observation.schema_valid,
    model_category: params.observation.model_category,
    candidates: summarizeCandidates(params.candidates ?? []),
    error_code: params.errorCode ? sanitizeStrategyProposalBenchmarkText(params.errorCode) : null,
  };
}

export async function runStrategyProposalBenchmarkScenario(
  scenario: StrategyProposalBenchmarkScenario,
  options: StrategyProposalBenchmarkRunOptions = {},
): Promise<StrategyProposalBenchmarkResult> {
  const startedAtMs = Date.now();
  const selection = resolveSelection(options);
  const input = toStrategyProposalBenchmarkRequest(scenario);

  try {
    const provider = createStrategyProposalProvider(selection.mode);
    const generated = await provider.generate(input);
    const data: StrategyProposalData = validateStrategyProposalData({
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      input,
      provider: generated.provider,
      candidates: generated.candidates,
      disclaimer: generated.disclaimer,
      provider_observation: buildStrategyProposalObservation({
        startedAtMs,
        selection,
        provider: generated.provider,
        status: 'succeeded',
        candidateCount: generated.candidates.length,
        schemaValid: true,
      }),
    });

    return buildResult({
      scenarioId: scenario.id,
      observation: data.provider_observation!,
      candidates: data.candidates,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === 'PROVIDER_INVALID_RESPONSE') {
      const invalidReason = classifyStrategyProposalInvalidReason(error);
      return buildResult({
        scenarioId: scenario.id,
        observation: buildStrategyProposalObservation({
          startedAtMs,
          selection,
          status: statusForInvalidReason(invalidReason),
          candidateCount: 0,
          invalidReason,
          validationErrorCount: 1,
          schemaValid: false,
        }),
        errorCode: error.code,
      });
    }
    if (error instanceof AppError) {
      return buildResult({
        scenarioId: scenario.id,
        observation: buildStrategyProposalObservation({
          startedAtMs,
          selection,
          status: 'validation_failed',
          candidateCount: 0,
          invalidReason: 'unknown',
          validationErrorCount: 1,
          schemaValid: false,
        }),
        errorCode: error.code,
      });
    }
    return buildResult({
      scenarioId: scenario.id,
      observation: buildStrategyProposalObservation({
        startedAtMs,
        selection,
        status: 'provider_error',
        candidateCount: 0,
        invalidReason: 'unknown',
        validationErrorCount: 1,
        schemaValid: false,
      }),
      errorCode: 'PROVIDER_ERROR',
    });
  }
}
