import { AppError } from '../utils/response';
import {
  CONFIDENCE_VALUES,
  PINE_FEASIBILITY_VALUES,
  RESEARCH_SOURCE_TYPES,
  RISK_PREFERENCES,
  STRATEGY_TYPE_BIASES,
  STRATEGY_TYPES,
  StrategyProposalCandidate,
  StrategyProposalData,
  StrategyProposalRequest,
} from './types';

type ProposalBody = {
  market?: unknown;
  timeframe?: unknown;
  symbol_code?: unknown;
  risk_preference?: unknown;
  strategy_type_bias?: unknown;
  proposal_count?: unknown;
  user_hint?: unknown;
};

type ValidationOptions = {
  allowWebResearchBasis?: boolean;
};

function readOptionalText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function readNullableText(value: unknown, maxLength = 1000): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readProposalCount(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return 5;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    throw new AppError(400, 'VALIDATION_ERROR', 'proposal_count must be an integer between 1 and 10.');
  }
  return parsed;
}

function normalizeMarket(value: unknown): string {
  const market = readOptionalText(value, 'JP_STOCK').toUpperCase();
  if (market.length > 40) {
    throw new AppError(400, 'VALIDATION_ERROR', 'market must be 40 characters or fewer.');
  }
  return market;
}

function normalizeTimeframe(value: unknown): string {
  const timeframe = readOptionalText(value, 'D').toUpperCase();
  if (timeframe.length > 20) {
    throw new AppError(400, 'VALIDATION_ERROR', 'timeframe must be 20 characters or fewer.');
  }
  return timeframe;
}

function normalizeRiskPreference(value: unknown): StrategyProposalRequest['risk_preference'] {
  const candidate = readOptionalText(value, 'balanced');
  if (!RISK_PREFERENCES.includes(candidate as StrategyProposalRequest['risk_preference'])) {
    throw new AppError(400, 'VALIDATION_ERROR', 'risk_preference must be one of: conservative, balanced, aggressive.');
  }
  return candidate as StrategyProposalRequest['risk_preference'];
}

function normalizeStrategyTypeBias(value: unknown): StrategyProposalRequest['strategy_type_bias'] {
  const candidate = readOptionalText(value, 'any');
  if (!STRATEGY_TYPE_BIASES.includes(candidate as StrategyProposalRequest['strategy_type_bias'])) {
    throw new AppError(400, 'VALIDATION_ERROR', 'strategy_type_bias must be one of: any, trend_following, mean_reversion, breakout, momentum, volatility, risk_management, other.');
  }
  return candidate as StrategyProposalRequest['strategy_type_bias'];
}

export function parseStrategyProposalRequest(body: ProposalBody = {}): StrategyProposalRequest {
  const userHint = readNullableText(body.user_hint, 1000);
  return {
    market: normalizeMarket(body.market),
    timeframe: normalizeTimeframe(body.timeframe),
    symbol_code: readNullableText(body.symbol_code),
    risk_preference: normalizeRiskPreference(body.risk_preference),
    strategy_type_bias: normalizeStrategyTypeBias(body.strategy_type_bias),
    proposal_count: readProposalCount(body.proposal_count),
    user_hint: userHint,
  };
}

function requireText(value: unknown, field: string, maxLength = 400): string {
  if (typeof value !== 'string') {
    throw invalidProviderOutput(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw invalidProviderOutput(`${field} must not be empty.`);
  }
  if (trimmed.length > maxLength) {
    throw invalidProviderOutput(`${field} is too long.`);
  }
  return trimmed;
}

function normalizeTextArray(value: unknown, field: string, maxItems = 8, maxItemLength = 240): string[] {
  if (!Array.isArray(value)) {
    throw invalidProviderOutput(`${field} must be an array.`);
  }
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxItemLength));
  if (normalized.length === 0) {
    throw invalidProviderOutput(`${field} must contain at least one item.`);
  }
  return normalized;
}

function invalidProviderOutput(message: string): AppError {
  return new AppError(502, 'PROVIDER_INVALID_RESPONSE', `Strategy proposal provider returned invalid output. ${message}`);
}

