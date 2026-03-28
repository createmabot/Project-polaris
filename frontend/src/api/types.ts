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
  symbolCode?: string | null;
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
  current_snapshot?: {
    last_price: number;
    change: number | null;
    change_percent: number | null;
    volume: number | null;
    as_of: string;
    market_status: 'open' | 'closed' | 'unknown';
    source_name: string;
  } | null;
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
  current_snapshot: {
    last_price: number;
    change: number | null;
    change_percent: number | null;
    volume: number | null;
    as_of: string;
    market_status: 'open' | 'closed' | 'unknown';
    source_name: string;
  } | null;
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
  current_snapshot: {
    last_price: number;
    change: number | null;
    change_percent: number | null;
    volume: number | null;
    as_of: string;
    market_status: 'open' | 'closed' | 'unknown';
    source_name: string;
  } | null;
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

export type StrategyCreateData = {
  strategy: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
};

export type StrategyVersionData = {
  strategy_version: {
    id: string;
    strategy_id: string;
    cloned_from_version_id?: string | null;
    natural_language_rule: string;
    market: string;
    timeframe: string;
    status: 'draft' | 'generated' | 'failed' | string;
    normalized_rule_json: any;
    generated_pine: string | null;
    forward_validation_note: string | null;
    warnings: string[];
    assumptions: string[];
    created_at: string;
    updated_at: string;
  };
  compare_base?: {
    id: string;
    natural_language_rule: string;
    status: string;
    generated_pine: string | null;
    updated_at: string;
  } | null;
};

export type StrategyVersionListData = {
  strategy: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  query?: {
    q: string;
    status?: string;
    sort?: string;
    order?: 'asc' | 'desc' | string;
  };
  pagination: {
    page: number;
    limit: number;
    q: string;
    status?: string;
    sort?: string;
    order?: 'asc' | 'desc' | string;
    total: number;
    has_next: boolean;
    has_prev: boolean;
  };
  strategy_versions: Array<{
    id: string;
    strategy_id: string;
    cloned_from_version_id: string | null;
    is_derived: boolean;
    has_forward_validation_note: boolean;
    has_diff_from_clone: boolean | null;
    market: string;
    timeframe: string;
    status: string;
    has_warnings: boolean;
    created_at: string;
    updated_at: string;
  }>;
};

export type BacktestCreateData = {
  backtest: {
    id: string;
    strategy_version_id: string;
    title: string;
    execution_source: string;
    market: string;
    timeframe: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
};

export type BacktestImportData = {
  import: {
    id: string;
    backtest_id: string;
    file_name: string;
    file_size: number;
    content_type: string | null;
    parse_status: 'pending' | 'parsed' | 'failed' | string;
    parse_error: string | null;
    parsed_summary: {
      totalTrades: number | null;
      winRate: number | null;
      profitFactor: number | null;
      maxDrawdown: number | null;
      netProfit: number | null;
      periodFrom: string | null;
      periodTo: string | null;
    } | null;
    created_at: string;
    updated_at: string;
  };
};

export type BacktestDetailData = {
  backtest: BacktestCreateData['backtest'];
  used_strategy: {
    strategy_id: string | null;
    strategy_version_id: string | null;
    snapshot: {
      strategy_id: string;
      strategy_version_id: string;
      natural_language_rule: string;
      generated_pine: string | null;
      market: string;
      timeframe: string;
      warnings: string[];
      assumptions: string[];
      captured_at: string | null;
    } | null;
  };
  latest_import: BacktestImportData['import'] | null;
  imports: Array<BacktestImportData['import']>;
};

export type BacktestListData = {
  backtests: Array<{
    strategy_id: string | null;
    id: string;
    strategy_version_id: string;
    title: string;
    execution_source: string;
    market: string;
    timeframe: string;
    status: string;
    created_at: string;
    updated_at: string;
    latest_import: {
      id: string;
      parse_status: 'pending' | 'parsed' | 'failed' | string;
      parse_error: string | null;
      created_at: string;
    } | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    q: string;
    status?: string;
    sort?: string;
    order?: 'asc' | 'desc' | string;
    total: number;
    has_next: boolean;
    has_prev: boolean;
  };
};

