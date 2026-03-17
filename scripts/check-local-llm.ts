#!/usr/bin/env node
/**
 * Local LLM Health Check Script
 * docs/20 §9.1: ローカルLLMで1回の疎通テストが成功していること
 * docs/24 §15.1: ローカルLLM最小確認
 *
 * Usage:
 *   node scripts/check-local-llm.js
 *   # or during development:
 *   npx tsx scripts/check-local-llm.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

const endpoint = process.env.LOCAL_LLM_ENDPOINT ?? 'http://localhost:11434';
const model = process.env.PRIMARY_LOCAL_MODEL ?? 'qwen3-30b-a3b-2507';

async function checkLocalLlm() {
  console.log('🔍 Checking local LLM connectivity...');
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Model:    ${model}`);
  console.log('');

  // 1. Try /v1/models (list available models)
  try {
    const modelsRes = await fetch(`${endpoint}/v1/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (modelsRes.ok) {
      const data: any = await modelsRes.json();
      const available = data.data?.map((m: any) => m.id) ?? [];
      console.log('✅ LLM server is reachable');
      console.log(`   Available models: ${available.join(', ') || '(none listed)'}`);
      if (!available.includes(model) && available.length > 0) {
        console.warn(`⚠️  Model "${model}" not found in available list.`);
        console.warn('   Set PRIMARY_LOCAL_MODEL in .env to one of the available models.');
      }
    }
  } catch (e: any) {
    console.error(`❌ Cannot reach local LLM at ${endpoint}`);
    console.error(`   Error: ${e.message}`);
    console.error('');
    console.error('Possible causes:');
    console.error('  - Ollama / LM Studio is not running');
    console.error('  - LOCAL_LLM_ENDPOINT is incorrect in .env');
    console.error('  - Model is not loaded');
    console.error('');
    console.error('To start Ollama:');
    console.error('  ollama serve');
    console.error(`  ollama run ${model}`);
    process.exit(1);
  }

  // 2. Try a minimal inference call
  try {
    console.log('\n🤖 Testing minimal inference...');
    const res = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: {"ok":true}' }],
        max_tokens: 20,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data: any = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    console.log(`✅ Inference OK. Response: ${content.trim().slice(0, 100)}`);
    console.log('');
    console.log('🎉 Local LLM is ready! You can proceed with development.');
  } catch (e: any) {
    console.error(`❌ Inference test failed: ${e.message}`);
    console.error('   The LLM server is reachable but inference is failing.');
    console.error('   Check that the model is fully loaded and has enough VRAM.');
    process.exit(1);
  }
}

checkLocalLlm().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
