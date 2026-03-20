/**
 * External Reference Collector (docs/6)
 *
 * Adapter-based collection layer:
 * - news       -> Google News RSS search
 * - disclosure -> TDnet daily disclosure list (real data)
 * - earnings   -> TDnet earnings-focused extraction (real data)
 */

import crypto from 'crypto';
import { env } from '../env';

export type ReferenceType = 'news' | 'disclosure' | 'earnings';

export interface CollectedReference {
  sourceType: ReferenceType;
  referenceType: ReferenceType;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: Date | null;
  summaryText: string | null;
  metadataJson: Record<string, unknown>;
  relevanceScore: number;
  relevanceHint?: string | null;
  category?: string | null;
  rawPayloadJson?: Record<string, unknown> | null;
}

export interface AlertReferenceCollectionContext {
  alertEventId: string;
  symbolId: string | null;
  symbolCode: string | null;
  displayName: string | null;
  tradingviewSymbol: string | null;
  alertType: string | null;
  alertName: string;
  triggeredAt: Date | null;
}

export interface SymbolReferenceCollectionContext {
  symbolId: string;
  symbolCode: string | null;
  displayName: string | null;
  tradingviewSymbol: string | null;
}

export interface ReferenceCollector {
  collectForAlert(ctx: AlertReferenceCollectionContext): Promise<CollectedReference[]>;
  collectForSymbol(ctx: SymbolReferenceCollectionContext): Promise<CollectedReference[]>;
}

interface ReferenceCollectorAdapter {
  readonly sourceType: ReferenceType;
  collectForAlert(ctx: AlertReferenceCollectionContext): Promise<CollectedReference[]>;
  collectForSymbol(ctx: SymbolReferenceCollectionContext): Promise<CollectedReference[]>;
}

type RssItem = {
  title: string;
  link: string;
  pubDate: string | null;
  description: string | null;
  guid: string | null;
};

type TdnetDisclosureItem = {
  timeText: string;
  codeText: string;
  companyName: string;
  title: string;
  pdfPath: string | null;
  xbrlPath: string | null;
  marketText: string;
  historyText: string;
};

const IMPORTANT_WORDS = ['決算', '業績', '修正', '開示', '自社株', '配当'];
const EARNINGS_KEYWORDS = [
  '決算短信',
  '四半期決算',
  '通期業績',
  '業績予想',
  '配当予想',
  '決算説明',
  '決算補足',
  '業績修正',
];
const SOURCE_PRIORITY: Record<ReferenceType, number> = {
  disclosure: 30,
  earnings: 20,
  news: 10,
};