export function validateStrategyProposalCandidate(
  value: unknown,
  options: ValidationOptions = {},
): StrategyProposalCandidate {
  if (!value || typeof value !== 'object') {
    throw invalidProviderOutput('candidate must be an object.');
  }
  const candidate = value as Record<string, unknown>;
  const strategyType = requireText(candidate.strategy_type, 'strategy_type');
  if (!STRATEGY_TYPES.includes(strategyType as StrategyProposalCandidate['strategy_type'])) {
    throw invalidProviderOutput('strategy_type is unsupported.');
  }
  const pineFeasibility = requireText(candidate.pine_feasibility, 'pine_feasibility');
  if (!PINE_FEASIBILITY_VALUES.includes(pineFeasibility as StrategyProposalCandidate['pine_feasibility'])) {
    throw invalidProviderOutput('pine_feasibility is unsupported.');
  }
  const confidence = requireText(candidate.confidence, 'confidence');
  if (!CONFIDENCE_VALUES.includes(confidence as StrategyProposalCandidate['confidence'])) {
    throw invalidProviderOutput('confidence is unsupported.');
  }

  const title = requireText(candidate.title, 'title', 120);
  const summary = requireText(candidate.summary, 'summary', 500);
  const suggestedSpec = requireText(candidate.suggested_natural_language_spec, 'suggested_natural_language_spec', 4000);
  if (suggestedSpec.length < 20) {
    throw invalidProviderOutput('suggested_natural_language_spec is too short.');
  }

  const researchBasis = Array.isArray(candidate.research_basis) ? candidate.research_basis : [];
  const normalizedResearchBasis = researchBasis.slice(0, 5).map((basis, index) => {
    if (!basis || typeof basis !== 'object') {
      throw invalidProviderOutput(`research_basis[${index}] must be an object.`);
    }
    const item = basis as Record<string, unknown>;
    const sourceType = requireText(item.source_type, `research_basis[${index}].source_type`);
    if (!RESEARCH_SOURCE_TYPES.includes(sourceType as StrategyProposalCandidate['research_basis'][number]['source_type'])) {
      throw invalidProviderOutput(`research_basis[${index}].source_type is unsupported.`);
    }
    if (sourceType === 'web' && options.allowWebResearchBasis !== true) {
      throw invalidProviderOutput('web research basis is not enabled.');
    }
    return {
      source_type: sourceType as StrategyProposalCandidate['research_basis'][number]['source_type'],
      label: requireText(item.label, `research_basis[${index}].label`, 160),
      url: typeof item.url === 'string' && options.allowWebResearchBasis === true ? item.url.slice(0, 500) : null,
    };
  });

  return {
    candidate_id: requireText(candidate.candidate_id, 'candidate_id', 80),
    title,
    summary,
    market_assumption: requireText(candidate.market_assumption, 'market_assumption', 80),
    timeframe_assumption: requireText(candidate.timeframe_assumption, 'timeframe_assumption', 40),
    strategy_type: strategyType as StrategyProposalCandidate['strategy_type'],
    entry_logic: normalizeTextArray(candidate.entry_logic, 'entry_logic'),
    exit_logic: normalizeTextArray(candidate.exit_logic, 'exit_logic'),
    risk_management: normalizeTextArray(candidate.risk_management, 'risk_management'),
    invalidation_conditions: normalizeTextArray(candidate.invalidation_conditions, 'invalidation_conditions'),
    expected_strengths: normalizeTextArray(candidate.expected_strengths, 'expected_strengths'),
    expected_weaknesses: normalizeTextArray(candidate.expected_weaknesses, 'expected_weaknesses'),
    required_indicators: normalizeTextArray(candidate.required_indicators, 'required_indicators'),
    pine_feasibility: pineFeasibility as StrategyProposalCandidate['pine_feasibility'],
    backtest_cautions: normalizeTextArray(candidate.backtest_cautions, 'backtest_cautions'),
    research_basis: normalizedResearchBasis,
    confidence: confidence as StrategyProposalCandidate['confidence'],
    uncertainty: normalizeTextArray(candidate.uncertainty, 'uncertainty'),
    suggested_natural_language_spec: suggestedSpec,
    suggested_pine_constraints: normalizeTextArray(candidate.suggested_pine_constraints, 'suggested_pine_constraints'),
  };
}

export function validateStrategyProposalData(
  data: StrategyProposalData,
  options: ValidationOptions = {},
): StrategyProposalData {
  if (data.schema_name !== 'strategy_proposal_candidates' || data.schema_version !== '1.0') {
    throw invalidProviderOutput('schema metadata is unsupported.');
  }
  if (!data.provider || typeof data.provider.name !== 'string' || typeof data.provider.mode !== 'string') {
    throw invalidProviderOutput('provider metadata is invalid.');
  }
  if (!Array.isArray(data.candidates)) {
    throw invalidProviderOutput('candidates must be an array.');
  }
  if (data.candidates.length > data.input.proposal_count || data.candidates.length > 10) {
    throw invalidProviderOutput('candidate count exceeds request limit.');
  }
  return {
    ...data,
    candidates: data.candidates.map((candidate) => validateStrategyProposalCandidate(candidate, options)),
    disclaimer: requireText(data.disclaimer, 'disclaimer', 500),
  };
}
