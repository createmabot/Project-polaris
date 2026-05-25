import type { PrismaClient } from '@prisma/client';

export type CountByValue = Record<string, number>;

export type InternalBacktestDataAuditInput = {
  generatedAt: string;
  internalBacktestExecutions: {
    total: number;
    byStatus: CountByValue;
    resultSummaryNonNull: number;
    artifactPointerNonNull: number;
  };
  internalBacktestArtifacts: {
    total: number;
    byKind: CountByValue;
    orphanCount: number;
  };
  backtests: {
    internalBacktestReports: number;
    tradingviewReports: number;
    internalReportsWithExecutionIdSnapshot: number;
    internalReportsWithResultSummarySnapshot: number;
    internalReportsWithArtifactPointerSnapshot: number;
    internalReportSampleIdsMissingRequiredSnapshot: string[];
  };
  symbolStrategyApplicationRuns: {
    internalRuns: number;
    internalExecutionReferenceCount: number;
    backtestReferenceCount: number;
    bothInternalExecutionAndBacktest: number;
    internalExecutionOnly: number;
    backtestOnly: number;
    neitherInternalExecutionNorBacktest: number;
  };
  aiSummary: {
    internalBacktestReportAiSummaries: number;
    aiJobsForInternalBacktestReports: number;
    aiJobsWithInternalExecutionDependency: number;
  };
};