function parseEnabledSources(raw: string): ReferenceType[] {
  const tokens = raw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  const sourceSet = new Set<ReferenceType>();
  for (const token of tokens) {
    if (token === 'news' || token === 'disclosure' || token === 'earnings') {
      sourceSet.add(token);
    }
  }

  return sourceSet.size > 0 ? [...sourceSet] : ['news', 'disclosure', 'earnings'];
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function extractTagValue(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = block.match(re);
  if (!match) return null;
  return stripCdata(match[1]);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function cleanText(value: string): string {
  return decodeEntities(value).replace(/\s+/g, ' ').replace(/　/g, ' ').trim();
}

function parseRss(xml: string): RssItem[] {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return blocks
    .map((item) => ({
      title: cleanText(extractTagValue(item, 'title') ?? ''),
      link: cleanText(extractTagValue(item, 'link') ?? ''),
      pubDate: extractTagValue(item, 'pubDate'),
      description: extractTagValue(item, 'description'),
      guid: extractTagValue(item, 'guid'),
    }))
    .filter((item) => item.title.length > 0 && item.link.length > 0);
}

function normalizeUrl(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

function extractDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

function buildSymbolQuery(symbolCode: string | null, displayName: string | null, tradingviewSymbol: string | null): string {
  const candidates = [
    symbolCode,
    displayName,
    tradingviewSymbol?.split(':')[1] ?? null,
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

  const primary = candidates[0] ?? '株式';
  return `${primary} 開示`;
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calcRelevanceScore(
  referenceType: ReferenceType,
  title: string,
  publishedAt: Date | null,
  ctx: AlertReferenceCollectionContext,
): number {
  let score = SOURCE_PRIORITY[referenceType];
  const lowerTitle = title.toLowerCase();
  const symbolHints = [ctx.symbolCode, ctx.displayName, ctx.tradingviewSymbol?.split(':')[1] ?? null]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toLowerCase());

  if (symbolHints.some((hint) => lowerTitle.includes(hint))) {
    score += 25;
  }
  if (ctx.alertName && lowerTitle.includes(ctx.alertName.toLowerCase())) {
    score += 10;
  }
  if (IMPORTANT_WORDS.some((word) => title.includes(word))) {
    score += 15;
  }

  if (publishedAt && ctx.triggeredAt) {
    const deltaHours = Math.abs(publishedAt.getTime() - ctx.triggeredAt.getTime()) / (1000 * 60 * 60);
    if (deltaHours <= 24) score += 15;
    else if (deltaHours <= 72) score += 8;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * docs/6 section 14.3:
 * - base on source_url when available
 * - keep symbol scope
 * - fallback to title+publishedAt for feeds without stable URL
 */
export function buildDedupeKey(params: {
  symbolId: string | null;
  sourceName: string;
  sourceUrl: string | null;
  referenceType: ReferenceType;
  title: string;
  publishedAt: Date | null;
}): string {
  const normalizedUrl = normalizeUrl(params.sourceUrl);
  const publishedAtKey = params.publishedAt ? params.publishedAt.toISOString() : '';

  const raw = normalizedUrl
    ? `symbol:${params.symbolId ?? ''}|type:${params.referenceType}|source:${params.sourceName}|url:${normalizedUrl}`
    : `symbol:${params.symbolId ?? ''}|type:${params.referenceType}|source:${params.sourceName}|title:${params.title}|published_at:${publishedAtKey}`;

  return crypto.createHash('sha256').update(raw).digest('hex');
}

function buildDatesFrom(baseDate: Date, lookbackDays: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(baseDate.getTime() - i * 24 * 60 * 60 * 1000);
    const y = d.getFullYear().toString();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}${m}${day}`);
  }
  return dates;
}

function buildTdnetListUrl(template: string, yyyymmdd: string): string {
  return template.replace('{date}', yyyymmdd);
}

function toTdnetPublishedAt(yyyymmdd: string, hhmm: string): Date | null {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  const [hh, mm] = hhmm.split(':');
  if (!hh || !mm) return null;
  const iso = `${y}-${m}-${d}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00+09:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTdnetRows(html: string): TdnetDisclosureItem[] {
  const rowRe = /<tr>\s*<td[^>]*class="[^"]*kjTime[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="[^"]*kjCode[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="[^"]*kjName[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="[^"]*kjTitle[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="[^"]*kjXbrl[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="[^"]*kjPlace[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="[^"]*kjHistroy[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  const output: TdnetDisclosureItem[] = [];

  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html)) !== null) {
    const [, timeRaw, codeRaw, nameRaw, titleCellRaw, xbrlCellRaw, placeRaw, historyRaw] = match;

    const titleAnchor = titleCellRaw.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const xbrlAnchor = xbrlCellRaw.match(/<a[^>]*href="([^"]+)"[^>]*>/i);

    const timeText = cleanText(timeRaw);
    const codeText = cleanText(codeRaw);
    const companyName = cleanText(nameRaw);
    const title = titleAnchor ? cleanText(titleAnchor[2]) : cleanText(titleCellRaw);

    if (!timeText || !codeText || !title) continue;

    output.push({
      timeText,
      codeText,
      companyName,
      title,
      pdfPath: titleAnchor ? titleAnchor[1].trim() : null,
      xbrlPath: xbrlAnchor ? xbrlAnchor[1].trim() : null,
      marketText: cleanText(placeRaw),
      historyText: cleanText(historyRaw),
    });
  }

  return output;
}

function normalizeTdnetCode(rawCode: string): string {
  const digits = (extractDigits(rawCode) ?? '').slice(0, 5);
  if (digits.length === 5 && digits.endsWith('0')) {
    return digits.slice(0, 4);
  }
  return digits;
}

function buildCodeCandidates(symbolCode: string | null, tradingviewSymbol: string | null): Set<string> {
  const result = new Set<string>();

  const addCandidate = (raw: string | null | undefined) => {
    const digits = extractDigits(raw);
    if (!digits) return;

    if (digits.length >= 4) {
      const four = digits.slice(-4);
      result.add(four);
      result.add(`${four}0`);
    }

    if (digits.length === 5) {
      result.add(digits);
      if (digits.endsWith('0')) result.add(digits.slice(0, 4));
    }
  };

  addCandidate(symbolCode);
  addCandidate(tradingviewSymbol?.split(':')[1] ?? null);
  addCandidate(tradingviewSymbol);

  return result;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').replace(/　/g, '').toLowerCase();
}

function matchesSymbol(
  item: TdnetDisclosureItem,
  ctx: { symbolCode: string | null; displayName: string | null; tradingviewSymbol: string | null },
): { matched: boolean; reason: 'code' | 'name' | 'none' } {
  const codeCandidates = buildCodeCandidates(ctx.symbolCode, ctx.tradingviewSymbol);
  const itemCode5 = extractDigits(item.codeText) ?? '';
  const itemCode4 = normalizeTdnetCode(item.codeText);

  if (itemCode5 && (codeCandidates.has(itemCode5) || codeCandidates.has(itemCode4))) {
    return { matched: true, reason: 'code' };
  }

  const symbolName = normalizeName(ctx.displayName);
  const companyName = normalizeName(item.companyName);
  if (symbolName.length >= 2 && companyName.length >= 2) {
    if (companyName.includes(symbolName) || symbolName.includes(companyName)) {
      return { matched: true, reason: 'name' };
    }
  }

  return { matched: false, reason: 'none' };
}

function classifyDisclosureCategory(title: string): string {
  if (title.includes('決算') || title.includes('業績')) return 'financial_results';
  if (title.includes('配当')) return 'dividend';
  if (title.includes('自己株式')) return 'buyback';
  if (title.includes('人事')) return 'management';
  return 'corporate_action';
}

function isEarningsTitle(title: string): boolean {
  return EARNINGS_KEYWORDS.some((keyword) => title.includes(keyword));
}

function classifyEarningsCategory(title: string): string {
  if (title.includes('決算短信') || title.includes('四半期決算')) return 'earnings_results';
  if (title.includes('業績予想') || title.includes('通期業績')) return 'earnings_forecast';
  if (title.includes('修正')) return 'earnings_revision';
  if (title.includes('配当')) return 'dividend_forecast';
  return 'earnings';
}

class NewsCollectorAdapter implements ReferenceCollectorAdapter {
  readonly sourceType: ReferenceType = 'news';

  constructor(
    private readonly baseUrl: string,
    private readonly fetchTimeoutMs: number,
    private readonly maxItems: number,
  ) {}

  async collectForAlert(ctx: AlertReferenceCollectionContext): Promise<CollectedReference[]> {
    const query = buildSymbolQuery(ctx.symbolCode, ctx.displayName, ctx.tradingviewSymbol);
    const url = new URL(this.baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('hl', 'ja');
    url.searchParams.set('gl', 'JP');
    url.searchParams.set('ceid', 'JP:ja');

    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(this.fetchTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`news_source_http_${response.status}`);
    }

    const xml = await response.text();
    const items = parseRss(xml).slice(0, this.maxItems);

    return items.map((item) => {
      const publishedAt = toDate(item.pubDate);
      const relevanceScore = calcRelevanceScore('news', item.title, publishedAt, ctx);

      return {
        sourceType: 'news',
        referenceType: 'news',
        title: item.title,
        sourceName: 'google_news_rss',
        sourceUrl: item.link,
        publishedAt,
        summaryText: item.description ? cleanText(item.description) : null,
        metadataJson: {
          provider_article_id: item.guid ?? item.link,
          language: 'ja',
          query,
          relevance_score: relevanceScore,
        },
        relevanceScore,
        relevanceHint: relevanceScore >= 60 ? 'symbol_and_time_match' : 'general_news',
        category: 'market_news',
        rawPayloadJson: {
          guid: item.guid,
          pub_date: item.pubDate,
          description: item.description,
          query,
        },
      };
    });
  }

  async collectForSymbol(ctx: SymbolReferenceCollectionContext): Promise<CollectedReference[]> {
    const alertLikeContext: AlertReferenceCollectionContext = {
      alertEventId: 'symbol-context',
      symbolId: ctx.symbolId,
      symbolCode: ctx.symbolCode,
      displayName: ctx.displayName,
      tradingviewSymbol: ctx.tradingviewSymbol,
      alertType: null,
      alertName: 'symbol_research',
      triggeredAt: new Date(),
    };

    return this.collectForAlert(alertLikeContext);
  }
}

class TdnetDisclosureCollectorAdapter implements ReferenceCollectorAdapter {
  readonly sourceType: ReferenceType = 'disclosure';

  constructor(
    private readonly listUrlTemplate: string,
    private readonly fetchTimeoutMs: number,
    private readonly maxItems: number,
    private readonly alertLookbackDays: number,
    private readonly symbolLookbackDays: number,
  ) {}

  private async collectInternal(params: {
    symbolId: string | null;
    symbolCode: string | null;
    displayName: string | null;
    tradingviewSymbol: string | null;
    triggeredAt: Date | null;
    alertName: string;
    lookbackDays: number;
  }): Promise<CollectedReference[]> {
    const baseDate = params.triggeredAt ?? new Date();
    const dates = buildDatesFrom(baseDate, params.lookbackDays);
    const results: CollectedReference[] = [];
    const errors: string[] = [];

    for (const yyyymmdd of dates) {
      if (results.length >= this.maxItems) break;

      const listUrl = buildTdnetListUrl(this.listUrlTemplate, yyyymmdd);
      try {
        const response = await fetch(listUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(this.fetchTimeoutMs),
        });

        if (!response.ok) {
          errors.push(`http_${response.status}_${yyyymmdd}`);
          continue;
        }

        const html = await response.text();
        const rows = parseTdnetRows(html);

        for (const row of rows) {
          if (results.length >= this.maxItems) break;

          const matched = matchesSymbol(row, {
            symbolCode: params.symbolCode,
            displayName: params.displayName,
            tradingviewSymbol: params.tradingviewSymbol,
          });
          if (!matched.matched) continue;

          const publishedAt = toTdnetPublishedAt(yyyymmdd, row.timeText);
          const title = row.title;
          const sourceUrl = row.pdfPath
            ? `https://www.release.tdnet.info/inbs/${row.pdfPath}`
            : listUrl;

          const alertCtx: AlertReferenceCollectionContext = {
            alertEventId: 'disclosure-context',
            symbolId: params.symbolId,
            symbolCode: params.symbolCode,
            displayName: params.displayName,
            tradingviewSymbol: params.tradingviewSymbol,
            alertType: null,
            alertName: params.alertName,
            triggeredAt: params.triggeredAt,
          };

          const baseScore = calcRelevanceScore('disclosure', title, publishedAt, alertCtx);
          const matchBonus = matched.reason === 'code' ? 20 : 10;
          const relevanceScore = Math.max(0, Math.min(100, baseScore + matchBonus));
          const category = classifyDisclosureCategory(title);

          results.push({
            sourceType: 'disclosure',
            referenceType: 'disclosure',
            title,
            sourceName: 'tdnet_disclosure',
            sourceUrl,
            publishedAt,
            summaryText: title,
            metadataJson: {
              provider_article_id: row.pdfPath ?? `${yyyymmdd}-${row.codeText}-${row.timeText}`,
              disclosure_code: normalizeTdnetCode(row.codeText),
              disclosure_code_raw: row.codeText,
              company_name: row.companyName,
              market_tag: row.marketText,
              query_date: yyyymmdd,
              relevance_score: relevanceScore,
              match_reason: matched.reason,
            },
            relevanceScore,
            relevanceHint: matched.reason === 'code' ? 'tdnet_code_match' : 'tdnet_name_match',
            category,
            rawPayloadJson: {
              source: 'tdnet_list',
              list_url: listUrl,
              row,
            },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`fetch_error_${yyyymmdd}:${message}`);
      }
    }

    if (results.length === 0 && errors.length > 0 && errors.length === dates.length) {
      throw new Error(`tdnet_collect_failed:${errors.join(',')}`);
    }

    return results;
  }

  async collectForAlert(ctx: AlertReferenceCollectionContext): Promise<CollectedReference[]> {
    return this.collectInternal({
      symbolId: ctx.symbolId,
      symbolCode: ctx.symbolCode,
      displayName: ctx.displayName,
      tradingviewSymbol: ctx.tradingviewSymbol,
      triggeredAt: ctx.triggeredAt,
      alertName: ctx.alertName,
      lookbackDays: this.alertLookbackDays,
    });
  }

  async collectForSymbol(ctx: SymbolReferenceCollectionContext): Promise<CollectedReference[]> {
    return this.collectInternal({
      symbolId: ctx.symbolId,
      symbolCode: ctx.symbolCode,
      displayName: ctx.displayName,
      tradingviewSymbol: ctx.tradingviewSymbol,
      triggeredAt: new Date(),
      alertName: 'symbol_research',
      lookbackDays: this.symbolLookbackDays,
    });
  }
}

class TdnetEarningsCollectorAdapter implements ReferenceCollectorAdapter {
  readonly sourceType: ReferenceType = 'earnings';

  constructor(
    private readonly listUrlTemplate: string,
    private readonly fetchTimeoutMs: number,
    private readonly maxItems: number,
    private readonly alertLookbackDays: number,
    private readonly symbolLookbackDays: number,
  ) {}

  private async collectInternal(params: {
    symbolId: string | null;
    symbolCode: string | null;
    displayName: string | null;
    tradingviewSymbol: string | null;
    triggeredAt: Date | null;
    alertName: string;
    lookbackDays: number;
  }): Promise<CollectedReference[]> {
    const baseDate = params.triggeredAt ?? new Date();
    const dates = buildDatesFrom(baseDate, params.lookbackDays);
    const results: CollectedReference[] = [];
    const errors: string[] = [];

    for (const yyyymmdd of dates) {
      if (results.length >= this.maxItems) break;

      const listUrl = buildTdnetListUrl(this.listUrlTemplate, yyyymmdd);
      try {
        const response = await fetch(listUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(this.fetchTimeoutMs),
        });

        if (!response.ok) {
          errors.push(`http_${response.status}_${yyyymmdd}`);
          continue;
        }

        const html = await response.text();
        const rows = parseTdnetRows(html);

        for (const row of rows) {
          if (results.length >= this.maxItems) break;
          if (!isEarningsTitle(row.title)) continue;

          const matched = matchesSymbol(row, {
            symbolCode: params.symbolCode,
            displayName: params.displayName,
            tradingviewSymbol: params.tradingviewSymbol,
          });
          if (!matched.matched) continue;

          const publishedAt = toTdnetPublishedAt(yyyymmdd, row.timeText);
          const title = row.title;
          const sourceUrl = row.pdfPath
            ? `https://www.release.tdnet.info/inbs/${row.pdfPath}`
            : listUrl;

          const alertCtx: AlertReferenceCollectionContext = {
            alertEventId: 'earnings-context',
            symbolId: params.symbolId,
            symbolCode: params.symbolCode,
            displayName: params.displayName,
            tradingviewSymbol: params.tradingviewSymbol,
            alertType: null,
            alertName: params.alertName,
            triggeredAt: params.triggeredAt,
          };

          const baseScore = calcRelevanceScore('earnings', title, publishedAt, alertCtx);
          const matchBonus = matched.reason === 'code' ? 25 : 12;
          const relevanceScore = Math.max(0, Math.min(100, baseScore + matchBonus));
          const category = classifyEarningsCategory(title);

          results.push({
            sourceType: 'earnings',
            referenceType: 'earnings',
            title,
            sourceName: 'tdnet_earnings',
            sourceUrl,
            publishedAt,
            summaryText: title,
            metadataJson: {
              provider_article_id: row.pdfPath ?? `${yyyymmdd}-${row.codeText}-${row.timeText}`,
              earnings_document_code: row.pdfPath ?? null,
              fiscal_period_hint: title.match(/\d{4}年\d{1,2}月期/)?.[0] ?? null,
              disclosure_code: normalizeTdnetCode(row.codeText),
              disclosure_code_raw: row.codeText,
              company_name: row.companyName,
              market_tag: row.marketText,
              query_date: yyyymmdd,
              relevance_score: relevanceScore,
              match_reason: matched.reason,
            },
            relevanceScore,
            relevanceHint: matched.reason === 'code' ? 'tdnet_earnings_code_match' : 'tdnet_earnings_name_match',
            category,
            rawPayloadJson: {
              source: 'tdnet_list',
              list_url: listUrl,
              row,
            },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`fetch_error_${yyyymmdd}:${message}`);
      }
    }

    if (results.length === 0 && errors.length > 0 && errors.length === dates.length) {
      throw new Error(`tdnet_earnings_collect_failed:${errors.join(',')}`);
    }

    return results;
  }

  async collectForAlert(ctx: AlertReferenceCollectionContext): Promise<CollectedReference[]> {
    return this.collectInternal({
      symbolId: ctx.symbolId,
      symbolCode: ctx.symbolCode,
      displayName: ctx.displayName,
      tradingviewSymbol: ctx.tradingviewSymbol,
      triggeredAt: ctx.triggeredAt,
      alertName: ctx.alertName,
      lookbackDays: this.alertLookbackDays,
    });
  }

  async collectForSymbol(ctx: SymbolReferenceCollectionContext): Promise<CollectedReference[]> {
    return this.collectInternal({
      symbolId: ctx.symbolId,
      symbolCode: ctx.symbolCode,
      displayName: ctx.displayName,
      tradingviewSymbol: ctx.tradingviewSymbol,
      triggeredAt: new Date(),
      alertName: 'symbol_research',
      lookbackDays: this.symbolLookbackDays,
    });
  }
}

class CompositeReferenceCollector implements ReferenceCollector {
  constructor(private readonly adapters: ReferenceCollectorAdapter[]) {}

  async collectForAlert(ctx: AlertReferenceCollectionContext): Promise<CollectedReference[]> {
    const collected: CollectedReference[] = [];
    const errors: Error[] = [];

    for (const adapter of this.adapters) {
      try {
        const refs = await adapter.collectForAlert(ctx);
        collected.push(...refs);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(new Error(`${adapter.sourceType}:${message}`));
      }
    }

    if (collected.length === 0 && errors.length > 0) {
      throw new Error(`collect_failed_all_adapters:${errors.map((e) => e.message).join(',')}`);
    }

    return dedupeCollectedReferences(collected);
  }

  async collectForSymbol(ctx: SymbolReferenceCollectionContext): Promise<CollectedReference[]> {
    const collected: CollectedReference[] = [];
    const errors: Error[] = [];

    for (const adapter of this.adapters) {
      try {
        const refs = await adapter.collectForSymbol(ctx);
        collected.push(...refs);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(new Error(`${adapter.sourceType}:${message}`));
      }
    }

    if (collected.length === 0 && errors.length > 0) {
      throw new Error(`collect_for_symbol_failed_all_adapters:${errors.map((e) => e.message).join(',')}`);
    }

    return dedupeCollectedReferences(collected);
  }
}

function dedupeCollectedReferences(input: CollectedReference[]): CollectedReference[] {
  const seen = new Set<string>();
  const output: CollectedReference[] = [];

  for (const ref of input) {
    const key = `${ref.referenceType}|${normalizeUrl(ref.sourceUrl) ?? ref.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(ref);
  }

  return output;
}

function createCollector(): ReferenceCollector {
  const enabled = parseEnabledSources(env.REFERENCE_ENABLED_SOURCES);
  const adapters: ReferenceCollectorAdapter[] = [];

  if (enabled.includes('news')) {
    adapters.push(
      new NewsCollectorAdapter(
        env.REFERENCE_NEWS_RSS_BASE_URL,
        env.REFERENCE_FETCH_TIMEOUT_MS,
        env.REFERENCE_NEWS_MAX_ITEMS,
      ),
    );
  }

  if (enabled.includes('disclosure')) {
    adapters.push(
      new TdnetDisclosureCollectorAdapter(
        env.REFERENCE_DISCLOSURE_TDNET_LIST_URL_TEMPLATE,
        env.REFERENCE_FETCH_TIMEOUT_MS,
        env.REFERENCE_DISCLOSURE_MAX_ITEMS,
        env.REFERENCE_DISCLOSURE_ALERT_LOOKBACK_DAYS,
        env.REFERENCE_DISCLOSURE_SYMBOL_LOOKBACK_DAYS,
      ),
    );
  }

  if (enabled.includes('earnings')) {
    adapters.push(
      new TdnetEarningsCollectorAdapter(
        env.REFERENCE_EARNINGS_TDNET_LIST_URL_TEMPLATE,
        env.REFERENCE_FETCH_TIMEOUT_MS,
        env.REFERENCE_EARNINGS_MAX_ITEMS,
        env.REFERENCE_EARNINGS_ALERT_LOOKBACK_DAYS,
        env.REFERENCE_EARNINGS_SYMBOL_LOOKBACK_DAYS,
      ),
    );
  }

  if (adapters.length === 0) {
    adapters.push(
      new NewsCollectorAdapter(
        env.REFERENCE_NEWS_RSS_BASE_URL,
        env.REFERENCE_FETCH_TIMEOUT_MS,
        env.REFERENCE_NEWS_MAX_ITEMS,
      ),
    );
  }

  return new CompositeReferenceCollector(adapters);
}

export const referenceCollector: ReferenceCollector = createCollector();
