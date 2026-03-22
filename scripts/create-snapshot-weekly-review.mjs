import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function toJstDate(base = new Date()) {
  return new Date(base.getTime() + 9 * 60 * 60 * 1000);
}

function toIsoWeekKeyJst(base = new Date()) {
  // Convert JST calendar date to UTC date for stable ISO week math.
  const jst = toJstDate(base);
  const date = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));

  // ISO week: move to Thursday.
  const day = date.getUTCDay() || 7; // Sunday=7
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear, isoWeek };
}

function buildTargetFilename(now = new Date()) {
  const { isoYear, isoWeek } = toIsoWeekKeyJst(now);
  return `${isoYear}-W${String(isoWeek).padStart(2, '0')}-snapshot-review.md`;
}

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(repoRoot, 'docs', 'snapshot-weekly-review-record-template.md');
  const outputDir = path.join(repoRoot, 'docs', 'snapshot-weekly-reviews');
  const filename = buildTargetFilename();
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

  console.log(`Created weekly review file: ${outputPath}`);
  console.log(`Naming rule (JST ISO week): ${filename}`);
}

main();
