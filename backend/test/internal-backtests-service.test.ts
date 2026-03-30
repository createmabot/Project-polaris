import { describe, expect, it } from 'vitest';
import { runInternalBacktestExecutionService } from '../src/internal-backtests/run-execution-service';
import { normalizeExecutionInputSnapshot } from '../src/internal-backtests/contracts';

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
    expect(output.resultSummary.metrics.total_trades).toBeGreaterThan(0);
    expect(output.artifactPointer).toMatchObject({
      type: 'internal_backtest_execution',
      execution_id: 'ibtx-1',
      path: '/internal-backtests/executions/ibtx-1',
    });
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
              generated_pine: 'strategy(\"x\")',
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
              total_trades: 10,
              win_rate: 0.5,
              net_profit: 1234,
              profit_factor: 1.2,
              max_drawdown_percent: -5.1,
            },
          }),
        },
      ),
    ).rejects.toThrow('result_summary.summary_kind');
  });
});
