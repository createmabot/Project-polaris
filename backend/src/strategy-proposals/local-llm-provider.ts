import { AppError } from '../utils/response';
import type {
  StrategyProposalCandidate,
  StrategyProposalProvider,
  StrategyProposalRequest,
  StrategyProposalProviderObservation,
} from './types';
import { getStrategyProposalLocalLlmGuardConfig } from './guards';
import { validateStrategyProposalCandidate } from './validation';
import { getStrategyProposalTimeframeProfile } from '../strategy/timeframe';

type LocalLlmResponse = {
  message?: { content?: string };
  choices?: Array<{ message?: { content?: string } }>;
};

type LocalLlmProviderOptions = {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
};

const DEFAULT_ENDPOINT = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen3-30b-a3b-2507';
const DEFAULT_DISCLAIMER =
  '検証候補の提案です。投資助言ではありません。Pine生成とbacktest、ユーザー確認を前提にしてください。';
const ARRAY_FIELDS = [
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

const REQUIRED_CANDIDATE_FIELDS = [
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
  'confidence',
  'uncertainty',
  'suggested_natural_language_spec',
  'suggested_pine_constraints',
] as const;

const LOCAL_LLM_RESPONSE_FORMAT = {
  type: 'object',
  additionalProperties: false,
  required: ['schema_name', 'schema_version', 'input', 'candidates', 'disclaimer'],
  properties: {
    schema_name: { const: 'strategy_proposal_candidates' },
    schema_version: { const: '1.0' },
    input: { type: 'object' },
    disclaimer: { type: 'string' },
    candidates: {
      type: 'array',
      minItems: 0,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'candidate_id',
          ...REQUIRED_CANDIDATE_FIELDS,
          'research_basis',
        ],
        properties: {
          candidate_id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          market_assumption: { type: 'string' },
          timeframe_assumption: { type: 'string' },
          strategy_type: {
            type: 'string',
            enum: ['trend_following', 'mean_reversion', 'breakout', 'momentum', 'volatility', 'risk_management', 'other'],
          },
          entry_logic: { type: 'array', minItems: 1, items: { type: 'string' } },
          exit_logic: { type: 'array', minItems: 1, items: { type: 'string' } },
          risk_management: { type: 'array', minItems: 1, items: { type: 'string' } },
          invalidation_conditions: { type: 'array', minItems: 1, items: { type: 'string' } },
          expected_strengths: { type: 'array', minItems: 1, items: { type: 'string' } },
          expected_weaknesses: { type: 'array', minItems: 1, items: { type: 'string' } },
          required_indicators: { type: 'array', minItems: 1, items: { type: 'string' } },
          pine_feasibility: { type: 'string', enum: ['high', 'medium', 'low'] },
          backtest_cautions: { type: 'array', minItems: 1, items: { type: 'string' } },
          research_basis: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['source_type', 'label', 'url'],
              properties: {
                source_type: { type: 'string', enum: ['internal', 'user_input', 'provider_knowledge'] },
                label: { type: 'string' },
                url: { type: ['string', 'null'] },
              },
            },
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          uncertainty: { type: 'array', minItems: 1, items: { type: 'string' } },
          suggested_natural_language_spec: { type: 'string', minLength: 20 },
          suggested_pine_constraints: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
      },
    },
  },
};

const FIELD_ALIASES: Record<string, string[]> = {
  candidate_id: ['id', 'candidateId'],
  title: ['name', 'strategy_name', 'strategyName'],
  summary: ['description', 'overview'],
  market_assumption: ['market', 'marketAssumption'],
  timeframe_assumption: ['timeframe', 'timeframeAssumption'],
  strategy_type: ['type', 'strategyType', 'category'],
  entry_logic: ['entry', 'entries', 'entry_rules', 'entry_conditions', 'entryLogic'],
  exit_logic: ['exit', 'exits', 'exit_rules', 'exit_conditions', 'exitLogic'],
  risk_management: ['risk', 'risk_rules', 'risk_controls', 'riskManagement'],
  invalidation_conditions: ['invalidation_condition', 'invalidation', 'invalidations', 'invalidationConditions'],
  expected_strengths: ['strengths', 'expected_strength', 'pros', 'advantages', 'expectedStrengths'],
  expected_weaknesses: ['weaknesses', 'expected_weakness', 'cons', 'risks', 'expectedWeaknesses'],
  required_indicators: ['indicators', 'indicator_requirements', 'required_indicator', 'requiredIndicators'],
  pine_feasibility: ['feasibility', 'pineFeasibility', 'tradingview_feasibility', 'tradingViewFeasibility'],
  backtest_cautions: ['cautions', 'backtest_caution', 'backtest_notes', 'backtestCautions'],
  confidence: ['confidence_level', 'confidenceLevel'],
  uncertainty: ['uncertainties', 'uncertainty_notes', 'limitations'],
  suggested_pine_constraints: ['pine_constraints', 'pineConstraints', 'constraints'],
  suggested_natural_language_spec: ['natural_language_spec', 'suggested_rule', 'rule_description', 'suggestedNaturalLanguageSpec'],
};

