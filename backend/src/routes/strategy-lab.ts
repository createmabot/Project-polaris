import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { createStrategyProposalProvider, getStrategyProposalProviderSelection } from '../strategy-proposals/provider';
import {
  checkStrategyProposalRateLimit,
  getStrategyProposalRateLimitConfig,
  resolveStrategyProposalRateLimitKey,
  type StrategyProposalRateLimitMode,
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

type CodexCliImportBody = {
  source?: unknown;
  result_json_text?: unknown;
  file_name?: unknown;
};

type ProposalHistoryQuery = {
  limit?: string;
  page?: string;
  q?: string;
  provider?: string;
  provider_name?: string;
  status?: string;
  selected?: string;
  market?: string;
  timeframe?: string;
  sort?: string;
  order?: string;
};

const CODEX_CLI_MANUAL_PROVIDER = {
  name: 'codex_cli_manual',
  mode: 'manual_import',
  web_search: false,
  persisted: true,
};

const CODEX_CLI_IMPORT_MAX_CHARS = 120_000;
const CODEX_CLI_IMPORT_DISCLAIMER = 'This is a verification candidate, not investment advice.';
const CODEX_CLI_REQUIRED_SCALAR_FIELDS = [
  'candidate_id',
  'title',
  'summary',
  'market_assumption',
  'timeframe_assumption',
  'strategy_type',
  'pine_feasibility',
  'confidence',
] as const;
const CODEX_CLI_REQUIRED_ARRAY_FIELDS = [
  'entry_logic',
  'exit_logic',
  'risk_management',
  'invalidation_conditions',
  'expected_strengths',
  'expected_weaknesses',
  'required_indicators',
  'backtest_cautions',
  'uncertainty',
  'suggested_pine_constraints',
] as const;

function parsePositiveInteger(value: unknown, fieldName: string, defaultValue: number, maxValue: number): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = typeof value === 'string' ? Number(value) : defaultValue;
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a positive integer.`);
  }
  if (parsed > maxValue) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be ${maxValue} or less.`);
  }
  return parsed;
}

