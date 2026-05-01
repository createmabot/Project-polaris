export type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getReferenceCountFromGenerationContext(generationContextJson: unknown): number | null {
  if (!isJsonRecord(generationContextJson)) {
    return null;
  }

  const snakeCaseValue = generationContextJson.reference_count;
  if (typeof snakeCaseValue === 'number' && Number.isFinite(snakeCaseValue)) {
    return snakeCaseValue;
  }

  const camelCaseValue = generationContextJson.referenceCount;
  return typeof camelCaseValue === 'number' && Number.isFinite(camelCaseValue) ? camelCaseValue : null;
}

export function normalizeInsufficientContext(
  structuredJson: unknown,
  referenceCount: number | null | undefined,
): boolean {
  const providerInsufficientContext =
    isJsonRecord(structuredJson) && typeof structuredJson.insufficient_context === 'boolean'
      ? structuredJson.insufficient_context
      : false;

  return providerInsufficientContext || referenceCount === 0;
}

export function withNormalizedInsufficientContext(
  structuredJson: unknown,
  referenceCount: number | null | undefined,
): JsonRecord | null {
  if (isJsonRecord(structuredJson)) {
    return {
      ...structuredJson,
      insufficient_context: normalizeInsufficientContext(structuredJson, referenceCount),
    };
  }

  if (referenceCount === 0) {
    return { insufficient_context: true };
  }

  return null;
}