const CANDIDATE_WRAPPER_FIELDS = ['candidate', 'proposal', 'strategy', 'strategy_proposal', 'strategyProposal'] as const;

const SAFE_ARRAY_FALLBACKS: Partial<Record<typeof ARRAY_FIELDS[number], string[]>> = {
  backtest_cautions: ['十分な期間と複数条件でbacktestして確認する。'],
  uncertainty: ['市場環境や銘柄特性により有効性が変わる可能性がある。'],
  suggested_pine_constraints: ['Pine生成前にユーザーが条件を確認する。'],
};

type MissingFieldDiagnostics = {
  missing_required_fields: string[];
  missing_required_field_count: number;
  affected_candidate_count: number;
};

type NormalizedPayloadResult = {
  data: Record<string, unknown>;
  fallbackFieldCount: number;
};

type LocalLlmFailureReason = StrategyProposalProviderObservation['invalid_reason'];

function providerFailure(reason: LocalLlmFailureReason = 'unknown', details: Record<string, unknown> = {}): AppError {
  return new AppError(
    502,
    'PROVIDER_INVALID_RESPONSE',
    'Strategy proposal provider failed to return usable candidates. Please try again later.',
    { provider_failure_reason: reason, ...details },
  );
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeStrategyType(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = normalizeToken(value);
  const aliases: Record<string, StrategyProposalCandidate['strategy_type']> = {
    trend: 'trend_following',
    trend_follow: 'trend_following',
    trend_following: 'trend_following',
    mean_reversion: 'mean_reversion',
    reversion: 'mean_reversion',
    breakout: 'breakout',
    momentum: 'momentum',
    volatility: 'volatility',
    risk: 'risk_management',
    risk_management: 'risk_management',
    other: 'other',
  };
  return aliases[normalized] ?? normalized;
}

function normalizeThreeLevel(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = normalizeToken(value);
  if (normalized === 'moderate' || normalized === 'normal') {
    return 'medium';
  }
  return normalized;
}

function normalizeSourceType(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return normalizeToken(value);
}

function normalizeStringArray(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return value;
}

function normalizeResearchBasis(value: unknown): unknown {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      {
        source_type: 'provider_knowledge',
        label: 'local llm generated candidate',
        url: null,
      },
    ];
  }
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return item;
    }
    const record = item as Record<string, unknown>;
    return {
      ...record,
      source_type: normalizeSourceType(record.source_type),
      url: typeof record.url === 'string' ? record.url : null,
    };
  });
}

function hasUsableValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasUsableValue(item));
  }
  return value !== undefined && value !== null;
}

function hasRequiredScalar(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function candidateShapeScore(candidate: Record<string, unknown>): number {
  let score = 0;
  for (const field of REQUIRED_CANDIDATE_FIELDS) {
    if (hasUsableValue(candidate[field])) {
      score += 1;
      continue;
    }
    if (FIELD_ALIASES[field]?.some((alias) => hasUsableValue(candidate[alias]))) {
      score += 1;
    }
  }
  return score;
}

function unwrapCandidateRecord(candidate: Record<string, unknown>): Record<string, unknown> {
  const baseScore = candidateShapeScore(candidate);
  let bestCandidate = candidate;
  let bestScore = baseScore;
  for (const wrapperField of CANDIDATE_WRAPPER_FIELDS) {
    const wrapped = candidate[wrapperField];
    if (!wrapped || typeof wrapped !== 'object' || Array.isArray(wrapped)) {
      continue;
    }
    const wrappedRecord = wrapped as Record<string, unknown>;
    const wrappedScore = candidateShapeScore(wrappedRecord);
    if (wrappedScore > bestScore) {
      bestCandidate = { ...candidate, ...wrappedRecord };
      bestScore = wrappedScore;
    }
  }
  return bestCandidate;
}

function applyFieldAliases(candidate: Record<string, unknown>): number {
  let aliasCount = 0;
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (hasUsableValue(candidate[canonical])) {
      continue;
    }
    const alias = aliases.find((field) => hasUsableValue(candidate[field]));
    if (alias) {
      candidate[canonical] = candidate[alias];
      aliasCount += 1;
    }
  }
  return aliasCount;
}

