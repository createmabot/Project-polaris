import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  runStrategyProposalBenchmarkScenario,
  sanitizeStrategyProposalBenchmarkText,
} from '../src/strategy-proposals/benchmark';
import {
  buildStrategyProposalBenchmarkSummaryRecord,
  resolveStrategyProposalBenchmarkOutputPath,
} from '../src/strategy-proposals/benchmark-record';
import {
  STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS,
  toStrategyProposalBenchmarkRequest,
} from '../src/strategy-proposals/benchmark-scenarios';
import {
  parseStrategyProposalRequest,
  validateStrategyProposalCandidate,
  validateStrategyProposalData,
} from '../src/strategy-proposals/validation';
import { StrategyProposalCandidate, StrategyProposalData } from '../src/strategy-proposals/types';
import { AppError } from '../src/utils/response';

function validCandidate(overrides: Partial<StrategyProposalCandidate> = {}): StrategyProposalCandidate {
  return {
    candidate_id: 'candidate-1',
    title: '移動平均トレンドフォロー候補',
    summary: '中期移動平均と出来高で上昇トレンドを確認してから入る検証候補。',
    market_assumption: 'JP_STOCK',
    timeframe_assumption: 'D',
    strategy_type: 'trend_following',
    entry_logic: ['終値が25日移動平均を上回る'],
    exit_logic: ['終値が5日移動平均を下回る'],
    risk_management: ['1回の損失を限定する'],
    invalidation_conditions: ['レンジ相場でダマシが増える'],
    expected_strengths: ['Pineで表現しやすい'],
    expected_weaknesses: ['横ばい相場で損切りが増える'],
    required_indicators: ['SMA'],
    pine_feasibility: 'high',
    backtest_cautions: ['backtestで検証する'],
    research_basis: [
      {
        source_type: 'internal',
        label: 'deterministic strategy proposal stub',
        url: null,
      },
    ],
    confidence: 'medium',
    uncertainty: ['市場環境や銘柄固有材料は未評価です。'],
    suggested_natural_language_spec:
      'JP_STOCK / D を前提に、移動平均トレンドフォロー候補を検証します。エントリー条件と手仕舞い条件を明記します。',
    suggested_pine_constraints: ['long_only'],
    ...overrides,
  };
}

function validData(overrides: Partial<StrategyProposalData> = {}): StrategyProposalData {
  return {
    schema_name: 'strategy_proposal_candidates',
    schema_version: '1.0',
    input: {
      market: 'JP_STOCK',
      timeframe: 'D',
      symbol_code: null,
      risk_preference: 'balanced',
      strategy_type_bias: 'any',
      proposal_count: 5,
      user_hint: null,
    },
    provider: {
      name: 'stub',
      mode: 'deterministic',
      web_search: false,
      persisted: false,
    },
    candidates: [validCandidate()],
    disclaimer: '検証候補の提案です。投資助言ではありません。',
    ...overrides,
  };
}

