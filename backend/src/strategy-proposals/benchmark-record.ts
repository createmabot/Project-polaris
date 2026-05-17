import path from 'node:path';
import type {
  Confidence,
  PineFeasibility,
  StrategyType,
} from './types';
import type { StrategyProposalBenchmarkResult } from './benchmark';

type CountItem<T extends string> = {
  value: T;
  count: number;
};

export type StrategyProposalBenchmarkSummaryRecord = {
  schema_name: 'strategy_proposal_benchmark_summary_records';
  schema_version: '1.0';
  generated_at: string;
  record_kind: 'manual_optional_benchmark';
  source: {
    script: 'strategy-proposal:benchmark';
    required_check: false;
    provider_real_dependency: boolean;
  };
  records: Array<{
    run: {
      provider: string;
      provider_mode: string;
      provider_category: 'stub' | 'local_llm' | 'unknown';
      scenario_id: string;
      scenario_set_version: '1.0';
      candidate_count: number;
      status: StrategyProposalBenchmarkResult['status'];
      latency_bucket: StrategyProposalBenchmarkResult['latency_bucket'];
      elapsed_ms_bucket: string;
      schema_valid: boolean;
      invalid_reason: StrategyProposalBenchmarkResult['invalid_reason'];
      validation_error_count: number;
      fallback_used: boolean;
      fallback_reason: string | null;
    };
    candidate_summary: {
      strategy_type_counts: CountItem<StrategyType>[];
      confidence_counts: CountItem<Confidence>[];
      pine_feasibility_counts: CountItem<PineFeasibility>[];
      backtest_caution_count: number;
      uncertainty_count: number;
    };
    quality_notes: {
      manual_review_required: true;
      advice_like_wording_observed: boolean;
      unsupported_claim_risk: 'unknown';
      notes: string[];
    };
    safety: {
      sanitized: true;
      raw_prompt_included: false;
      raw_response_included: false;
      endpoint_included: false;
      model_value_included: false;
      secret_included: false;
      local_path_included: false;
      stack_trace_included: false;
      user_hint_full_text_included: false;
      candidate_free_text_included: false;
    };
  }>;
  meta: {
    actual_record_should_be_committed: false;
    raw_prompt_included: false;
    raw_response_included: false;
    endpoint_included: false;
    model_value_included: false;
    user_hint_full_text_included: false;
    candidate_free_text_included: false;
  };
};

export const STRATEGY_PROPOSAL_BENCHMARK_RECORD_OUTPUT_DIR = path.join(
  '.benchmark-records',
  'strategy-proposal',
);

function countBy<T extends string>(values: T[]): CountItem<T>[] {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => ({ value, count }));
}

function latencyToElapsedBucket(latencyBucket: StrategyProposalBenchmarkResult['latency_bucket']) {
  if (latencyBucket === 'fast') {
    return '0_1000';
  }
  if (latencyBucket === 'acceptable') {
    return '1000_5000';
  }
  if (latencyBucket === 'slow') {
    return '5000_plus';
  }
  return 'timeout';
}

function providerCategory(providerName: string): 'stub' | 'local_llm' | 'unknown' {
  if (providerName === 'stub' || providerName === 'local_llm') {
    return providerName;
  }
  return 'unknown';
}

export function buildStrategyProposalBenchmarkSummaryRecord(params: {
  generatedAt: string;
  results: StrategyProposalBenchmarkResult[];
}): StrategyProposalBenchmarkSummaryRecord {
  return {
    schema_name: 'strategy_proposal_benchmark_summary_records',
    schema_version: '1.0',
    generated_at: params.generatedAt,
    record_kind: 'manual_optional_benchmark',
    source: {
      script: 'strategy-proposal:benchmark',
      required_check: false,
      provider_real_dependency: params.results.some((result) => result.provider_name !== 'stub'),
    },
    records: params.results.map((result) => ({
      run: {
        provider: providerCategory(result.provider_name),
        provider_mode: result.provider_name === 'stub' ? 'deterministic' : 'configured',
        provider_category: providerCategory(result.provider_name),
        scenario_id: result.scenario_id,
        scenario_set_version: '1.0',
        candidate_count: result.candidate_count,
        status: result.status,
        latency_bucket: result.latency_bucket,
        elapsed_ms_bucket: latencyToElapsedBucket(result.latency_bucket),
        schema_valid: result.schema_valid,
        invalid_reason: result.invalid_reason,
        validation_error_count: result.validation_error_count,
        fallback_used: result.fallback_used,
        fallback_reason: result.fallback_reason,
      },
      candidate_summary: {
        strategy_type_counts: countBy(result.candidates.map((candidate) => candidate.strategy_type)),
        confidence_counts: countBy(result.candidates.map((candidate) => candidate.confidence)),
        pine_feasibility_counts: countBy(result.candidates.map((candidate) => candidate.pine_feasibility)),
        backtest_caution_count: result.candidates.reduce(
          (sum, candidate) => sum + candidate.backtest_caution_count,
          0,
        ),
        uncertainty_count: result.candidates.reduce(
          (sum, candidate) => sum + candidate.uncertainty_count,
          0,
        ),
      },
      quality_notes: {
        manual_review_required: true,
        advice_like_wording_observed: result.scenario_id === 'advice_like_wording',
        unsupported_claim_risk: 'unknown',
        notes: [],
      },
      safety: {
        sanitized: true,
        raw_prompt_included: false,
        raw_response_included: false,
        endpoint_included: false,
        model_value_included: false,
        secret_included: false,
        local_path_included: false,
        stack_trace_included: false,
        user_hint_full_text_included: false,
        candidate_free_text_included: false,
      },
    })),
    meta: {
      actual_record_should_be_committed: false,
      raw_prompt_included: false,
      raw_response_included: false,
      endpoint_included: false,
      model_value_included: false,
      user_hint_full_text_included: false,
      candidate_free_text_included: false,
    },
  };
}

export function resolveStrategyProposalBenchmarkOutputPath(outputArg: string, cwd = process.cwd()) {
  if (!outputArg.trim()) {
    throw new Error('output path must not be empty');
  }
  if (path.isAbsolute(outputArg)) {
    throw new Error('output path must be relative to the benchmark record directory');
  }
  const normalized = path.normalize(outputArg);
  if (normalized.includes(':')) {
    throw new Error('output path must not include a drive or scheme separator');
  }
  if (normalized.startsWith('..') || normalized.includes(`..${path.sep}`)) {
    throw new Error('output path must stay inside the benchmark record directory');
  }
  if (!normalized.endsWith('.json')) {
    throw new Error('output path must end with .json');
  }

  const root = path.resolve(cwd, STRATEGY_PROPOSAL_BENCHMARK_RECORD_OUTPUT_DIR);
  const resolved = path.resolve(root, normalized);
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
    throw new Error('output path must stay inside the benchmark record directory');
  }
  return resolved;
}
