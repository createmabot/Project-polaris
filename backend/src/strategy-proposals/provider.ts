import { StrategyProposalProvider } from './types';
import { StubStrategyProposalProvider } from './stub-provider';
import { LocalLlmStrategyProposalProvider } from './local-llm-provider';

export type StrategyProposalProviderMode = 'stub' | 'local_llm';
export type StrategyProposalProviderSelectedBy = 'default' | 'env' | 'config';
export type StrategyProposalProviderSelection = {
  mode: StrategyProposalProviderMode;
  selectedBy: StrategyProposalProviderSelectedBy;
};

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
  return getStrategyProposalProviderSelection().mode;
}

export function getStrategyProposalProviderSelection(): StrategyProposalProviderSelection {
  const raw = process.env.STRATEGY_PROPOSAL_PROVIDER?.trim();
  if (raw === 'local_llm') {
    return { mode: 'local_llm', selectedBy: 'env' };
  }
  if (raw === 'stub') {
    return { mode: 'stub', selectedBy: 'env' };
  }
  return { mode: 'stub', selectedBy: raw ? 'env' : 'default' };
}
