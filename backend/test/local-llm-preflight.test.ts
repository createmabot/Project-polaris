import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const scriptPath = path.join(repoRoot, 'scripts/preflight-local-llm.mjs');

function runPreflight(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  });
}

describe('local LLM dev preflight', () => {
  it('skips when no local_llm provider is active', () => {
    const result = runPreflight({
      HOME_AI_PROVIDER: 'stub',
      PINE_GENERATION_PROVIDER: 'deterministic',
      STRATEGY_PROPOSAL_PROVIDER: 'stub',
      SKIP_LOCAL_LLM_PREFLIGHT: '',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('skipped: no local_llm providers are active');
  });

  it('can be explicitly skipped', () => {
    const result = runPreflight({
      HOME_AI_PROVIDER: 'local_llm',
      PINE_GENERATION_PROVIDER: 'local_llm',
      STRATEGY_PROPOSAL_PROVIDER: 'local_llm',
      LOCAL_LLM_ENDPOINT: 'http://127.0.0.1:9',
      SKIP_LOCAL_LLM_PREFLIGHT: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('skipped by SKIP_LOCAL_LLM_PREFLIGHT');
  });

  it('fails with sanitized guidance when local_llm is active but unreachable', () => {
    const result = runPreflight({
      HOME_AI_PROVIDER: 'local_llm',
      PINE_GENERATION_PROVIDER: 'deterministic',
      STRATEGY_PROPOSAL_PROVIDER: 'stub',
      LOCAL_LLM_ENDPOINT: 'http://127.0.0.1:9',
      SKIP_LOCAL_LLM_PREFLIGHT: '',
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain('local LLM is required but not reachable');
    expect(output).toContain('HOME_AI_PROVIDER');
    expect(output).not.toContain('127.0.0.1:9');
    expect(output).not.toContain('stack');
  });
});