describe('strategy proposal validation', () => {
  it('accepts a valid candidate', () => {
    expect(validateStrategyProposalCandidate(validCandidate()).strategy_type).toBe('trend_following');
  });

  it('accepts valid provider data with required fields, enums, and candidate count', () => {
    const data = validateStrategyProposalData(validData({
      input: {
        ...validData().input,
        proposal_count: 1,
      },
      candidates: [validCandidate({
        strategy_type: 'breakout',
        pine_feasibility: 'medium',
        confidence: 'low',
      })],
    }));

    expect(data.candidates).toHaveLength(1);
    expect(data.candidates[0].strategy_type).toBe('breakout');
    expect(data.candidates[0].pine_feasibility).toBe('medium');
    expect(data.candidates[0].confidence).toBe('low');
  });

  it('preserves optional provider observation metadata after structural validation', () => {
    const data = validateStrategyProposalData(validData({
      provider_observation: {
        provider_name: 'stub',
        selected_by: 'default',
        elapsed_ms: 20,
        latency_bucket: 'fast',
        status: 'succeeded',
        candidate_count: 1,
        invalid_reason: 'none',
        validation_error_count: 0,
        fallback_used: false,
        fallback_reason: null,
        schema_valid: true,
        model_category: 'unknown',
      },
    }));

    expect(data.provider_observation).toMatchObject({
      provider_name: 'stub',
      status: 'succeeded',
      candidate_count: 1,
      schema_valid: true,
    });
  });

  it('rejects provider data with too many candidates for the request', () => {
    expectProviderInvalidResponse(() => validateStrategyProposalData(validData({
      input: {
        ...validData().input,
        proposal_count: 1,
      },
      candidates: [
        validCandidate({ candidate_id: 'candidate-1' }),
        validCandidate({ candidate_id: 'candidate-2' }),
      ],
    })));
  });

  it('rejects missing required candidate fields', () => {
    const candidate = validCandidate() as Record<string, unknown>;
    delete candidate.entry_logic;

    expectProviderInvalidResponse(() => validateStrategyProposalCandidate(candidate));
  });

  it('rejects unsupported enum values', () => {
    expectProviderInvalidResponse(() => validateStrategyProposalCandidate({
      ...validCandidate(),
      strategy_type: 'scalping',
    }));
  });

  it('rejects schema metadata mismatch', () => {
    expectProviderInvalidResponse(() => validateStrategyProposalData({
      ...validData(),
      schema_name: 'unexpected_schema' as StrategyProposalData['schema_name'],
    }));
  });

  it('allows investment advice style wording while preserving structural validation', () => {
    const candidate = validateStrategyProposalCandidate(validCandidate({
      summary: 'この銘柄を買うべきで、必ず儲かる候補。',
    }));

    expect(candidate.summary).toBe('この銘柄を買うべきで、必ず儲かる候補。');
  });

  it('keeps empty candidate responses representable for existing UI empty states', () => {
    const data = validateStrategyProposalData(validData({
      candidates: [],
    }));

    expect(data.candidates).toHaveLength(0);
  });

  it('rejects web research basis while web search is disabled', () => {
    expectProviderInvalidResponse(() => validateStrategyProposalCandidate(validCandidate({
      research_basis: [
        {
          source_type: 'web',
          label: 'external citation',
          url: 'https://example.test/source',
        },
      ],
    })));
  });

  it('bounds long user hints during request parsing', () => {
    const parsed = parseStrategyProposalRequest({
      user_hint: 'x'.repeat(1500),
    });

    expect(parsed.user_hint).toHaveLength(1000);
  });

  it('canonicalizes strategy proposal timeframe aliases during request parsing', () => {
    expect(parseStrategyProposalRequest({ timeframe: '1D' }).timeframe).toBe('D');
    expect(parseStrategyProposalRequest({ timeframe: ' 4h ' }).timeframe).toBe('4H');
    expect(parseStrategyProposalRequest({ timeframe: ' 1h ' }).timeframe).toBe('1H');
  });

  it('canonicalizes candidate timeframe assumption aliases without loosening schema validation', () => {
    const candidate = validateStrategyProposalCandidate(validCandidate({
      timeframe_assumption: '1D',
    }));

    expect(candidate.timeframe_assumption).toBe('D');
  });

  it('allows investment advice style wording in user hints while bounding text', () => {
    const english = parseStrategyProposalRequest({
      user_hint: 'must buy this setup',
    });
    const japanese = parseStrategyProposalRequest({
      user_hint: 'この銘柄は買うべき',
    });

    expect(english.user_hint).toBe('must buy this setup');
    expect(japanese.user_hint).toBe('この銘柄は買うべき');
  });

  it('keeps benchmark scenarios aligned with the documented scenario set and valid request shape', () => {
    expect(STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'generic_default',
      'jp_stock_daily',
      'us_stock_daily',
      'short_swing',
      'long_trend_following',
      'mean_reversion',
      'breakout',
      'volatility',
      'conservative_risk',
      'aggressive_risk',
      'concrete_user_hint',
      'vague_user_hint',
      'long_user_hint',
      'advice_like_wording',
    ]);

    for (const scenario of STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS) {
      expect(toStrategyProposalBenchmarkRequest(scenario).proposal_count).toBeGreaterThanOrEqual(1);
      expect(toStrategyProposalBenchmarkRequest(scenario).proposal_count).toBeLessThanOrEqual(10);
    }
  });

  it('keeps advice-like benchmark wording as a valid stub benchmark scenario', async () => {
    const scenario = STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS.find((item) => item.id === 'advice_like_wording');
    expect(scenario).toBeDefined();

    const result = await runStrategyProposalBenchmarkScenario(scenario!, { providerMode: 'stub' });

    expect(result.status).toBe('succeeded');
    expect(result.schema_valid).toBe(true);
    expect(result.candidate_count).toBeGreaterThan(0);
  });

  it('uses stub for benchmark runs without options even when provider env requests local_llm', async () => {
    const previous = process.env.STRATEGY_PROPOSAL_PROVIDER;
    process.env.STRATEGY_PROPOSAL_PROVIDER = 'local_llm';
    try {
      const scenario = STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS.find((item) => item.id === 'generic_default');
      expect(scenario).toBeDefined();

      const result = await runStrategyProposalBenchmarkScenario(scenario!);

      expect(result.provider_name).toBe('stub');
      expect(result.selected_by).toBe('default');
      expect(result.status).toBe('succeeded');
    } finally {
      if (previous === undefined) {
        delete process.env.STRATEGY_PROPOSAL_PROVIDER;
      } else {
        process.env.STRATEGY_PROPOSAL_PROVIDER = previous;
      }
    }
  });

  it('sanitizes benchmark output summaries before printing provider-derived text', () => {
    const endpointLike = ['https://', 'provider-error.example.test/failure'].join('');
    const sensitiveAssignment = [['api', 'key'].join('_'), 'sample-value'].join('=');
    const pathLike = ['Z:', 'example', 'path'].join('\\');
    const sanitized = sanitizeStrategyProposalBenchmarkText([
      'candidate',
      endpointLike,
      sensitiveAssignment,
      pathLike,
    ].join(' '));

    expect(sanitized).not.toContain(endpointLike);
    expect(sanitized).not.toContain('sample-value');
    expect(sanitized).not.toContain(pathLike);
    expect(sanitized).toContain('[redacted-url]');
    expect(sanitized).toContain('[redacted-sensitive]');
    expect(sanitized).toContain('[redacted-path]');
  });

  it('keeps benchmark stdout summaries free of candidate free text', async () => {
    const scenario = STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS.find((item) => item.id === 'generic_default');
    expect(scenario).toBeDefined();

    const result = await runStrategyProposalBenchmarkScenario(scenario!, { providerMode: 'stub' });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('title');
    expect(serialized).not.toContain('"summary"');
    expect(serialized).not.toContain('suggested_natural_language_spec');
    expect(serialized).toContain('strategy_type');
    expect(serialized).toContain('pine_feasibility');
  });

  it('builds sanitized benchmark summary records without raw or free-text fields', async () => {
    const scenario = STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS.find((item) => item.id === 'advice_like_wording');
    expect(scenario).toBeDefined();

    const result = await runStrategyProposalBenchmarkScenario(scenario!, { providerMode: 'stub' });
    const record = buildStrategyProposalBenchmarkSummaryRecord({
      generatedAt: '2026-05-17T00:00:00.000Z',
      results: [result],
    });
    const serialized = JSON.stringify(record);

    expect(record.schema_name).toBe('strategy_proposal_benchmark_summary_records');
    expect(record.source.required_check).toBe(false);
    expect(record.source.provider_real_dependency).toBe(false);
    expect(record.records[0].quality_notes.manual_review_required).toBe(true);
    expect(record.records[0].quality_notes.advice_like_wording_observed).toBe(true);
    expect(record.records[0].safety.raw_prompt_included).toBe(false);
    expect(record.records[0].safety.raw_response_included).toBe(false);
    expect(record.records[0].safety.candidate_free_text_included).toBe(false);
    expect(serialized).not.toContain(String(scenario!.request.user_hint));
    expect(serialized).not.toContain('title');
    expect(serialized).not.toContain('suggested_natural_language_spec');
    expect(serialized).not.toContain('entry_logic');
    expect(serialized).not.toContain('exit_logic');
    expect(serialized).not.toContain('risk_management');
  });

  it('keeps benchmark record output paths inside the ignored record directory', () => {
    const outputPath = resolveStrategyProposalBenchmarkOutputPath(
      'generic_default.json',
      process.cwd(),
    );
    const absoluteOutput = path.join(path.parse(process.cwd()).root, 'generic_default.json');

    expect(outputPath).toContain('.benchmark-records');
    expect(outputPath.endsWith('generic_default.json')).toBe(true);
    expect(() => resolveStrategyProposalBenchmarkOutputPath('../generic_default.json')).toThrow();
    expect(() => resolveStrategyProposalBenchmarkOutputPath('nested/../generic_default.json')).not.toThrow();
    expect(() => resolveStrategyProposalBenchmarkOutputPath('generic_default.txt')).toThrow();
    expect(() => resolveStrategyProposalBenchmarkOutputPath(absoluteOutput)).toThrow();
  });
});

function expectProviderInvalidResponse(run: () => unknown) {
  try {
    run();
    throw new Error('expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('PROVIDER_INVALID_RESPONSE');
  }
}
