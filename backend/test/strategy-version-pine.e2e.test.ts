import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strategyVersionRoutes } from '../src/routes/strategy-versions';
import { generatePineDeterministic } from '../src/strategy/pine';
import { errorHandler } from '../src/utils/response';

type StrategyRuleVersionRow = {
  id: string;
  strategyRuleId: string;
  clonedFromVersionId: string | null;
  naturalLanguageRule: string;
  forwardValidationNote: string | null;
  forwardValidationNoteUpdatedAt: Date | null;
  normalizedRuleJson: unknown;
  generatedPine: string | null;
  warningsJson: unknown;
  assumptionsJson: unknown;
  market: string;
  timeframe: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type PineScriptRow = {
  id: string;
  strategyRuleVersionId: string;
  parentPineScriptId: string | null;
  scriptName: string;
  pineVersion: string;
  scriptBody: string;
  generationNoteJson: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type Runtime = {
  pineSeq: number;
  revisionSeq: number;
  versions: Map<string, StrategyRuleVersionRow>;
  pineScripts: Map<string, PineScriptRow>;
  pineRevisionInputs: Map<string, {
    id: string;
    strategyRuleVersionId: string;
    sourcePineScriptId: string;
    generatedPineScriptId: string | null;
    compileErrorText: string | null;
    validationNote: string | null;
    revisionRequest: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

let runtime: Runtime;

const generatePineScriptMock = vi.fn();

function createRuntime(): Runtime {
  const now = new Date('2026-04-25T10:00:00.000Z');
  return {
    pineSeq: 1,
    revisionSeq: 1,
    versions: new Map([
      [
        'ver-1',
        {
          id: 'ver-1',
          strategyRuleId: 'str-1',
          clonedFromVersionId: null,
          naturalLanguageRule: 'buy above ma25, exit below ma25',
          forwardValidationNote: null,
          forwardValidationNoteUpdatedAt: null,
          normalizedRuleJson: null,
          generatedPine: null,
          warningsJson: null,
          assumptionsJson: null,
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        },
      ],
    ]),
    pineScripts: new Map(),
    pineRevisionInputs: new Map(),
  };
}

vi.mock('../src/ai/home-ai-service', () => {
  class HomeAiService {
    async generatePineScript(context: unknown) {
      return generatePineScriptMock(context);
    }
  }
  return { HomeAiService };
});

vi.mock('../src/db', () => {
  const prisma = {
    strategyRuleVersion: {
      findUnique: async ({ where, include }: any) => {
        const row = runtime.versions.get(where.id) ?? null;
        if (!row) return null;
        if (include?.clonedFromVersion) {
          return { ...row, clonedFromVersion: null };
        }
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.versions.get(where.id);
        if (!row) throw new Error('version_not_found');
        const next = {
          ...row,
          ...data,
          updatedAt: new Date(),
        };
        runtime.versions.set(where.id, next);
        return next;
      },
      create: async () => {
        throw new Error('not used');
      },
    },
    pineScript: {
      create: async ({ data }: any) => {
        const id = `pine-${runtime.pineSeq++}`;
        const now = new Date();
        const row: PineScriptRow = {
          id,
          strategyRuleVersionId: data.strategyRuleVersionId,
          parentPineScriptId: data.parentPineScriptId ?? null,
          scriptName: data.scriptName,
          pineVersion: data.pineVersion,
          scriptBody: data.scriptBody,
          generationNoteJson: data.generationNoteJson ?? null,
          status: data.status ?? 'ready',
          createdAt: now,
          updatedAt: now,
        };
        runtime.pineScripts.set(id, row);
        return row;
      },
      findFirst: async ({ where }: any) => {
        let rows = Array.from(runtime.pineScripts.values());
        if (where?.strategyRuleVersionId) {
          rows = rows.filter((row) => row.strategyRuleVersionId === where.strategyRuleVersionId);
        }
        if (where?.id) {
          rows = rows.filter((row) => row.id === where.id);
        }
        rows.sort((a, b) => (
          b.createdAt.getTime() - a.createdAt.getTime()
          || b.id.localeCompare(a.id, undefined, { numeric: true })
        ));
        const selected = rows[0] ?? null;
        if (!selected) return null;
        const generatedFromRevision = Array.from(runtime.pineRevisionInputs.values()).find(
          (item) => item.generatedPineScriptId === selected.id,
        ) ?? null;
        return { ...selected, generatedFromRevision };
      },
    },
    pineRevisionInput: {
      create: async ({ data }: any) => {
        const id = `rev-${runtime.revisionSeq++}`;
        const now = new Date();
        const row = {
          id,
          strategyRuleVersionId: data.strategyRuleVersionId,
          sourcePineScriptId: data.sourcePineScriptId,
          generatedPineScriptId: data.generatedPineScriptId ?? null,
          compileErrorText: data.compileErrorText ?? null,
          validationNote: data.validationNote ?? null,
          revisionRequest: data.revisionRequest,
          createdAt: now,
          updatedAt: now,
        };
        runtime.pineRevisionInputs.set(id, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.pineRevisionInputs.get(where.id);
        if (!row) throw new Error('revision_input_not_found');
        const next = {
          ...row,
          ...data,
          updatedAt: new Date(),
        };
        runtime.pineRevisionInputs.set(where.id, next);
        return next;
      },
      findFirst: async ({ where }: any) => {
        let rows = Array.from(runtime.pineRevisionInputs.values());
        if (where?.strategyRuleVersionId) {
          rows = rows.filter((row) => row.strategyRuleVersionId === where.strategyRuleVersionId);
        }
        rows.sort((a, b) => (
          b.createdAt.getTime() - a.createdAt.getTime()
          || b.id.localeCompare(a.id, undefined, { numeric: true })
        ));
        return rows[0] ?? null;
      },
    },
  };

  return { prisma };
});

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(strategyVersionRoutes, { prefix: '/api/strategy-versions' });
  await app.ready();
  return app;
}

describe('deterministic pine market / timeframe scope', () => {
  const supportedRule =
    '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が25日移動平均線を下回ったら手仕舞い。';

  it('accepts US_STOCK and intraday timeframe without JP_STOCK/D fallback warnings', () => {
    const output = generatePineDeterministic({
      naturalLanguageSpec: supportedRule,
      normalizedRuleJson: null,
      targetMarket: 'US_STOCK',
      targetTimeframe: '1H',
    });

    expect(output.status).toBe('generated');
    expect(output.warnings.join(' ')).not.toContain('JP_STOCK 前提として扱います');
    expect(output.warnings.join(' ')).not.toContain('日足（D）前提として扱います');
    expect(output.assumptions).toContain('対象市場は US_STOCK として扱います。');
    expect(output.assumptions).toContain('対象時間足は 1H として扱います。');
    expect(output.assumptions).toContain('生成されたPineはTradingViewの表示中チャート時間足に従って検証します。');
  });

  it('canonicalizes 1D to D without D fallback warnings', () => {
    const output = generatePineDeterministic({
      naturalLanguageSpec: supportedRule,
      normalizedRuleJson: null,
      targetMarket: 'JP_STOCK',
      targetTimeframe: '1D',
    });

    expect(output.status).toBe('generated');
    expect(output.warnings.join(' ')).not.toContain('日足（D）前提として扱います');
    expect(output.assumptions).not.toContain('対象時間足は 1D として扱います。');
  });

  it('keeps explicit fallback warnings for unsupported market and timeframe', () => {
    const output = generatePineDeterministic({
      naturalLanguageSpec: supportedRule,
      normalizedRuleJson: null,
      targetMarket: 'CRYPTO',
      targetTimeframe: '15M',
    });

    expect(output.warnings).toContain('市場 CRYPTO はPine生成の初回対応範囲外です。JP_STOCK 前提として扱います。');
    expect(output.warnings).toContain('時間足 15M はPine生成の初回対応範囲外です。日足（D）前提として扱います。');
    expect(output.assumptions).toContain('対象市場は JP_STOCK として扱います。');
    expect(output.assumptions).toContain('対象時間足は日足（D）として扱います。');
  });

  it('returns Japanese warnings and assumptions from deterministic Pine generation', () => {
    const output = generatePineDeterministic({
      naturalLanguageSpec: 'ショートで高値更新を狙う。トレーリングストップも使う。',
      normalizedRuleJson: null,
      targetMarket: 'JP_STOCK',
      targetTimeframe: 'D',
    });

    expect(output.status).toBe('failed');
    expect(output.warnings).toContain('ショート条件は初回Pine生成の対応範囲外です。long_only 前提で扱います。');
    expect(output.warnings).toContain('トレーリング、ナンピン、pyramiding、詳細なポジションサイズ制御は初回Pine生成の対応範囲外です。');
    expect(output.warnings).toContain('初回対応パターンからエントリー条件を検出できませんでした。');
    expect(output.warnings).toContain('初回対応パターンから手仕舞い条件を検出できませんでした。');
    expect(output.warnings.join(' ')).not.toContain('entry conditions were not detected');
  });
});

describe('strategy version pine endpoints', () => {
  beforeEach(() => {
    runtime = createRuntime();
    generatePineScriptMock.mockReset();
  });

  it('generates and persists pine script successfully', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("ok", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().data.strategy_version.status).toBe('generated');
    expect(generated.json().data.pine.pine_script_id).toBeTruthy();

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.status).toBe('available');
    expect(typeof fetched.json().data.generated_script).toBe('string');

    await app.close();
  });

  it('passes expanded market and timeframe through pine generation context', async () => {
    const row = runtime.versions.get('ver-1');
    if (!row) throw new Error('seed row missing');
    runtime.versions.set('ver-1', {
      ...row,
      market: 'US_STOCK',
      timeframe: '4H',
    });

    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("ok", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    expect(generated.statusCode).toBe(200);
    expect(generatePineScriptMock).toHaveBeenCalledTimes(1);
    expect(generatePineScriptMock.mock.calls[0][0]).toMatchObject({
      targetMarket: 'US_STOCK',
      targetTimeframe: '4H',
    });

    await app.close();
  });

  it('preserves provider Pine notes and keeps post-processing notes in Japanese', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: 'Here is your Pine script:\n```pine\n//@version=6\nstrategy("ok", overlay=true)\n```',
        warnings: [
          'リスク管理用の損切り価格はエントリー時点で固定し、トレーリングしません。',
        ],
        assumptions: [
          'シグナル発生後、翌営業日の始値でエントリーし、損切り価格はシグナル発生足の ATR 値をもとに計算します。',
          'Chandelier Exit の「過去の最高値」は、同じ20期間における高値の最大値として解釈します。',
        ],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    expect(generated.statusCode).toBe(200);
    const generatedBody = generated.json().data;
    expect(generatedBody.strategy_version.warnings).toContain(
      'リスク管理用の損切り価格はエントリー時点で固定し、トレーリングしません。',
    );
    expect(generatedBody.strategy_version.warnings).toContain('生成結果の先頭に含まれていた説明文を削除しました。');
    expect(generatedBody.strategy_version.assumptions).toContain(
      'シグナル発生後、翌営業日の始値でエントリーし、損切り価格はシグナル発生足の ATR 値をもとに計算します。',
    );
    expect(generatedBody.strategy_version.assumptions).toContain(
      'Chandelier Exit の「過去の最高値」は、同じ20期間における高値の最大値として解釈します。',
    );
    expect(generatedBody.pine.warnings).toContain('生成結果に含まれていた Markdown code fence を削除しました。');
    expect(generatedBody.pine.warnings).toContain('生成結果の先頭に含まれていた説明文を削除しました。');
    expect(generatedBody.pine.generated_script).toContain('strategy("ok", overlay=true)');
    expect(generatedBody.pine.generated_script).not.toContain('```');
    expect(generatedBody.pine.generated_script).not.toContain('Here is your Pine script');

    const detail = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1',
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.strategy_version.warnings).toContain(
      'リスク管理用の損切り価格はエントリー時点で固定し、トレーリングしません。',
    );
    expect(detail.json().data.strategy_version.assumptions).toContain(
      'シグナル発生後、翌営業日の始値でエントリーし、損切り価格はシグナル発生足の ATR 値をもとに計算します。',
    );

    const pine = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(pine.statusCode).toBe(200);
    expect(pine.json().data.generated_script).not.toContain('```');
    expect(pine.json().data.generated_script).not.toContain('Here is your Pine script');
    expect(pine.json().data.warnings).toContain('生成結果に含まれていた Markdown code fence を削除しました。');
    expect(pine.json().data.warnings).toContain('生成結果の先頭に含まれていた説明文を削除しました。');
    expect(JSON.stringify(pine.json().data.generation_note)).toContain('シグナル発生後');

    await app.close();
  });

  it('canonicalizes 1D strategy version timeframe before pine generation', async () => {
    const row = runtime.versions.get('ver-1');
    if (!row) throw new Error('seed row missing');
    runtime.versions.set('ver-1', {
      ...row,
      timeframe: '1D',
    });

    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("ok", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    expect(generated.statusCode).toBe(200);
    expect(generatePineScriptMock.mock.calls[0][0]).toMatchObject({
      targetTimeframe: 'D',
    });
    expect(generated.json().data.strategy_version.timeframe).toBe('D');

    await app.close();
  });

  it('regenerates pine with compile_error_text and stores revision context', async () => {
    generatePineScriptMock
      .mockResolvedValueOnce({
        output: {
          normalizedRuleJson: { strategy_type: 'long_only' },
          generatedScript: '//@version=6\nstrategy("base", overlay=true)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        },
        log: { provider: 'local_llm', fallbackToStub: false },
      })
      .mockResolvedValueOnce({
        output: {
          normalizedRuleJson: { strategy_type: 'long_only' },
          generatedScript: '//@version=6\nstrategy("revised", overlay=true)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        },
        log: { provider: 'local_llm', fallbackToStub: false },
      });

    const app = await createApp();

    const initial = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    expect(initial.statusCode).toBe(200);
    const sourcePineScriptId = initial.json().data.pine.pine_script_id as string;
    expect(sourcePineScriptId).toBeTruthy();

    const regenerated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/regenerate',
      payload: {
        source_pine_script_id: sourcePineScriptId,
        compile_error_text: "Undeclared identifier 'foo'",
        validation_note: 'TradingView compile failed on line 7',
        revision_request: 'entry条件を単純化して再生成してください',
      },
    });
    expect(regenerated.statusCode).toBe(200);
    expect(regenerated.json().data.pine.parent_pine_script_id).toBe(sourcePineScriptId);
    expect(regenerated.json().data.pine.source_pine_script_id).toBe(sourcePineScriptId);
    expect(regenerated.json().data.pine.revision_input_id).toBeTruthy();

    const secondCallContext = generatePineScriptMock.mock.calls[1][0];
    expect(secondCallContext.regenerationInput.sourcePineScriptId).toBe(sourcePineScriptId);
    expect(secondCallContext.regenerationInput.compileErrorText).toContain('Undeclared identifier');

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.latest_revision_input.revision_request).toContain('entry条件');
    expect(fetched.json().data.parent_pine_script_id).toBe(sourcePineScriptId);

    await app.close();
  });

  it('regenerates with revision_request only', async () => {
    generatePineScriptMock
      .mockResolvedValueOnce({
        output: {
          normalizedRuleJson: { strategy_type: 'long_only' },
          generatedScript: '//@version=6\nstrategy("base", overlay=true)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        },
        log: { provider: 'local_llm', fallbackToStub: false },
      })
      .mockResolvedValueOnce({
        output: {
          normalizedRuleJson: { strategy_type: 'long_only' },
          generatedScript: '//@version=6\nstrategy("rev2", overlay=true)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        },
        log: { provider: 'local_llm', fallbackToStub: false },
      });

    const app = await createApp();
    const initial = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    const sourcePineScriptId = initial.json().data.pine.pine_script_id as string;

    const regenerated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/regenerate',
      payload: {
        source_pine_script_id: sourcePineScriptId,
        revision_request: 'exit条件を厳しくしてください',
      },
    });

    expect(regenerated.statusCode).toBe(200);
    expect(regenerated.json().data.pine.revision_input_id).toBeTruthy();
    expect(regenerated.json().data.pine.status).toBe('generated');

    await app.close();
  });

  it('marks failure when provider output is invalid pine format', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: 'strategy("invalid_without_version", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().data.strategy_version.status).toBe('failed');
    expect(generated.json().data.pine.pine_script_id).toBeNull();
    expect(generated.json().data.pine.failure_reason).toContain('version');

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.status).toBe('unavailable');

    await app.close();
  });

  it('returns sanitized failed status when provider call throws', async () => {
    generatePineScriptMock.mockRejectedValue(new Error('provider timeout at upstream-url with model=sensitive-model-value'));
    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().data.strategy_version.status).toBe('failed');
    expect(generated.json().data.pine.warnings).toContain('provider_error: provider_timeout');
    expect(generated.json().data.pine.failure_reason).toBe('provider_timeout');
    const serialized = JSON.stringify(generated.json().data);
    expect(serialized).not.toContain('upstream-url');
    expect(serialized).not.toContain('sensitive-model-value');

    await app.close();
  });

  it('persists fallback flag when service used stub fallback', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("stub", overlay=true)',
        warnings: ['fallback_used'],
        assumptions: [],
        status: 'generated',
        modelName: 'stub-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: true,
      },
    });

    const app = await createApp();

    await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/pine',
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.generation_note.payload.fallback_to_stub).toBe(true);

    await app.close();
  });

  it('returns repair attempts metadata when service repaired output', async () => {
    generatePineScriptMock.mockResolvedValue({
      output: {
        normalizedRuleJson: { strategy_type: 'long_only' },
        generatedScript: '//@version=6\nstrategy("repaired", overlay=true)',
        warnings: ['repaired_once'],
        assumptions: [],
        status: 'generated',
        repairAttempts: 1,
        failureReason: null,
        invalidReasonCodes: ['missing_version_declaration'],
        modelName: 'local-model',
        promptVersion: 'v1',
      },
      log: {
        provider: 'local_llm',
        fallbackToStub: false,
      },
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    expect(generated.statusCode).toBe(200);
    expect(generated.json().data.pine.repair_attempts).toBe(1);
    expect(generated.json().data.pine.invalid_reason_codes).toContain('missing_version_declaration');

    await app.close();
  });

  it('returns validation error when backtest period is inconsistent', async () => {
    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {
        backtest_period_from: '2026-04-20',
        backtest_period_to: '2026-04-10',
      },
    });

    expect(generated.statusCode).toBe(400);
    expect(generated.json().error.code).toBe('VALIDATION_ERROR');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });

  it('returns validation error when backtest period field is non-string', async () => {
    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {
        backtest_period_from: 20260420,
        backtest_period_to: '2026-04-21',
      },
    });

    expect(generated.statusCode).toBe(400);
    expect(generated.json().error.code).toBe('VALIDATION_ERROR');
    expect(generated.json().error.message).toContain('backtest_period_from must be a string');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });

  it('returns validation error for impossible calendar dates', async () => {
    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {
        backtest_period_from: '2026-02-31',
        backtest_period_to: '2026-03-10',
      },
    });

    expect(generated.statusCode).toBe(400);
    expect(generated.json().error.code).toBe('VALIDATION_ERROR');
    expect(generated.json().error.message).toContain('valid calendar date');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });

  it('returns validation error when natural language rule is empty', async () => {
    const row = runtime.versions.get('ver-1');
    if (!row) throw new Error('seed row missing');
    runtime.versions.set('ver-1', {
      ...row,
      naturalLanguageRule: '   ',
    });

    const app = await createApp();

    const generated = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/pine/generate',
      payload: {},
    });

    expect(generated.statusCode).toBe(400);
    expect(generated.json().error.code).toBe('VALIDATION_ERROR');
    expect(generatePineScriptMock).toHaveBeenCalledTimes(0);

    await app.close();
  });
});
