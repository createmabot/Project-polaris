import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { normalizeTimeframeAlias } from '../strategy/timeframe';
import {
  candidateToRewriteContext,
  sanitizeCandidateStatus,
  isRecord,
  sanitizeOptimizationText,
  toOptimizationCandidateResponse,
  toOptimizationSessionResponse,
} from '../strategy/optimization-sessions';
import { AppError, formatSuccess } from '../utils/response';

function toCreatedStrategyVersionResponse(version: any) {
  return {
    id: version.id,
    strategy_id: version.strategyRuleId,
    cloned_from_version_id: version.clonedFromVersionId,
    status: version.status,
    warnings: Array.isArray(version.warningsJson) ? version.warningsJson.filter((item: unknown) => typeof item === 'string') : [],
    assumptions: Array.isArray(version.assumptionsJson) ? version.assumptionsJson.filter((item: unknown) => typeof item === 'string') : [],
    market: version.market,
    timeframe: normalizeTimeframeAlias(version.timeframe),
    created_at: version.createdAt,
    updated_at: version.updatedAt,
  };
}

function annotationLabel(value: unknown): string | null {
  const sanitized = sanitizeOptimizationText(value, 80);
  return sanitized ? sanitized.slice(0, 80) : null;
}

function annotationNote(value: unknown): string | null {
  const sanitized = sanitizeOptimizationText(value, 240);
  return sanitized ? sanitized.slice(0, 240) : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseBacktestMetrics(backtest: any | null) {
  const latestImport = Array.isArray(backtest?.imports) ? backtest.imports[0] : null;
  const parsed = isRecord(latestImport?.parsedSummaryJson) ? latestImport.parsedSummaryJson : {};
  return {
    backtest_id: backtest?.id ?? null,
    title: backtest?.title ?? null,
    status: backtest?.status ?? null,
    execution_source: backtest?.executionSource ?? null,
    market: backtest?.market ?? null,
    timeframe: backtest?.timeframe ? normalizeTimeframeAlias(backtest.timeframe) : null,
    updated_at: backtest?.updatedAt ?? null,
    total_trades: numberOrNull(parsed.totalTrades),
    win_rate: numberOrNull(parsed.winRate),
    profit_factor: numberOrNull(parsed.profitFactor),
    max_drawdown: numberOrNull(parsed.maxDrawdown),
    net_profit: numberOrNull(parsed.netProfit),
  };
}

function diffNumber(value: number | null, base: number | null): number | null {
  if (typeof value !== 'number' || typeof base !== 'number') return null;
  return Number((value - base).toFixed(4));
}

type CandidateImproveApplicationContext = {
  symbol_id: string;
  symbol_code: string;
  symbol_name: string;
  application_id: string;
  source_version_id: string;
};

async function resolveCandidateImproveApplicationContext(candidate: any): Promise<CandidateImproveApplicationContext | null> {
  if (!candidate?.sourceBacktestId) return null;
  const run = await prisma.symbolStrategyApplicationRun.findFirst({
    where: { backtestId: candidate.sourceBacktestId },
    orderBy: { createdAt: 'desc' },
    include: {
      application: {
        include: {
          symbol: true,
        },
      },
    },
  });
  const application = run?.application;
  const symbol = application?.symbol;
  if (!application || !symbol) return null;
  const symbolCode = symbol.symbolCode ?? symbol.symbol;
  const symbolName = symbol.displayName ?? symbol.symbolCode ?? symbol.symbol;
  if (!symbol.id || !symbolCode || !symbolName || !application.id) return null;
  return {
    symbol_id: symbol.id,
    symbol_code: symbolCode,
    symbol_name: symbolName,
    application_id: application.id,
    source_version_id: candidate.parentStrategyVersionId ?? application.strategyRuleVersionId,
  };
}

function buildCandidateDetailUrl(
  candidate: any,
  versionId: string,
  context: CandidateImproveApplicationContext | null = null,
): string {
  const params = new URLSearchParams();
  params.set('mode', 'improve_application');
  if (context) {
    params.set('symbol_id', context.symbol_id);
    params.set('symbol_code', context.symbol_code);
    params.set('symbol_name', context.symbol_name);
    params.set('application_id', context.application_id);
    params.set('source_version_id', context.source_version_id);
  }
  if (candidate.sourceBacktestId) params.set('source_backtest_id', candidate.sourceBacktestId);
  params.set('refinement_candidate_id', candidate.id);
  if (candidate.sourceBacktestId) params.set('return_to', `/backtests/${candidate.sourceBacktestId}`);
  return `/strategy-versions/${encodeURIComponent(versionId)}?${params.toString()}`;
}

export const strategyOptimizationSessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { sessionId: string } }>('/:sessionId', async (request, reply) => {
    const orm = prisma as any;
    const session = await orm.strategyOptimizationSession.findUnique({
      where: { id: request.params.sessionId },
    });
    if (!session) {
      throw new AppError(404, 'NOT_FOUND', 'strategy optimization session was not found.');
    }
    const candidates = await orm.strategyRefinementCandidate.findMany({
      where: { sessionId: session.id },
      orderBy: [{ candidateIndex: 'asc' }, { createdAt: 'asc' }],
    });
    const sourceBacktest = session.sourceBacktestId
      ? await prisma.backtest.findUnique({
          where: { id: session.sourceBacktestId },
          include: {
            imports: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        })
      : null;
    const baseVersion = await prisma.strategyRuleVersion.findUnique({
      where: { id: session.baseStrategyVersionId },
      select: {
        id: true,
        strategyRuleId: true,
        market: true,
        timeframe: true,
        status: true,
        updatedAt: true,
      },
    });
    const baseMetrics = parseBacktestMetrics(sourceBacktest);
    const candidatesWithReports = await Promise.all(
      candidates.map(async (candidate: any) => {
        const improveContext = candidate.createdStrategyRuleVersionId
          ? await resolveCandidateImproveApplicationContext(candidate)
          : null;
        const latestBacktest = candidate.createdStrategyRuleVersionId
          ? await prisma.backtest.findFirst({
              where: { strategyRuleVersionId: candidate.createdStrategyRuleVersionId },
              orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
              include: {
                imports: { orderBy: { createdAt: 'desc' }, take: 1 },
              },
            })
          : null;
        const latestMetrics = parseBacktestMetrics(latestBacktest);
        return toOptimizationCandidateResponse(candidate, {
          detail_url: candidate.createdStrategyRuleVersionId
            ? buildCandidateDetailUrl(candidate, candidate.createdStrategyRuleVersionId, improveContext)
            : null,
          latest_backtest_report: latestBacktest
            ? {
                id: latestBacktest.id,
                title: latestBacktest.title,
                status: latestBacktest.status,
                execution_source: latestBacktest.executionSource,
                market: latestBacktest.market,
                timeframe: normalizeTimeframeAlias(latestBacktest.timeframe),
                updated_at: latestBacktest.updatedAt,
                metrics: latestMetrics,
                diff_vs_base: {
                  profit_factor: diffNumber(latestMetrics.profit_factor, baseMetrics.profit_factor),
                  win_rate: diffNumber(latestMetrics.win_rate, baseMetrics.win_rate),
                  max_drawdown: diffNumber(latestMetrics.max_drawdown, baseMetrics.max_drawdown),
                  net_profit: diffNumber(latestMetrics.net_profit, baseMetrics.net_profit),
                  total_trades: diffNumber(latestMetrics.total_trades, baseMetrics.total_trades),
                },
              }
            : null,
        });
      }),
    );
    return reply.status(200).send(
      formatSuccess(request, {
        optimization_session: toOptimizationSessionResponse(session, [], {
          source_backtest: sourceBacktest
            ? {
                id: sourceBacktest.id,
                title: sourceBacktest.title,
                status: sourceBacktest.status,
                execution_source: sourceBacktest.executionSource,
                market: sourceBacktest.market,
                timeframe: normalizeTimeframeAlias(sourceBacktest.timeframe),
                updated_at: sourceBacktest.updatedAt,
                metrics: baseMetrics,
              }
            : null,
          base_version: {
            id: session.baseStrategyVersionId,
            strategy_id: baseVersion?.strategyRuleId ?? session.strategyRuleId,
            market: baseVersion?.market ?? null,
            timeframe: baseVersion?.timeframe ? normalizeTimeframeAlias(baseVersion.timeframe) : null,
            status: baseVersion?.status ?? null,
            updated_at: baseVersion?.updatedAt ?? null,
          },
          candidates: candidatesWithReports,
          comparison_rows: candidatesWithReports.map((candidate: any) => ({
            candidate_id: candidate.id,
            candidate_index: candidate.candidate_index,
            status: candidate.status,
            latest_backtest_report: candidate.latest_backtest_report,
          })),
          meta: {
            includes_raw_prompt: false,
            includes_raw_provider_response: false,
            includes_raw_csv: false,
            includes_raw_import_text: false,
            includes_raw_pine: false,
          },
        }),
      }),
    );
  });
};

