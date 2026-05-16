import { AppError } from '../utils/response';
import {
  StrategyProposalCandidate,
  StrategyProposalProvider,
  StrategyProposalRequest,
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
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_CHARS = 12_000;

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function stripJsonFence(value: string): string {
  return value.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
}

function providerFailure(): AppError {
  return new AppError(
    502,
    'PROVIDER_INVALID_RESPONSE',
    'Strategy proposal provider failed to return usable candidates. Please try again later.',
  );
}

function normalizeCandidateInput(value: unknown): StrategyProposalCandidate[] {
  if (!value || typeof value !== 'object') {
    throw providerFailure();
  }
  const data = value as Record<string, unknown>;
  if (data.schema_name !== 'strategy_proposal_candidates' || data.schema_version !== '1.0') {
    throw providerFailure();
  }
  if (!Array.isArray(data.candidates)) {
    throw providerFailure();
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
    return {
      provider: {
        name: 'local_llm',
        mode: 'local',
        web_search: false,
        persisted: false,
      },
      candidates: normalizeCandidateInput(parsed),
      disclaimer:
        typeof (parsed as Record<string, unknown>).disclaimer === 'string'
          ? String((parsed as Record<string, unknown>).disclaimer)
          : '検証候補の提案です。投資助言ではありません。Pine生成とbacktest、ユーザー確認を前提にしてください。',
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
                'Return strict JSON only. Do not include markdown fences.',
                'The output must match schema_name=strategy_proposal_candidates and schema_version=1.0.',
                'Do not claim web research or cite URLs.',
                'Treat proposals as verification candidates, not investment advice.',
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
          options: {
            temperature: 0.2,
            num_predict: Math.max(256, Math.ceil(this.maxOutputChars / 4)),
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw providerFailure();
    }

    if (!response.ok) {
      throw providerFailure();
    }

    try {
      const data = (await response.json()) as LocalLlmResponse;
      const content = data.message?.content ?? data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0 || content.length > this.maxOutputChars) {
        throw providerFailure();
      }
      return content;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw providerFailure();
    }
  }

  private parseJson(rawText: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(stripJsonFence(rawText));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw providerFailure();
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw providerFailure();
    }
  }
}
