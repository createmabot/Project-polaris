import { StrategyProposalProvider } from './types';
import { StubStrategyProposalProvider } from './stub-provider';
import { LocalLlmStrategyProposalProvider } from './local-llm-provider';

export type StrategyProposalProviderMode = 'stub' | 'local_llm';

export function createStrategyProposalProvider(mode: StrategyProposalProviderMode = 'stub'): StrategyProposalProvider {
  switch (mode) {
    case 'stub':
      return new StubStrategyProposalProvider();
    case 'local_llm':
      return new LocalLlmStrategyProposalProvider();
    default:
      return new StubStrategyProposalProvider();
  }
}

export function getStrategyProposalProviderMode(): StrategyProposalProviderMode {
  const raw = process.env.STRATEGY_PROPOSAL_PROVIDER?.trim();
  return raw === 'local_llm' ? 'local_llm' : 'stub';
}