export type InternalBacktestDataAuditSummary = {
  audit_name: 'internal_backtest_stage_2c_data_audit';
  schema_version: '1.0';
  generated_at: string;
  counts: {
    internal_backtest_executions: {
      total: number;
      by_status: CountByValue;
      result_summary_non_null: number;
      artifact_pointer_non_null: number;
    };
    internal_backtest_artifacts: {
      total: number;
      by_kind: CountByValue;
      orphan_count: number;
    };
    backtests: {
      internal_backtest_reports: number;
      tradingview_reports: number;
      internal_reports_with_execution_id_snapshot: number;
      internal_reports_with_result_summary_snapshot: number;
      internal_reports_with_artifact_pointer_snapshot: number;
      internal_report_sample_ids_missing_required_snapshot: string[];
    };
    symbol_strategy_application_runs: {
      internal_runs: number;
      internal_execution_reference_count: number;
      backtest_reference_count: number;
      both_internal_execution_and_backtest: number;
      internal_execution_only: number;
      backtest_only: number;
      neither_internal_execution_nor_backtest: number;
    };
    ai_summary: {
      internal_backtest_report_ai_summaries: number;
      ai_jobs_for_internal_backtest_reports: number;
      ai_jobs_with_internal_execution_dependency: number;
    };
  };
  risk_summary: {
    can_drop_execution_tables_without_losing_report_display: boolean;
    needs_snapshot_retention_migration: boolean;
    notes: string[];
  };
  meta: {
    read_only: true;
    sanitized: true;
    raw_snapshot_included: false;
    raw_artifact_included: false;
    raw_csv_included: false;
    local_path_included: false;
    endpoint_included: false;
    model_value_included: false;
  };
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasSnapshotField(snapshot: unknown, field: string): boolean {
  return isRecord(snapshot) && snapshot[field] !== undefined && snapshot[field] !== null;
}

function sortRecord(record: CountByValue): CountByValue {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function requestPayloadHasInternalExecutionDependency(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const directKeys = [
    'source_internal_backtest_execution_id',
    'internal_backtest_execution_id',
    'sourceInternalBacktestExecutionId',
    'internalBacktestExecutionId',
  ];
  return directKeys.some((key) => typeof payload[key] === 'string' && payload[key] !== '');
}

export function buildInternalBacktestDataAuditSummary(
  input: InternalBacktestDataAuditInput,
): InternalBacktestDataAuditSummary {
  const internalReports = input.backtests.internalBacktestReports;
  const missingExecutionSnapshot =
    internalReports - input.backtests.internalReportsWithExecutionIdSnapshot;
  const missingResultSummarySnapshot =
    internalReports - input.backtests.internalReportsWithResultSummarySnapshot;
  const needsSnapshotRetentionMigration =
    missingExecutionSnapshot > 0 || missingResultSummarySnapshot > 0;

  const notes: string[] = [];
  if (input.internalBacktestExecutions.total > 0) {
    notes.push('internal backtest executions remain; review relation and retention policy before dropping execution tables.');
  }
  if (input.internalBacktestArtifacts.total > 0) {
    notes.push('internal backtest artifacts remain; verify whether artifact pointer metadata is sufficient before dropping artifact tables.');
  }
  if (input.internalBacktestArtifacts.orphanCount > 0) {
    notes.push('orphan internal backtest artifacts were detected; investigate before cleanup.');
  }
  if (input.symbolStrategyApplicationRuns.internalExecutionReferenceCount > 0) {
    notes.push('symbol strategy application runs still reference internal executions; dropping the relation may remove historical linkage.');
  }
  if (needsSnapshotRetentionMigration) {
    notes.push('some internal reports are missing required execution id or result summary snapshots; design retention or migration before Stage 2C drop.');
  }
  if (input.aiSummary.internalBacktestReportAiSummaries > 0) {
    notes.push('AI summaries exist for internal backtest reports; keep Backtest report ids stable for read-only history.');
  }
  if (notes.length === 0) {
    notes.push('no internal backtest data was detected in the audited categories.');
  }

  return {
    audit_name: 'internal_backtest_stage_2c_data_audit',
    schema_version: '1.0',
    generated_at: input.generatedAt,
    counts: {
      internal_backtest_executions: {
        total: input.internalBacktestExecutions.total,
        by_status: sortRecord(input.internalBacktestExecutions.byStatus),
        result_summary_non_null: input.internalBacktestExecutions.resultSummaryNonNull,
        artifact_pointer_non_null: input.internalBacktestExecutions.artifactPointerNonNull,
      },
      internal_backtest_artifacts: {
        total: input.internalBacktestArtifacts.total,
        by_kind: sortRecord(input.internalBacktestArtifacts.byKind),
        orphan_count: input.internalBacktestArtifacts.orphanCount,
      },
      backtests: {
        internal_backtest_reports: internalReports,
        tradingview_reports: input.backtests.tradingviewReports,
        internal_reports_with_execution_id_snapshot: input.backtests.internalReportsWithExecutionIdSnapshot,
        internal_reports_with_result_summary_snapshot: input.backtests.internalReportsWithResultSummarySnapshot,
        internal_reports_with_artifact_pointer_snapshot: input.backtests.internalReportsWithArtifactPointerSnapshot,
        internal_report_sample_ids_missing_required_snapshot:
          input.backtests.internalReportSampleIdsMissingRequiredSnapshot.slice(0, 5),
      },
      symbol_strategy_application_runs: {
        internal_runs: input.symbolStrategyApplicationRuns.internalRuns,
        internal_execution_reference_count: input.symbolStrategyApplicationRuns.internalExecutionReferenceCount,
        backtest_reference_count: input.symbolStrategyApplicationRuns.backtestReferenceCount,
        both_internal_execution_and_backtest: input.symbolStrategyApplicationRuns.bothInternalExecutionAndBacktest,
        internal_execution_only: input.symbolStrategyApplicationRuns.internalExecutionOnly,
        backtest_only: input.symbolStrategyApplicationRuns.backtestOnly,
        neither_internal_execution_nor_backtest: input.symbolStrategyApplicationRuns.neitherInternalExecutionNorBacktest,
      },
      ai_summary: {
        internal_backtest_report_ai_summaries: input.aiSummary.internalBacktestReportAiSummaries,
        ai_jobs_for_internal_backtest_reports: input.aiSummary.aiJobsForInternalBacktestReports,
        ai_jobs_with_internal_execution_dependency: input.aiSummary.aiJobsWithInternalExecutionDependency,
      },
    },
    risk_summary: {
      can_drop_execution_tables_without_losing_report_display: !needsSnapshotRetentionMigration,
      needs_snapshot_retention_migration: needsSnapshotRetentionMigration,
      notes,
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
  };
}

type CountRow = { count: bigint };

function numberFromCountRow(rows: CountRow[]): number {
  return Number(rows[0]?.count ?? 0n);
}

export async function collectInternalBacktestDataAuditInput(
  db: PrismaClient,
  generatedAt = new Date().toISOString(),
): Promise<InternalBacktestDataAuditInput> {
  const internalReportRows = await db.backtest.findMany({
    where: { executionSource: 'internal_backtest' },
    select: { id: true, strategySnapshotJson: true },
  });
  const internalReportIds = internalReportRows.map((report) => report.id);

  const [
    executionStatusGroups,
    executionResultSummaryNonNullRows,
    executionArtifactPointerNonNullRows,
    artifactKindGroups,
    artifactOrphanCountRows,
    tradingviewReportCount,
    internalRuns,
    internalBacktestReportAiSummaryCount,
    aiJobsForInternalBacktestReports,
  ] = await Promise.all([
    db.internalBacktestExecution.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM internal_backtest_executions
      WHERE "resultSummaryJson" IS NOT NULL
    `,
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM internal_backtest_executions
      WHERE "artifactPointerJson" IS NOT NULL
    `,
    db.internalBacktestExecutionArtifact.groupBy({
      by: ['kind'],
      _count: { _all: true },
    }),
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM internal_backtest_execution_artifacts artifact
      LEFT JOIN internal_backtest_executions execution
        ON execution.id = artifact.execution_id
      WHERE execution.id IS NULL
    `,
    db.backtest.count({ where: { executionSource: 'tradingview' } }),
    db.symbolStrategyApplicationRun.findMany({
      where: { runType: 'internal_backtest' },
      select: {
        internalBacktestExecutionId: true,
        backtestId: true,
      },
    }),
    internalReportIds.length === 0
      ? Promise.resolve(0)
      : db.aiSummary.count({
        where: {
          summaryScope: 'backtest_review',
          targetEntityType: 'backtest',
          targetEntityId: { in: internalReportIds },
        },
      }),
    internalReportIds.length === 0
      ? Promise.resolve([])
      : db.aiJob.findMany({
        where: {
          jobType: 'generate_backtest_review_summary',
          targetEntityType: 'backtest',
          targetEntityId: { in: internalReportIds },
        },
        select: { requestPayload: true },
      }),
  ]);

  const executionStatusCounts = Object.fromEntries(
    executionStatusGroups.map((group) => [String(group.status), group._count._all]),
  );
  const artifactKindCounts = Object.fromEntries(
    artifactKindGroups.map((group) => [group.kind, group._count._all]),
  );
  const internalReportsWithExecutionIdSnapshot = internalReportRows.filter((report) =>
    hasSnapshotField(report.strategySnapshotJson, 'internal_backtest_execution_id')).length;
  const internalReportsWithResultSummarySnapshot = internalReportRows.filter((report) =>
    hasSnapshotField(report.strategySnapshotJson, 'result_summary')).length;
  const internalReportsWithArtifactPointerSnapshot = internalReportRows.filter((report) =>
    hasSnapshotField(report.strategySnapshotJson, 'artifact_pointer')).length;
  const missingRequiredSnapshotSampleIds = internalReportRows
    .filter((report) =>
      !hasSnapshotField(report.strategySnapshotJson, 'internal_backtest_execution_id')
      || !hasSnapshotField(report.strategySnapshotJson, 'result_summary'))
    .map((report) => report.id)
    .slice(0, 5);

  const internalRunsWithExecution = internalRuns.filter((run) => run.internalBacktestExecutionId);
  const internalRunsWithBacktest = internalRuns.filter((run) => run.backtestId);
  const bothInternalExecutionAndBacktest = internalRuns.filter((run) =>
    run.internalBacktestExecutionId && run.backtestId).length;
  const internalExecutionOnly = internalRuns.filter((run) =>
    run.internalBacktestExecutionId && !run.backtestId).length;
  const backtestOnly = internalRuns.filter((run) =>
    !run.internalBacktestExecutionId && run.backtestId).length;
  const neitherInternalExecutionNorBacktest = internalRuns.filter((run) =>
    !run.internalBacktestExecutionId && !run.backtestId).length;

  return {
    generatedAt,
    internalBacktestExecutions: {
      total: Object.values(executionStatusCounts).reduce((sum, count) => sum + count, 0),
      byStatus: executionStatusCounts,
      resultSummaryNonNull: numberFromCountRow(executionResultSummaryNonNullRows),
      artifactPointerNonNull: numberFromCountRow(executionArtifactPointerNonNullRows),
    },
    internalBacktestArtifacts: {
      total: Object.values(artifactKindCounts).reduce((sum, count) => sum + count, 0),
      byKind: artifactKindCounts,
      orphanCount: numberFromCountRow(artifactOrphanCountRows),
    },
    backtests: {
      internalBacktestReports: internalReportRows.length,
      tradingviewReports: tradingviewReportCount,
      internalReportsWithExecutionIdSnapshot,
      internalReportsWithResultSummarySnapshot,
      internalReportsWithArtifactPointerSnapshot,
      internalReportSampleIdsMissingRequiredSnapshot: missingRequiredSnapshotSampleIds,
    },
    symbolStrategyApplicationRuns: {
      internalRuns: internalRuns.length,
      internalExecutionReferenceCount: internalRunsWithExecution.length,
      backtestReferenceCount: internalRunsWithBacktest.length,
      bothInternalExecutionAndBacktest,
      internalExecutionOnly,
      backtestOnly,
      neitherInternalExecutionNorBacktest,
    },
    aiSummary: {
      internalBacktestReportAiSummaries: internalBacktestReportAiSummaryCount,
      aiJobsForInternalBacktestReports: aiJobsForInternalBacktestReports.length,
      aiJobsWithInternalExecutionDependency: aiJobsForInternalBacktestReports
        .filter((job) => requestPayloadHasInternalExecutionDependency(job.requestPayload)).length,
    },
  };
}
