import { prisma } from '../db';
import {
  buildInternalBacktestDataAuditSummary,
  collectInternalBacktestDataAuditInput,
} from '../internal-backtests/data-audit';

async function main() {
  const input = await collectInternalBacktestDataAuditInput(prisma);
  const summary = buildInternalBacktestDataAuditSummary(input);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch(() => {
    console.error('Internal backtest data audit failed before producing a sanitized summary.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
