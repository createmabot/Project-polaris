import { AppError } from '../utils/response';
import type {
  StrategyProposalCandidate,
  StrategyProposalProvider,
  StrategyProposalRequest,
  StrategyProposalProviderObservation,
} from './types';

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
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_OUTPUT_CHARS = 20_000;
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

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

type LocalLlmFailureReason = StrategyProposalProviderObservation['invalid_reason'];

function providerFailure(reason: LocalLlmFailureReason = 'unknown'): AppError {
  return new AppError(
    502,
    'PROVIDER_INVALID_RESPONSE',
    'Strategy proposal provider failed to return usable candidates. Please try again later.',
    { provider_failure_reason: reason },
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

function normalizeCandidate(value: unknown, input: StrategyProposalRequest, index: number): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const candidate = { ...(value as Record<string, unknown>) };
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
  candidate.strategy_type = normalizeStrategyType(candidate.strategy_type);
  candidate.pine_feasibility = normalizeThreeLevel(candidate.pine_feasibility);
  candidate.confidence = normalizeThreeLevel(candidate.confidence);
  for (const field of ARRAY_FIELDS) {
    candidate[field] = normalizeStringArray(candidate[field]);
  }
  candidate.research_basis = normalizeResearchBasis(candidate.research_basis);
  return candidate;
}

function normalizePayload(value: unknown, input: StrategyProposalRequest): Record<string, unknown> {
  if (Array.isArray(value)) {
    return {
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      input,
      candidates: value.map((candidate, index) => normalizeCandidate(candidate, input, index)),
      disclaimer: DEFAULT_DISCLAIMER,
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
    data.candidates = data.candidates.map((candidate, index) => normalizeCandidate(candidate, input, index));
  }
  return data;
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
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 0;
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
      if (char === openChar) {
        depth += 1;
        continue;
      }
      if (char === closeChar) {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return candidates;
}

function normalizeCandidateInput(value: unknown, input: StrategyProposalRequest): StrategyProposalCandidate[] {
  const normalized = normalizePayload(value, input);
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

export class LocalLlmStrategyProposalProvider implements StrategyProposalProvider {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxOutputChars: number;

  constructor(options: LocalLlmProviderOptions = {}) {
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
    this.timeoutMs =
      options.timeoutMs ??
      readPositiveInteger(process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    this.maxOutputChars =
      options.maxOutputChars ??
      readPositiveInteger(process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS, DEFAULT_MAX_OUTPUT_CHARS);
  }

  async generate(input: StrategyProposalRequest) {
    const rawText = await this.callLocalLlm(input);
    const parsed = this.parseJson(rawText);
    const normalized = normalizePayload(parsed, input);
    return {
      provider: {
        name: 'local_llm',
        mode: 'local',
        web_search: false,
        persisted: false,
      },
      candidates: normalizeCandidateInput(normalized, input),
      disclaimer:
        typeof normalized.disclaimer === 'string'
          ? String(normalized.disclaimer)
          : DEFAULT_DISCLAIMER,
    };
  }

  private async callLocalLlm(input: StrategyProposalRequest): Promise<string> {
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
                'Use English schema keys exactly as requested. Japanese text is allowed only inside string values.',
                'The root object must include schema_name="strategy_proposal_candidates", schema_version="1.0", input, candidates, and disclaimer.',
                'Each candidate must include every required field. Array fields must be arrays of strings, not a single string.',
                'strategy_type must be one of trend_following, mean_reversion, breakout, momentum, volatility, risk_management, other.',
                'pine_feasibility and confidence must be one of high, medium, low.',
                'research_basis.source_type must be one of internal, user_input, provider_knowledge. Do not use web because Web search is disabled.',
                'Do not claim web research, cite URLs, or rely on current news.',
                'Make suggested_natural_language_spec a concrete rule description long enough for manual Pine generation.',
                'Treat proposals as verification candidates, not investment advice.',
                'Do not guarantee profit or present the candidates as buy/sell recommendations.',
              ].join(' '),
            },
            {
              role: 'user',
              content: JSON.stringify({
                input,
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
          ],
          stream: false,
          think: false,
          format: 'json',
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
      for (const candidate of extractJsonValues(rawText)) {
        try {
          const parsed = JSON.parse(candidate);
          if (!parsed || typeof parsed !== 'object') {
            throw providerFailure('schema_invalid');
          }
          if (Array.isArray(parsed) && parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
            continue;
          }
          return parsed;
        } catch (error) {
          if (error instanceof AppError) {
            throw error;
          }
        }
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