function applySafeFallbacks(candidate: Record<string, unknown>): number {
  let fallbackCount = 0;
  for (const [field, fallback] of Object.entries(SAFE_ARRAY_FALLBACKS)) {
    if (!hasUsableValue(candidate[field])) {
      candidate[field] = fallback;
      fallbackCount += 1;
    }
  }
  return fallbackCount;
}

function normalizeCandidate(value: unknown, input: StrategyProposalRequest, index: number): { candidate: unknown; fallbackFieldCount: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { candidate: value, fallbackFieldCount: 0 };
  }
  const candidate = { ...unwrapCandidateRecord(value as Record<string, unknown>) };
  applyFieldAliases(candidate);
  candidate.candidate_id = typeof candidate.candidate_id === 'string' && candidate.candidate_id.trim()
    ? candidate.candidate_id
    : `candidate-${index + 1}`;
  candidate.market_assumption = typeof candidate.market_assumption === 'string' && candidate.market_assumption.trim()
    ? candidate.market_assumption
    : input.market;
  candidate.timeframe_assumption = typeof candidate.timeframe_assumption === 'string' && candidate.timeframe_assumption.trim()
    ? candidate.timeframe_assumption
    : input.timeframe;
  if (!candidate.invalidation_conditions && candidate.invalidation_condition) {
    candidate.invalidation_conditions = candidate.invalidation_condition;
  }
  const fallbackFieldCount = applySafeFallbacks(candidate);
  candidate.strategy_type = normalizeStrategyType(candidate.strategy_type);
  candidate.pine_feasibility = normalizeThreeLevel(candidate.pine_feasibility);
  candidate.confidence = normalizeThreeLevel(candidate.confidence);
  for (const field of ARRAY_FIELDS) {
    candidate[field] = normalizeStringArray(candidate[field]);
  }
  candidate.research_basis = normalizeResearchBasis(candidate.research_basis);
  return { candidate, fallbackFieldCount };
}

function normalizePayload(value: unknown, input: StrategyProposalRequest): NormalizedPayloadResult {
  if (Array.isArray(value)) {
    let fallbackFieldCount = 0;
    const candidates = value.map((candidate, index) => {
      const normalized = normalizeCandidate(candidate, input, index);
      fallbackFieldCount += normalized.fallbackFieldCount;
      return normalized.candidate;
    });
    return {
      data: {
        schema_name: 'strategy_proposal_candidates',
        schema_version: '1.0',
        input,
        candidates,
        disclaimer: DEFAULT_DISCLAIMER,
      },
      fallbackFieldCount,
    };
  }
  if (!value || typeof value !== 'object') {
    throw providerFailure('schema_invalid');
  }
  const data = { ...(value as Record<string, unknown>) };
  data.schema_name = data.schema_name ?? 'strategy_proposal_candidates';
  data.schema_version = data.schema_version ?? '1.0';
  data.input = data.input ?? input;
  data.disclaimer = typeof data.disclaimer === 'string' && data.disclaimer.trim()
    ? data.disclaimer
    : DEFAULT_DISCLAIMER;
  if (Array.isArray(data.candidates)) {
    let fallbackFieldCount = 0;
    data.candidates = data.candidates.map((candidate, index) => {
      const normalized = normalizeCandidate(candidate, input, index);
      fallbackFieldCount += normalized.fallbackFieldCount;
      return normalized.candidate;
    });
    return { data, fallbackFieldCount };
  }
  return { data, fallbackFieldCount: 0 };
}

