import { parseStrategyProposalRequest } from './validation';
import type { StrategyProposalRequest } from './types';

type BenchmarkScenarioBody = {
  market?: unknown;
  timeframe?: unknown;
  symbol_code?: unknown;
  risk_preference?: unknown;
  strategy_type_bias?: unknown;
  proposal_count?: unknown;
  user_hint?: unknown;
};

export type StrategyProposalBenchmarkScenario = {
  id: string;
  label: string;
  request: BenchmarkScenarioBody;
};

export const STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS: StrategyProposalBenchmarkScenario[] = [
  {
    id: 'generic_default',
    label: 'Generic default proposal',
    request: {},
  },
  {
    id: 'jp_stock_daily',
    label: 'JP stock daily proposal',
    request: {
      market: 'JP_STOCK',
      timeframe: 'D',
      proposal_count: 5,
      user_hint: '日本株の日足で検証できる候補を比較したい。',
    },
  },
  {
    id: 'us_stock_daily',
    label: 'US stock daily proposal',
    request: {
      market: 'US_STOCK',
      timeframe: 'D',
      proposal_count: 5,
      user_hint: 'US stock daily setup without assuming recent news.',
    },
  },
  {
    id: 'short_swing',
    label: 'Short swing proposal',
    request: {
      timeframe: 'D',
      risk_preference: 'balanced',
      proposal_count: 5,
      user_hint: '2週間以内の短期 swing を想定し、entry と exit を明確にしたい。',
    },
  },
  {
    id: 'long_trend_following',
    label: 'Long trend following proposal',
    request: {
      timeframe: 'W',
      strategy_type_bias: 'trend_following',
      risk_preference: 'balanced',
      proposal_count: 5,
      user_hint: '長期の trend following。継続条件と exit 条件を重視する。',
    },
  },
  {
    id: 'mean_reversion',
    label: 'Mean reversion proposal',
    request: {
      strategy_type_bias: 'mean_reversion',
      risk_preference: 'conservative',
      proposal_count: 5,
      user_hint: '売られすぎからの反転を検証したい。損切り条件も明確にする。',
    },
  },
  {
    id: 'breakout',
    label: 'Breakout proposal',
    request: {
      strategy_type_bias: 'breakout',
      risk_preference: 'balanced',
      proposal_count: 5,
      user_hint: '高値 breakout。だまし対策と volume 条件を見る。',
    },
  },
  {
    id: 'volatility',
    label: 'Volatility proposal',
    request: {
      strategy_type_bias: 'volatility',
      risk_preference: 'balanced',
      proposal_count: 5,
      user_hint: 'volatility regime と stop width を考慮した候補。',
    },
  },
  {
    id: 'conservative_risk',
    label: 'Conservative risk proposal',
    request: {
      risk_preference: 'conservative',
      strategy_type_bias: 'risk_management',
      proposal_count: 5,
      user_hint: '損失限定を優先し、過剰な entry を避けたい。',
    },
  },
  {
    id: 'aggressive_risk',
    label: 'Aggressive risk proposal',
    request: {
      risk_preference: 'aggressive',
      proposal_count: 5,
      user_hint: '勢いがある局面を逃さないが、overfitting caution も残す。',
    },
  },
  {
    id: 'concrete_user_hint',
    label: 'Concrete user hint proposal',
    request: {
      proposal_count: 5,
      user_hint: '25日移動平均、20日高値、出来高平均の条件を含めて Pine 化しやすい候補にする。',
    },
  },
  {
    id: 'vague_user_hint',
    label: 'Vague user hint proposal',
    request: {
      proposal_count: 5,
      user_hint: 'いい感じの押し目を探したいが、条件はまだ曖昧。',
    },
  },
  {
    id: 'long_user_hint',
    label: 'Long user hint proposal',
    request: {
      proposal_count: 5,
      user_hint: [
        '長文の検証メモとして、trend、mean reversion、breakout のどれがよいか比較したい。',
        'entry、exit、risk、invalidation、Pine feasibility、backtest caution を分けて見たい。',
        '最新ニュースや外部 citation は不要で、検証候補として扱いたい。',
      ].join(' '),
    },
  },
  {
    id: 'advice_like_wording',
    label: 'Advice-like wording proposal',
    request: {
      proposal_count: 5,
      user_hint: 'must buy と読める wording を含んでも、拒否ではなく検証候補として扱う。買うべきという断定をそのまま推奨にしない。',
    },
  },
];

export function toStrategyProposalBenchmarkRequest(
  scenario: StrategyProposalBenchmarkScenario,
): StrategyProposalRequest {
  return parseStrategyProposalRequest(scenario.request);
}
