import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const TEST_SHARED_SECRET = 'test-shared-secret-abc';

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

type UpsertSymbolInput = {
  symbol: string;
  tradingviewSymbol: string;
  marketCode: string;
  symbolCode: string;
  displayName: string;
};

async function upsertAiSummaryByFingerprint(input: {
  summaryScope: string;
  targetEntityType: string;
  targetEntityId: string;
  title: string;
  bodyMarkdown: string;
  generatedAt: Date;
  structuredJson?: Record<string, unknown>;
  generationContextJson?: Record<string, unknown>;
}) {
  const existing = await prisma.aiSummary.findFirst({
    where: {
      summaryScope: input.summaryScope,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      title: input.title,
    },
  });

  if (existing) {
    return prisma.aiSummary.update({
      where: { id: existing.id },
      data: {
        bodyMarkdown: input.bodyMarkdown,
        generatedAt: input.generatedAt,
        structuredJson: input.structuredJson,
        generationContextJson: input.generationContextJson,
      },
    });
  }

  return prisma.aiSummary.create({
    data: {
      summaryScope: input.summaryScope,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      title: input.title,
      bodyMarkdown: input.bodyMarkdown,
      generatedAt: input.generatedAt,
      structuredJson: input.structuredJson,
      generationContextJson: input.generationContextJson,
    },
  });
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

  const symbols: UpsertSymbolInput[] = [
    { symbol: 'BTC/USDT', tradingviewSymbol: 'BINANCE:BTCUSDT', marketCode: 'BINANCE', symbolCode: 'BTCUSDT', displayName: 'BTC/USDT' },
    { symbol: 'ETH/USDT', tradingviewSymbol: 'BINANCE:ETHUSDT', marketCode: 'BINANCE', symbolCode: 'ETHUSDT', displayName: 'ETH/USDT' },
    { symbol: 'SOL/USDT', tradingviewSymbol: 'BINANCE:SOLUSDT', marketCode: 'BINANCE', symbolCode: 'SOLUSDT', displayName: 'SOL/USDT' },
    { symbol: '7203', tradingviewSymbol: 'TSE:7203', marketCode: 'JP_STOCK', symbolCode: '7203', displayName: 'トヨタ自動車' },
    { symbol: '6758', tradingviewSymbol: 'TSE:6758', marketCode: 'JP_STOCK', symbolCode: '6758', displayName: 'ソニーグループ' },
  ];

  const upsertedSymbols = new Map<string, Awaited<ReturnType<typeof prisma.symbol.upsert>>>();
  for (const item of symbols) {
    const symbol = await prisma.symbol.upsert({
      where: { symbol: item.symbol },
      update: {
        tradingviewSymbol: item.tradingviewSymbol,
        marketCode: item.marketCode,
        symbolCode: item.symbolCode,
        displayName: item.displayName,
      },
      create: {
        symbol: item.symbol,
        tradingviewSymbol: item.tradingviewSymbol,
        marketCode: item.marketCode,
        symbolCode: item.symbolCode,
        displayName: item.displayName,
      },
    });
    upsertedSymbols.set(item.symbolCode, symbol);
  }

  const toyota = upsertedSymbols.get('7203');
  const sony = upsertedSymbols.get('6758');
  if (!toyota || !sony) {
    throw new Error('required symbols 7203/6758 are missing after seed upsert');
  }

  const sectorSnapshots = [
    {
      id: '00000000-0000-4000-8000-000000000071',
      targetCode: 'TOPIX_TRANSPORT',
      price: '1520.12',
      changeValue: '12.34',
      changeRate: '0.82',
    },
    {
      id: '00000000-0000-4000-8000-000000000072',
      targetCode: 'TOPIX_ELECTRIC',
      price: '2840.50',
      changeValue: '-8.50',
      changeRate: '-0.30',
    },
    {
      id: '00000000-0000-4000-8000-000000000073',
      targetCode: 'TOPIX_BANKS',
      price: '920.20',
      changeValue: '2.10',
      changeRate: '0.23',
    },
    {
      id: '00000000-0000-4000-8000-000000000074',
      targetCode: 'TOPIX_RETAIL',
      price: '1340.80',
      changeValue: '-3.20',
      changeRate: '-0.24',
    },
    {
      id: '00000000-0000-4000-8000-000000000075',
      targetCode: 'TOPIX_INFO_TECH',
      price: '2150.60',
      changeValue: '6.40',
      changeRate: '0.30',
    },
  ] as const;

  for (const snapshot of sectorSnapshots) {
    await prisma.marketSnapshot.upsert({
      where: { id: snapshot.id },
      update: {
        snapshotType: 'sector',
        targetCode: snapshot.targetCode,
        snapshotDate: new Date('2026-03-09T00:00:00+09:00'),
        snapshotTimeframe: 'D',
        price: new Prisma.Decimal(snapshot.price),
        changeValue: new Prisma.Decimal(snapshot.changeValue),
        changeRate: new Prisma.Decimal(snapshot.changeRate),
        asOf: new Date('2026-03-09T15:00:00+09:00'),
      },
      create: {
        id: snapshot.id,
        snapshotType: 'sector',
        targetCode: snapshot.targetCode,
        snapshotDate: new Date('2026-03-09T00:00:00+09:00'),
        snapshotTimeframe: 'D',
        price: new Prisma.Decimal(snapshot.price),
        changeValue: new Prisma.Decimal(snapshot.changeValue),
        changeRate: new Prisma.Decimal(snapshot.changeRate),
        asOf: new Date('2026-03-09T15:00:00+09:00'),
      },
    });
  }

  const defaultWatchlist = await prisma.watchlist.upsert({
    where: { id: '00000000-0000-4000-8000-000000000011' },
    update: {
      userId: user.id,
      name: 'default',
      description: 'UI walkthrough default watchlist',
      sortOrder: 0,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000011',
      userId: user.id,
      name: 'default',
      description: 'UI walkthrough default watchlist',
      sortOrder: 0,
    },
  });

  await prisma.watchlistItem.upsert({
    where: {
      watchlistId_symbolId: {
        watchlistId: defaultWatchlist.id,
        symbolId: toyota.id,
      },
    },
    update: {
      priority: 1,
      memo: 'core watch target',
    },
    create: {
      watchlistId: defaultWatchlist.id,
      symbolId: toyota.id,
      priority: 1,
      memo: 'core watch target',
    },
  });

  await prisma.watchlistItem.upsert({
    where: {
      watchlistId_symbolId: {
        watchlistId: defaultWatchlist.id,
        symbolId: sony.id,
      },
    },
    update: {
      priority: 2,
      memo: 'secondary watch target',
    },
    create: {
      watchlistId: defaultWatchlist.id,
      symbolId: sony.id,
      priority: 2,
      memo: 'secondary watch target',
    },
  });

  const defaultPortfolio = await prisma.portfolio.upsert({
    where: {
      userId_name: {
        userId: user.id,
        name: 'default',
      },
    },
    update: {
      isDefault: true,
      baseCurrency: 'JPY',
    },
    create: {
      userId: user.id,
      name: 'default',
      isDefault: true,
      baseCurrency: 'JPY',
    },
  });

  await prisma.transaction.upsert({
    where: { id: '00000000-0000-4000-8000-000000000021' },
    update: {
      userId: user.id,
      portfolioId: defaultPortfolio.id,
      symbolId: sony.id,
      side: 'buy',
      quantity: new Prisma.Decimal('100'),
      price: new Prisma.Decimal('12000'),
      feeAmount: new Prisma.Decimal('0'),
      executedAt: new Date('2026-03-01T09:00:00+09:00'),
      source: 'seed',
      memo: 'initial buy',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000021',
      userId: user.id,
      portfolioId: defaultPortfolio.id,
      symbolId: sony.id,
      side: 'buy',
      quantity: new Prisma.Decimal('100'),
      price: new Prisma.Decimal('12000'),
      feeAmount: new Prisma.Decimal('0'),
      executedAt: new Date('2026-03-01T09:00:00+09:00'),
      source: 'seed',
      memo: 'initial buy',
    },
  });

  await prisma.transaction.upsert({
    where: { id: '00000000-0000-4000-8000-000000000022' },
    update: {
      userId: user.id,
      portfolioId: defaultPortfolio.id,
      symbolId: sony.id,
      side: 'buy',
      quantity: new Prisma.Decimal('60'),
      price: new Prisma.Decimal('13000'),
      feeAmount: new Prisma.Decimal('0'),
      executedAt: new Date('2026-03-05T09:00:00+09:00'),
      source: 'seed',
      memo: 'add position',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000022',
      userId: user.id,
      portfolioId: defaultPortfolio.id,
      symbolId: sony.id,
      side: 'buy',
      quantity: new Prisma.Decimal('60'),
      price: new Prisma.Decimal('13000'),
      feeAmount: new Prisma.Decimal('0'),
      executedAt: new Date('2026-03-05T09:00:00+09:00'),
      source: 'seed',
      memo: 'add position',
    },
  });

  await prisma.transaction.upsert({
    where: { id: '00000000-0000-4000-8000-000000000023' },
    update: {
      userId: user.id,
      portfolioId: defaultPortfolio.id,
      symbolId: sony.id,
      side: 'sell',
      quantity: new Prisma.Decimal('40'),
      price: new Prisma.Decimal('13200'),
      feeAmount: new Prisma.Decimal('0'),
      executedAt: new Date('2026-03-08T09:00:00+09:00'),
      source: 'seed',
      memo: 'partial sell',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000023',
      userId: user.id,
      portfolioId: defaultPortfolio.id,
      symbolId: sony.id,
      side: 'sell',
      quantity: new Prisma.Decimal('40'),
      price: new Prisma.Decimal('13200'),
      feeAmount: new Prisma.Decimal('0'),
      executedAt: new Date('2026-03-08T09:00:00+09:00'),
      source: 'seed',
      memo: 'partial sell',
    },
  });

  const alertToyota = await prisma.alertEvent.upsert({
    where: { dedupeKey: 'seed-home-alert-7203' },
    update: {
      userId: user.id,
      symbolId: toyota.id,
      alertName: 'MA25 breakout',
      alertType: 'technical',
      timeframe: 'D',
      triggerPrice: 3021.5,
      triggerPayloadJson: { source: 'seed', symbol: '7203' },
      processingStatus: 'summarized',
      triggeredAt: new Date('2026-03-09T09:15:00+09:00'),
    },
    create: {
      userId: user.id,
      symbolId: toyota.id,
      alertName: 'MA25 breakout',
      alertType: 'technical',
      timeframe: 'D',
      triggerPrice: 3021.5,
      triggerPayloadJson: { source: 'seed', symbol: '7203' },
      dedupeKey: 'seed-home-alert-7203',
      processingStatus: 'summarized',
      triggeredAt: new Date('2026-03-09T09:15:00+09:00'),
    },
  });

  const alertSony = await prisma.alertEvent.upsert({
    where: { dedupeKey: 'seed-home-alert-6758' },
    update: {
      userId: user.id,
      symbolId: sony.id,
      alertName: 'RSI oversold rebound',
      alertType: 'technical',
      timeframe: 'D',
      triggerPrice: 12850,
      triggerPayloadJson: { source: 'seed', symbol: '6758' },
      processingStatus: 'summarized',
      triggeredAt: new Date('2026-03-09T10:30:00+09:00'),
    },
    create: {
      userId: user.id,
      symbolId: sony.id,
      alertName: 'RSI oversold rebound',
      alertType: 'technical',
      timeframe: 'D',
      triggerPrice: 12850,
      triggerPayloadJson: { source: 'seed', symbol: '6758' },
      dedupeKey: 'seed-home-alert-6758',
      processingStatus: 'summarized',
      triggeredAt: new Date('2026-03-09T10:30:00+09:00'),
    },
  });

  await upsertAiSummaryByFingerprint({
    summaryScope: 'alert_reason',
    targetEntityType: 'alert_event',
    targetEntityId: alertToyota.id,
    title: '7203 アラート要約',
    bodyMarkdown: '移動平均線上抜けと出来高増加を確認。短期モメンタムが改善傾向です。',
    generatedAt: new Date('2026-03-09T09:20:00+09:00'),
  });
  await upsertAiSummaryByFingerprint({
    summaryScope: 'alert_reason',
    targetEntityType: 'alert_event',
    targetEntityId: alertSony.id,
    title: '6758 アラート要約',
    bodyMarkdown: 'RSI反発シグナルが点灯。前日比で買い優勢の地合いです。',
    generatedAt: new Date('2026-03-09T10:35:00+09:00'),
  });

  await upsertAiSummaryByFingerprint({
    summaryScope: 'daily',
    targetEntityType: 'market_snapshot',
    targetEntityId: 'home-seed-daily-2026-03-09-morning',
    title: '朝サマリー（seed）',
    bodyMarkdown: '寄り付き後は半導体関連が強く、トヨタとソニーに資金流入。',
    generatedAt: new Date('2026-03-09T08:30:00+09:00'),
    generationContextJson: { summary_type: 'morning', date: '2026-03-09' },
  });
  await upsertAiSummaryByFingerprint({
    summaryScope: 'daily',
    targetEntityType: 'market_snapshot',
    targetEntityId: 'home-seed-daily-2026-03-09-evening',
    title: '夜サマリー（seed）',
    bodyMarkdown: '引けにかけて強含み。自動車と電機が指数を牽引。',
    generatedAt: new Date('2026-03-09T18:00:00+09:00'),
    generationContextJson: { summary_type: 'evening', date: '2026-03-09' },
  });

  await upsertAiSummaryByFingerprint({
    summaryScope: 'thesis',
    targetEntityType: 'symbol',
    targetEntityId: toyota.id,
    title: 'トヨタ投資仮説（seed）',
    bodyMarkdown: '為替の落ち着きと販売回復を背景に、短中期で需給改善を想定。',
    generatedAt: new Date('2026-03-09T11:00:00+09:00'),
    structuredJson: {
      schema_name: 'thesis_summary',
      schema_version: '1.0',
      confidence: 'medium',
      insufficient_context: false,
      payload: {
        bullish_points: ['需給改善', '販売回復'],
        bearish_points: ['原材料コストの上振れ'],
      },
    },
  });

  await prisma.externalReference.upsert({
    where: { dedupeKey: 'seed-ref-7203-1' },
    update: {
      symbolId: toyota.id,
      alertEventId: alertToyota.id,
      referenceType: 'news',
      title: 'トヨタ関連ニュース（seed）',
      sourceName: 'seed-news',
      sourceUrl: 'https://example.com/seed/toyota-news',
      publishedAt: new Date('2026-03-09T07:45:00+09:00'),
      summaryText: '販売見通しに関する短報。',
      relevanceScore: 80,
    },
    create: {
      symbolId: toyota.id,
      alertEventId: alertToyota.id,
      referenceType: 'news',
      title: 'トヨタ関連ニュース（seed）',
      sourceName: 'seed-news',
      sourceUrl: 'https://example.com/seed/toyota-news',
      publishedAt: new Date('2026-03-09T07:45:00+09:00'),
      summaryText: '販売見通しに関する短報。',
      dedupeKey: 'seed-ref-7203-1',
      relevanceScore: 80,
    },
  });

  const note = await prisma.researchNote.upsert({
    where: { id: '00000000-0000-4000-8000-000000000101' },
    update: {
      userId: user.id,
      symbolId: toyota.id,
      title: 'トヨタ監視ノート（seed）',
      thesisText: '為替と販売動向を軸に中期で上昇余地を検証する。',
      scenarioText: '25日線上で出来高増を伴う上昇が継続するかを確認。',
      entryConditionText: '終値が25日線を上回り、出来高が20日平均比1.5倍以上。',
      takeProfitText: '+8%目安',
      stopLossText: '-4%目安',
      invalidationText: '業績ガイダンスの下方修正',
      status: 'active',
      nextReviewAt: new Date('2026-03-15T00:00:00+09:00'),
    },
    create: {
      id: '00000000-0000-4000-8000-000000000101',
      userId: user.id,
      symbolId: toyota.id,
      title: 'トヨタ監視ノート（seed）',
      thesisText: '為替と販売動向を軸に中期で上昇余地を検証する。',
      scenarioText: '25日線上で出来高増を伴う上昇が継続するかを確認。',
      entryConditionText: '終値が25日線を上回り、出来高が20日平均比1.5倍以上。',
      takeProfitText: '+8%目安',
      stopLossText: '-4%目安',
      invalidationText: '業績ガイダンスの下方修正',
      status: 'active',
      nextReviewAt: new Date('2026-03-15T00:00:00+09:00'),
    },
  });

  await prisma.noteRevision.upsert({
    where: { researchNoteId_revisionNo: { researchNoteId: note.id, revisionNo: 1 } },
    update: {
      changeSummary: '初回作成（seed）',
      snapshotJson: note as unknown as Prisma.InputJsonValue,
    },
    create: {
      researchNoteId: note.id,
      revisionNo: 1,
      changeSummary: '初回作成（seed）',
      snapshotJson: note as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.noteRevision.upsert({
    where: { researchNoteId_revisionNo: { researchNoteId: note.id, revisionNo: 2 } },
    update: {
      changeSummary: '利確条件を追記（seed）',
      snapshotJson: { ...note, takeProfitText: '+8%目安（更新）' } as unknown as Prisma.InputJsonValue,
    },
    create: {
      researchNoteId: note.id,
      revisionNo: 2,
      changeSummary: '利確条件を追記（seed）',
      snapshotJson: { ...note, takeProfitText: '+8%目安（更新）' } as unknown as Prisma.InputJsonValue,
    },
  });

  const strategy = await prisma.strategyRule.upsert({
    where: { id: '00000000-0000-4000-8000-000000000201' },
    update: { userId: user.id, title: 'Rule Lab seed strategy', status: 'active' },
    create: { id: '00000000-0000-4000-8000-000000000201', userId: user.id, title: 'Rule Lab seed strategy', status: 'active' },
  });

  const strategyVersion = await prisma.strategyRuleVersion.upsert({
    where: { id: '00000000-0000-4000-8000-000000000202' },
    update: {
      strategyRuleId: strategy.id,
      naturalLanguageRule: '終値が25日移動平均線を上回りRSIが50以上で買い、終値が25日移動平均線を下回ったら売り。',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'generated',
      generatedPine: '// seed pine',
      warningsJson: [],
      assumptionsJson: ['seed data'],
    },
    create: {
      id: '00000000-0000-4000-8000-000000000202',
      strategyRuleId: strategy.id,
      naturalLanguageRule: '終値が25日移動平均線を上回りRSIが50以上で買い、終値が25日移動平均線を下回ったら売り。',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'generated',
      generatedPine: '// seed pine',
      warningsJson: [],
      assumptionsJson: ['seed data'],
    },
  });

  const comparisonSession = await prisma.comparisonSession.upsert({
    where: { id: '00000000-0000-4000-8000-000000000301' },
    update: { userId: user.id, name: 'seed: 7203 vs 6758', comparisonType: 'symbol', status: 'ready' },
    create: { id: '00000000-0000-4000-8000-000000000301', userId: user.id, name: 'seed: 7203 vs 6758', comparisonType: 'symbol', status: 'ready' },
  });

  await prisma.comparisonSymbol.upsert({
    where: { comparisonSessionId_symbolId: { comparisonSessionId: comparisonSession.id, symbolId: toyota.id } },
    update: { sortOrder: 0 },
    create: { comparisonSessionId: comparisonSession.id, symbolId: toyota.id, sortOrder: 0 },
  });
  await prisma.comparisonSymbol.upsert({
    where: { comparisonSessionId_symbolId: { comparisonSessionId: comparisonSession.id, symbolId: sony.id } },
    update: { sortOrder: 1 },
    create: { comparisonSessionId: comparisonSession.id, symbolId: sony.id, sortOrder: 1 },
  });

  await prisma.comparisonResult.upsert({
    where: { id: '00000000-0000-4000-8000-000000000302' },
    update: {
      comparisonSessionId: comparisonSession.id,
      title: 'seed comparison result',
      bodyMarkdown: '7203 は需給改善、6758 は反発局面。リスクは為替とイベント集中。',
      comparedMetricJson: {
        schema_name: 'comparison_metric_snapshot',
        schema_version: '1.0',
        symbol_metrics: [
          { symbol_id: toyota.id, display_name: toyota.displayName, recent_alert_count: 1, thesis_presence: 1 },
          { symbol_id: sony.id, display_name: sony.displayName, recent_alert_count: 1, thesis_presence: 0 },
        ],
      },
      generatedAt: new Date('2026-03-09T18:10:00+09:00'),
    },
    create: {
      id: '00000000-0000-4000-8000-000000000302',
      comparisonSessionId: comparisonSession.id,
      title: 'seed comparison result',
      bodyMarkdown: '7203 は需給改善、6758 は反発局面。リスクは為替とイベント集中。',
      comparedMetricJson: {
        schema_name: 'comparison_metric_snapshot',
        schema_version: '1.0',
        symbol_metrics: [
          { symbol_id: toyota.id, display_name: toyota.displayName, recent_alert_count: 1, thesis_presence: 1 },
          { symbol_id: sony.id, display_name: sony.displayName, recent_alert_count: 1, thesis_presence: 0 },
        ],
      },
      generatedAt: new Date('2026-03-09T18:10:00+09:00'),
    },
  });

  const backtest = await prisma.backtest.upsert({
    where: { id: '00000000-0000-4000-8000-000000000401' },
    update: {
      strategyRuleVersionId: strategyVersion.id,
      title: 'seed backtest',
      executionSource: 'tradingview',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'imported',
      strategySnapshotJson: {
        strategy_id: strategy.id,
        strategy_version_id: strategyVersion.id,
        natural_language_rule: strategyVersion.naturalLanguageRule,
        generated_pine: strategyVersion.generatedPine,
        market: strategyVersion.market,
        timeframe: strategyVersion.timeframe,
        warnings: [],
        assumptions: ['seed data'],
        captured_at: new Date('2026-03-09T17:00:00+09:00').toISOString(),
      } as Prisma.InputJsonValue,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000401',
      strategyRuleVersionId: strategyVersion.id,
      title: 'seed backtest',
      executionSource: 'tradingview',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'imported',
      strategySnapshotJson: {
        strategy_id: strategy.id,
        strategy_version_id: strategyVersion.id,
        natural_language_rule: strategyVersion.naturalLanguageRule,
        generated_pine: strategyVersion.generatedPine,
        market: strategyVersion.market,
        timeframe: strategyVersion.timeframe,
        warnings: [],
        assumptions: ['seed data'],
        captured_at: new Date('2026-03-09T17:00:00+09:00').toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  const backtestImport = await prisma.backtestImport.upsert({
    where: { id: '00000000-0000-4000-8000-000000000402' },
    update: {
      backtestId: backtest.id,
      fileName: 'seed-summary.csv',
      fileSize: 128,
      contentType: 'text/csv',
      rawCsvText: 'Net Profit,Total Closed Trades,Percent Profitable,Profit Factor,Max Drawdown,From,To\n120000,12,58.33,1.72,-4.20,2026-01-01,2026-03-09\n',
      parseStatus: 'parsed',
      parseError: null,
      parsedSummaryJson: {
        totalTrades: 12,
        winRate: 58.33,
        profitFactor: 1.72,
        maxDrawdown: -4.2,
        netProfit: 120000,
        periodFrom: '2026-01-01',
        periodTo: '2026-03-09',
      } as Prisma.InputJsonValue,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000402',
      backtestId: backtest.id,
      fileName: 'seed-summary.csv',
      fileSize: 128,
      contentType: 'text/csv',
      rawCsvText: 'Net Profit,Total Closed Trades,Percent Profitable,Profit Factor,Max Drawdown,From,To\n120000,12,58.33,1.72,-4.20,2026-01-01,2026-03-09\n',
      parseStatus: 'parsed',
      parseError: null,
      parsedSummaryJson: {
        totalTrades: 12,
        winRate: 58.33,
        profitFactor: 1.72,
        maxDrawdown: -4.2,
        netProfit: 120000,
        periodFrom: '2026-01-01',
        periodTo: '2026-03-09',
      } as Prisma.InputJsonValue,
    },
  });

  const backtestImport2 = await prisma.backtestImport.upsert({
    where: { id: '00000000-0000-4000-8000-000000000403' },
    update: {
      backtestId: backtest.id,
      fileName: 'seed-summary-variant.csv',
      fileSize: 132,
      contentType: 'text/csv',
      rawCsvText: 'Net Profit,Total Closed Trades,Percent Profitable,Profit Factor,Max Drawdown,From,To\n98000,14,50.00,1.35,-5.10,2026-01-01,2026-03-09\n',
      parseStatus: 'parsed',
      parseError: null,
      parsedSummaryJson: {
        totalTrades: 14,
        winRate: 50,
        profitFactor: 1.35,
        maxDrawdown: -5.1,
        netProfit: 98000,
        periodFrom: '2026-01-01',
        periodTo: '2026-03-09',
      } as Prisma.InputJsonValue,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000403',
      backtestId: backtest.id,
      fileName: 'seed-summary-variant.csv',
      fileSize: 132,
      contentType: 'text/csv',
      rawCsvText: 'Net Profit,Total Closed Trades,Percent Profitable,Profit Factor,Max Drawdown,From,To\n98000,14,50.00,1.35,-5.10,2026-01-01,2026-03-09\n',
      parseStatus: 'parsed',
      parseError: null,
      parsedSummaryJson: {
        totalTrades: 14,
        winRate: 50,
        profitFactor: 1.35,
        maxDrawdown: -5.1,
        netProfit: 98000,
        periodFrom: '2026-01-01',
        periodTo: '2026-03-09',
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.backtestComparison.upsert({
    where: { id: '00000000-0000-4000-8000-000000000404' },
    update: {
      baseBacktestId: backtest.id,
      baseImportId: backtestImport.id,
      targetBacktestId: backtest.id,
      targetImportId: backtestImport2.id,
      metricsDiffJson: {
        schema_version: '1.0',
        total_trades_diff: 2,
        win_rate_diff_pt: -8.33,
        profit_factor_diff: -0.37,
        max_drawdown_diff: -0.9,
        net_profit_diff: -22000,
      } as Prisma.InputJsonValue,
      tradeoffSummary: '- 総取引数差分: +2\n- 勝率差分(pt): -8.33\n- Profit Factor差分: -0.37\n- 最大ドローダウン差分: -0.90\n- 純利益差分: -22000.00',
      aiSummary: '比較元に対して、比較先は取引回数が増える一方で勝率と純利益が低下しています。ドローダウンはやや改善しています。',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000404',
      baseBacktestId: backtest.id,
      baseImportId: backtestImport.id,
      targetBacktestId: backtest.id,
      targetImportId: backtestImport2.id,
      metricsDiffJson: {
        schema_version: '1.0',
        total_trades_diff: 2,
        win_rate_diff_pt: -8.33,
        profit_factor_diff: -0.37,
        max_drawdown_diff: -0.9,
        net_profit_diff: -22000,
      } as Prisma.InputJsonValue,
      tradeoffSummary: '- 総取引数差分: +2\n- 勝率差分(pt): -8.33\n- Profit Factor差分: -0.37\n- 最大ドローダウン差分: -0.90\n- 純利益差分: -22000.00',
      aiSummary: '比較元に対して、比較先は取引回数が増える一方で勝率と純利益が低下しています。ドローダウンはやや改善しています。',
    },
  });

  await upsertAiSummaryByFingerprint({
    summaryScope: 'backtest_review',
    targetEntityType: 'backtest',
    targetEntityId: backtest.id,
    title: 'backtest ai review (seed)',
    bodyMarkdown: '勝率は中程度、PFは1.7台。最大DDは許容範囲だがイベント前後のボラに注意。',
    generatedAt: new Date('2026-03-09T18:20:00+09:00'),
  });

  await prisma.internalBacktestExecution.upsert({
    where: { id: '00000000-0000-4000-8000-000000000501' },
    update: {
      strategyRuleVersionId: strategyVersion.id,
      status: 'succeeded',
      startedAt: new Date('2026-03-09T18:25:00+09:00'),
      finishedAt: new Date('2026-03-09T18:26:00+09:00'),
      inputSnapshotJson: {
        strategy_rule_version_id: strategyVersion.id,
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: { symbol: '7203', market: 'JP_STOCK' },
        data_range: { from: '2026-01-01', to: '2026-03-09' },
        engine_config: { summary_mode: 'engine_actual', preset: 'default_previous_close' },
      } as Prisma.InputJsonValue,
      resultSummaryJson: {
        summary_kind: 'engine_actual',
        metrics: {
          trade_count: 2,
          win_rate: 50,
          total_return_percent: 3.2,
          max_drawdown_percent: -1.1,
          average_trade_return_percent: 1.6,
          profit_factor: 1.4,
        },
      } as Prisma.InputJsonValue,
      artifactPointerJson: {
        type: 'engine_actual_artifact',
        execution_id: '00000000-0000-4000-8000-000000000501',
        path: '/api/internal-backtests/executions/00000000-0000-4000-8000-000000000501/artifacts/engine_actual/trades-and-equity',
      } as Prisma.InputJsonValue,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000501',
      strategyRuleVersionId: strategyVersion.id,
      status: 'succeeded',
      startedAt: new Date('2026-03-09T18:25:00+09:00'),
      finishedAt: new Date('2026-03-09T18:26:00+09:00'),
      inputSnapshotJson: {
        strategy_rule_version_id: strategyVersion.id,
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: { symbol: '7203', market: 'JP_STOCK' },
        data_range: { from: '2026-01-01', to: '2026-03-09' },
        engine_config: { summary_mode: 'engine_actual', preset: 'default_previous_close' },
      } as Prisma.InputJsonValue,
      resultSummaryJson: {
        summary_kind: 'engine_actual',
        metrics: {
          trade_count: 2,
          win_rate: 50,
          total_return_percent: 3.2,
          max_drawdown_percent: -1.1,
          average_trade_return_percent: 1.6,
          profit_factor: 1.4,
        },
      } as Prisma.InputJsonValue,
      artifactPointerJson: {
        type: 'engine_actual_artifact',
        execution_id: '00000000-0000-4000-8000-000000000501',
        path: '/api/internal-backtests/executions/00000000-0000-4000-8000-000000000501/artifacts/engine_actual/trades-and-equity',
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.internalBacktestExecutionArtifact.upsert({
    where: {
      executionId_kind: {
        executionId: '00000000-0000-4000-8000-000000000501',
        kind: 'engine_actual_trades_and_equity',
      },
    },
    update: {
      path: '/api/internal-backtests/executions/00000000-0000-4000-8000-000000000501/artifacts/engine_actual/trades-and-equity',
      payloadJson: {
        trades: [
          {
            entry_at: '2026-02-05T00:00:00.000Z',
            entry_price: 2890,
            exit_at: '2026-02-20T00:00:00.000Z',
            exit_price: 2968,
            return_percent: 2.7,
            holding_bars: 11,
          },
        ],
        equity_curve: [
          { at: '2026-02-05T00:00:00.000Z', equity_index: 100 },
          { at: '2026-02-20T00:00:00.000Z', equity_index: 102.7 },
          { at: '2026-03-09T00:00:00.000Z', equity_index: 103.2 },
        ],
      } as Prisma.InputJsonValue,
    },
    create: {
      executionId: '00000000-0000-4000-8000-000000000501',
      kind: 'engine_actual_trades_and_equity',
      path: '/api/internal-backtests/executions/00000000-0000-4000-8000-000000000501/artifacts/engine_actual/trades-and-equity',
      payloadJson: {
        trades: [
          {
            entry_at: '2026-02-05T00:00:00.000Z',
            entry_price: 2890,
            exit_at: '2026-02-20T00:00:00.000Z',
            exit_price: 2968,
            return_percent: 2.7,
            holding_bars: 11,
          },
        ],
        equity_curve: [
          { at: '2026-02-05T00:00:00.000Z', equity_index: 100 },
          { at: '2026-02-20T00:00:00.000Z', equity_index: 102.7 },
          { at: '2026-03-09T00:00:00.000Z', equity_index: 103.2 },
        ],
      } as Prisma.InputJsonValue,
    },
  });

  console.log(`Seeded user: ${user.email}`);
  console.log(`Seeded symbols: ${Array.from(upsertedSymbols.values()).map((s) => `${s.symbolCode}:${s.id}`).join(', ')}`);
  console.log(`Seeded note: ${note.id}`);
  console.log(`Seeded comparison: ${comparisonSession.id}`);
  console.log(`Seeded backtest/import: ${backtest.id} / ${backtestImport.id}`);
  console.log(`Seeded backtest comparison: 00000000-0000-4000-8000-000000000404`);
  console.log('Seed completed for UI walkthrough dataset.');
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
