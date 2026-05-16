import { FastifyPluginAsync } from 'fastify';
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

type ProposalBody = {
  market?: unknown;
  timeframe?: unknown;
  symbol_code?: unknown;
  risk_preference?: unknown;
  strategy_type_bias?: unknown;
  proposal_count?: unknown;
  user_hint?: unknown;
};

export const strategyLabRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ProposalBody }>('/proposals', async (request, reply) => {
    const startedAtMs = Date.now();
    const selection = getStrategyProposalProviderSelection();

    try {
      const input = parseStrategyProposalRequest(request.body ?? {});
      const provider = createStrategyProposalProvider(selection.mode);
      const generated = await provider.generate(input);

      const data = validateStrategyProposalData({
        schema_name: 'strategy_proposal_candidates',
        schema_version: '1.0',
        input,
        provider: generated.provider,
        candidates: generated.candidates,
        disclaimer: generated.disclaimer,
        provider_observation: buildStrategyProposalObservation({
          startedAtMs,
          selection,
          provider: generated.provider,
          status: 'succeeded',
          candidateCount: generated.candidates.length,
          schemaValid: true,
        }),
      });

      return reply.status(200).send(formatSuccess(request, data));
    } catch (error) {
      if (error instanceof AppError && error.code === 'PROVIDER_INVALID_RESPONSE') {
        const invalidReason = classifyStrategyProposalInvalidReason(error);
        throw new AppError(error.statusCode, error.code, error.message, {
          provider_observation: buildStrategyProposalObservation({
            startedAtMs,
            selection,
            status: statusForInvalidReason(invalidReason),
            candidateCount: 0,
            invalidReason,
            validationErrorCount: 1,
            schemaValid: false,
          }),
        });
      }
      throw error;
    }
  });
};
