import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_FORMAT_TEXT = 'text';
const OUTPUT_FORMAT_JSON = 'json';

function toJstDate(base = new Date()) {
  return new Date(base.getTime() + 9 * 60 * 60 * 1000);
}

function toIsoWeekKeyFromJstDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));

  // ISO week: move to Thursday.
  const isoDay = date.getUTCDay() || 7; // Sunday=7
  date.setUTCDate(date.getUTCDate() + 4 - isoDay);

  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear, isoWeek };
}

function getCurrentJstDateParts(now = new Date()) {
  const jst = toJstDate(now);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
  };
}

function parseArgs(argv) {
  let dateArg;
  let force = false;
  let dryRun = false;
  let outputFormat = OUTPUT_FORMAT_TEXT;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printHelpAndExit(0);
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('--date=')) {
      dateArg = arg.slice('--date='.length).trim();
      continue;
    }
    if (arg.startsWith('--date')) {
      console.error(`Unsupported --date usage: "${arg}"`);
      console.error('Use: --date=YYYY-MM-DD');
      process.exit(1);
    }
    if (arg.startsWith('--output-format=')) {
      outputFormat = arg.slice('--output-format='.length).trim();
      continue;
    }
    if (arg.startsWith('--output-format')) {
      console.error(`Unsupported --output-format usage: "${arg}"`);
      console.error('Use: --output-format=json');
      process.exit(1);
    }
    console.error(`Unknown argument: ${arg}`);
    printHelpAndExit(1);
  }
  return { dateArg, force, dryRun, outputFormat };
}

function parseJstDateArg(dateArg) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateArg);
  if (!m) {
    throw new Error(`Invalid --date format: "${dateArg}". Expected YYYY-MM-DD (JST).`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  const probe = new Date(Date.UTC(year, month - 1, day));
  const valid =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() + 1 === month &&
    probe.getUTCDate() === day;
  if (!valid) {
    throw new Error(`Invalid --date value: "${dateArg}". Date does not exist.`);
  }
  return { year, month, day };
}

function buildTargetFilename(dateParts) {
  const { isoYear, isoWeek } = toIsoWeekKeyFromJstDateParts(
    dateParts.year,
    dateParts.month,
    dateParts.day
  );
  return `${isoYear}-W${String(isoWeek).padStart(2, '0')}-snapshot-review.md`;
}

function printHelpAndExit(code = 0) {
  console.log('Create snapshot weekly review record from template');
  console.log('');
  console.log('Usage:');
  console.log('  pnpm run create:snapshot-weekly-review');
  console.log('  pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD');
  console.log('  pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD --force');
  console.log('  pnpm run create:snapshot-weekly-review -- --dry-run');
  console.log('  pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD --dry-run');
  console.log('  pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD --force --dry-run');
  console.log('  pnpm run create:snapshot-weekly-review -- --dry-run --output-format=json');
  console.log('');
  console.log('Notes:');
  console.log('  --date is interpreted as JST calendar date.');
  console.log('  --force overwrites existing target file explicitly.');
  console.log('  --dry-run does not write files; it only prints expected result.');
  console.log('  --output-format=json prints machine-readable JSON output.');
  console.log('  File naming rule: YYYY-Www-snapshot-review.md');
  process.exit(code);
}

function emitJson(payload) {
  console.log(JSON.stringify(payload));
}

function exitWithError({ outputFormat, error, message, context = {} }) {
  if (outputFormat === OUTPUT_FORMAT_JSON) {
    emitJson({
      ...context,
      result: 'error',
      error,
      message,
    });
  } else {
    console.error(message);
  }
  process.exit(1);
}

function main() {
  const { dateArg, force, dryRun, outputFormat } = parseArgs(process.argv.slice(2));
  if (outputFormat !== OUTPUT_FORMAT_TEXT && outputFormat !== OUTPUT_FORMAT_JSON) {
    exitWithError({
      outputFormat: OUTPUT_FORMAT_TEXT,
      error: 'invalid_output_format',
      message: `Invalid --output-format: "${outputFormat}". Supported: json`,
    });
  }

  let baseJstDate;
  try {
    baseJstDate = dateArg ? parseJstDateArg(dateArg) : getCurrentJstDateParts(new Date());
  } catch (error) {
    exitWithError({
      outputFormat,
      error: 'invalid_date',
      message: error instanceof Error ? error.message : String(error),
      context: {
        force,
        dryRun,
      },
    });
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(repoRoot, 'docs', 'snapshot-weekly-review-record-template.md');
  const outputDir = path.join(repoRoot, 'docs', 'snapshot-weekly-reviews');
  const filename = buildTargetFilename(baseJstDate);
  const outputPath = path.join(outputDir, filename);
  const baseDateText = `${baseJstDate.year}-${String(baseJstDate.month).padStart(2, '0')}-${String(baseJstDate.day).padStart(2, '0')}`;
  const weekKey = filename.replace('-snapshot-review.md', '');

  if (!fs.existsSync(templatePath)) {
    exitWithError({
      outputFormat,
      error: 'template_not_found',
      message: `Template not found: ${templatePath}`,
      context: {
        baseDateJst: baseDateText,
        targetWeek: weekKey,
        targetFilePath: outputPath,
        targetFileExists: fs.existsSync(outputPath),
        force,
        dryRun,
      },
    });
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const existed = fs.existsSync(outputPath);
  const basePayload = {
    baseDateJst: baseDateText,
    targetWeek: weekKey,
    targetFilePath: outputPath,
    targetFileExists: existed,
    force,
    dryRun,
  };

  if (dryRun) {
    let result = 'create';
    if (!existed) {
      result = 'create';
    } else if (force) {
      result = 'overwrite';
    } else {
      result = 'fail_exists';
    }

    if (outputFormat === OUTPUT_FORMAT_JSON) {
      emitJson({
        ...basePayload,
        result,
      });
    } else {
      console.log(`Base date (JST): ${baseDateText}`);
      console.log(`Target week (JST ISO week): ${weekKey}`);
      console.log(`Target file path: ${outputPath}`);
      console.log(`Target file exists: ${existed ? 'yes' : 'no'}`);
      if (result === 'create') {
        console.log('Dry-run result: Would create.');
      } else if (result === 'overwrite') {
        console.log('Dry-run result: Would overwrite (--force).');
      } else {
        console.log('Dry-run result: Would fail because file already exists.');
      }
      console.log('Dry-run mode: no file was written.');
    }
    return;
  }

  if (existed && !force) {
    exitWithError({
      outputFormat,
      error: 'file_exists',
      message: `Review file already exists: ${outputPath}. Re-run with --force to overwrite explicitly.`,
      context: {
        ...basePayload,
        result: 'fail_exists',
      },
    });
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  fs.writeFileSync(outputPath, template, 'utf8');

  const result = existed && force ? 'overwritten' : 'created';
  if (outputFormat === OUTPUT_FORMAT_JSON) {
    emitJson({
      ...basePayload,
      result,
    });
  } else {
    console.log(`Base date (JST): ${baseDateText}`);
    console.log(`Target week (JST ISO week): ${weekKey}`);
    console.log(`Target file path: ${outputPath}`);
    console.log(`Target file exists: ${existed ? 'yes' : 'no'}`);
    if (result === 'overwritten') {
      console.log(`Overwritten weekly review file (--force): ${outputPath}`);
    } else {
      console.log(`Created weekly review file: ${outputPath}`);
    }
    console.log(`Naming rule (JST ISO week): ${filename}`);
  }
}

main();