function extractJsonValues(value: string): string[] {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const text = fenced ? fenced[1].trim() : trimmed;
  const candidates: string[] = [];

  for (let start = 0; start < text.length; start += 1) {
    const openChar = text[start];
    if (openChar !== '{' && openChar !== '[') {
      continue;
    }
    const closeStack: string[] = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = inString;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (char === '{') {
        closeStack.push('}');
        continue;
      }
      if (char === '[') {
        closeStack.push(']');
        continue;
      }
      if (char === '}' || char === ']') {
        if (closeStack.at(-1) !== char) {
          break;
        }
        closeStack.pop();
        if (closeStack.length === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return candidates;
}

function normalizeCandidateInput(value: unknown, input: StrategyProposalRequest): StrategyProposalCandidate[] {
  const { data: normalized } = normalizePayload(value, input);
  if (!normalized || typeof normalized !== 'object') {
    throw providerFailure('schema_invalid');
  }
  const data = normalized;
  if (data.schema_name !== 'strategy_proposal_candidates' || data.schema_version !== '1.0') {
    throw providerFailure('schema_invalid');
  }
  if (!Array.isArray(data.candidates)) {
    throw providerFailure('schema_invalid');
  }
  return data.candidates as StrategyProposalCandidate[];
}

function collectMissingRequiredFields(candidates: unknown[]): MissingFieldDiagnostics | null {
  const missing = new Set<string>();
  let affectedCandidateCount = 0;

  candidates.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      for (const field of REQUIRED_CANDIDATE_FIELDS) {
        missing.add(field);
      }
      affectedCandidateCount += 1;
      return;
    }
    const record = candidate as Record<string, unknown>;
    const candidateMissing = REQUIRED_CANDIDATE_FIELDS.filter((field) => {
      const value = record[field];
      if (ARRAY_FIELDS.includes(field as typeof ARRAY_FIELDS[number])) {
        return !Array.isArray(value) || value.filter((item) => typeof item === 'string' && item.trim()).length === 0;
      }
      if (field === 'suggested_natural_language_spec') {
        return typeof value !== 'string' || value.trim().length < 20;
      }
      return !hasRequiredScalar(value);
    });
    if (candidateMissing.length > 0) {
      affectedCandidateCount += 1;
      for (const field of candidateMissing) {
        missing.add(field);
      }
    }
  });

  if (missing.size === 0) {
    return null;
  }
  return {
    missing_required_fields: Array.from(missing).sort(),
    missing_required_field_count: missing.size,
    affected_candidate_count: affectedCandidateCount,
  };
}

