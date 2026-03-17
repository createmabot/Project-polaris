import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// The test shared_secret value (plain text - used in fixtures/tests)
// This is hashed and stored in the DB; the raw value is never persisted.
export const TEST_SHARED_SECRET = 'test-shared-secret-abc';

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      name: 'Test Setup User',
    },
  });

  const webhookTokenValue = 'test-webhook-token-123';
  await prisma.webhookToken.upsert({
    where: { token: webhookTokenValue },
    update: {
      sharedSecretHash: hashSecret(TEST_SHARED_SECRET),
    },
    create: {
      token: webhookTokenValue,
      sharedSecretHash: hashSecret(TEST_SHARED_SECRET),
      userId: user.id,
    },
  });

  const symbols = [
    { s: 'BTC/USDT', tv: 'BINANCE:BTCUSDT', mc: 'BINANCE', sc: 'BTCUSDT' },
    { s: 'ETH/USDT', tv: 'BINANCE:ETHUSDT', mc: 'BINANCE', sc: 'ETHUSDT' },
    { s: 'SOL/USDT', tv: 'BINANCE:SOLUSDT', mc: 'BINANCE', sc: 'SOLUSDT' },
    { s: '7203', tv: 'TSE:7203', mc: 'TSE', sc: '7203' }
  ];
  let createdSymbols = 0;

  for (const item of symbols) {
    const sym = await prisma.symbol.upsert({
      where: { symbol: item.s },
      update: {},
      create: { 
        symbol: item.s,
        tradingviewSymbol: item.tv,
        marketCode: item.mc,
        symbolCode: item.sc,
	displayName: item.s
      },
    });
    if (sym) {
      createdSymbols++;
    }
  }

  console.log(`✅ Seeded user: ${user.email}`);
  console.log(`✅ Seeded ${createdSymbols} symbols.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
