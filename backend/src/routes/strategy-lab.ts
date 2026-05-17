import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { createStrategyProposalProvider, getStrategyProposalProviderSelection } from '../strategy-proposals/provider';
import {
  checkStrategyProposalRateLimit,
  getStrategyProposalRateLimitConfig,
  resolveStrategyProposalRateLimitKey,
} from '../strategy-proposals/guards';
import {
  buildStrategyProposalObservation,
  classifyStrategyProposalInvalidReason,
  statusForInvalidReason,
} from '../strategy-proposals/instrumentation';
import {
  parseStrategyProposalRequest,
  validateStrategyProposalData,
} from '../strategy-proposals/validation';
import type {
  StrategyProposalCandidate,
  StrategyProposalData,
  StrategyProposalProviderObservation,
  StrategyProposalRequest,
} from '../strategy-proposals/types';

type ProposalBody = {
  market?: unknown;
  timeframe?: unknown;
  symbol_code?: unknown;
  risk_preference?: unknown;
  strategy_type_bias?: unknown;
  proposal_count?: unknown;
  user_hint?: unknown;
};

type ProposalSelectBody = {
  candidate_id?: unknown;
  proposal_candidate_id?: unknown;
};

function parseProposalHistoryLimit(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : 20;
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 20;
  }
  return Math.min(parsed, 50);
}

function parseProposalQualityTrendLimit(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : 100;
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 100;
  }
  return Math.min(parsed, 500);
}

function serializeCandidate(row: any) {
  return {
    id: row.id,
    proposal_run_id: row.proposalRunId,
    provider_candidate_id: row.providerCandidateId,
    rank: row.rank,
    candidate: row.candidateJson,
    selected_at: row.selectedAt?.toISOString?.() ?? row.selectedAt ?? null,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
  };
}

function serializeRun(row: any) {
  return {
    id: row.id,
    status: row.status,
    provider_name: row.providerName,
    provider_mode: row.providerMode,
    selected_by: row.selectedBy,
    input: row.inputJson,
    provider_observation: row.providerObservationJson,
    candidate_count: row.candidateCount,
    selected_candidate_id: row.selectedCandidateId ?? null,
    completed_at: row.completedAt?.toISOString?.() ?? row.completedAt ?? null,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function readSafeToken(value: unknown, fallback = 'unknown'): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return /^[a-z0-9_]+$/i.test(trimmed) && trimmed.length <= 80 ? trimmed : fallback;
}

function readSafeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function incrementCount(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

function countRecordsToArray(record: Record<string, number>) {
  return Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => ({ value, count }));
}

function calculateRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2));
}

