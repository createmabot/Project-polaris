/**
 * japanese-input.e2e.test.ts
 *
 * 日本語 natural_language_rule が backend API 経由で正常に受け取れることを確認する。
 *
 * 背景:
 * - PowerShell から日本語 JSON を送る際、UTF-8 未指定で文字化けするケースがある
 * - backend (Fastify) は JSON を UTF-8 として解析するため、
 *   正常な UTF-8 で届いた日本語は正常に保存される
 * - mojibake 検知は detectMojibake() でパターンマッチする最小実装
 *
 * このテストで確認すること:
 * 1. 正常な日本語 natural_language_rule が正常に保存される
 * 2. 文字化けパターン（REPLACEMENT CHARACTER 等）が検知されて warning が返る
 * 3. 正常な日本語には false positive が起きない
 * 4. detectMojibake ユーティリティの単体動作
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strategyRoutes } from '../src/routes/strategies';
import { errorHandler } from '../src/utils/response';
import { detectMojibake } from '../src/utils/encoding';

type StrategyRow = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type StrategyVersionRow = {
  id: string;
  strategyRuleId: string;
  clonedFromVersionId: string | null;
  naturalLanguageRule: string;
  market: string;
  timeframe: string;
  status: string;
  normalizedRuleJson: unknown;
  generatedPine: string | null;
  warningsJson: unknown;
  assumptionsJson: unknown;
  forwardValidationNote: string | null;
  forwardValidationNoteUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type Runtime = {
  strategies: Map<string, StrategyRow>;
  versions: Map<string, StrategyVersionRow>;
  versionSeq: number;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  const now = new Date('2026-04-27T00:00:00Z');
  const strategies = new Map<string, StrategyRow>();
  strategies.set('str-1', {
    id: 'str-1',
    title: '移動平均戦略',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  return {
    strategies,
    versions: new Map(),
    versionSeq: 1,
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    strategyRule: {
      findUnique: async ({ where }: any) => {
        return runtime.strategies.get(where.id) ?? null;
      },
      create: async ({ data }: any) => {
        const now = new Date();
        const id = `str-${runtime.strategies.size + 1}`;
        const row: StrategyRow = {
          id,
          title: data.title,
          status: data.status ?? 'active',
          createdAt: now,
          updatedAt: now,
        };
        runtime.strategies.set(id, row);
        return row;
      },
    },
    strategyRuleVersion: {
      findUnique: async ({ where }: any) => {
        return runtime.versions.get(where.id) ?? null;
      },
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: any) => {
        const now = new Date();
        const id = `ver-${runtime.versionSeq++}`;
        const row: StrategyVersionRow = {
          id,
          strategyRuleId: data.strategyRuleId,
          clonedFromVersionId: data.clonedFromVersionId ?? null,
          naturalLanguageRule: data.naturalLanguageRule,
          market: data.market,
          timeframe: data.timeframe,
          status: data.status ?? 'draft',
          normalizedRuleJson: null,
          generatedPine: null,
          warningsJson: null,
          assumptionsJson: null,
          forwardValidationNote: null,
          forwardValidationNoteUpdatedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        runtime.versions.set(id, row);
        return row;
      },
    },
  };
  return { prisma };
});

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(strategyRoutes, { prefix: '/api/strategies' });
  await app.ready();
  return app;
}

describe('detectMojibake ユーティリティ', () => {
  it('正常な日本語文字列は isSuspect=false を返す', () => {
    const cases = [
      '終値が25日移動平均を上抜けたら買い、下抜けたら売る',
      'RSI が 70 を超えたら売り、30 を下回ったら買い',
      '移動平均クロス戦略（5日・25日）',
      '日経225 銘柄に対してボリンジャーバンド戦略を適用する',
      'ゴールデンクロス・デッドクロス判定',
    ];
    for (const text of cases) {
      const result = detectMojibake(text);
      expect(result.isSuspect, `false positive: "${text}"`).toBe(false);
      expect(result.hint).toBeNull();
    }
  });

  it('REPLACEMENT CHARACTER (U+FFFD) を含む文字列は isSuspect=true を返す', () => {
    // PowerShell で Shift_JIS → UTF-8 として誤解釈された際に出やすいパターン
    const text = '終値\uFFFDが25日\uFFFD移動平均';
    const result = detectMojibake(text);
    expect(result.isSuspect).toBe(true);
    expect(result.hint).toContain('replacement character');
  });

  it('NUL バイトを含む文字列は isSuspect=true を返す', () => {
    const text = '終値が\x00移動平均';
    const result = detectMojibake(text);
    expect(result.isSuspect).toBe(true);
    expect(result.hint).toContain('NUL byte');
  });

  it('Windows-1252 制御文字 (0x80-0x9F) を含む文字列は isSuspect=true を返す', () => {
    // CP932 の特定バイト列が UTF-8 誤解釈された際に現れるパターン
    const text = '移動平均\x82を上抜け';
    const result = detectMojibake(text);
    expect(result.isSuspect).toBe(true);
    expect(result.hint).toContain('Windows-1252');
  });

  it('空文字列は isSuspect=false を返す', () => {
    const result = detectMojibake('');
    expect(result.isSuspect).toBe(false);
  });

  it('ASCII のみの文字列は isSuspect=false を返す', () => {
    const result = detectMojibake('buy above ma25, exit below ma25');
    expect(result.isSuspect).toBe(false);
  });
});

describe('POST /api/strategies/:strategyId/versions - 日本語入力テスト', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('正常な日本語 natural_language_rule が正常に保存される', async () => {
    const app = await createApp();
    const japaneseRule = '終値が25日移動平均を上抜けたら買い、下抜けたら売る';

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategies/str-1/versions',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      payload: JSON.stringify({
        natural_language_rule: japaneseRule,
        market: 'JP_STOCK',
        timeframe: 'D',
      }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.strategy_version.natural_language_rule).toBe(japaneseRule);
    // 正常な日本語では creation_warnings は空
    expect(body.data.creation_warnings).toHaveLength(0);

    // DB に正しく保存されていることを確認
    const savedVersion = [...runtime.versions.values()][0];
    expect(savedVersion.naturalLanguageRule).toBe(japaneseRule);
    expect(savedVersion.market).toBe('JP_STOCK');
    expect(savedVersion.timeframe).toBe('D');
  });

  it('複数の日本語ルールが正常に保存される', async () => {
    const app = await createApp();
    const rules = [
      'RSI が 70 を超えたら売り、30 を下回ったら買い',
      'ゴールデンクロス・デッドクロス判定',
      '日経225 銘柄に対してボリンジャーバンド戦略',
    ];

    for (const rule of rules) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/strategies/str-1/versions',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        payload: JSON.stringify({
          natural_language_rule: rule,
          market: 'JP_STOCK',
          timeframe: 'D',
        }),
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.strategy_version.natural_language_rule).toBe(rule);
      expect(body.data.creation_warnings).toHaveLength(0);
    }

    expect(runtime.versions.size).toBe(3);
  });

  it('REPLACEMENT CHARACTER を含む文字列は creation_warnings が返る（拒否しない）', async () => {
    const app = await createApp();
    // REPLACEMENT CHARACTER が入った文字化けを模倣した文字列
    const mojibakeRule = '移\uFFFD\uFFFD平均\uFFFDクロス';

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategies/str-1/versions',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      payload: JSON.stringify({
        natural_language_rule: mojibakeRule,
        market: 'JP_STOCK',
        timeframe: 'D',
      }),
    });

    // 400 ではなく 201 が返る（拒否しない）
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    // creation_warnings に文字化け疑いの warning が入る
    expect(body.data.creation_warnings).toHaveLength(1);
    expect(body.data.creation_warnings[0]).toContain('文字化け');
    expect(body.data.creation_warnings[0]).toContain('UTF-8');

    // ただし値はそのまま保存される（自動修復なし）
    expect(body.data.strategy_version.natural_language_rule).toBe(mojibakeRule);
  });

  it('空の natural_language_rule は 400 エラーになる', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategies/str-1/versions',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      payload: JSON.stringify({
        natural_language_rule: '',
        market: 'JP_STOCK',
        timeframe: 'D',
      }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('market が空の場合は 400 エラーになる', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategies/str-1/versions',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      payload: JSON.stringify({
        natural_language_rule: '移動平均クロス',
        market: '',
        timeframe: 'D',
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('存在しない strategy_id は 404 エラーになる', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategies/non-existent/versions',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      payload: JSON.stringify({
        natural_language_rule: '移動平均クロス',
        market: 'JP_STOCK',
        timeframe: 'D',
      }),
    });
    expect(res.statusCode).toBe(404);
  });
});
