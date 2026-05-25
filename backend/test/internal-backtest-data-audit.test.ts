import { describe, expect, it } from 'vitest';
import { buildInternalBacktestDataAuditSummary } from '../src/internal-backtests/data-audit';

describe('internal backtest Stage 2C data audit summary', () => {
  it('builds a sanitized summary and flags missing internal report snapshots', () => {
    const summary = buildInternalBacktestDataAuditSummary({
      generatedAt: '2026-05-26T00:00:00.000Z',
      internalBacktestExecutions: {
        total: 3,
        byStatus: { succeeded: 2, queued: 1 },
        resultSummaryNonNull: 2,
        artifactPointerNonNull: 1,
      },
      internalBacktestArtifacts: {
        total: 2,
        byKind: { engine_actual_trades_and_equity: 2 },
        orphanCount: 1,
      },
      backtests: {
        internalBacktestReports: 2,
        tradingviewReports: 5,
        internalReportsWithExecutionIdSnapshot: 2,
        internalReportsWithResultSummarySnapshot: 1,
        internalReportsWithArtifactPointerSnapshot: 1,
        internalReportSampleIdsMissingRequiredSnapshot: [
          'bt-missing-1',
          'bt-missing-2',
          'bt-missing-3',
          'bt-missing-4',
          'bt-missing-5',
          'bt-missing-6',
        ],
      },
      symbolStrategyApplicationRuns: {
        internalRuns: 4,
        internalExecutionReferenceCount: 3,
        backtestReferenceCount: 2,
        bothInternalExecutionAndBacktest: 1,
        internalExecutionOnly: 2,
        backtestOnly: 1,
        neitherInternalExecutionNorBacktest: 0,
      },
      aiSummary: {
        internalBacktestReportAiSummaries: 2,
        aiJobsForInternalBacktestReports: 3,
        aiJobsWithInternalExecutionDependency: 1,
      },
    });

    expect(summary).toMatchObject({
      audit_name: 'internal_backtest_stage_2c_data_audit',
      schema_version: '1.0',
      generated_at: '2026-05-26T00:00:00.000Z',
      counts: {
        internal_backtest_executions: {
          total: 3,
          by_status: { queued: 1, succeeded: 2 },
          result_summary_non_null: 2,
          artifact_pointer_non_null: 1,
        },
        internal_backtest_artifacts: {
          total: 2,
          by_kind: { engine_actual_trades_and_equity: 2 },
          orphan_count: 1,
        },
        backtests: {
          internal_backtest_reports: 2,
          tradingview_reports: 5,
          internal_reports_with_execution_id_snapshot: 2,
          internal_reports_with_result_summary_snapshot: 1,
          internal_reports_with_artifact_pointer_snapshot: 1,
          internal_report_sample_ids_missing_required_snapshot: [
            'bt-missing-1',
            'bt-missing-2',
            'bt-missing-3',
            'bt-missing-4',
            'bt-missing-5',
          ],
        },
        symbol_strategy_application_runs: {
          internal_runs: 4,
          internal_execution_reference_count: 3,
          backtest_reference_count: 2,
          both_internal_execution_and_backtest: 1,
          internal_execution_only: 2,
          backtest_only: 1,
          neither_internal_execution_nor_backtest: 0,
        },
        ai_summary: {
          internal_backtest_report_ai_summaries: 2,
          ai_jobs_for_internal_backtest_reports: 3,
          ai_jobs_with_internal_execution_dependency: 1,
        },
      },
      risk_summary: {
        can_drop_execution_tables_without_losing_report_display: false,
        needs_snapshot_retention_migration: true,
      },
      meta: {
        read_only: true,
        sanitized: true,
        raw_snapshot_included: false,
        raw_artifact_included: false,
        raw_csv_included: false,
        local_path_included: false,
        endpoint_included: false,
        model_value_included: false,
      },
    });
    expect(summary.risk_summary.notes).toEqual(expect.arrayContaining([
      expect.stringContaining('missing required execution id or result summary snapshots'),
      expect.stringContaining('AI summaries exist for internal backtest reports'),
    ]));
  });

  it('does not include raw payload, local path, endpoint, or secret-like data', () => {
    const summary = buildInternalBacktestDataAuditSummary({
      generatedAt: '2026-05-26T00:00:00.000Z',
      internalBacktestExecutions: {
        total: 0,
        byStatus: {},
        resultSummaryNonNull: 0,
        artifactPointerNonNull: 0,
      },
      internalBacktestArtifacts: {
        total: 0,
        byKind: {},
        orphanCount: 0,
      },
      backtests: {
        internalBacktestReports: 0,
        tradingviewReports: 1,
        internalReportsWithExecutionIdSnapshot: 0,
        internalReportsWithResultSummarySnapshot: 0,
        internalReportsWithArtifactPointerSnapshot: 0,
        internalReportSampleIdsMissingRequiredSnapshot: [],
      },
      symbolStrategyApplicationRuns: {
        internalRuns: 0,
        internalExecutionReferenceCount: 0,
        backtestReferenceCount: 0,
        bothInternalExecutionAndBacktest: 0,
        internalExecutionOnly: 0,
        backtestOnly: 0,
        neitherInternalExecutionNorBacktest: 0,
      },
      aiSummary: {
        internalBacktestReportAiSummaries: 0,
        aiJobsForInternalBacktestReports: 0,
        aiJobsWithInternalExecutionDependency: 0,
      },
    });

    const json = JSON.stringify(summary);
    expect(json).not.toContain('rawCsvText');
    expect(json).not.toContain('payloadJson');
    expect(json).not.toContain('C:\\');
    expect(json).not.toContain('/home/');
    expect(json).not.toContain('http://');
    expect(json).not.toContain('https://');
    expect(json).not.toContain('secret');
    expect(json).not.toContain('token');
    expect(summary.risk_summary.can_drop_execution_tables_without_losing_report_display).toBe(true);
    expect(summary.risk_summary.needs_snapshot_retention_migration).toBe(false);
  });
});
