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

export type ResearchNoteDto = {
  id: string;
  symbolId: string;
  title: string;
  thesisText?: string;
  scenarioText?: string;
  entryConditionText?: string;
  takeProfitText?: string;
  stopLossText?: string;
  invalidationText?: string;
  nextReviewAt?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteRevisionDto = {
  id: string;
  revisionNo: number;
  changeSummary?: string;
  createdAt: string;
};

export type SymbolDetailData = {
  symbol: {
    id: string;
    symbol: string;
    symbol_code: string | null;
    display_name: string | null;
    market_code: string | null;
    tradingview_symbol: string | null;
  };
  current_snapshot: null;
  tradingview_symbol: string | null;
  recent_alerts: Array<{
    id: string;
    alert_name: string;
    alert_type: string | null;
    timeframe: string | null;
    trigger_price: number | null;
    triggered_at: string | null;
    received_at: string | null;
    processing_status: string;
    related_ai_summary: {
      id: string;
      title: string | null;
      generated_at: string | null;
      key_points: string[];
    } | null;
  }>;
  latest_ai_thesis_summary: {
    id: string;
    title: string | null;
    body_markdown: string;
    generated_at: string | null;
    overall_view: string | null;
    structured_json: any;
  } | null;
  related_references: Array<{
    id: string;
    alert_event_id: string | null;
    reference_type: string;
    title: string;
    source_name: string | null;
    source_url: string | null;
    published_at: string | null;
    summary_text: string | null;
  }>;
  latest_active_note: ResearchNoteDto | null;
  latest_processing_status: string;
};

export type ComparisonCreateData = {
  comparison_session: {
    id: string;
    name: string | null;
    comparison_type: string;
    status: string;
    created_at: string;
  };
  comparison_symbols: Array<{
    symbol_id: string;
    sort_order: number;
  }>;
};

export type ComparisonSymbolCard = {
  symbol: {
    id: string;
    symbol: string;
    symbol_code: string | null;
    display_name: string | null;
    market_code: string | null;
    tradingview_symbol: string | null;
  };
  latest_ai_thesis_summary: {
    id: string;
    title: string | null;
    body_markdown: string;
    generated_at: string | null;
    structured_json: any;
  } | null;
  latest_active_note: ResearchNoteDto | null;
  recent_alerts: Array<{
    id: string;
    alert_name: string;
    alert_type: string | null;
    timeframe: string | null;
    triggered_at: string | null;
    received_at: string | null;
    processing_status: string;
    related_ai_summary: {
      id: string;
      title: string | null;
      generated_at: string | null;
      key_points: string[];
    } | null;
  }>;
  related_references: Array<{
    id: string;
    reference_type: string;
    title: string;
    source_name: string | null;
    source_url: string | null;
    published_at: string | null;
    summary_text: string | null;
  }>;
  latest_processing_status: string;
};

export type ComparisonDetailData = {
  comparison_header: {
    comparison_id: string;
    name: string | null;
    comparison_type: string;
    status: string;
    created_at: string;
    updated_at: string;
    symbol_count: number;
  };
  symbols: ComparisonSymbolCard[];
  latest_result: {
    id: string;
    generated_at: string | null;
    compared_metric_json: any;
    ai_summary: {
      title: string | null;
      body_markdown: string;
      structured_json: any;
      model_name: string | null;
      prompt_version: string | null;
    } | null;
  } | null;
};

export type ComparisonGenerateData = {
  comparison_result_id: string;
  ai_job_id: string | null;
  generated_at: string | null;
  compared_metric_json: any;
  ai_summary: {
    title: string | null;
    body_markdown: string;
    structured_json: any;
    model_name: string | null;
    prompt_version: string | null;
  } | null;
};

