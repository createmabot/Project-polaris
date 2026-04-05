import { describe, expect, it } from 'vitest';
import { runInternalBacktestExecutionService } from '../src/internal-backtests/run-execution-service';
import { normalizeExecutionInputSnapshot } from '../src/internal-backtests/contracts';
import { createDummyInternalBacktestEngineAdapter } from '../src/internal-backtests/engine-adapter';
import { StubInternalBacktestDataSourceAdapter } from '../src/internal-backtests/data-source-adapter';
import {
  InternalBacktestProviderUnavailableError,
  type InternalBacktestMarketDataProvider,
} from '../src/internal-backtests/market-data-provider';

describe('internal backtest execution service contracts', () => {
  it('normalizes input snapshot with fallback from strategy_snapshot market/timeframe', () => {
    const normalized = normalizeExecutionInputSnapshot({
      strategy_rule_version_id: 'ver-1',
      data_range: { from: '2024-01-01', to: '2025-12-31' },
      engine_config: {},
      strategy_snapshot: {
        natural_language_rule: 'rule',
        generated_pine: 'strategy("x")',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });

    expect(normalized.market).toBe('JP_STOCK');
    expect(normalized.timeframe).toBe('D');
    expect(normalized.dataRange.from).toBe('2024-01-01');
    expect(normalized.dataRange.to).toBe('2025-12-31');
  });

  it('canonicalizes JP_STOCK execution_target symbol in input snapshot', () => {
    const normalized = normalizeExecutionInputSnapshot({
      strategy_rule_version_id: 'ver-1',
      market: 'JP_STOCK',
      timeframe: 'D',
      execution_target: {
        symbol: '  tyo:7203 ',
        source_kind: 'daily_ohlcv',
      },
      data_range: { from: '2024-01-01', to: '2024-01-31' },
      engine_config: {},
      strategy_snapshot: {
        natural_language_rule: 'rule',
        generated_pine: 'strategy("x")',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });

    expect(normalized.executionTarget.symbol).toBe('7203');
  });

  it('returns validated summary and artifact pointer from service', async () => {
    const output = await runInternalBacktestExecutionService({
      executionId: 'ibtx-1',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        data_range: { from: '2024-01-01', to: '2025-12-31' },
        engine_config: {},
        strategy_snapshot: {
          natural_language_rule: 'rule',
          generated_pine: 'strategy("x")',
          market: 'JP_STOCK',
          timeframe: 'D',
        },
      },
    });

    expect(output.resultSummary.schema_version).toBe('1.0');
    expect(output.resultSummary.summary_kind).toBe('scaffold_deterministic');
    expect(output.resultSummary.market).toBe('JP_STOCK');
    expect(output.resultSummary.period.to).toBe('2025-12-31');
    expect(output.resultSummary.metrics.bar_count).toBeGreaterThan(0);
    expect(output.artifactPointer).toMatchObject({
      type: 'internal_backtest_execution',
      execution_id: 'ibtx-1',
      path: '/internal-backtests/executions/ibtx-1',
    });
    expect(output.inputSnapshot.strategy_rule_version_id).toBe('ver-1');
    expect(output.inputSnapshot.execution_target).toMatchObject({
      symbol: 'legacy:ver-1',
      source_kind: 'daily_ohlcv',
    });
    expect(output.inputSnapshot.data_source_snapshot).toBeUndefined();
  });

  it('calculates deterministic metrics from execution input', async () => {
    const snapshotBase = {
      strategy_rule_version_id: 'ver-1',
      market: 'JP_STOCK',
      timeframe: 'D',
      data_range: { from: '2024-01-01', to: '2024-12-31' },
      engine_config: {},
      strategy_snapshot: {
        natural_language_rule: 'rule',
        generated_pine: 'strategy("x")',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    };

    const first = await runInternalBacktestExecutionService({
      executionId: 'ibtx-a',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: snapshotBase,
    });

    const second = await runInternalBacktestExecutionService({
      executionId: 'ibtx-b',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: snapshotBase,
    });

    const differentInput = await runInternalBacktestExecutionService({
      executionId: 'ibtx-c',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: {
        ...snapshotBase,
        timeframe: '4H',
        strategy_snapshot: {
          ...snapshotBase.strategy_snapshot,
          timeframe: '4H',
        },
      },
    });

    expect(first.resultSummary.metrics).toEqual(second.resultSummary.metrics);
    expect(differentInput.resultSummary.metrics).not.toEqual(first.resultSummary.metrics);
  });

  it('keeps metrics stable for equivalent timeframe aliases', async () => {
    const base = {
      strategy_rule_version_id: 'ver-1',
      market: 'JP_STOCK',
      data_range: { from: '2024-01-01', to: '2024-12-31' },
      engine_config: {},
      strategy_snapshot: {
        natural_language_rule: 'rule',
        generated_pine: 'strategy("x")',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    };

    const daily = await runInternalBacktestExecutionService({
      executionId: 'ibtx-d',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: {
        ...base,
        timeframe: 'D',
      },
    });

    const oneDay = await runInternalBacktestExecutionService({
      executionId: 'ibtx-1d',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: {
        ...base,
        timeframe: '1D',
      },
    });

    const lowercase = await runInternalBacktestExecutionService({
      executionId: 'ibtx-lower',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: {
        ...base,
        timeframe: 'd',
      },
    });

    expect(daily.resultSummary.metrics).toEqual(oneDay.resultSummary.metrics);
    expect(daily.resultSummary.metrics).toEqual(lowercase.resultSummary.metrics);
  });

  it('returns engine_estimated summary when summary_mode is requested', async () => {
    const baseInputSnapshot = {
      strategy_rule_version_id: 'ver-1',
      market: 'JP_STOCK',
      timeframe: 'D',
      execution_target: {
        symbol: '7203',
        source_kind: 'daily_ohlcv',
      },
      data_range: { from: '2024-01-01', to: '2025-12-31' },
      strategy_snapshot: {
        natural_language_rule: 'rule',
        generated_pine: 'strategy("x")',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    };

    const scaffoldOutput = await runInternalBacktestExecutionService({
      executionId: 'ibtx-11',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: {
        ...baseInputSnapshot,
        engine_config: {},
      },
    });
    const estimatedOutput = await runInternalBacktestExecutionService({
      executionId: 'ibtx-22',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: {
        ...baseInputSnapshot,
        engine_config: { summary_mode: 'engine_estimated' },
      },
    });

    expect(estimatedOutput.resultSummary.summary_kind).toBe('engine_estimated');
    expect(scaffoldOutput.resultSummary.summary_kind).toBe('scaffold_deterministic');
    expect(estimatedOutput.resultSummary.metrics).not.toEqual(scaffoldOutput.resultSummary.metrics);
    expect(estimatedOutput.inputSnapshot.data_source_snapshot).toMatchObject({
      source_kind: 'daily_ohlcv',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2025-12-31',
    });
    expect(estimatedOutput.inputSnapshot.data_source_snapshot?.bar_count).toBeGreaterThan(0);
  });

  it('returns engine_actual summary with minimal trade metrics and artifact path', async () => {
    const output = await runInternalBacktestExecutionService({
      executionId: 'ibtx-actual-1',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: {
          symbol: '7203',
          source_kind: 'daily_ohlcv',
        },
        data_range: { from: '2024-01-01', to: '2024-01-20' },
        engine_config: { summary_mode: 'engine_actual', commission_percent: 0, slippage_percent: 0 },
        strategy_snapshot: {
          natural_language_rule: 'rule',
          generated_pine: 'strategy("x")',
          market: 'JP_STOCK',
          timeframe: 'D',
        },
      },
    });

    expect(output.resultSummary.summary_kind).toBe('engine_actual');
    expect(output.resultSummary.metrics.bar_count).toBe(20);
    expect(output.resultSummary.metrics.trade_count).toBeTypeOf('number');
    expect(output.resultSummary.metrics.win_rate).toBeTypeOf('number');
    expect(output.resultSummary.metrics.total_return_percent).toBeTypeOf('number');
    expect(output.resultSummary.metrics.max_drawdown_percent).toBeTypeOf('number');
    expect(output.resultSummary.metrics.holding_period_avg_bars).toBeTypeOf('number');
    expect(output.artifactPointer).toMatchObject({
      type: 'internal_backtest_execution',
      execution_id: 'ibtx-actual-1',
      path: '/internal-backtests/executions/ibtx-actual-1/artifacts/engine_actual/trades-and-equity',
    });
    expect(output.artifactPayload).toBeDefined();
    expect(output.artifactPayload?.trades).toBeInstanceOf(Array);
    expect(output.artifactPayload?.equity_curve).toBeInstanceOf(Array);
    expect(output.inputSnapshot.data_source_snapshot?.bar_count).toBe(20);
  });

  it('keeps engine_actual succeeded with no-trade summary when bars are empty', async () => {
    const engineAdapter = createDummyInternalBacktestEngineAdapter({
      fetchDailyOhlcv: async () => ({
        bars: [],
        snapshot: {
          source_kind: 'daily_ohlcv',
          market: 'JP_STOCK',
          timeframe: 'D',
          from: '2024-01-01',
          to: '2024-01-10',
          fetched_at: '2024-01-10T00:00:00.000Z',
          data_revision: 'stub-zero-bars',
          bar_count: 0,
        },
        fetchObservation: {
          providerName: 'stub',
          internalReasonCode: null,
          retryTarget: false,
          retryAttempted: false,
          retryAttempts: 1,
          httpStatus: null,
          endpointKind: 'stub_daily_ohlcv',
        },
      }),
    });

    const output = await runInternalBacktestExecutionService(
      {
        executionId: 'ibtx-actual-zero-bars',
        strategyRuleVersionId: 'ver-1',
        engineVersion: 'ibtx-v0',
        inputSnapshotJson: {
          strategy_rule_version_id: 'ver-1',
          market: 'JP_STOCK',
          timeframe: 'D',
          execution_target: {
            symbol: '7203',
            source_kind: 'daily_ohlcv',
          },
          data_range: { from: '2024-01-01', to: '2024-01-10' },
          engine_config: { summary_mode: 'engine_actual' },
          strategy_snapshot: {
            natural_language_rule: 'rule',
            generated_pine: 'strategy("x")',
            market: 'JP_STOCK',
            timeframe: 'D',
          },
        },
      },
      { engineAdapter },
    );

    expect(output.resultSummary.summary_kind).toBe('engine_actual');
    expect(output.resultSummary.metrics).toMatchObject({
      bar_count: 0,
      trade_count: 0,
      win_rate: 0,
      total_return_percent: 0,
      max_drawdown_percent: 0,
      holding_period_avg_bars: 0,
    });
    expect(output.resultSummary.metrics.first_trade_at).toBeNull();
    expect(output.resultSummary.metrics.last_trade_at).toBeNull();
    expect(output.artifactPayload).toEqual({
      trades: [],
      equity_curve: [],
    });
    expect(output.inputSnapshot.data_source_snapshot?.bar_count).toBe(0);
  });

  it('builds engine_estimated metrics from normalized bars deterministically', async () => {
    const inputSnapshot = {
      strategy_rule_version_id: 'ver-1',
      market: 'JP_STOCK',
      timeframe: 'D',
      execution_target: {
        symbol: '7203',
        source_kind: 'daily_ohlcv',
      },
      data_range: { from: '2024-01-01', to: '2024-01-10' },
      engine_config: { summary_mode: 'engine_estimated' },
      strategy_snapshot: {
        natural_language_rule: 'rule',
        generated_pine: 'strategy("x")',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    };

    const first = await runInternalBacktestExecutionService({
      executionId: 'ibtx-est-bars-1',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: inputSnapshot,
    });

    const second = await runInternalBacktestExecutionService({
      executionId: 'ibtx-est-bars-2',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: inputSnapshot,
    });

    const changedRange = await runInternalBacktestExecutionService({
      executionId: 'ibtx-est-bars-3',
      strategyRuleVersionId: 'ver-1',
      engineVersion: 'ibtx-v0',
      inputSnapshotJson: {
        ...inputSnapshot,
        data_range: { from: '2024-01-01', to: '2024-01-20' },
      },
    });

    expect(first.resultSummary.summary_kind).toBe('engine_estimated');
    expect(first.resultSummary.metrics).toEqual(second.resultSummary.metrics);
    expect(first.resultSummary.metrics).not.toEqual(changedRange.resultSummary.metrics);
    expect(first.resultSummary.metrics.bar_count).toBe(10);
    expect(changedRange.resultSummary.metrics.bar_count).toBe(20);
  });

  it('fails with DATA_SOURCE_UNAVAILABLE on unsupported estimated market/timeframe', async () => {
    await expect(
      runInternalBacktestExecutionService({
        executionId: 'ibtx-estimated-unsupported',
        strategyRuleVersionId: 'ver-1',
        engineVersion: 'ibtx-v0',
        inputSnapshotJson: {
          strategy_rule_version_id: 'ver-1',
          market: 'US_STOCK',
          timeframe: 'D',
          execution_target: {
            symbol: 'AAPL',
            source_kind: 'daily_ohlcv',
          },
          data_range: { from: '2024-01-01', to: '2025-12-31' },
          engine_config: { summary_mode: 'engine_estimated' },
          strategy_snapshot: {
            natural_language_rule: 'rule',
            generated_pine: 'strategy("x")',
            market: 'US_STOCK',
            timeframe: 'D',
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'DATA_SOURCE_UNAVAILABLE' });
  });

  it('fails with INVALID_EXECUTION_TARGET when estimated mode has no execution_target.symbol', async () => {
    await expect(
      runInternalBacktestExecutionService({
        executionId: 'ibtx-estimated-no-target',
        strategyRuleVersionId: 'ver-1',
        engineVersion: 'ibtx-v0',
        inputSnapshotJson: {
          strategy_rule_version_id: 'ver-1',
          market: 'JP_STOCK',
          timeframe: 'D',
          data_range: { from: '2024-01-01', to: '2025-12-31' },
          engine_config: { summary_mode: 'engine_estimated' },
          strategy_snapshot: {
            natural_language_rule: 'rule',
            generated_pine: 'strategy(\"x\")',
            market: 'JP_STOCK',
            timeframe: 'D',
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EXECUTION_TARGET' });
  });

  it('fails with INVALID_EXECUTION_TARGET when actual mode has no execution_target.symbol', async () => {
    await expect(
      runInternalBacktestExecutionService({
        executionId: 'ibtx-actual-no-target',
        strategyRuleVersionId: 'ver-1',
        engineVersion: 'ibtx-v0',
        inputSnapshotJson: {
          strategy_rule_version_id: 'ver-1',
          market: 'JP_STOCK',
          timeframe: 'D',
          data_range: { from: '2024-01-01', to: '2025-12-31' },
          engine_config: { summary_mode: 'engine_actual' },
          strategy_snapshot: {
            natural_language_rule: 'rule',
            generated_pine: 'strategy(\"x\")',
            market: 'JP_STOCK',
            timeframe: 'D',
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EXECUTION_TARGET' });
  });

  it('fails with INVALID_EXECUTION_TARGET when JP_STOCK symbol is not canonicalizable', async () => {
    await expect(
      runInternalBacktestExecutionService({
        executionId: 'ibtx-estimated-invalid-symbol',
        strategyRuleVersionId: 'ver-1',
        engineVersion: 'ibtx-v0',
        inputSnapshotJson: {
          strategy_rule_version_id: 'ver-1',
          market: 'JP_STOCK',
          timeframe: 'D',
          execution_target: {
            symbol: 'AAPL',
            source_kind: 'daily_ohlcv',
          },
          data_range: { from: '2024-01-01', to: '2025-12-31' },
          engine_config: { summary_mode: 'engine_estimated' },
          strategy_snapshot: {
            natural_language_rule: 'rule',
            generated_pine: 'strategy(\"x\")',
            market: 'JP_STOCK',
            timeframe: 'D',
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EXECUTION_TARGET' });
  });

  it('fails when input snapshot is invalid', async () => {
    await expect(
      runInternalBacktestExecutionService({
        executionId: 'ibtx-invalid',
        strategyRuleVersionId: 'ver-1',
        engineVersion: 'ibtx-v0',
        inputSnapshotJson: {
          strategy_rule_version_id: 'ver-1',
          market: 'JP_STOCK',
          timeframe: 'D',
          data_range: { from: '2025-12-31', to: '2024-01-01' },
          strategy_snapshot: {
            natural_language_rule: 'rule',
            generated_pine: null,
            market: 'JP_STOCK',
            timeframe: 'D',
          },
        },
      }),
    ).rejects.toThrow('from<=to');
  });

  it('fails when summary_kind is invalid in adapter output', async () => {
    await expect(
      runInternalBacktestExecutionService(
        {
          executionId: 'ibtx-invalid-kind',
          strategyRuleVersionId: 'ver-1',
          engineVersion: 'ibtx-v0',
          inputSnapshotJson: {
            strategy_rule_version_id: 'ver-1',
            market: 'JP_STOCK',
            timeframe: 'D',
            data_range: { from: '2024-01-01', to: '2025-12-31' },
            engine_config: {},
            strategy_snapshot: {
              natural_language_rule: 'rule',
              generated_pine: 'strategy("x")',
              market: 'JP_STOCK',
              timeframe: 'D',
            },
          },
        },
        {
          engineAdapter: async () => ({
            // intentionally invalid
            summary_kind: 'invalid_kind' as any,
            metrics: {
              bar_count: 10,
              first_close: 100,
              last_close: 110,
              price_change: 10,
              price_change_percent: 10,
              period_high: 112,
              period_low: 95,
              range_percent: 17.8947,
            },
          }),
        },
      ),
    ).rejects.toThrow('result_summary.summary_kind');
  });

  it('keeps engine_estimated succeeded with zero-bar data source results', async () => {
    const engineAdapter = createDummyInternalBacktestEngineAdapter({
      fetchDailyOhlcv: async () => ({
        bars: [],
        snapshot: {
          source_kind: 'daily_ohlcv',
          market: 'JP_STOCK',
          timeframe: 'D',
          from: '2024-01-01',
          to: '2024-01-10',
          fetched_at: '2024-01-10T00:00:00.000Z',
          data_revision: 'stub-zero-bars',
          bar_count: 0,
        },
        fetchObservation: {
          providerName: 'stub',
          internalReasonCode: null,
          retryTarget: false,
          retryAttempted: false,
          retryAttempts: 1,
          httpStatus: null,
          endpointKind: 'stub_daily_ohlcv',
        },
      }),
    });

    const output = await runInternalBacktestExecutionService(
      {
        executionId: 'ibtx-estimated-zero-bars',
        strategyRuleVersionId: 'ver-1',
        engineVersion: 'ibtx-v0',
        inputSnapshotJson: {
          strategy_rule_version_id: 'ver-1',
          market: 'JP_STOCK',
          timeframe: 'D',
          execution_target: {
            symbol: '7203',
            source_kind: 'daily_ohlcv',
          },
          data_range: { from: '2024-01-01', to: '2024-01-10' },
          engine_config: { summary_mode: 'engine_estimated' },
          strategy_snapshot: {
            natural_language_rule: 'rule',
            generated_pine: 'strategy(\"x\")',
            market: 'JP_STOCK',
            timeframe: 'D',
          },
        },
      },
      { engineAdapter },
    );

    expect(output.resultSummary.summary_kind).toBe('engine_estimated');
    expect(output.resultSummary.metrics).toMatchObject({
      bar_count: 0,
      first_close: 0,
      last_close: 0,
    });
    expect(output.inputSnapshot.data_source_snapshot?.bar_count).toBe(0);
  });

  it('succeeds in engine_estimated when retry-target provider error recovers on retry', async () => {
    let callCount = 0;
    const flakyProvider: InternalBacktestMarketDataProvider = {
      fetchDailyOhlcv: async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new InternalBacktestProviderUnavailableError('temporary timeout', {
            reasonCode: 'provider_timeout',
            providerName: 'stooq',
            details: { endpoint_kind: 'stooq_daily_csv' },
          });
        }
        return {
          fetched_at: '2024-01-10T00:00:00.000Z',
          data_revision: 'retry-recovered',
          bars: [
            {
              timestamp: '2024-01-10',
              open: 100,
              high: 110,
              low: 90,
              close: 105,
              volume: 1000,
            },
          ],
        };
      },
    };
    const engineAdapter = createDummyInternalBacktestEngineAdapter(
      new StubInternalBacktestDataSourceAdapter(
        flakyProvider,
        { maxRetries: 1, baseDelayMs: 0 },
        async () => {},
      ),
    );

    const output = await runInternalBacktestExecutionService(
      {
        executionId: 'ibtx-estimated-retry-recovered',
        strategyRuleVersionId: 'ver-1',
        engineVersion: 'ibtx-v0',
        inputSnapshotJson: {
          strategy_rule_version_id: 'ver-1',
          market: 'JP_STOCK',
          timeframe: 'D',
          execution_target: {
            symbol: '7203',
            source_kind: 'daily_ohlcv',
          },
          data_range: { from: '2024-01-01', to: '2024-01-10' },
          engine_config: { summary_mode: 'engine_estimated' },
          strategy_snapshot: {
            natural_language_rule: 'rule',
            generated_pine: 'strategy("x")',
            market: 'JP_STOCK',
            timeframe: 'D',
          },
        },
      },
      { engineAdapter },
    );

    expect(callCount).toBe(2);
    expect(output.resultSummary.summary_kind).toBe('engine_estimated');
    expect(output.resultSummary.metrics.bar_count).toBe(1);
    expect(output.inputSnapshot.data_source_snapshot?.bar_count).toBe(1);
  });

  it('fails when metrics.bar_count is fractional', async () => {
    await expect(
      runInternalBacktestExecutionService(
        {
          executionId: 'ibtx-invalid-bar-count',
          strategyRuleVersionId: 'ver-1',
          engineVersion: 'ibtx-v0',
          inputSnapshotJson: {
            strategy_rule_version_id: 'ver-1',
            market: 'JP_STOCK',
            timeframe: 'D',
            data_range: { from: '2024-01-01', to: '2025-12-31' },
            engine_config: {},
            strategy_snapshot: {
              natural_language_rule: 'rule',
              generated_pine: 'strategy(\"x\")',
              market: 'JP_STOCK',
              timeframe: 'D',
            },
          },
        },
        {
          engineAdapter: async () => ({
            summary_kind: 'engine_estimated',
            metrics: {
              bar_count: 1.5,
              first_close: 100,
              last_close: 110,
              price_change: 10,
              price_change_percent: 10,
              period_high: 112,
              period_low: 95,
              range_percent: 17.89,
            },
          }),
        },
      ),
    ).rejects.toThrow('result_summary.metrics.bar_count');
  });
});
