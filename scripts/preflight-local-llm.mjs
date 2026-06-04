#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

const DEFAULT_LOCAL_LLM_ENDPOINT = 'http://localhost:11434';
const PREFLIGHT_TIMEOUT_MS = 5000;

function parseBoolean(value) {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function readDotEnv() {
  const env = {};
  if (!fs.existsSync('.env')) {
    return env;
  }
  const lines = fs.readFileSync('.env', 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return env;
}

function activeLocalLlmProviders(env) {
  const providers = [];
  const homeProvider = process.env.HOME_AI_PROVIDER ?? env.HOME_AI_PROVIDER ?? 'local_llm';
  const pineProvider = process.env.PINE_GENERATION_PROVIDER ?? env.PINE_GENERATION_PROVIDER ?? 'local_llm';
  const proposalProvider = process.env.STRATEGY_PROPOSAL_PROVIDER ?? env.STRATEGY_PROPOSAL_PROVIDER ?? 'stub';

  if (homeProvider === 'local_llm') providers.push('HOME_AI_PROVIDER');
  if (pineProvider === 'local_llm') providers.push('PINE_GENERATION_PROVIDER');
  if (proposalProvider === 'local_llm') providers.push('STRATEGY_PROPOSAL_PROVIDER');
  return providers;
}

async function main() {
  if (parseBoolean(process.env.SKIP_LOCAL_LLM_PREFLIGHT)) {
    console.log('[local-llm-preflight] skipped by SKIP_LOCAL_LLM_PREFLIGHT.');
    return;
  }

  const env = readDotEnv();
  const providers = activeLocalLlmProviders(env);
  if (providers.length === 0) {
    console.log('[local-llm-preflight] skipped: no local_llm providers are active.');
    return;
  }

  const endpoint = (process.env.LOCAL_LLM_ENDPOINT ?? env.LOCAL_LLM_ENDPOINT ?? DEFAULT_LOCAL_LLM_ENDPOINT).replace(
    /\/$/,
    '',
  );

  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`health check returned HTTP ${response.status}`);
    }
    console.log(`[local-llm-preflight] ok: local LLM is reachable for ${providers.join(', ')}.`);
  } catch {
    console.error('[local-llm-preflight] local LLM is required but not reachable.');
    console.error(`[local-llm-preflight] active local_llm providers: ${providers.join(', ')}`);
    console.error('[local-llm-preflight] start your local LLM server, then run pnpm dev again.');
    console.error('[local-llm-preflight] set SKIP_LOCAL_LLM_PREFLIGHT=true only when intentionally running without it.');
    process.exit(1);
  }
}

main().catch(() => {
  console.error('[local-llm-preflight] failed unexpectedly.');
  process.exit(1);
});