function parseProposalHistoryLimit(value: unknown): number {
  return parsePositiveInteger(value, 'limit', 20, 50);
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

function sanitizeProposalRunInput(input: unknown) {
  const data = readRecord(input);
  const userHint = typeof data.user_hint === 'string' ? data.user_hint : null;
  return {
    market: typeof data.market === 'string' ? data.market : 'JP_STOCK',
    timeframe: typeof data.timeframe === 'string' ? data.timeframe : 'D',
    symbol_code: typeof data.symbol_code === 'string' ? data.symbol_code : null,
    risk_preference: typeof data.risk_preference === 'string' ? data.risk_preference : 'balanced',
    strategy_type_bias: typeof data.strategy_type_bias === 'string' ? data.strategy_type_bias : 'any',
    proposal_count: readSafeNumber(data.proposal_count) ?? 5,
    user_hint: null,
    user_hint_present: Boolean(userHint?.trim()),
    user_hint_length: userHint?.length ?? 0,
  };
}

function serializeRun(row: any) {
  return {
    id: row.id,
    status: row.status,
    provider_name: row.providerName,
    provider_mode: row.providerMode,
    selected_by: row.selectedBy,
    input: sanitizeProposalRunInput(row.inputJson),
    provider_observation: row.providerObservationJson,
    candidate_count: row.candidateCount,
    selected_candidate_id: row.selectedCandidateId ?? null,
    completed_at: row.completedAt?.toISOString?.() ?? row.completedAt ?? null,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function readSafeFilterToken(value: unknown, fieldName: string): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (!/^[a-z0-9_.:-]+$/i.test(trimmed) || trimmed.length > 80) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is invalid.`);
  }
  return trimmed;
}

function parseProposalHistorySelected(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '' || value === 'all') {
    return null;
  }
  if (value === 'true' || value === 'selected') {
    return true;
  }
  if (value === 'false' || value === 'unselected') {
    return false;
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'selected must be true or false.');
}

function parseProposalHistorySearch(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'q must be a string.');
  }
  const trimmed = value.trim();
  if (trimmed.length > 200) {
    throw new AppError(400, 'VALIDATION_ERROR', 'q must be 200 characters or less.');
  }
  return trimmed;
}

function parseProposalHistoryQuery(query: ProposalHistoryQuery) {
  const limit = parseProposalHistoryLimit(query.limit);
  const page = parsePositiveInteger(query.page, 'page', 1, 10_000);
  const sort = query.sort ?? 'created_at';
  if (sort !== 'created_at') {
    throw new AppError(400, 'VALIDATION_ERROR', 'sort must be created_at.');
  }
  const order = query.order ?? 'desc';
  if (order !== 'asc' && order !== 'desc') {
    throw new AppError(400, 'VALIDATION_ERROR', 'order must be asc or desc.');
  }
  const providerName = readSafeFilterToken(query.provider_name ?? query.provider, 'provider_name');
  const status = readSafeFilterToken(query.status, 'status');
  if (status && status !== 'succeeded' && status !== 'failed') {
    throw new AppError(400, 'VALIDATION_ERROR', 'status must be succeeded or failed.');
  }
  return {
    page,
    limit,
    q: parseProposalHistorySearch(query.q),
    providerName,
    status,
    selected: parseProposalHistorySelected(query.selected),
    market: readSafeFilterToken(query.market, 'market'),
    timeframe: readSafeFilterToken(query.timeframe, 'timeframe'),
    sort,
    order,
  };
}

function readSearchText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function strategyProposalRunMatchesQuery(row: any, query: ReturnType<typeof parseProposalHistoryQuery>): boolean {
  const input = readRecord(row.inputJson);
  if (query.providerName && row.providerName !== query.providerName) {
    return false;
  }
  if (query.status && row.status !== query.status) {
    return false;
  }
  if (query.selected !== null && Boolean(row.selectedCandidateId) !== query.selected) {
    return false;
  }
  if (query.market && input.market !== query.market) {
    return false;
  }
  if (query.timeframe && input.timeframe !== query.timeframe) {
    return false;
  }
  if (!query.q) {
    return true;
  }

  const needle = query.q.toLowerCase();
  const runSearchFields = [
    row.id,
    row.providerName,
    row.providerMode,
    row.selectedBy,
    input.market,
    input.timeframe,
    input.symbol_code,
    input.risk_preference,
    input.strategy_type_bias,
  ].map(readSearchText);
  const candidateSearchFields = (row.candidates ?? []).flatMap((candidate: any) => {
    const candidateJson = readRecord(candidate.candidateJson);
    return [
      candidate.providerCandidateId,
      candidateJson.candidate_id,
      candidateJson.title,
      candidateJson.summary,
      candidateJson.strategy_type,
      candidateJson.suggested_natural_language_spec,
    ].map(readSearchText);
  });
  return [...runSearchFields, ...candidateSearchFields].some((value) => value.toLowerCase().includes(needle));
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

function readCodexCliImportSource(value: unknown): 'paste' | 'file' {
  if (value === undefined || value === null || value === '') {
    return 'paste';
  }
  if (value === 'paste' || value === 'file') {
    return value;
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'Codex CLI import source must be paste or file.', {
    invalid_reason: 'schema_invalid',
  });
}

function readCodexCliImportText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Codex CLI import JSON text is required.', {
      invalid_reason: 'required_field_missing',
    });
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Codex CLI import JSON text is required.', {
      invalid_reason: 'required_field_missing',
    });
  }
  if (trimmed.length > CODEX_CLI_IMPORT_MAX_CHARS) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Codex CLI import JSON is too large.', {
      invalid_reason: 'candidate_count_invalid',
      max_chars: CODEX_CLI_IMPORT_MAX_CHARS,
    });
  }
  return trimmed;
}

function parseCodexCliImportJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Codex CLI import JSON is malformed.', {
      invalid_reason: 'malformed_json',
    });
  }
}

function hasRequiredString(value: unknown, minLength = 1): boolean {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function hasRequiredStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim().length > 0);
}

function collectCodexCliMissingRequiredFields(candidates: unknown): string[] {
  if (!Array.isArray(candidates)) {
    return [];
  }
  const missingFields = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue;
    }
    const record = candidate as Record<string, unknown>;
    for (const field of CODEX_CLI_REQUIRED_SCALAR_FIELDS) {
      if (!hasRequiredString(record[field])) {
        missingFields.add(field);
      }
    }
    for (const field of CODEX_CLI_REQUIRED_ARRAY_FIELDS) {
      if (!hasRequiredStringArray(record[field])) {
        missingFields.add(field);
      }
    }
    if (!hasRequiredString(record.suggested_natural_language_spec, 20)) {
      missingFields.add('suggested_natural_language_spec');
    }
    if (!Array.isArray(record.research_basis) || record.research_basis.length === 0) {
      missingFields.add('research_basis');
    }
  }
  return Array.from(missingFields).sort().slice(0, 24);
}

function toCodexCliImportValidationError(error: AppError, candidates: unknown): AppError {
  const invalidReason = classifyStrategyProposalInvalidReason(error);
  const missingFields = Array.isArray(error.details?.missing_required_fields)
    ? error.details.missing_required_fields
    : collectCodexCliMissingRequiredFields(candidates);
  return new AppError(400, 'VALIDATION_ERROR', 'Codex CLI import JSON did not match the strategy proposal schema.', {
    invalid_reason: invalidReason,
    missing_required_fields: missingFields.length > 0 ? missingFields : undefined,
    missing_required_field_count:
      typeof error.details?.missing_required_field_count === 'number'
        ? error.details.missing_required_field_count
        : missingFields.length || undefined,
    affected_candidate_count:
      typeof error.details?.affected_candidate_count === 'number'
        ? error.details.affected_candidate_count
        : Array.isArray(candidates) && missingFields.length > 0 ? candidates.length : undefined,
  });
}

function buildCodexCliPrompt(input: StrategyProposalRequest): string {
  const exampleInput = JSON.stringify(input, null, 2);
  return [
    'Return only one JSON object. Do not include markdown fences or explanatory text outside JSON.',
    'The JSON must use schema_name "strategy_proposal_candidates" and schema_version "1.0".',
    'Use the fixed English schema keys exactly. Japanese prose is allowed only in values.',
    `Create ${input.proposal_count} strategy proposal candidates. The maximum candidate count is 10.`,
    'This is not investment advice. Each candidate must be a verification idea that requires backtesting and user review.',
    'Do not claim guaranteed profit. Do not automatically create Pine code, save a strategy, run backtests, or trigger AI summaries.',
    'Every candidate must include these required keys:',
    [
      'candidate_id',
      'title',
      'summary',
      'market_assumption',
      'timeframe_assumption',
      'strategy_type',
      'entry_logic',
      'exit_logic',
      'risk_management',
      'invalidation_conditions',
      'expected_strengths',
      'expected_weaknesses',
      'required_indicators',
      'pine_feasibility',
      'backtest_cautions',
      'research_basis',
      'confidence',
      'uncertainty',
      'suggested_natural_language_spec',
      'suggested_pine_constraints',
    ].join(', '),
    'Array fields must be non-empty arrays of strings.',
    'strategy_type must be one of: trend_following, mean_reversion, breakout, momentum, volatility, risk_management, other.',
    'pine_feasibility and confidence must be one of: high, medium, low.',
    'research_basis[].source_type must be one of: internal, user_input, provider_knowledge. Do not use web.',
    'Use this input object exactly as the JSON input field:',
    exampleInput,
    'Required root shape:',
    JSON.stringify({
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      input,
      candidates: [
        {
          candidate_id: 'candidate-1',
          title: '日本語の候補タイトル',
          summary: '日本語の要約',
          market_assumption: 'JP_STOCK',
          timeframe_assumption: 'D',
          strategy_type: 'trend_following',
          entry_logic: ['日本語のエントリー条件'],
          exit_logic: ['日本語の終了条件'],
          risk_management: ['日本語のリスク管理'],
          invalidation_conditions: ['日本語の無効化条件'],
          expected_strengths: ['日本語の強み'],
          expected_weaknesses: ['日本語の弱み'],
          required_indicators: ['SMA'],
          pine_feasibility: 'medium',
          backtest_cautions: ['日本語のバックテスト注意点'],
          research_basis: [
            {
              source_type: 'provider_knowledge',
              label: 'Codex CLI manual generated candidate',
              url: null,
            },
          ],
          confidence: 'medium',
          uncertainty: ['日本語の不確実性'],
          suggested_natural_language_spec: '日本語で20文字以上のStrategyLab用自然言語ルール。',
          suggested_pine_constraints: ['日本語のPine生成制約'],
        },
      ],
      disclaimer: CODEX_CLI_IMPORT_DISCLAIMER,
    }, null, 2),
  ].join('\n\n');
}

function buildCodexCliManualObservation(params: {
  startedAtMs: number;
  candidateCount: number;
}): StrategyProposalProviderObservation {
  const elapsedMs = Math.max(0, Date.now() - params.startedAtMs);
  return {
    provider_name: CODEX_CLI_MANUAL_PROVIDER.name,
    selected_by: 'config',
    elapsed_ms: elapsedMs,
    latency_bucket: elapsedMs < 1_000 ? 'fast' : 'acceptable',
    status: 'succeeded',
    candidate_count: params.candidateCount,
    invalid_reason: 'none',
    validation_error_count: 0,
    fallback_used: false,
    fallback_reason: null,
    schema_valid: true,
    model_category: 'unknown',
    manual_import: true,
  };
}

function assertStrategyProposalRateLimit(
  request: FastifyRequest,
  providerMode: StrategyProposalRateLimitMode,
) {
  const rateLimitConfig = getStrategyProposalRateLimitConfig();
  const rateLimitKey = resolveStrategyProposalRateLimitKey({
    requestIp: request.ip,
    forwardedFor: request.headers['x-forwarded-for'],
    trustedForwardedIp: rateLimitConfig.trustForwardedIp,
  });
  const rateLimit = checkStrategyProposalRateLimit({
    key: rateLimitKey.key,
    providerMode,
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
        provider_mode: providerMode,
        rate_limit_key_source: rateLimitKey.source,
      },
    );
  }
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
      assertStrategyProposalRateLimit(request, selection.mode);
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

  fastify.post<{ Body: ProposalBody }>('/proposals/codex-cli/request', async (request, reply) => {
    const input = parseStrategyProposalRequest(request.body ?? {});
    return reply.status(200).send(formatSuccess(request, {
      provider_name: CODEX_CLI_MANUAL_PROVIDER.name,
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      proposal_count: input.proposal_count,
      prompt: buildCodexCliPrompt(input),
    }));
  });

  fastify.post<{ Body: CodexCliImportBody }>('/proposals/codex-cli/import', async (request, reply) => {
    const startedAtMs = Date.now();
    assertStrategyProposalRateLimit(request, CODEX_CLI_MANUAL_PROVIDER.mode as StrategyProposalRateLimitMode);
    readCodexCliImportSource(request.body?.source);
    const importText = readCodexCliImportText(request.body?.result_json_text);
    const parsed = parseCodexCliImportJson(importText);
    const root = readRecord(parsed);
    const input = parseStrategyProposalRequest(root.input ?? {});
    const candidateCount = Array.isArray(root.candidates) ? root.candidates.length : 0;
    const providerObservation = buildCodexCliManualObservation({ startedAtMs, candidateCount });

    let data: StrategyProposalData;
    try {
      data = validateStrategyProposalData({
        schema_name: root.schema_name,
        schema_version: root.schema_version,
        input,
        provider: CODEX_CLI_MANUAL_PROVIDER,
        provider_observation: providerObservation,
        candidates: root.candidates,
        disclaimer: typeof root.disclaimer === 'string' && root.disclaimer.trim()
          ? root.disclaimer.trim()
          : CODEX_CLI_IMPORT_DISCLAIMER,
      } as StrategyProposalData);
    } catch (error) {
      if (error instanceof AppError) {
        throw toCodexCliImportValidationError(error, root.candidates);
      }
      throw error;
    }

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
  });

  fastify.get<{ Querystring: ProposalHistoryQuery }>('/proposals', async (request, reply) => {
    const query = parseProposalHistoryQuery(request.query);
    const runs = await (prisma as any).strategyProposalRun.findMany({
      orderBy: { createdAt: query.order },
      include: { candidates: { orderBy: { rank: 'asc' } } },
    });
    const filteredRuns = runs.filter((run: any) => strategyProposalRunMatchesQuery(run, query));
    const offset = (query.page - 1) * query.limit;
    const paginatedRuns = filteredRuns.slice(offset, offset + query.limit);

    return reply.status(200).send(formatSuccess(request, {
      proposal_runs: paginatedRuns.map(serializeRun),
      limit: query.limit,
      filters: {
        provider_name: query.providerName,
        status: query.status,
        selected: query.selected,
        market: query.market,
        timeframe: query.timeframe,
        q_present: Boolean(query.q),
        sort: query.sort,
        order: query.order,
      },
      pagination: {
        page: query.page,
        limit: query.limit,
        total_count: filteredRuns.length,
        has_next: offset + query.limit < filteredRuns.length,
        has_previous: query.page > 1,
      },
      meta: {
        source: 'strategy_proposal_history',
        sanitized: true,
        raw_prompt_included: false,
        raw_response_included: false,
        candidate_free_text_included: false,
        user_hint_full_text_included: false,
      },
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
