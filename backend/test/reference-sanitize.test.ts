import { describe, expect, it } from 'vitest';
import {
  fallbackReferenceTitle,
  sanitizeReferenceText,
  sanitizeReferenceTitle,
} from '../src/references/sanitize';

describe('reference text sanitization', () => {
  it('keeps RSS link inner text and strips HTML tags and raw URLs', () => {
    const input = '<a href="https://news.example.test/raw">トヨタ自動車[7203]：一部報道について</a> <font color="#6f6f6f">日本経済新聞</font> https://news.example.test/raw';

    expect(sanitizeReferenceText(input)).toBe('トヨタ自動車[7203]：一部報道について 日本経済新聞');
  });

  it('decodes HTML entities and normalizes whitespace', () => {
    expect(sanitizeReferenceText('Toyota &amp; Lexus\t&quot;update&quot; &#39;JP&#39; &#x3042;')).toBe('Toyota & Lexus "update" \'JP\' あ');
  });

  it('drops script and style contents', () => {
    const input = '<p>決算関連</p><script>alert("secret")</script><style>.x{display:none}</style>本文';

    expect(sanitizeReferenceText(input)).toBe('決算関連 本文');
  });

  it('returns null for empty or non-string inputs', () => {
    expect(sanitizeReferenceText(' <br> \n ')).toBeNull();
    expect(sanitizeReferenceText(null)).toBeNull();
    expect(sanitizeReferenceText(undefined)).toBeNull();
  });

  it('uses safe fallback titles when the sanitized title is empty', () => {
    expect(sanitizeReferenceTitle('<script>bad()</script>', 'news')).toBe('関連ニュース');
    expect(sanitizeReferenceTitle('', 'disclosure')).toBe('適時開示');
    expect(fallbackReferenceTitle('earnings')).toBe('決算関連');
  });
});
