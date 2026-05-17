export const STRATEGY_TYPES = [
  'trend_following',
  'mean_reversion',
  'breakout',
  'momentum',
  'volatility',
  'risk_management',
  'other',
] as const;

export const RISK_PREFERENCES = ['conservative', 'balanced', 'aggressive'] as const;
export const STRATEGY_TYPE_BIASES = ['any', ...STRATEGY_TYPES] as const;
export const PINE_FEASIBILITY_VALUES = ['high', 'medium', 'low'] as const;
export const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
export const RESEARCH_SOURCE_TYPES = ['internal', 'user_input', 'web', 'provider_knowledge'] as const;

export type StrategyType = typeof STRATEGY_TYPES[number];
export type StrategyTypeBias = typeof STRATEGY_TYPE_BIASES[number];
export type RiskPreference = typeof RISK_PREFERENCES[number];
export type PineFeasibility = typeof PINE_FEASIBILITY_VALUES[number];
export type Confidence = typeof CONFIDENCE_VALUES[number];
export type ResearchSourceType = typeof RESEARCH_SOURCE_TYPES[number];

export type StrategyProposalRequest = {
  market: string;
  timeframe: string;
  symbol_code: string | null;
  risk_preference: RiskPreference;
  strategy_type_bias: StrategyTypeBias;
  proposal_count: number;
  user_hint: string | null;
};

export type StrategyProposalProviderMetadata = {
  name: string;
  mode: string;
  web_search: boolean;
  persisted: boolean;
};

export type StrategyProposalProviderObservation = {
  provider_name: string;
  selected_by: 'default' | 'env' | 'config';
  elapsed_ms: number;
  latency_bucket: 'fast' | 'acceptable' | 'slow' | 'timeout';
  status:
    | 'succeeded'
    | 'validation_failed'
    | 'provider_unavailable'
    | 'timeout'
    | 'invalid_response'
    | 'provider_error';
  candidate_count: number;
  invalid_reason:
    | 'none'
    | 'schema_invalid'
    | 'malformed_json'
    | 'required_field_missing'
    | 'enum_invalid'
    | 'candidate_count_invalid'
    | 'web_research_basis_disabled'
    | 'provider_unavailable'
    | 'timeout'
    | 'unknown';
  validation_error_count: number;
  missing_required_fields?: string[];
  missing_required_field_count?: number;
  affected_candidate_count?: number;
  retry_used?: boolean;
  retry_reason?: string | null;
  retry_succeeded?: boolean;
  normalization_fallback_used?: boolean;
  fallback_field_count?: number;
  fallback_used: boolean;
  fallback_reason: string | null;
  schema_valid: boolean;
  model_category: 'configured' | 'default' | 'unknown';
};

export type StrategyProposalResearchBasis = {
  source_type: ResearchSourceType;
  label: string;
  url: string | null;
};

export type StrategyProposalCandidate = {
  candidate_id: string;
  title: string;
  summary: string;
  market_assumption: string;
  timeframe_assumption: string;
  strategy_type: StrategyType;
  entry_logic: string[];
  exit_logic: string[];
  risk_management: string[];
  invalidation_conditions: string[];
  expected_strengths: string[];
  expected_weaknesses: string[];
  required_indicators: string[];
  pine_feasibility: PineFeasibility;
  backtest_cautions: string[];
  research_basis: StrategyProposalResearchBasis[];
  confidence: Confidence;
  uncertainty: string[];
  suggested_natural_language_spec: string;
  suggested_pine_constraints: string[];
};

export type StrategyProposalData = {
  schema_name: 'strategy_proposal_candidates';
  schema_version: '1.0';
  input: StrategyProposalRequest;
  provider: StrategyProposalProviderMetadata;
  provider_observation?: StrategyProposalProviderObservation;
  candidates: StrategyProposalCandidate[];
  disclaimer: string;
};

export interface StrategyProposalProvider {
  generate(input: StrategyProposalRequest): Promise<{
    provider: StrategyProposalProviderMetadata;
    provider_observation?: Partial<StrategyProposalProviderObservation>;
    candidates: StrategyProposalCandidate[];
    disclaimer: string;
  }>;
}
