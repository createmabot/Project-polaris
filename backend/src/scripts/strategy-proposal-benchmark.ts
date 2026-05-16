import { runStrategyProposalBenchmarkScenario } from '../strategy-proposals/benchmark';
import {
  STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS,
  type StrategyProposalBenchmarkScenario,
} from '../strategy-proposals/benchmark-scenarios';
import type { StrategyProposalProviderMode } from '../strategy-proposals/provider';

type CliOptions = {
  providerMode?: StrategyProposalProviderMode;
  scenarioIds: string[];
  help: boolean;
};

function printHelp() {
  console.log([
    'Usage: pnpm --filter backend strategy-proposal:benchmark [--provider=stub|local_llm] [--scenario=id[,id]]',
    '',
    'Runs an optional sanitized Strategy proposal benchmark summary.',
    'The default benchmark provider is stub and does not read STRATEGY_PROPOSAL_PROVIDER.',
    'This command is not a required check and does not print raw prompt, raw response, endpoint, model value, or user_hint text.',
  ].join('\n'));
}

function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = { scenarioIds: [], help: false };
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg.startsWith('--provider=')) {
      const provider = arg.slice('--provider='.length);
      if (provider !== 'stub' && provider !== 'local_llm') {
        throw new Error('provider must be stub or local_llm');
      }
      options.providerMode = provider;
      continue;
    }
    if (arg.startsWith('--scenario=')) {
      options.scenarioIds = arg
        .slice('--scenario='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }
    throw new Error('unsupported argument');
  }
  return options;
}

function selectScenarios(ids: string[]): StrategyProposalBenchmarkScenario[] {
  if (ids.length === 0) {
    return STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS;
  }
  const known = new Map(STRATEGY_PROPOSAL_BENCHMARK_SCENARIOS.map((scenario) => [scenario.id, scenario]));
  const selected = ids.map((id) => known.get(id));
  if (selected.some((scenario) => !scenario)) {
    throw new Error('unknown scenario id');
  }
  return selected as StrategyProposalBenchmarkScenario[];
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const scenarios = selectScenarios(options.scenarioIds);
  const results = [];
  for (const scenario of scenarios) {
    results.push(await runStrategyProposalBenchmarkScenario(scenario, {
      providerMode: options.providerMode,
    }));
  }

  console.log(JSON.stringify({
    schema_name: 'strategy_proposal_benchmark_summary',
    schema_version: '1.0',
    provider_requested: options.providerMode ?? 'stub',
    scenario_count: results.length,
    results,
  }, null, 2));
}

main().catch(() => {
  console.error('Strategy proposal benchmark failed before producing a sanitized summary.');
  process.exitCode = 1;
});
