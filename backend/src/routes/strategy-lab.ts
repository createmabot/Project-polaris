import { FastifyPluginAsync } from 'fastify';
import { formatSuccess } from '../utils/response';
import { createStrategyProposalProvider } from '../strategy-proposals/provider';
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
    const input = parseStrategyProposalRequest(request.body ?? {});
    const provider = createStrategyProposalProvider('stub');
    const generated = await provider.generate(input);

    const data = validateStrategyProposalData({
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      input,
      provider: generated.provider,
      candidates: generated.candidates,
      disclaimer: generated.disclaimer,
    });

    return reply.status(200).send(formatSuccess(request, data));
  });
};
