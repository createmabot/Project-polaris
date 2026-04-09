import { describe, expect, it } from 'vitest';
import { normalizeEngineActualRuleSet } from '../src/internal-backtests/engine-actual-rules';

describe('normalizeEngineActualRuleSet exit_overrides', () => {
  it('normalizes valid exit_overrides', () => {
    const normalized = normalizeEngineActualRuleSet({
      actual_rules: {
        entry_rule: { kind: 'price_above_sma', period: 25 },
        exit_rule: { kind: 'price_below_sma', period: 25 },
        exit_overrides: {
          max_holding_bars: 10,
          take_profit_percent: 8.5,
          stop_loss_percent: 3.2,
        },
      },
    });

    expect(normalized.exitOverrides).toEqual({
      maxHoldingBars: 10,
      takeProfitPercent: 8.5,
      stopLossPercent: 3.2,
    });
  });

  it('throws for invalid max_holding_bars', () => {
    expect(() =>
      normalizeEngineActualRuleSet({
        actual_rules: {
          entry_rule: { kind: 'close_above_previous_close' },
          exit_rule: { kind: 'close_below_previous_close' },
          exit_overrides: {
            max_holding_bars: 0,
          },
        },
      }),
    ).toThrow('max_holding_bars');
  });

  it('throws for invalid take_profit_percent or stop_loss_percent', () => {
    expect(() =>
      normalizeEngineActualRuleSet({
        actual_rules: {
          entry_rule: { kind: 'close_above_previous_close' },
          exit_rule: { kind: 'close_below_previous_close' },
          exit_overrides: {
            take_profit_percent: -1,
          },
        },
      }),
    ).toThrow('take_profit_percent');

    expect(() =>
      normalizeEngineActualRuleSet({
        actual_rules: {
          entry_rule: { kind: 'close_above_previous_close' },
          exit_rule: { kind: 'close_below_previous_close' },
          exit_overrides: {
            stop_loss_percent: 0,
          },
        },
      }),
    ).toThrow('stop_loss_percent');
  });
});

