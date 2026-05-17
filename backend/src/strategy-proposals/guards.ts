import type { StrategyProposalProviderMode } from './provider';

export function readBoundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

export function readBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function getStrategyProposalLocalLlmGuardConfig() {
  return {
    timeoutMs: readBoundedPositiveInteger(
      process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS,
      90_000,
      5_000,
      120_000,
    ),
    maxOutputChars: readBoundedPositiveInteger(
      process.env.STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS,
      20_000,
      4_000,
      40_000,
    ),
  };
}

export function getStrategyProposalRateLimitConfig() {
  return {
    enabled: readBooleanFlag(process.env.STRATEGY_PROPOSAL_RATE_LIMIT_ENABLED, true),
    maxRequests: readBoundedPositiveInteger(
      process.env.STRATEGY_PROPOSAL_RATE_LIMIT_MAX_REQUESTS,
      60,
      1,
      600,
    ),
    windowMs: readBoundedPositiveInteger(
      process.env.STRATEGY_PROPOSAL_RATE_LIMIT_WINDOW_MS,
      60_000,
      1_000,
      3_600_000,
    ),
  };
}

type RateLimitBucket = {
  count: number;
  windowStartedAtMs: number;
};

const strategyProposalRateLimitBuckets = new Map<string, RateLimitBucket>();

export function checkStrategyProposalRateLimit(params: {
  key: string;
  providerMode: StrategyProposalProviderMode;
  nowMs?: number;
}): {
  allowed: boolean;
  retryAfterMs: number;
  limit: number;
  windowMs: number;
} {
  const config = getStrategyProposalRateLimitConfig();
  if (!config.enabled) {
    return {
      allowed: true,
      retryAfterMs: 0,
      limit: config.maxRequests,
      windowMs: config.windowMs,
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const bucketKey = `${params.providerMode}:${params.key}`;
  const existing = strategyProposalRateLimitBuckets.get(bucketKey);
  const bucket =
    existing && nowMs - existing.windowStartedAtMs < config.windowMs
      ? existing
      : { count: 0, windowStartedAtMs: nowMs };

  if (bucket.count >= config.maxRequests) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, config.windowMs - (nowMs - bucket.windowStartedAtMs)),
      limit: config.maxRequests,
      windowMs: config.windowMs,
    };
  }

  bucket.count += 1;
  strategyProposalRateLimitBuckets.set(bucketKey, bucket);
  return {
    allowed: true,
    retryAfterMs: 0,
    limit: config.maxRequests,
    windowMs: config.windowMs,
  };
}

export function resetStrategyProposalRateLimitForTests() {
  strategyProposalRateLimitBuckets.clear();
}
