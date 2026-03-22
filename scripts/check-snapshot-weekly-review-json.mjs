import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const generatorPath = path.join(repoRoot, 'scripts', 'create-snapshot-weekly-review.mjs');

function runGenerator(args) {
  const result = spawnSync('node', [generatorPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `Generator failed with args: ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  const output = (result.stdout ?? '').trim();
  let payload;
  try {
    payload = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `Output is not valid JSON for args: ${args.join(' ')}\noutput:\n${output}\nerror: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  return payload;
}

function assertRequiredKeys(payload, label) {
  const requiredKeys = [
    'baseDateJst',
    'targetWeek',
    'targetFilePath',
    'targetFileExists',
    'force',
    'dryRun',
    'result',
  ];
  for (const key of requiredKeys) {
    if (!(key in payload)) {
      throw new Error(`${label}: missing key "${key}"`);
    }
  }
}

function assertResult(payload, expected, label) {
  if (payload.result !== expected) {
    throw new Error(`${label}: expected result="${expected}" but got "${payload.result}"`);
  }
}

function main() {
  // Existing file in repository (2026-W13) should produce fail_exists on dry-run without force.
  const failExists = runGenerator(['--date=2026-03-23', '--dry-run', '--output-format=json']);
  assertRequiredKeys(failExists, 'fail_exists case');
  assertResult(failExists, 'fail_exists', 'fail_exists case');

  // Same target with force should report overwrite (still dry-run).
  const overwrite = runGenerator([
    '--date=2026-03-23',
    '--force',
    '--dry-run',
    '--output-format=json',
  ]);
  assertRequiredKeys(overwrite, 'overwrite case');
  assertResult(overwrite, 'overwrite', 'overwrite case');

  // Non-existing target week should report create (still dry-run).
  const create = runGenerator(['--date=2026-03-30', '--dry-run', '--output-format=json']);
  assertRequiredKeys(create, 'create case');
  assertResult(create, 'create', 'create case');

  console.log(
    JSON.stringify({
      ok: true,
      checked: ['fail_exists', 'overwrite', 'create'],
    })
  );
}

main();