function classifyValidationFailure(error: AppError): LocalLlmFailureReason {
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
  if (
    message.includes('schema metadata') ||
    message.includes('provider metadata') ||
    message.includes('candidates must be an array')
  ) {
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

function sanitizeFailureDetails(details: Record<string, unknown>): Partial<StrategyProposalProviderObservation> {
  const fields = Array.isArray(details.missing_required_fields)
    ? details.missing_required_fields
      .filter((field) => typeof field === 'string' && /^[a-z0-9_]+$/i.test(field))
      .slice(0, 24)
    : [];
  return {
    ...(fields.length > 0 ? { missing_required_fields: fields } : {}),
    ...(typeof details.missing_required_field_count === 'number'
      ? { missing_required_field_count: details.missing_required_field_count }
      : {}),
    ...(typeof details.affected_candidate_count === 'number'
      ? { affected_candidate_count: details.affected_candidate_count }
      : {}),
    ...(typeof details.retry_used === 'boolean' ? { retry_used: details.retry_used } : {}),
    ...(typeof details.retry_reason === 'string' || details.retry_reason === null
      ? { retry_reason: details.retry_reason as string | null }
      : {}),
    ...(typeof details.retry_succeeded === 'boolean' ? { retry_succeeded: details.retry_succeeded } : {}),
    ...(typeof details.normalization_fallback_used === 'boolean'
      ? { normalization_fallback_used: details.normalization_fallback_used }
      : {}),
    ...(typeof details.fallback_field_count === 'number' ? { fallback_field_count: details.fallback_field_count } : {}),
  };
}

export class LocalLlmStrategyProposalProvider implements StrategyProposalProvider {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxOutputChars: number;

  constructor(options: LocalLlmProviderOptions = {}) {
    const guardConfig = getStrategyProposalLocalLlmGuardConfig();
    this.endpoint = (
      options.endpoint ??
      process.env.STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT ??
      process.env.LOCAL_LLM_ENDPOINT ??
      DEFAULT_ENDPOINT
    ).replace(/\/$/, '');
    this.model =
      options.model ??
      process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MODEL ??
      process.env.PRIMARY_LOCAL_MODEL ??
      DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? guardConfig.timeoutMs;
    this.maxOutputChars = options.maxOutputChars ?? guardConfig.maxOutputChars;
  }

  async generate(input: StrategyProposalRequest) {
    try {
      return await this.generateOnce(input);
    } catch (error) {
      if (!(error instanceof AppError) || error.details?.provider_failure_reason !== 'required_field_missing') {
        throw error;
      }
      const retryDetails = sanitizeFailureDetails(error.details ?? {});
      try {
        const retryResult = await this.generateOnce(input, {
          missing_required_fields: retryDetails.missing_required_fields ?? [],
          affected_candidate_count: retryDetails.affected_candidate_count ?? 0,
        });
        return {
          ...retryResult,
          provider_observation: {
            ...(retryResult.provider_observation ?? {}),
            retry_used: true,
            retry_reason: 'required_field_missing',
            retry_succeeded: true,
          },
        };
      } catch (retryError) {
        if (retryError instanceof AppError && retryError.code === 'PROVIDER_INVALID_RESPONSE') {
          throw providerFailure((retryError.details?.provider_failure_reason as LocalLlmFailureReason) ?? 'unknown', {
            ...sanitizeFailureDetails(retryError.details ?? {}),
            retry_used: true,
            retry_reason: 'required_field_missing',
            retry_succeeded: false,
          });
        }
        throw retryError;
      }
    }
  }

  private async generateOnce(input: StrategyProposalRequest, retryContext?: {
    missing_required_fields: string[];
    affected_candidate_count: number;
  }) {
    const rawText = await this.callLocalLlm(input, retryContext);
    const parsed = this.parseJson(rawText);
    const { data: normalized, fallbackFieldCount } = normalizePayload(parsed, input);
    const candidates = normalizeCandidateInput(normalized, input);
    if (candidates.length > input.proposal_count || candidates.length > 10) {
      throw providerFailure('candidate_count_invalid');
    }
    const missingDiagnostics = collectMissingRequiredFields(candidates);
    if (missingDiagnostics) {
      throw providerFailure('required_field_missing', missingDiagnostics);
    }
    try {
      candidates.forEach((candidate) => validateStrategyProposalCandidate(candidate));
    } catch (error) {
      if (error instanceof AppError) {
        throw providerFailure(classifyValidationFailure(error), {
          ...(classifyValidationFailure(error) === 'required_field_missing'
            ? collectMissingRequiredFields(candidates) ?? {}
            : {}),
        });
      }
      throw error;
    }
    return {
      provider: {
        name: 'local_llm',
        mode: 'local',
        web_search: false,
        persisted: false,
      },
      provider_observation: fallbackFieldCount > 0
        ? {
          normalization_fallback_used: true,
          fallback_field_count: fallbackFieldCount,
        }
        : undefined,
      candidates,
      disclaimer:
        typeof normalized.disclaimer === 'string'
          ? String(normalized.disclaimer)
          : DEFAULT_DISCLAIMER,
    };
  }

  private async callLocalLlm(input: StrategyProposalRequest, retryContext?: {
    missing_required_fields: string[];
    affected_candidate_count: number;
  }): Promise<string> {
    const timeframeProfile = getStrategyProposalTimeframeProfile(input.timeframe);
    let response: Response;
    try {
      response = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: [
                'You generate temporary strategy verification candidates for StrategyLab.',
                'Return one JSON object only. Do not include markdown fences, comments, headings, or explanations.',
                'Use English schema keys exactly as requested.',
                'Write all user-facing string values in Japanese, including title, summary, assumptions, logic arrays, cautions, uncertainty, disclaimer, suggested_natural_language_spec, and suggested_pine_constraints.',
                'Only schema keys, enum values, and source_type values must remain in English.',
                'The root object must include schema_name="strategy_proposal_candidates", schema_version="1.0", input, candidates, and disclaimer.',
                'Every candidate must include exactly these required keys: candidate_id, title, summary, market_assumption, timeframe_assumption, strategy_type, entry_logic, exit_logic, risk_management, invalidation_conditions, expected_strengths, expected_weaknesses, required_indicators, pine_feasibility, backtest_cautions, research_basis, confidence, uncertainty, suggested_natural_language_spec, suggested_pine_constraints.',
                'Do not omit any key even if uncertain. Do not use singular aliases or camelCase aliases.',
                'All array fields must be non-empty arrays of strings, not a single string. If uncertain, put a cautious manual-review item in the array.',
                'expected_strengths, expected_weaknesses, required_indicators, backtest_cautions, uncertainty, and suggested_pine_constraints must each contain at least one item.',
                'strategy_type must be one of trend_following, mean_reversion, breakout, momentum, volatility, risk_management, other.',
                'pine_feasibility and confidence must be one of high, medium, low.',
                'research_basis.source_type must be one of internal, user_input, provider_knowledge. Do not use web because Web search is disabled.',
                'Do not claim web research, cite URLs, or rely on current news.',
                'Make suggested_natural_language_spec a concrete Japanese rule description long enough for manual Pine generation.',
                'Reflect input.timeframe in every candidate. D should focus on swing, trend following, breakout, lower trade frequency, volume, moving average, RSI, sample period, earnings/events, and gaps. 4H should focus on short swing, momentum, pullback, breakout confirmation, more noise and false breakouts than daily, overnight/session gap, liquidity, and shorter invalidation. 1H should focus on intraday, short-term momentum, mean reversion, volatility breakout, whipsaw, transaction cost, slippage, overtrading, tighter stops, and shorter holding assumptions.',
                'Treat proposals as verification candidates, not investment advice.',
                'Do not guarantee profit or present the candidates as buy/sell recommendations.',
              ].join(' '),
            },
            {
              role: 'user',
              content: JSON.stringify({
                input,
                timeframe_guidance: {
                  label: timeframeProfile.label,
                  focus: timeframeProfile.focus,
                  assumption: timeframeProfile.assumption,
                  caution: timeframeProfile.caution,
                },
                output_schema: {
                  schema_name: 'strategy_proposal_candidates',
                  schema_version: '1.0',
                  candidates: [
                    {
                      candidate_id: '<stable string>',
                      title: '<string>',
                      summary: '<string>',
                      market_assumption: input.market,
                      timeframe_assumption: input.timeframe,
                      strategy_type:
                        'trend_following|mean_reversion|breakout|momentum|volatility|risk_management|other',
                      entry_logic: ['<string>'],
                      exit_logic: ['<string>'],
                      risk_management: ['<string>'],
                      invalidation_conditions: ['<string>'],
                      expected_strengths: ['<string>'],
                      expected_weaknesses: ['<string>'],
                      required_indicators: ['<string>'],
                      pine_feasibility: 'high|medium|low',
                      backtest_cautions: ['<string>'],
                      research_basis: [{ source_type: 'internal|user_input|provider_knowledge', label: '<string>', url: null }],
                      confidence: 'high|medium|low',
                      uncertainty: ['<string>'],
                      suggested_natural_language_spec: '<string>',
                      suggested_pine_constraints: ['<string>'],
                    },
                  ],
                  disclaimer: '<string>',
                },
              }),
            },
            ...(retryContext
              ? [{
                role: 'user',
                content: JSON.stringify({
                  retry_instruction:
                    'The previous provider output omitted required fields. Regenerate the full JSON from scratch. Do not patch or reference the previous output.',
                  missing_required_fields: retryContext.missing_required_fields,
                  affected_candidate_count: retryContext.affected_candidate_count,
                  required_behavior: [
                    'Include every required candidate key.',
                    'Use non-empty arrays of strings for every array field.',
                    'Do not include markdown fences or explanations.',
                  ],
                }),
              }]
              : []),
          ],
          stream: false,
          think: false,
          format: LOCAL_LLM_RESPONSE_FORMAT,
          options: {
            temperature: 0.2,
            num_predict: Math.max(256, Math.ceil(this.maxOutputChars / 4)),
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name.toLowerCase() : '';
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const reason = name.includes('timeout') || name.includes('abort') || message.includes('timeout')
        ? 'timeout'
        : 'provider_unavailable';
      throw providerFailure(reason);
    }

    if (!response.ok) {
      throw providerFailure('provider_unavailable');
    }

    try {
      const data = (await response.json()) as LocalLlmResponse;
      const content = data.message?.content ?? data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0 || content.length > this.maxOutputChars) {
        throw providerFailure('schema_invalid');
      }
      return content;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw providerFailure('schema_invalid');
    }
  }

  private parseJson(rawText: string): unknown {
    try {
      let parsedInvalidSchema = false;
      for (const candidate of extractJsonValues(rawText)) {
        try {
          const parsed = JSON.parse(candidate);
          if (!parsed || typeof parsed !== 'object') {
            parsedInvalidSchema = true;
            continue;
          }
          if (Array.isArray(parsed)) {
            if (parsed.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
              return parsed;
            }
            parsedInvalidSchema = true;
            continue;
          }
          if (
            Array.isArray((parsed as Record<string, unknown>).candidates) ||
            (parsed as Record<string, unknown>).schema_name === 'strategy_proposal_candidates'
          ) {
            return parsed;
          }
          parsedInvalidSchema = true;
        } catch (error) {
          if (error instanceof AppError) {
            throw error;
          }
        }
      }
      if (parsedInvalidSchema) {
        throw providerFailure('schema_invalid');
      }
      throw providerFailure('malformed_json');
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw providerFailure('malformed_json');
    }
  }
}
