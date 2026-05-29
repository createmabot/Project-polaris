const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return ENTITY_MAP[normalized] ?? match;
  });
}

export function sanitizeReferenceText(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const sanitized = decodeHtmlEntities(input)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/[\r\n\t\u00a0]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized.length > 0 ? sanitized : null;
}

export function fallbackReferenceTitle(referenceType: string | null | undefined): string {
  if (referenceType === 'news') {
    return '関連ニュース';
  }
  if (referenceType === 'disclosure') {
    return '適時開示';
  }
  if (referenceType === 'earnings') {
    return '決算関連';
  }
  return '関連参照情報';
}

export function sanitizeReferenceTitle(
  input: unknown,
  referenceType: string | null | undefined,
): string {
  return sanitizeReferenceText(input) ?? fallbackReferenceTitle(referenceType);
}