function formatDateTimeForTrend(value: unknown): string | null {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function buildStrategyProposalQualityTrend(runs: any[], limit: number) {
  type ProviderBucket = {
    provider_name: string;
    run_count: number;
    succeeded_runs: number;
    failed_runs: number;
    selected_runs: number;
    zero_candidate_runs: number;
    candidate_counts: number[];
    elapsed_ms_values: number[];
    latency_bucket_counts: Record<string, number>;
    status_counts: Record<string, number>;
    invalid_reason_counts: Record<string, number>;
    selected_by_counts: Record<string, number>;
    provider_mode_counts: Record<string, number>;
  };

  const providers = new Map<string, ProviderBucket>();
  const marketBuckets = new Map<string, { market: string; run_count: number; succeeded_runs: number; candidate_counts: number[] }>();
  const strategyTypeBiasBuckets = new Map<string, { strategy_type_bias: string; run_count: number; succeeded_runs: number; candidate_counts: number[] }>();
  const strategyTypeCounts: Record<string, number> = {};
  const confidenceCounts: Record<string, number> = {};
  const pineFeasibilityCounts: Record<string, number> = {};
  const elapsedMsValues: number[] = [];
  const candidateCounts: number[] = [];
  const recentFailures: Array<{
    proposal_run_id: string;
    created_at: string | null;
    provider_name: string;
    status: string;
    invalid_reason: string;
    candidate_count: number;
    latency_bucket: string;
  }> = [];

  let succeededRuns = 0;
  let selectedRuns = 0;
  let zeroCandidateRuns = 0;

  for (const run of runs) {
    const observation = readRecord(run.providerObservationJson);
    const input = readRecord(run.inputJson);
    const providerName = readSafeToken(observation.provider_name, readSafeToken(run.providerName, 'unknown'));
    const providerMode = readSafeToken(run.providerMode, 'unknown');
    const selectedBy = readSafeToken(observation.selected_by, readSafeToken(run.selectedBy, 'unknown'));
    const observationStatus = readSafeToken(observation.status, run.status === 'succeeded' ? 'succeeded' : 'provider_error');
    const invalidReason = readSafeToken(observation.invalid_reason, 'unknown');
    const latencyBucket = readSafeToken(observation.latency_bucket, observationStatus === 'timeout' ? 'timeout' : 'unknown');
    const candidateCount = typeof run.candidateCount === 'number' ? run.candidateCount : 0;
    const elapsedMs = readSafeNumber(observation.elapsed_ms);
    const isSucceeded = observationStatus === 'succeeded' || run.status === 'succeeded';
    const isSelected = Boolean(run.selectedCandidateId);

    if (isSucceeded) {
      succeededRuns += 1;
    }
    if (isSelected) {
      selectedRuns += 1;
    }
    if (candidateCount === 0) {
      zeroCandidateRuns += 1;
    }
    candidateCounts.push(candidateCount);
    if (elapsedMs !== null) {
      elapsedMsValues.push(elapsedMs);
    }

    if (!providers.has(providerName)) {
      providers.set(providerName, {
        provider_name: providerName,
        run_count: 0,
        succeeded_runs: 0,
        failed_runs: 0,
        selected_runs: 0,
        zero_candidate_runs: 0,
        candidate_counts: [],
        elapsed_ms_values: [],
        latency_bucket_counts: {},
        status_counts: {},
        invalid_reason_counts: {},
        selected_by_counts: {},
        provider_mode_counts: {},
      });
    }
    const providerBucket = providers.get(providerName)!;
    providerBucket.run_count += 1;
    providerBucket.succeeded_runs += isSucceeded ? 1 : 0;
    providerBucket.failed_runs += isSucceeded ? 0 : 1;
    providerBucket.selected_runs += isSelected ? 1 : 0;
    providerBucket.zero_candidate_runs += candidateCount === 0 ? 1 : 0;
    providerBucket.candidate_counts.push(candidateCount);
    if (elapsedMs !== null) {
      providerBucket.elapsed_ms_values.push(elapsedMs);
    }
    incrementCount(providerBucket.latency_bucket_counts, latencyBucket);
    incrementCount(providerBucket.status_counts, observationStatus);
    incrementCount(providerBucket.invalid_reason_counts, invalidReason);
    incrementCount(providerBucket.selected_by_counts, selectedBy);
    incrementCount(providerBucket.provider_mode_counts, providerMode);

    const market = readSafeToken(input.market, 'unknown');
    if (!marketBuckets.has(market)) {
      marketBuckets.set(market, { market, run_count: 0, succeeded_runs: 0, candidate_counts: [] });
    }
    const marketBucket = marketBuckets.get(market)!;
    marketBucket.run_count += 1;
    marketBucket.succeeded_runs += isSucceeded ? 1 : 0;
    marketBucket.candidate_counts.push(candidateCount);

    const strategyTypeBias = readSafeToken(input.strategy_type_bias, 'unknown');
    if (!strategyTypeBiasBuckets.has(strategyTypeBias)) {
      strategyTypeBiasBuckets.set(strategyTypeBias, { strategy_type_bias: strategyTypeBias, run_count: 0, succeeded_runs: 0, candidate_counts: [] });
    }
    const strategyTypeBiasBucket = strategyTypeBiasBuckets.get(strategyTypeBias)!;
    strategyTypeBiasBucket.run_count += 1;
    strategyTypeBiasBucket.succeeded_runs += isSucceeded ? 1 : 0;
    strategyTypeBiasBucket.candidate_counts.push(candidateCount);

    const candidates = Array.isArray(run.candidates) ? run.candidates : [];
    for (const candidateRow of candidates) {
      const candidate = readRecord(candidateRow.candidateJson);
      incrementCount(strategyTypeCounts, readSafeToken(candidate.strategy_type, 'unknown'));
      incrementCount(confidenceCounts, readSafeToken(candidate.confidence, 'unknown'));
      incrementCount(pineFeasibilityCounts, readSafeToken(candidate.pine_feasibility, 'unknown'));
    }

    if (!isSucceeded && recentFailures.length < 5) {
      recentFailures.push({
        proposal_run_id: run.id,
        created_at: formatDateTimeForTrend(run.createdAt),
        provider_name: providerName,
        status: observationStatus,
        invalid_reason: invalidReason,
        candidate_count: candidateCount,
        latency_bucket: latencyBucket,
      });
    }
  }

  const totalRuns = runs.length;
  const failedRuns = totalRuns - succeededRuns;

  return {
    summary: {
      total_runs: totalRuns,
      succeeded_runs: succeededRuns,
      failed_runs: failedRuns,
      success_rate: calculateRate(succeededRuns, totalRuns),
      selected_runs: selectedRuns,
      selected_rate: calculateRate(selectedRuns, totalRuns),
      zero_candidate_runs: zeroCandidateRuns,
      avg_candidate_count: calculateAverage(candidateCounts),
      avg_elapsed_ms: calculateAverage(elapsedMsValues),
    },
    by_provider: Array.from(providers.values())
      .sort((left, right) => left.provider_name.localeCompare(right.provider_name))
      .map((provider) => ({
        provider_name: provider.provider_name,
        run_count: provider.run_count,
        succeeded_runs: provider.succeeded_runs,
        failed_runs: provider.failed_runs,
        success_rate: calculateRate(provider.succeeded_runs, provider.run_count),
        selected_runs: provider.selected_runs,
        selected_rate: calculateRate(provider.selected_runs, provider.run_count),
        zero_candidate_runs: provider.zero_candidate_runs,
        avg_candidate_count: calculateAverage(provider.candidate_counts),
        avg_elapsed_ms: calculateAverage(provider.elapsed_ms_values),
        latency_buckets: countRecordsToArray(provider.latency_bucket_counts),
        status_counts: countRecordsToArray(provider.status_counts),
        invalid_reason_counts: countRecordsToArray(provider.invalid_reason_counts),
        selected_by_counts: countRecordsToArray(provider.selected_by_counts),
        provider_mode_counts: countRecordsToArray(provider.provider_mode_counts),
      })),
    by_market: Array.from(marketBuckets.values())
      .sort((left, right) => left.market.localeCompare(right.market))
      .map((bucket) => ({
        market: bucket.market,
        run_count: bucket.run_count,
        success_rate: calculateRate(bucket.succeeded_runs, bucket.run_count),
        avg_candidate_count: calculateAverage(bucket.candidate_counts),
      })),
    by_strategy_type_bias: Array.from(strategyTypeBiasBuckets.values())
      .sort((left, right) => left.strategy_type_bias.localeCompare(right.strategy_type_bias))
      .map((bucket) => ({
        strategy_type_bias: bucket.strategy_type_bias,
        run_count: bucket.run_count,
        success_rate: calculateRate(bucket.succeeded_runs, bucket.run_count),
        avg_candidate_count: calculateAverage(bucket.candidate_counts),
      })),
    candidate_distribution: {
      strategy_type_counts: countRecordsToArray(strategyTypeCounts),
      confidence_counts: countRecordsToArray(confidenceCounts),
      pine_feasibility_counts: countRecordsToArray(pineFeasibilityCounts),
    },
    recent_failures: recentFailures,
    meta: {
      source: 'strategy_proposal_history',
      sanitized: true,
      raw_prompt_included: false,
      raw_response_included: false,
      limit,
    },
  };
}

async function createProposalRun(params: {
  input: StrategyProposalRequest;
  status: 'succeeded' | 'failed';
  providerName: string;
  providerMode: string;
  selectedBy: StrategyProposalProviderObservation['selected_by'];
  providerObservation: StrategyProposalProviderObservation;
  candidates: StrategyProposalCandidate[];
}) {
  return (prisma as any).$transaction(async (tx: any) => {
    const run = await tx.strategyProposalRun.create({
      data: {
        status: params.status,
        providerName: params.providerName,
        providerMode: params.providerMode,
        selectedBy: params.selectedBy,
        inputJson: params.input,
        userHint: params.input.user_hint,
        providerObservationJson: params.providerObservation,
        candidateCount: params.candidates.length,
        completedAt: new Date(),
      },
    });

    for (const [index, candidate] of params.candidates.entries()) {
      await tx.strategyProposalCandidate.create({
        data: {
          proposalRunId: run.id,
          providerCandidateId: candidate.candidate_id,
          rank: index + 1,
          candidateJson: candidate,
        },
      });
    }

    return run;
  });
}

function withProposalRunId(data: StrategyProposalData, proposalRunId: string): StrategyProposalData & {
  proposal_run_id: string;
  history: { proposal_run_id: string };
} {
  return {
    ...data,
    proposal_run_id: proposalRunId,
    history: {
      proposal_run_id: proposalRunId,
    },
  };
}

export const strategyLabRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ProposalBody }>('/proposals', async (request, reply) => {
    const startedAtMs = Date.now();
    const selection = getStrategyProposalProviderSelection();
    let input: StrategyProposalRequest | null = null;

    try {
      input = parseStrategyProposalRequest(request.body ?? {});
      const rateLimitConfig = getStrategyProposalRateLimitConfig();
      const rateLimitKey = resolveStrategyProposalRateLimitKey({
        requestIp: request.ip,
        forwardedFor: request.headers['x-forwarded-for'],
        trustedForwardedIp: rateLimitConfig.trustForwardedIp,
      });
      const rateLimit = checkStrategyProposalRateLimit({
        key: rateLimitKey.key,
        providerMode: selection.mode,
      });
      if (!rateLimit.allowed) {
        throw new AppError(
          429,
          'RATE_LIMITED',
          '短時間に候補取得が続いたため、少し時間をおいて再試行してください。',
          {
            rate_limited: true,
            retry_after_ms: rateLimit.retryAfterMs,
            limit: rateLimit.limit,
            window_ms: rateLimit.windowMs,
            provider_mode: selection.mode,
            rate_limit_key_source: rateLimitKey.source,
          },
        );
      }
      const provider = createStrategyProposalProvider(selection.mode);
      const generated = await provider.generate(input);
      const providerObservation = buildStrategyProposalObservation({
        startedAtMs,
        selection,
        provider: generated.provider,
        status: 'succeeded',
        candidateCount: generated.candidates.length,
        schemaValid: true,
        details: generated.provider_observation,
      });

      const data = validateStrategyProposalData({
        schema_name: 'strategy_proposal_candidates',
        schema_version: '1.0',
        input,
        provider: generated.provider,
        candidates: generated.candidates,
        disclaimer: generated.disclaimer,
        provider_observation: providerObservation,
      });
      const run = await createProposalRun({
        input,
        status: 'succeeded',
        providerName: data.provider.name,
        providerMode: data.provider.mode,
        selectedBy: providerObservation.selected_by,
        providerObservation,
        candidates: data.candidates,
      });

      return reply.status(200).send(formatSuccess(request, withProposalRunId(data, run.id)));
    } catch (error) {
      if (error instanceof AppError && error.code === 'PROVIDER_INVALID_RESPONSE') {
        const invalidReason = classifyStrategyProposalInvalidReason(error);
        const providerObservation = buildStrategyProposalObservation({
          startedAtMs,
          selection,
          status: statusForInvalidReason(invalidReason),
          candidateCount: 0,
          invalidReason,
          validationErrorCount:
            typeof error.details?.missing_required_field_count === 'number'
              ? error.details.missing_required_field_count
              : 1,
          schemaValid: false,
          details: error.details,
        });
        let proposalRunId: string | undefined;
        if (input) {
          const run = await createProposalRun({
            input,
            status: 'failed',
            providerName: providerObservation.provider_name,
            providerMode: selection.mode,
            selectedBy: providerObservation.selected_by,
            providerObservation,
            candidates: [],
          });
          proposalRunId = run.id;
        }
        throw new AppError(error.statusCode, error.code, error.message, {
          provider_observation: providerObservation,
          ...(proposalRunId ? { proposal_run_id: proposalRunId, history: { proposal_run_id: proposalRunId } } : {}),
        });
      }
      throw error;
    }
  });

  fastify.get<{ Querystring: { limit?: string } }>('/proposals', async (request, reply) => {
    const limit = parseProposalHistoryLimit(request.query.limit);
    const runs = await (prisma as any).strategyProposalRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return reply.status(200).send(formatSuccess(request, {
      proposal_runs: runs.map(serializeRun),
      limit,
    }));
  });

  fastify.get<{ Querystring: { limit?: string } }>('/proposals/provider-quality-trend', async (request, reply) => {
    const limit = parseProposalQualityTrendLimit(request.query.limit);
    const runs = await (prisma as any).strategyProposalRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { candidates: { orderBy: { rank: 'asc' } } },
    });

    return reply.status(200).send(formatSuccess(request, buildStrategyProposalQualityTrend(runs, limit)));
  });

  fastify.get<{ Params: { proposalRunId: string } }>('/proposals/:proposalRunId', async (request, reply) => {
    const run = await (prisma as any).strategyProposalRun.findUnique({
      where: { id: request.params.proposalRunId },
      include: { candidates: { orderBy: { rank: 'asc' } } },
    });
    if (!run) {
      throw new AppError(404, 'NOT_FOUND', 'Strategy proposal run was not found.');
    }

    return reply.status(200).send(formatSuccess(request, {
      proposal_run: serializeRun(run),
      candidates: run.candidates.map(serializeCandidate),
    }));
  });

  fastify.post<{ Params: { proposalRunId: string }; Body: ProposalSelectBody }>('/proposals/:proposalRunId/select', async (request, reply) => {
    const candidateId = typeof request.body?.candidate_id === 'string' ? request.body.candidate_id.trim() : '';
    const proposalCandidateId = typeof request.body?.proposal_candidate_id === 'string'
      ? request.body.proposal_candidate_id.trim()
      : '';
    if (!candidateId && !proposalCandidateId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'candidate_id or proposal_candidate_id is required.');
    }

    const run = await (prisma as any).strategyProposalRun.findUnique({
      where: { id: request.params.proposalRunId },
      include: { candidates: { orderBy: { rank: 'asc' } } },
    });
    if (!run) {
      throw new AppError(404, 'NOT_FOUND', 'Strategy proposal run was not found.');
    }
    const selected = run.candidates.find((candidate: any) => (
      candidate.id === (candidateId || proposalCandidateId) || (Boolean(candidateId) && candidate.providerCandidateId === candidateId)
    ));
    if (!selected) {
      throw new AppError(400, 'VALIDATION_ERROR', 'candidate_id or proposal_candidate_id must belong to the proposal run.');
    }

    const { updatedRun, selectedCandidate } = await (prisma as any).$transaction(async (tx: any) => {
      const selectedAt = new Date();
      await tx.strategyProposalCandidate.updateMany({
        where: { proposalRunId: run.id },
        data: { selectedAt: null },
      });
      const selectedCandidate = await tx.strategyProposalCandidate.update({
        where: { id: selected.id },
        data: { selectedAt },
      });
      const updatedRun = await tx.strategyProposalRun.update({
        where: { id: run.id },
        data: { selectedCandidateId: selected.id },
        include: { candidates: { orderBy: { rank: 'asc' } } },
      });
      return { updatedRun, selectedCandidate };
    });

    return reply.status(200).send(formatSuccess(request, {
      proposal_run: serializeRun(updatedRun),
      selected_candidate: serializeCandidate(selectedCandidate),
    }));
  });
};
