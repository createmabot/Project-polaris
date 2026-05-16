import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { createStrategyProposalProvider, getStrategyProposalProviderSelection } from '../strategy-proposals/provider';
import {
  buildStrategyProposalObservation,
  classifyStrategyProposalInvalidReason,
  statusForInvalidReason,
} from '../strategy-proposals/instrumentation';
import {
  parseStrategyProposalRequest,
  validateStrategyProposalData,
} from '../strategy-proposals/validation';
import type {
  StrategyProposalCandidate,
  StrategyProposalData,
  StrategyProposalProviderObservation,
  StrategyProposalRequest,
} from '../strategy-proposals/types';

type ProposalBody = {
  market?: unknown;
  timeframe?: unknown;
  symbol_code?: unknown;
  risk_preference?: unknown;
  strategy_type_bias?: unknown;
  proposal_count?: unknown;
  user_hint?: unknown;
};

type ProposalSelectBody = {
  candidate_id?: unknown;
  proposal_candidate_id?: unknown;
};

function parseProposalHistoryLimit(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : 20;
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 20;
  }
  return Math.min(parsed, 50);
}

function serializeCandidate(row: any) {
  return {
    id: row.id,
    proposal_run_id: row.proposalRunId,
    provider_candidate_id: row.providerCandidateId,
    rank: row.rank,
    candidate: row.candidateJson,
    selected_at: row.selectedAt?.toISOString?.() ?? row.selectedAt ?? null,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
  };
}

