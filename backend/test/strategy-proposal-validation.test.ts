import { describe, expect, it } from 'vitest';
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

  it('rejects unsupported enum values', () => {
    expectProviderInvalidResponse(() => validateStrategyProposalCandidate({
      ...validCandidate(),
      strategy_type: 'scalping',
    }));
  });

  it('rejects investment advice style wording', () => {
    expectProviderInvalidResponse(() => validateStrategyProposalCandidate(validCandidate({
      summary: 'この銘柄を買うべきで、必ず儲かる候補。',
    })));
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

  it('classifies investment advice wording in user hints as request validation', () => {
    expectValidationError(() => parseStrategyProposalRequest({
      user_hint: 'must buy this setup',
    }));
    expectValidationError(() => parseStrategyProposalRequest({
      user_hint: 'この銘柄は買うべき',
    }));
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

function expectValidationError(run: () => unknown) {
  try {
    run();
    throw new Error('expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('VALIDATION_ERROR');
  }
}
