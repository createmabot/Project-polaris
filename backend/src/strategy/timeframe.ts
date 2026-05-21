export const CANONICAL_PINE_TIMEFRAMES = ['D', '4H', '1H'] as const;

export type CanonicalPineTimeframe = typeof CANONICAL_PINE_TIMEFRAMES[number];

const CANONICAL_TIMEFRAME_SET = new Set<string>(CANONICAL_PINE_TIMEFRAMES);

export function normalizeTimeframeAlias(value: string): string {
  const normalized = value.trim().toUpperCase();
  return normalized === '1D' ? 'D' : normalized;
}

export function readTimeframe(value: unknown, fallback = 'D'): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = normalizeTimeframeAlias(value);
  return normalized || fallback;
}

export function isCanonicalPineTimeframe(value: string): value is CanonicalPineTimeframe {
  return CANONICAL_TIMEFRAME_SET.has(value);
}

export function timeframeSearchAliases(value: string): string[] {
  const normalized = normalizeTimeframeAlias(value);
  if (normalized === 'D') {
    return ['D', '1D'];
  }
  return normalized ? [normalized] : [];
}

export type StrategyProposalTimeframeProfile = {
  label: string;
  focus: string;
  assumption: string;
  caution: string;
  suggestedConstraint: string;
};

export function getStrategyProposalTimeframeProfile(timeframe: string): StrategyProposalTimeframeProfile {
  const canonical = normalizeTimeframeAlias(timeframe);
  if (canonical === '4H') {
    return {
      label: '4時間足（4H）',
      focus: 'short swing / momentum / pullback / breakout confirmation',
      assumption: '4時間足では日足よりノイズと false breakout が増える前提で、短めの無効化条件を置きます。',
      caution: 'overnight、session gap、流動性、false breakout の影響を確認してください。',
      suggestedConstraint: '4H chart confirmation; shorter invalidation; no automatic execution',
    };
  }
  if (canonical === '1H') {
    return {
      label: '1時間足（1H）',
      focus: 'intraday / short-term momentum / mean reversion / volatility breakout',
      assumption: '1時間足では短期保有とタイトな損切りを前提に、whipsaw と過剰売買を強く警戒します。',
      caution: 'transaction cost、slippage、whipsaw、overtrading の影響を厚めに確認してください。',
      suggestedConstraint: '1H chart validation; tighter stop; shorter holding; no automatic execution',
    };
  }
  return {
    label: '日足（D）',
    focus: 'swing / trend following / breakout',
    assumption: '日足では取引回数を抑え、移動平均・出来高・RSI などで確認する前提を置きます。',
    caution: 'サンプル期間、決算・イベント、ギャップ、長期相場への過剰適合を確認してください。',
    suggestedConstraint: 'daily chart validation; swing holding; no automatic execution',
  };
}
