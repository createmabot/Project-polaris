import { AppError } from '../utils/response';
import { InvestmentCalendarProviderEvent } from './types';

export const INVESTMENT_CALENDAR_EVENT_TYPES = [
  'earnings',
  'ex_dividend',
  'shareholder_meeting',
  'dividend_payment',
  'economic_indicator',
  'central_bank',
  'market_holiday',
  'ipo',
  'other',
] as const;

export const INVESTMENT_CALENDAR_IMPORTANCE = ['high', 'medium', 'low'] as const;
export const INVESTMENT_CALENDAR_STATUS = ['active', 'archived'] as const;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeCalendarDate(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !isCalendarDate(value.trim())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be YYYY-MM-DD.`);
  }
  return value.trim();
}

export function defaultCalendarRange(now = new Date()): { from: string; to: string } {
  const fromDate = new Date(now);
  fromDate.setUTCHours(0, 0, 0, 0);
  const toDate = new Date(fromDate);
  toDate.setUTCDate(toDate.getUTCDate() + 60);
  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

export function toDateRangeWhere(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00.000Z`),
    lte: new Date(`${to}T23:59:59.999Z`),
  };
}

export function normalizeEventType(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'event_type must be a string.');
  }
  const normalized = value.trim().toLowerCase();
  if ((INVESTMENT_CALENDAR_EVENT_TYPES as readonly string[]).includes(normalized)) return normalized;
  throw new AppError(400, 'VALIDATION_ERROR', `event_type must be one of ${INVESTMENT_CALENDAR_EVENT_TYPES.join('|')}.`);
}

export function normalizeImportance(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'importance must be a string.');
  }
  const normalized = value.trim().toLowerCase();
  if ((INVESTMENT_CALENDAR_IMPORTANCE as readonly string[]).includes(normalized)) return normalized;
  throw new AppError(400, 'VALIDATION_ERROR', `importance must be one of ${INVESTMENT_CALENDAR_IMPORTANCE.join('|')}.`);
}

export function normalizeStatus(value: unknown): 'active' | 'archived' | 'all' {
  if (value === undefined || value === null || value === '') return 'active';
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'status must be a string.');
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'active' || normalized === 'archived' || normalized === 'all') return normalized;
  throw new AppError(400, 'VALIDATION_ERROR', 'status must be one of active|archived|all.');
}

export function normalizeLimit(value: unknown, fallback = 20, max = 100): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit must be a positive integer.');
  }
  return Math.min(parsed, max);
}

function normalizeSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeProviderEvent(value: unknown): InvestmentCalendarProviderEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const externalId = typeof row.externalId === 'string' ? row.externalId.trim() : '';
  const eventDate = typeof row.eventDate === 'string' ? row.eventDate.trim() : '';
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const eventType = typeof row.eventType === 'string' ? row.eventType.trim().toLowerCase() : '';
  const importance = typeof row.importance === 'string' ? row.importance.trim().toLowerCase() : 'medium';
  const sourceName = typeof row.sourceName === 'string' ? row.sourceName.trim() : '';
  if (!externalId || !isCalendarDate(eventDate) || !title || !sourceName) return null;
  if (!(INVESTMENT_CALENDAR_EVENT_TYPES as readonly string[]).includes(eventType)) return null;
  if (!(INVESTMENT_CALENDAR_IMPORTANCE as readonly string[]).includes(importance)) return null;

  return {
    externalId,
    symbolCode: typeof row.symbolCode === 'string' ? row.symbolCode.trim() : null,
    eventDate,
    eventTime: typeof row.eventTime === 'string' && row.eventTime.trim() ? row.eventTime.trim() : null,
    timezone: typeof row.timezone === 'string' && row.timezone.trim() ? row.timezone.trim() : 'Asia/Tokyo',
    eventType,
    title,
    description: typeof row.description === 'string' && row.description.trim() ? row.description.trim() : null,
    importance,
    sourceName,
    sourceLabel: typeof row.sourceLabel === 'string' && row.sourceLabel.trim() ? row.sourceLabel.trim() : null,
    sourceUrl: normalizeSourceUrl(row.sourceUrl),
  };
}
