import { StrategyProposalProvider } from './types';
import { StubStrategyProposalProvider } from './stub-provider';

export type StrategyProposalProviderMode = 'stub';

export function createStrategyProposalProvider(mode: StrategyProposalProviderMode = 'stub'): StrategyProposalProvider {
  switch (mode) {
    case 'stub':
      return new StubStrategyProposalProvider();
    default:
      return new StubStrategyProposalProvider();
  }
}
