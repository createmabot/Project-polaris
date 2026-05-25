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

export type InvestmentCalendarEvent = {
  id: string;
  scope?: 'symbol' | 'market' | string;
  symbol_id: string | null;
  symbol_code?: string | null;
  display_name?: string | null;
  event_date: string | null;
  event_time: string | null;
  timezone: string;
  event_type: string;
  title: string;
  description?: string | null;
  importance: 'high' | 'medium' | 'low' | string;
  source_type: string;
  source_name: string | null;
  source_label: string | null;
  source_url?: string | null;
  status: string;
  fetched_at: string | null;
};

export type InvestmentCalendarData = {
  events: InvestmentCalendarEvent[];
  meta: {
    from: string;
    to: string;
    source?: string;
    scope?: string;
    symbol_id?: string;
    manual_refresh_available?: boolean;
  };
};

export type InvestmentCalendarRefreshData = {
  status: 'succeeded';
  saved_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  from: string;
  to: string;
  source: string;
  manual_only: true;
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
  watchlist_symbols: Array<{
    item_id?: string | null;
    symbol_id: string | null;
    symbol_code?: string | null;
    display_name: string | null;
    market_code?: string | null;
    tradingview_symbol: string | null;
    latest_price: number | null;
    change_rate: number | null;
    latest_alert_status?: string | null;
    user_priority?: number | null;
  }>;
  positions: Array<{
    position_id: string | null;
    symbol_id: string | null;
    symbol_code?: string | null;
    display_name: string | null;
    market_code?: string | null;
    tradingview_symbol?: string | null;
    quantity: number | null;
    avg_cost?: number | null;
    latest_price: number | null;
    unrealized_pnl: number | null;
  }>;
  recent_alerts: AlertEventDto[];
  daily_summary: {
    id: string | null;
    title: string | null;
    body_markdown: string | null;
    structured_json: Record<string, unknown> | null;
    generated_at: string | null;
    status: 'available' | 'unavailable';
    insufficient_context: boolean;
    summary_type: 'latest' | 'morning' | 'evening';
    date: string | null;
  } | null;
  key_events: any[];
  investment_calendar?: InvestmentCalendarData;
};

export type WatchlistItemData = {
  watchlist: {
    id: string;
    name: string;
    description: string | null;
  };
  items: Array<{
    item_id: string;
    watchlist_id: string;
    symbol_id: string | null;
    symbol_code: string | null;
    display_name: string | null;
    market_code: string | null;
    tradingview_symbol: string | null;
    priority: number | null;
    memo: string | null;
    added_at: string;
    created_at: string;
    updated_at: string;
  }>;
};

export type WatchlistItemMutateData = {
  created?: boolean;
  status?: 'created' | 'already_exists';
  item: WatchlistItemData['items'][number];
};

export type PositionManagementData = {
  portfolio: {
    id: string;
    name: string;
    is_default: boolean;
  };
  positions: Array<{
    position_id: string;
    symbol_id: string | null;
    symbol_code: string | null;
    display_name: string | null;
    market_code: string | null;
    tradingview_symbol: string | null;
    quantity: number | null;
    average_cost: number | null;
    created_at: string;
    updated_at: string;
  }>;
};