function serializeRun(row: any) {
  return {
    id: row.id,
    status: row.status,
    provider_name: row.providerName,
    provider_mode: row.providerMode,
    selected_by: row.selectedBy,
    input: row.inputJson,
    provider_observation: row.providerObservationJson,
    candidate_count: row.candidateCount,
    selected_candidate_id: row.selectedCandidateId ?? null,
    completed_at: row.completedAt?.toISOString?.() ?? row.completedAt ?? null,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

async function createProposalRun(params: {
  input: StrategyProposalRequest;
  status: 'succeeded' | 'failed';
  providerName: string;
  providerMode: string;
  selectedBy: StrategyProposalProviderObservation['selected_by'];
  providerObservation: StrategyProposalProviderObservation;
  candidates: StrategyProposalCandidate[];
}) {
  return (prisma as any).$transaction(async (tx: any) => {
    const run = await tx.strategyProposalRun.create({
      data: {
        status: params.status,
        providerName: params.providerName,
        providerMode: params.providerMode,
        selectedBy: params.selectedBy,
        inputJson: params.input,
        userHint: params.input.user_hint,
        providerObservationJson: params.providerObservation,
        candidateCount: params.candidates.length,
        completedAt: new Date(),
      },
    });

    for (const [index, candidate] of params.candidates.entries()) {
      await tx.strategyProposalCandidate.create({
        data: {
          proposalRunId: run.id,
          providerCandidateId: candidate.candidate_id,
          rank: index + 1,
          candidateJson: candidate,
        },
      });
    }

    return run;
  });
}

function withProposalRunId(data: StrategyProposalData, proposalRunId: string): StrategyProposalData & {
  proposal_run_id: string;
  history: { proposal_run_id: string };
} {
  return {
    ...data,
    proposal_run_id: proposalRunId,
    history: {
      proposal_run_id: proposalRunId,
    },
  };
}

export const strategyLabRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ProposalBody }>('/proposals', async (request, reply) => {
    const startedAtMs = Date.now();
    const selection = getStrategyProposalProviderSelection();
    let input: StrategyProposalRequest | null = null;

    try {
      input = parseStrategyProposalRequest(request.body ?? {});
      const provider = createStrategyProposalProvider(selection.mode);
      const generated = await provider.generate(input);
      const providerObservation = buildStrategyProposalObservation({
        startedAtMs,
        selection,
        provider: generated.provider,
        status: 'succeeded',
        candidateCount: generated.candidates.length,
        schemaValid: true,
      });

      const data = validateStrategyProposalData({
        schema_name: 'strategy_proposal_candidates',
        schema_version: '1.0',
        input,
        provider: generated.provider,
        candidates: generated.candidates,
        disclaimer: generated.disclaimer,
        provider_observation: providerObservation,
      });
      const run = await createProposalRun({
        input,
        status: 'succeeded',
        providerName: data.provider.name,
        providerMode: data.provider.mode,
        selectedBy: providerObservation.selected_by,
        providerObservation,
        candidates: data.candidates,
      });

      return reply.status(200).send(formatSuccess(request, withProposalRunId(data, run.id)));
    } catch (error) {
      if (error instanceof AppError && error.code === 'PROVIDER_INVALID_RESPONSE') {
        const invalidReason = classifyStrategyProposalInvalidReason(error);
        const providerObservation = buildStrategyProposalObservation({
          startedAtMs,
          selection,
          status: statusForInvalidReason(invalidReason),
          candidateCount: 0,
          invalidReason,
          validationErrorCount: 1,
          schemaValid: false,
        });
        let proposalRunId: string | undefined;
        if (input) {
          const run = await createProposalRun({
            input,
            status: 'failed',
            providerName: providerObservation.provider_name,
            providerMode: selection.mode,
            selectedBy: providerObservation.selected_by,
            providerObservation,
            candidates: [],
          });
          proposalRunId = run.id;
        }
        throw new AppError(error.statusCode, error.code, error.message, {
          provider_observation: providerObservation,
          ...(proposalRunId ? { proposal_run_id: proposalRunId, history: { proposal_run_id: proposalRunId } } : {}),
        });
      }
      throw error;
    }
  });

  fastify.get<{ Querystring: { limit?: string } }>('/proposals', async (request, reply) => {
    const limit = parseProposalHistoryLimit(request.query.limit);
    const runs = await (prisma as any).strategyProposalRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return reply.status(200).send(formatSuccess(request, {
      proposal_runs: runs.map(serializeRun),
      limit,
    }));
  });

  fastify.get<{ Params: { proposalRunId: string } }>('/proposals/:proposalRunId', async (request, reply) => {
    const run = await (prisma as any).strategyProposalRun.findUnique({
      where: { id: request.params.proposalRunId },
      include: { candidates: { orderBy: { rank: 'asc' } } },
    });
    if (!run) {
      throw new AppError(404, 'NOT_FOUND', 'Strategy proposal run was not found.');
    }

    return reply.status(200).send(formatSuccess(request, {
      proposal_run: serializeRun(run),
      candidates: run.candidates.map(serializeCandidate),
    }));
  });

  fastify.post<{ Params: { proposalRunId: string }; Body: ProposalSelectBody }>('/proposals/:proposalRunId/select', async (request, reply) => {
    const candidateId = typeof request.body?.candidate_id === 'string' ? request.body.candidate_id.trim() : '';
    const proposalCandidateId = typeof request.body?.proposal_candidate_id === 'string'
      ? request.body.proposal_candidate_id.trim()
      : '';
    if (!candidateId && !proposalCandidateId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'candidate_id or proposal_candidate_id is required.');
    }

    const run = await (prisma as any).strategyProposalRun.findUnique({
      where: { id: request.params.proposalRunId },
      include: { candidates: { orderBy: { rank: 'asc' } } },
    });
    if (!run) {
      throw new AppError(404, 'NOT_FOUND', 'Strategy proposal run was not found.');
    }
    const selected = run.candidates.find((candidate: any) => (
      candidate.id === (candidateId || proposalCandidateId) || (Boolean(candidateId) && candidate.providerCandidateId === candidateId)
    ));
    if (!selected) {
      throw new AppError(400, 'VALIDATION_ERROR', 'candidate_id or proposal_candidate_id must belong to the proposal run.');
    }

    const { updatedRun, selectedCandidate } = await (prisma as any).$transaction(async (tx: any) => {
      const selectedAt = new Date();
      await tx.strategyProposalCandidate.updateMany({
        where: { proposalRunId: run.id },
        data: { selectedAt: null },
      });
      const selectedCandidate = await tx.strategyProposalCandidate.update({
        where: { id: selected.id },
        data: { selectedAt },
      });
      const updatedRun = await tx.strategyProposalRun.update({
        where: { id: run.id },
        data: { selectedCandidateId: selected.id },
        include: { candidates: { orderBy: { rank: 'asc' } } },
      });
      return { updatedRun, selectedCandidate };
    });

    return reply.status(200).send(formatSuccess(request, {
      proposal_run: serializeRun(updatedRun),
      selected_candidate: serializeCandidate(selectedCandidate),
    }));
  });
};
