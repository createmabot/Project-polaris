import type { StrategyProposalProviderMode } from './provider';
import crypto from 'crypto';
import { isIP } from 'net';

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

export type StrategyProposalLocalLlmTimeoutProfile = 'default' | 'long_context';

function readLocalLlmTimeoutProfile(value: string | undefined): StrategyProposalLocalLlmTimeoutProfile {
  const normalized = value?.trim().toLowerCase().replace(/-/g, '_');
  return normalized === 'long_context' ? 'long_context' : 'default';
}

export function getStrategyProposalLocalLlmGuardConfig() {
  const timeoutProfile = readLocalLlmTimeoutProfile(
    process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_PROFILE,
  );
  const timeoutLimits =
    timeoutProfile === 'long_context'
      ? { fallback: 180_000, min: 5_000, max: 300_000 }
      : { fallback: 90_000, min: 5_000, max: 120_000 };

  return {
    timeoutProfile,
    timeoutMs: readBoundedPositiveInteger(
      process.env.STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS,
      timeoutLimits.fallback,
      timeoutLimits.min,
      timeoutLimits.max,
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
    trustForwardedIp: readBooleanFlag(process.env.STRATEGY_PROPOSAL_TRUST_FORWARDED_IP, false),
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

export type StrategyProposalRateLimitKeySource = 'user' | 'forwarded_ip' | 'request_ip' | 'unknown';

export type StrategyProposalRateLimitKeyInput = {
  userId?: string | null;
  requestIp?: string | null;
  forwardedFor?: string | string[];
  trustedForwardedIp?: boolean;
};

export type StrategyProposalRateLimitKeyResult = {
  key: string;
  source: StrategyProposalRateLimitKeySource;
};

function readNonEmptyIdentifier(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || /[\r\n]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeForwardedIpCandidate(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const withoutBrackets = trimmed.startsWith('[') && trimmed.endsWith(']')
    ? trimmed.slice(1, -1)
    : trimmed;
  if (isIP(withoutBrackets) === 0) {
    return null;
  }
  return withoutBrackets.toLowerCase();
}

function readForwardedClientIp(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const firstForwardedIp = raw?.split(',')[0];
  return normalizeForwardedIpCandidate(firstForwardedIp);
}

function buildRateLimitKey(source: StrategyProposalRateLimitKeySource, value: string): string {
  const digest = crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${source}:${digest}`;
}

export function resolveStrategyProposalRateLimitKey(
  input: StrategyProposalRateLimitKeyInput,
): StrategyProposalRateLimitKeyResult {
  const userId = readNonEmptyIdentifier(input.userId);
  if (userId) {
    return { key: buildRateLimitKey('user', userId), source: 'user' };
  }

  if (input.trustedForwardedIp) {
    const forwardedIp = readForwardedClientIp(input.forwardedFor);
    if (forwardedIp) {
      return { key: buildRateLimitKey('forwarded_ip', forwardedIp), source: 'forwarded_ip' };
    }
  }

  const requestIp = readNonEmptyIdentifier(input.requestIp);
  if (requestIp) {
    return { key: buildRateLimitKey('request_ip', requestIp), source: 'request_ip' };
  }

  return { key: buildRateLimitKey('unknown', 'unknown'), source: 'unknown' };
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