export type PositionMutateData = {
  action: 'created' | 'updated' | 'unchanged';
  position: PositionManagementData['positions'][number] | null;
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

export type SymbolAiSummaryData = {
  symbol_id: string;
  scope: 'thesis' | 'latest';
  summary: {
    summary_id: string | null;
    title: string | null;
    body_markdown: string | null;
    structured_json: Record<string, unknown> | null;
    generated_at: string | null;
    status: 'available' | 'unavailable';
    insufficient_context: boolean;
    scope: 'thesis' | 'latest';
  };
};

export type SymbolReferenceRefreshData = {
  symbol_id: string;
  job_id: string;
  status: 'succeeded' | 'queued' | 'running' | 'failed' | string;
  saved_count: number | null;
  skipped_count: number | null;
  reference_count: number | null;
  source_breakdown: Record<string, number> | null;
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
    ai_summary_id?: string | null;
    ai_summary: {
      summary_id?: string;
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
  ai_summary_id?: string | null;
  generated_at: string | null;
  compared_metric_json: any;
  ai_summary: {
    summary_id?: string;
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
    forward_validation_note_updated_at: string | null;
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

export type StrategyVersionPineData = {
  strategy_rule_version_id: string;
  status: 'available' | 'unavailable';
  pine_script_id: string | null;
  parent_pine_script_id?: string | null;
  source_pine_script_id?: string | null;
  revision_input_id?: string | null;
  generated_script: string | null;
  script_body?: string | null;
  script_name?: string | null;
  pine_version?: string | null;
  warnings: string[];
  generation_note?: Record<string, unknown> | null;
  generated_at?: string | null;
  latest_revision_input?: {
    id: string;
    source_pine_script_id: string;
    generated_pine_script_id: string | null;
    compile_error_text: string | null;
    validation_note: string | null;
    revision_request: string;
    created_at: string;
  } | null;
};

export type StrategyVersionPineGenerateData = {
  strategy_version: StrategyVersionData['strategy_version'];
  pine: {
    pine_script_id: string | null;
    parent_pine_script_id?: string | null;
    source_pine_script_id?: string | null;
    revision_input_id?: string | null;
    generated_script: string | null;
    warnings: string[];
    assumptions?: string[];
    status: 'generated' | 'failed';
    failure_reason?: string | null;
    repair_attempts?: number;
    invalid_reason_codes?: string[];
  };
};

export type PineGenerationJobStage =
  | 'queued'
  | 'loading_context'
  | 'generating'
  | 'normalizing'
  | 'reviewing'
  | 'repairing'
  | 'validating'
  | 'saving'
  | 'succeeded'
  | 'failed';

export type PineGenerationStageEvent = {
  stage: PineGenerationJobStage | string;
  status: 'running' | 'completed' | 'skipped';
  occurred_at: string;
};

export type PineGenerationJob = {
  id: string;
  strategy_version_id: string | null;
  strategy_rule_version_id?: string | null;
  request_kind: 'generate' | 'regenerate' | string;
  job_kind?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | string;
  current_stage: PineGenerationJobStage | string;
  stage?: string;
  progress_percent?: number;
  stage_history: PineGenerationStageEvent[];
  result: {
    pine_script_id: string;
    status: 'available' | string;
  } | null;
  error: {
    code: string;
    message: string;
    invalid_reason_codes?: string[];
    pine_reviewer_issues?: Array<{
      code: string;
      severity: 'error' | 'warning' | 'info' | string;
      repair_hint: string;
    }>;
  } | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type StrategyVersionPineJobData = {
  job: PineGenerationJob;
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
    forward_validation_note_updated_at: string | null;
    has_diff_from_clone: boolean | null;
    market: string;
    timeframe: string;
    status: string;
    has_warnings: boolean;
    created_at: string;
    updated_at: string;
  }>;
};

export type StrategyProposalData = {
  schema_name: 'strategy_proposal_candidates' | string;
  schema_version: string;
  input: {
    market: string;
    timeframe: string;
    symbol_code: string | null;
    risk_preference: string;
    strategy_type_bias: string;
    proposal_count: number;
    user_hint: string | null;
  };
  provider: {
    name: string;
    mode: string;
    web_search: boolean;
    persisted: boolean;
  };
  provider_observation?: {
    provider_name: string;
    selected_by: 'default' | 'env' | 'config' | string;
    elapsed_ms: number;
    latency_bucket: 'fast' | 'acceptable' | 'slow' | 'timeout' | string;
    status:
      | 'succeeded'
      | 'validation_failed'
      | 'provider_unavailable'
      | 'timeout'
      | 'invalid_response'
      | 'provider_error'
      | string;
    candidate_count: number;
    invalid_reason:
      | 'none'
      | 'schema_invalid'
      | 'malformed_json'
      | 'required_field_missing'
      | 'enum_invalid'
      | 'candidate_count_invalid'
      | 'web_research_basis_disabled'
      | 'provider_unavailable'
      | 'timeout'
      | 'unknown'
      | string;
    validation_error_count: number;
    missing_required_fields?: string[];
    missing_required_field_count?: number;
    affected_candidate_count?: number;
    retry_used?: boolean;
    retry_reason?: string | null;
    retry_succeeded?: boolean;
    normalization_fallback_used?: boolean;
    fallback_field_count?: number;
    fallback_used: boolean;
    fallback_reason: string | null;
    schema_valid: boolean;
    model_category: 'configured' | 'default' | 'unknown' | string;
    manual_import?: boolean;
  };
  candidates: Array<{
    candidate_id: string;
    title: string;
    summary: string;
    market_assumption: string;
    timeframe_assumption: string;
    strategy_type: string;
    entry_logic: string[];
    exit_logic: string[];
    risk_management: string[];
    invalidation_conditions: string[];
    expected_strengths: string[];
    expected_weaknesses: string[];
    required_indicators: string[];
    pine_feasibility: string;
    backtest_cautions: string[];
    research_basis: Array<{
      source_type: string;
      label: string;
      url: string | null;
    }>;
    confidence: string;
    uncertainty: string[];
    suggested_natural_language_spec: string;
    suggested_pine_constraints: string[];
  }>;
  disclaimer: string;
  proposal_run_id?: string;
  history?: {
    proposal_run_id?: string;
  };
};

export type StrategyProposalCandidate = StrategyProposalData['candidates'][number];

export type StrategyProposalCodexCliRequestData = {
  provider_name: 'codex_cli_manual' | string;
  schema_name: 'strategy_proposal_candidates' | string;
  schema_version: string;
  proposal_count: number;
  web_search_prompt?: boolean;
  prompt: string;
};

export type StrategyProposalHistoryInput = Omit<StrategyProposalData['input'], 'user_hint'> & {
  user_hint: null;
  user_hint_present?: boolean;
  user_hint_length?: number;
};

export type StrategyProposalHistoryRun = {
  id: string;
  status: string;
  provider_name: string;
  provider_mode: string;
  selected_by: string;
  input: StrategyProposalHistoryInput;
  provider_observation?: StrategyProposalData['provider_observation'] | Record<string, unknown> | null;
  candidate_count: number;
  selected_candidate_id: string | null;
  archived_at: string | null;
  is_archived: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StrategyProposalHistoryCandidate = {
  id: string;
  proposal_run_id: string;
  provider_candidate_id: string;
  rank: number;
  candidate: StrategyProposalCandidate;
  selected_at: string | null;
  created_at: string;
};

export type StrategyProposalHistoryListData = {
  proposal_runs: StrategyProposalHistoryRun[];
  limit: number;
  filters?: {
    provider_name: string;
    status: string;
    selected: boolean | null;
    market: string;
    timeframe: string;
    archived: 'active' | 'archived' | 'all' | string;
    q_present: boolean;
    sort: string;
    order: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total_count: number;
    has_next: boolean;
    has_previous: boolean;
  };
  meta?: {
    source: string;
    sanitized: boolean;
    raw_prompt_included: boolean;
    raw_response_included: boolean;
    candidate_free_text_included: boolean;
    user_hint_full_text_included: boolean;
  };
};

export type StrategyProposalHistoryDetailData = {
  proposal_run: StrategyProposalHistoryRun;
  candidates: StrategyProposalHistoryCandidate[];
};

export type StrategyProposalSelectData = {
  proposal_run: StrategyProposalHistoryRun;
  selected_candidate: StrategyProposalHistoryCandidate;
};

export type StrategyProposalProviderQualityTrendData = {
  summary: {
    total_runs: number;
    succeeded_runs: number;
    failed_runs: number;
    success_rate: number;
    selected_runs: number;
    selected_rate: number;
    zero_candidate_runs: number;
    avg_candidate_count: number;
    avg_elapsed_ms: number;
  };
  by_provider: Array<{
    provider_name: string;
    run_count: number;
    succeeded_runs: number;
    failed_runs: number;
    success_rate: number;
    selected_runs: number;
    selected_rate: number;
    zero_candidate_runs: number;
    avg_candidate_count: number;
    avg_elapsed_ms: number;
    latency_buckets: Array<{ value: string; count: number }>;
    status_counts: Array<{ value: string; count: number }>;
    invalid_reason_counts: Array<{ value: string; count: number }>;
    selected_by_counts: Array<{ value: string; count: number }>;
    provider_mode_counts: Array<{ value: string; count: number }>;
  }>;
  by_market: Array<{
    market: string;
    run_count: number;
    success_rate: number;
    avg_candidate_count: number;
  }>;
  by_strategy_type_bias: Array<{
    strategy_type_bias: string;
    run_count: number;
    success_rate: number;
    avg_candidate_count: number;
  }>;
  candidate_distribution: {
    strategy_type_counts: Array<{ value: string; count: number }>;
    confidence_counts: Array<{ value: string; count: number }>;
    pine_feasibility_counts: Array<{ value: string; count: number }>;
  };
  recent_failures: Array<{
    proposal_run_id: string;
    created_at: string | null;
    provider_name: string;
    status: string;
    invalid_reason: string;
    candidate_count: number;
    latency_bucket: string;
  }>;
  meta: {
    source: 'strategy_proposal_history' | string;
    sanitized: boolean;
    raw_prompt_included: boolean;
    raw_response_included: boolean;
    limit: number;
  };
};

export type StrategyListData = {
  query: {
    q: string;
    status: string;
    sort: string;
    order: 'asc' | 'desc' | string;
  };
  pagination: {
    page: number;
    limit: number;
    q: string;
    status: string;
    sort: string;
    order: 'asc' | 'desc' | string;
    total: number;
    has_next: boolean;
    has_prev: boolean;
  };
  strategies: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    updated_at: string;
    version_count: number;
    latest_version: {
      id: string;
      market: string;
      timeframe: string;
      status: string;
      created_at: string;
      updated_at: string;
    } | null;
  }>;
};

export type StrategyMutateData = {
  strategy: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
};

export type SymbolStrategyApplicationItem = {
  id: string;
  status: string;
  source: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
  strategy: {
    id: string;
    title: string;
    status: string;
  };
  strategy_version: {
    id: string;
    market: string;
    timeframe: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  latest_run: {
    id: string;
    run_type: string;
    status: string;
    created_at: string;
    updated_at: string;
    backtest_id: string | null;
    backtest_import_id: string | null;
  } | null;
  latest_backtest_report: {
    id: string;
    title: string;
    status: string;
    execution_source: string;
    market: string;
    timeframe: string;
    created_at: string;
    updated_at: string;
  } | null;
  latest_reports_by_source?: {
    csv_import: {
      backtest_id: string;
      title: string;
      execution_source: string;
      status: string;
      run_type: string;
      run_status: string;
      updated_at: string;
    } | null;
    internal_backtest: {
      backtest_id: string;
      title: string;
      execution_source: string;
      status: string;
      run_type: string;
      run_status: string;
      updated_at: string;
    } | null;
  };
  run_count: number;
};

export type StrategySymbolApplicationItem = {
  id: string;
  status: string;
  source: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
  symbol: {
    id: string;
    symbol: string;
    symbol_code: string | null;
    display_name: string | null;
    market_code: string | null;
    tradingview_symbol: string | null;
  };
  strategy_version: SymbolStrategyApplicationItem['strategy_version'];
  latest_run: SymbolStrategyApplicationItem['latest_run'];
  latest_backtest_report: SymbolStrategyApplicationItem['latest_backtest_report'];
  run_count: number;
};

export type StrategySymbolApplicationsData = {
  strategy: {
    id: string;
    title: string;
    status: string;
  };
  query: {
    status: string;
    report_presence?: string | null;
    sort: string;
    order: 'asc' | 'desc' | string;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_next: boolean;
    has_prev: boolean;
  };
  applications: StrategySymbolApplicationItem[];
};

export type SymbolStrategyApplicationListData = {
  symbol: {
    id: string;
    symbol: string;
    symbol_code: string | null;
    display_name: string | null;
    market_code: string | null;
    tradingview_symbol: string | null;
  };
  query: {
    status: string;
    report_presence?: string | null;
    report_source?: string | null;
    run_type?: string | null;
    run_status?: string | null;
    strategy_id?: string | null;
    strategy_version_id?: string | null;
    sort: string;
    order: 'asc' | 'desc' | string;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_next: boolean;
    has_prev: boolean;
  };
  applications: SymbolStrategyApplicationItem[];
};

export type SymbolStrategyApplicationCreateData = {
  symbol: SymbolStrategyApplicationListData['symbol'];
  application: SymbolStrategyApplicationItem;
};

export type SymbolStrategyApplicationMutateData = {
  application: {
    id: string;
    status: string;
    source: string;
    memo: string | null;
    created_at: string;
    updated_at: string;
    symbol: {
      id: string;
      symbol: string;
      symbol_code: string | null;
      display_name: string | null;
    };
    strategy: {
      id: string;
      title: string;
      status: string;
    };
    strategy_version: {
      id: string;
      market: string;
      timeframe: string;
      status: string;
    };
    run_count: number;
  };
};

export type SymbolStrategyApplicationSummary = {
  id: string;
  status: string;
  source: string;
  memo: string | null;
  symbol: {
    id: string;
    symbol: string;
    symbol_code: string | null;
    display_name: string | null;
  };
  strategy: {
    id: string;
    title: string;
    status: string;
  };
  strategy_version: {
    id: string;
    market: string;
    timeframe: string;
    status: string;
  };
  created_at: string;
  updated_at: string;
};

export type SymbolStrategyApplicationRunHistoryData = {
  application: SymbolStrategyApplicationSummary & {
    run_count: number;
  };
  query: {
    run_type: string | null;
    run_status: string | null;
    sort: string;
    order: 'asc' | 'desc' | string;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_next: boolean;
    has_prev: boolean;
  };
  runs: Array<{
    id: string;
    run_type: string;
    status: string;
    created_at: string;
    updated_at: string;
    started_at: string | null;
    finished_at: string | null;
    error_code: string | null;
    error_message: string | null;
    linked_backtest: BacktestCreateData['backtest'] | null;
    linked_backtest_import: {
      id: string;
      backtest_id: string;
      file_name: string;
      parse_status: string;
      parse_error: string | null;
      created_at: string;
      updated_at: string;
    } | null;
  }>;
};

export type SymbolStrategyApplicationReportHistoryData = {
  application: SymbolStrategyApplicationSummary & {
    report_count: number;
  };
  query: {
    execution_source: string | null;
    run_type: string | null;
    status: string | null;
    with_metrics: boolean;
    sort: string;
    order: 'asc' | 'desc' | string;
  };
  pagination: SymbolStrategyApplicationRunHistoryData['pagination'];
  reports: Array<{
    id: string;
    title: string;
    status: string;
    execution_source: string;
    report_origin: string;
    market: string;
    timeframe: string;
    created_at: string;
    updated_at: string;
    linked_run: {
      id: string;
      run_type: string;
      status: string;
      created_at: string;
      updated_at: string;
      started_at: string | null;
      finished_at: string | null;
    };
    metrics: (BacktestRelatedReportMetrics & {
      source: string;
    }) | null;
    importless_report: boolean;
    backtest_detail_link: {
      path: string;
      label: string;
    };
  }>;
};

export type SymbolStrategyApplicationCsvImportData = {
  application_id: string;
  run: {
    id: string;
    run_type: string;
    status: string;
    backtest_id: string | null;
    backtest_import_id: string | null;
    created_at: string;
    updated_at: string;
  };
  backtest: {
    id: string;
    title: string;
    status: string;
    execution_source: string;
    market: string;
    timeframe: string;
    created_at: string;
    updated_at: string;
  };
  import: {
    id: string;
    backtest_id: string;
    file_name: string;
    file_size: number;
    content_type: string | null;
    parse_status: 'pending' | 'parsed' | 'failed' | string;
    parse_error: string | null;
    parsed_summary: BacktestImportData['import']['parsed_summary'];
    created_at: string;
    updated_at: string;
  };
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

export type BacktestAiReviewData = {
  summary_id: string | null;
  title: string | null;
  body_markdown: string | null;
  structured_json: Record<string, unknown> | null;
  generated_at: string | null;
  status: 'available' | 'unavailable';
  insufficient_context: boolean;
};

export type BacktestAiSummaryJobData = {
  job_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | string;
  trigger: string | null;
  error_message: string | null;
  duration_ms: number | null;
  estimated_cost_usd: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
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
      execution_source?: string | null;
      internal_backtest_execution_id?: string | null;
      result_summary?: Record<string, unknown> | null;
      artifact_pointer?: Record<string, unknown> | null;
      reported_at?: string | null;
    } | null;
  };
  latest_import: BacktestImportData['import'] | null;
  imports: Array<BacktestImportData['import']>;
  ai_review: BacktestAiReviewData;
  latest_ai_summary_job?: BacktestAiSummaryJobData | null;
  symbol_strategy_application: {
    application_id: string;
    application_status: string;
    application_source: string;
    application_memo: string | null;
    application_created_at: string;
    application_updated_at: string;
    run_id: string;
    run_type: string;
    run_status: string;
    run_created_at: string;
    run_updated_at: string;
    symbol: {
      id: string;
      symbol: string;
      symbol_code: string | null;
      market_code: string | null;
      tradingview_symbol: string | null;
      display_name: string | null;
    };
    strategy: {
      id: string;
      title: string;
    };
    strategy_version: {
      id: string;
      market: string;
      timeframe: string;
    };
    current_report?: {
      backtest_id: string;
      title: string;
      execution_source: string;
      status: string;
      run_type: string;
      run_status: string;
      updated_at: string;
      metrics: BacktestRelatedReportMetrics;
      ai_review?: BacktestAiReviewData;
    } | null;
    related_reports?: Array<{
      backtest_id: string;
      title: string;
      execution_source: string;
      status: string;
      run_type: string;
      run_status: string;
      updated_at: string;
      metrics?: BacktestRelatedReportMetrics;
      ai_review?: BacktestAiReviewData;
    }>;
  } | null;
};

export type BacktestRelatedReportMetrics = {
  period_from: string | null;
  period_to: string | null;
  trade_count: number | null;
  total_return_percent: number | null;
  price_change_percent: number | null;
  max_drawdown_percent: number | null;
  profit_factor: number | null;
  win_rate: number | null;
};

export type BacktestComparisonData = {
  comparison: {
    comparison_id: string;
    base_backtest_id: string;
    base_import_id: string;
    target_backtest_id: string;
    target_import_id: string;
    metrics_diff: {
      schema_version: string;
      total_trades_diff: number | null;
      win_rate_diff_pt: number | null;
      profit_factor_diff: number | null;
      max_drawdown_diff: number | null;
      net_profit_diff: number | null;
    };
    tradeoff_summary: string;
    ai_summary: string | null;
    created_at: string;
  };
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
