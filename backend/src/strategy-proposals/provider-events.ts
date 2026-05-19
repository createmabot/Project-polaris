import { prisma } from '../db';

export type StrategyProposalProviderEventType =
  | 'proposal_generate'
  | 'proposal_generate_failed'
  | 'proposal_generate_retry'
  | 'proposal_generate_rate_limited'
  | 'codex_cli_import'
  | 'codex_cli_import_failed'
  | 'codex_cli_import_rate_limited';

export type StrategyProposalProviderEventInput = {
  proposalRunId?: string | null;
  eventType: StrategyProposalProviderEventType;
  providerName: string;
  providerMode?: string | null;
  selectedBy?: string | null;
  status: string;
  invalidReason?: string | null;
  latencyBucket?: string | null;
  elapsedMs?: number | null;
  candidateCount?: number | null;
  validationErrorCount?: number | null;
  retryUsed?: boolean;
  retryReason?: string | null;
  retrySucceeded?: boolean | null;
  rateLimited?: boolean;
  rateLimitKeySource?: string | null;
  manualImport?: boolean;
  benchmark?: boolean;
  metadata?: Record<string, unknown>;
};

const ALLOWED_METADATA_KEYS = new Set([
  'affected_candidate_count',
  'candidate_count_requested',
  'fallback_field_count',
  'fallback_reason',
  'fallback_used',
  'manual_import_source',
  'missing_required_field_count',
  'normalization_fallback_used',
  'rate_limit_limit',
  'rate_limit_window_ms',
  'schema_valid',
  'source',
]);

function sanitizeMetadataValue(value: unknown): string | number | boolean | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 120 || /[\r\n]/.test(trimmed)) {
      return undefined;
    }
    if (!/^[a-z0-9_.:-]+$/i.test(trimmed)) {
      return undefined;
    }
    return trimmed;
  }
  return undefined;
}

export function sanitizeStrategyProposalProviderEventMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) {
      continue;
    }
    const sanitizedValue = sanitizeMetadataValue(value);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function readBoundedInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value));
}

export async function recordStrategyProposalProviderEvent(
  input: StrategyProposalProviderEventInput,
): Promise<void> {
  try {
    await (prisma as any).strategyProposalProviderEvent.create({
      data: {
        proposalRunId: input.proposalRunId ?? null,
        eventType: input.eventType,
        providerName: input.providerName,
        providerMode: input.providerMode ?? null,
        selectedBy: input.selectedBy ?? null,
        status: input.status,
        invalidReason: input.invalidReason ?? null,
        latencyBucket: input.latencyBucket ?? null,
        elapsedMs: readBoundedInteger(input.elapsedMs),
        candidateCount: readBoundedInteger(input.candidateCount),
        validationErrorCount: readBoundedInteger(input.validationErrorCount),
        retryUsed: input.retryUsed ?? false,
        retryReason: input.retryReason ?? null,
        retrySucceeded: input.retrySucceeded ?? null,
        rateLimited: input.rateLimited ?? false,
        rateLimitKeySource: input.rateLimitKeySource ?? null,
        manualImport: input.manualImport ?? false,
        benchmark: input.benchmark ?? false,
        metadataJson: sanitizeStrategyProposalProviderEventMetadata(input.metadata),
      },
    });
  } catch {
    console.warn('Strategy proposal provider event write failed.', {
      event_type: input.eventType,
      provider_name: input.providerName,
      status: input.status,
    });
  }
}

export function serializeStrategyProposalProviderEvent(row: any) {
  return {
    id: row.id,
    proposal_run_id: row.proposalRunId ?? null,
    event_type: row.eventType,
    provider_name: row.providerName,
    provider_mode: row.providerMode ?? null,
    selected_by: row.selectedBy ?? null,
    status: row.status,
    invalid_reason: row.invalidReason ?? null,
    latency_bucket: row.latencyBucket ?? null,
    elapsed_ms: row.elapsedMs ?? null,
    candidate_count: row.candidateCount ?? null,
    validation_error_count: row.validationErrorCount ?? null,
    retry_used: Boolean(row.retryUsed),
    retry_reason: row.retryReason ?? null,
    retry_succeeded: row.retrySucceeded ?? null,
    rate_limited: Boolean(row.rateLimited),
    rate_limit_key_source: row.rateLimitKeySource ?? null,
    manual_import: Boolean(row.manualImport),
    benchmark: Boolean(row.benchmark),
    metadata: sanitizeStrategyProposalProviderEventMetadata(row.metadataJson ?? undefined),
    occurred_at: row.occurredAt?.toISOString?.() ?? row.occurredAt,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
  };
}
