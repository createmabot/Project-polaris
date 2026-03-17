// Defines the frontend response shape mimicking docs/3

export type ApiResponse<T> = {
  data: T | null;
  meta: Record<string, any>;
  error: { code: string; message: string; details?: any } | null;
};

// DTOs matching prisma schema & API responses
export type SymbolDto = {
  id: string;
  symbol: string;
  tradingviewSymbol: string | null;
  displayName: string | null;
};

export type AiSummaryDto = {
  id: string;
  title: string | null;
  bodyMarkdown: string;
  summaryScope: string;
  targetEntityType: string;
  targetEntityId: string;
  processingStatus?: string;
  modelName: string | null;
  generatedAt: string | null;
};

export type AlertEventDto = {
  id: string;
  alertName: string;
  alertType: string | null;
  timeframe: string | null;
  triggerPrice: number | null;
  triggeredAt: string | null;
  receivedAt: string | null;
  processingStatus: string;
  symbol: SymbolDto | null;
  related_ai_summary: AiSummaryDto | null;
};

export type ExternalReferenceDto = {
  id: string;
  referenceType: string;
  title: string;
  sourceName: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  summaryText: string | null;
};

export type HomeData = {
  market_overview: any;
  watchlist_symbols: any[];
  positions: any[];
  recent_alerts: AlertEventDto[];
  daily_summary: AiSummaryDto | null;
  key_events: any[];
};

export type AlertDetailData = {
  alert_event: {
    id: string;
    alertName: string;
    alertType: string | null;
    timeframe: string | null;
    triggerPrice: number | null;
    triggeredAt: string | null;
    receivedAt: string | null;
    processingStatus: string;
  };
  symbol: SymbolDto | null;
  related_ai_summary: AiSummaryDto | null;
  related_references: ExternalReferenceDto[];
  processing_status: string;
};
