import { describe, expect, it } from 'vitest';
import { derivePositionsFromTransactions } from '../src/home/positions-read-model';

describe('derivePositionsFromTransactions', () => {
  it('derives quantity and weighted average cost with buy/buy/partial sell', () => {
    const derived = derivePositionsFromTransactions([
      {
        id: 'tx-1',
        userId: 'user-1',
        portfolioId: 'pf-1',
        symbolId: 'sym-1',
        side: 'buy',
        quantity: 100,
        price: 12000,
        executedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        id: 'tx-2',
        userId: 'user-1',
        portfolioId: 'pf-1',
        symbolId: 'sym-1',
        side: 'buy',
        quantity: 60,
        price: 13000,
        executedAt: new Date('2026-03-05T00:00:00.000Z'),
      },
      {
        id: 'tx-3',
        userId: 'user-1',
        portfolioId: 'pf-1',
        symbolId: 'sym-1',
        side: 'sell',
        quantity: 40,
        price: 13200,
        executedAt: new Date('2026-03-08T00:00:00.000Z'),
      },
    ]);

    expect(derived).toHaveLength(1);
    expect(derived[0]).toMatchObject({
      userId: 'user-1',
      portfolioId: 'pf-1',
      symbolId: 'sym-1',
      quantity: 120,
    });
    expect(derived[0].averageCost).toBeCloseTo(12375, 6);
  });

  it('closes position when quantity becomes zero or below', () => {
    const derived = derivePositionsFromTransactions([
      {
        id: 'tx-1',
        userId: 'user-1',
        portfolioId: 'pf-1',
        symbolId: 'sym-1',
        side: 'buy',
        quantity: 100,
        price: 1000,
        executedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        id: 'tx-2',
        userId: 'user-1',
        portfolioId: 'pf-1',
        symbolId: 'sym-1',
        side: 'sell',
        quantity: 100,
        price: 1200,
        executedAt: new Date('2026-03-02T00:00:00.000Z'),
      },
    ]);

    expect(derived).toEqual([]);
  });
});

