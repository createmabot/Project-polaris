import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printHelpAndExit(0);
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
    console.error(`Unknown argument: ${arg}`);
    printHelpAndExit(1);
  }
  return { dateArg };
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
  console.log('');
  console.log('Notes:');
  console.log('  --date is interpreted as JST calendar date.');
  console.log('  File naming rule: YYYY-Www-snapshot-review.md');
  process.exit(code);
}

function main() {
  const { dateArg } = parseArgs(process.argv.slice(2));
  const baseJstDate = dateArg ? parseJstDateArg(dateArg) : getCurrentJstDateParts(new Date());
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(repoRoot, 'docs', 'snapshot-weekly-review-record-template.md');
  const outputDir = path.join(repoRoot, 'docs', 'snapshot-weekly-reviews');
  const filename = buildTargetFilename(baseJstDate);
  const outputPath = path.join(outputDir, filename);

  if (!fs.existsSync(templatePath)) {
    console.error(`Template not found: ${templatePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (fs.existsSync(outputPath)) {
    console.error(`Review file already exists: ${outputPath}`);
    console.error('No file was overwritten.');
    process.exit(1);
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  fs.writeFileSync(outputPath, template, 'utf8');

  const baseDateText = `${baseJstDate.year}-${String(baseJstDate.month).padStart(2, '0')}-${String(baseJstDate.day).padStart(2, '0')}`;
  const weekKey = filename.replace('-snapshot-review.md', '');
  console.log(`Base date (JST): ${baseDateText}`);
  console.log(`Target week (JST ISO week): ${weekKey}`);
  console.log(`Created weekly review file: ${outputPath}`);
  console.log(`Naming rule (JST ISO week): ${filename}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