export const strategyRefinementCandidateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { candidateId: string } }>('/:candidateId', async (request, reply) => {
    const orm = prisma as any;
    const candidate = await orm.strategyRefinementCandidate.findUnique({
      where: { id: request.params.candidateId },
    });
    if (!candidate) {
      throw new AppError(404, 'NOT_FOUND', 'strategy refinement candidate was not found.');
    }
    return reply.status(200).send(
      formatSuccess(request, {
        refinement_candidate: toOptimizationCandidateResponse(candidate),
      }),
    );
  });

  fastify.patch<{
    Params: { candidateId: string };
    Body: { status?: unknown };
  }>('/:candidateId/status', async (request, reply) => {
    const nextStatus = sanitizeCandidateStatus(request.body?.status);
    const now = new Date();
    const orm = prisma as any;
    const existing = await orm.strategyRefinementCandidate.findUnique({
      where: { id: request.params.candidateId },
    });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'strategy refinement candidate was not found.');
    }
    const candidate = await orm.strategyRefinementCandidate.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        selectedAt: nextStatus === 'selected' ? (existing.selectedAt ?? now) : existing.selectedAt,
      },
    });
    return reply.status(200).send(
      formatSuccess(request, {
        refinement_candidate: toOptimizationCandidateResponse(candidate),
      }),
    );
  });

  fastify.post<{ Params: { candidateId: string } }>('/:candidateId/create-version', async (request, reply) => {
    const orm = prisma as any;
    const existing = await orm.strategyRefinementCandidate.findUnique({
      where: { id: request.params.candidateId },
    });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'strategy refinement candidate was not found.');
    }
    if (existing.createdStrategyRuleVersionId) {
      const improveContext = await resolveCandidateImproveApplicationContext(existing);
      const detailUrl = buildCandidateDetailUrl(existing, existing.createdStrategyRuleVersionId, improveContext);
      return reply.status(200).send(
        formatSuccess(request, {
          strategy_version: {
            id: existing.createdStrategyRuleVersionId,
          },
          refinement_candidate: toOptimizationCandidateResponse(existing, {
            detail_url: detailUrl,
          }),
          detail_url: detailUrl,
        }),
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const txOrm = tx as any;
      const candidate = await txOrm.strategyRefinementCandidate.findUnique({
        where: { id: existing.id },
      });
      if (!candidate) {
        throw new AppError(404, 'NOT_FOUND', 'strategy refinement candidate was not found.');
      }
      if (candidate.createdStrategyRuleVersionId) {
        return { clonedVersion: null, candidate };
      }
      const parentVersion = await tx.strategyRuleVersion.findUnique({
        where: { id: candidate.parentStrategyVersionId },
      });
      if (!parentVersion) {
        throw new AppError(404, 'NOT_FOUND', 'parent strategy version was not found.');
      }

      const clonedVersion = await tx.strategyRuleVersion.create({
        data: {
          strategyRuleId: parentVersion.strategyRuleId,
          clonedFromVersionId: parentVersion.id,
          naturalLanguageRule: parentVersion.naturalLanguageRule,
          normalizedRuleJson: (parentVersion.normalizedRuleJson ?? undefined) as Prisma.InputJsonValue | undefined,
          generatedPine: parentVersion.generatedPine,
          warningsJson: (parentVersion.warningsJson ?? undefined) as Prisma.InputJsonValue | undefined,
          assumptionsJson: (parentVersion.assumptionsJson ?? undefined) as Prisma.InputJsonValue | undefined,
          market: parentVersion.market,
          timeframe: normalizeTimeframeAlias(parentVersion.timeframe),
          status: parentVersion.status,
        },
      });

      const sourcePine = await tx.pineScript.findFirst({
        where: { strategyRuleVersionId: parentVersion.id },
        orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      });
      if (sourcePine) {
        await tx.pineScript.create({
          data: {
            strategyRuleVersionId: clonedVersion.id,
            parentPineScriptId: sourcePine.id,
            scriptName: sourcePine.scriptName,
            pineVersion: sourcePine.pineVersion,
            scriptBody: sourcePine.scriptBody,
            status: sourcePine.status,
            generationNoteJson: {
              source: 'strategy_refinement_candidate_create_version',
              source_candidate_id: candidate.id,
              source_pine_script_id: sourcePine.id,
              cloned_for_optimization_session: true,
            },
          },
        });
      }

      const label = annotationLabel(candidate.title);
      const note = annotationNote(candidate.changeSummary);
      if (label || note) {
        await tx.strategyVersionAnnotation.create({
          data: {
            strategyRuleVersionId: clonedVersion.id,
            label,
            note,
            isFavorite: false,
          },
        });
      }

      const updatedCandidate = await txOrm.strategyRefinementCandidate.update({
        where: { id: candidate.id },
        data: {
          createdStrategyRuleVersionId: clonedVersion.id,
          status: 'version_created',
          selectedAt: candidate.selectedAt ?? new Date(),
        },
      });

      return { clonedVersion, candidate: updatedCandidate };
    });
    if (!result.clonedVersion) {
      const versionId = result.candidate.createdStrategyRuleVersionId;
      const improveContext = await resolveCandidateImproveApplicationContext(result.candidate);
      const detailUrl = versionId ? buildCandidateDetailUrl(result.candidate, versionId, improveContext) : null;
      return reply.status(200).send(
        formatSuccess(request, {
          strategy_version: {
            id: versionId,
          },
          refinement_candidate: toOptimizationCandidateResponse(result.candidate, {
            detail_url: detailUrl,
          }),
          detail_url: detailUrl,
        }),
      );
    }

    const improveContext = await resolveCandidateImproveApplicationContext(result.candidate);
    const detailUrl = buildCandidateDetailUrl(result.candidate, result.clonedVersion.id, improveContext);
    return reply.status(201).send(
      formatSuccess(request, {
        strategy_version: toCreatedStrategyVersionResponse(result.clonedVersion),
        refinement_candidate: toOptimizationCandidateResponse(result.candidate, {
          detail_url: detailUrl,
        }),
        detail_url: detailUrl,
        rewrite_context: {
          refinement_candidate: candidateToRewriteContext(result.candidate),
        },
      }),
    );
  });
};
