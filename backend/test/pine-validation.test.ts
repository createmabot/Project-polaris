import { describe, expect, it } from 'vitest';
import { assessGeneratedPineScript, reviewGeneratedPineScriptDeterministic } from '../src/strategy/pine';

describe('assessGeneratedPineScript', () => {
  it('classifies empty output as non-retryable failure', () => {
    const assessed = assessGeneratedPineScript('');
    expect(assessed.failureReason).toContain('empty');
    expect(assessed.retryable).toBe(false);
    expect(assessed.invalidReasonCodes).toContain('empty_output');
  });

  it('classifies missing version as retryable', () => {
    const assessed = assessGeneratedPineScript('strategy("x", overlay=true)');
    expect(assessed.failureReason).toContain('version');
    expect(assessed.retryable).toBe(true);
    expect(assessed.invalidReasonCodes).toContain('missing_version_declaration');
  });

  it('removes markdown fence and explanatory prefix as warning and keeps valid script', () => {
    const assessed = assessGeneratedPineScript(
      'Here is your Pine script:\n```pine\n//@version=6\nstrategy("ok", overlay=true)\n```',
    );
    expect(assessed.failureReason).toBeNull();
    expect(assessed.normalizedScript).toContain('//@version=6');
    expect(assessed.normalizedScript).toContain('strategy("ok", overlay=true)');
    expect(assessed.warnings).toContain('生成結果に含まれていた Markdown code fence を削除しました。');
    expect(assessed.warnings).toContain('生成結果の先頭に含まれていた説明文を削除しました。');
    expect(assessed.invalidReasonCodes).toContain('markdown_code_fence_pollution');
  });

  it('normalizes unsupported color.color namespace', () => {
    const assessed = assessGeneratedPineScript(
      '//@version=6\nstrategy("ok", overlay=true)\nplot(close, color=color.color.green)',
    );

    expect(assessed.failureReason).toBeNull();
    expect(assessed.normalizedScript).toContain('color=color.green');
    expect(assessed.normalizedScript).not.toContain('color.color.');
    expect(assessed.warnings).toContain('Pine Script の unsupported color.color.* namespace を color.* に補正しました。');
    expect(assessed.invalidReasonCodes).toContain('unsupported_color_namespace');
  });

  it('normalizes unsupported plot.style_dashed style', () => {
    const assessed = assessGeneratedPineScript(
      '//@version=6\nstrategy("ok", overlay=true)\nplot(close, style=plot.style_dashed)',
    );

    expect(assessed.failureReason).toBeNull();
    expect(assessed.normalizedScript).toContain('style=plot.style_linebr');
    expect(assessed.normalizedScript).not.toContain('plot.style_dashed');
    expect(assessed.warnings).toContain('Pine Script の unsupported plot.style_dashed を plot.style_linebr に補正しました。');
    expect(assessed.invalidReasonCodes).toContain('unsupported_plot_style');
  });

  it('normalizes unsupported crossabove and crossbelow aliases', () => {
    const assessed = assessGeneratedPineScript(
      '//@version=6\nstrategy("ok", overlay=true)\nentryCondition = ta.crossabove(close, ta.sma(close, 20))\nexitCondition = ta.crossbelow(close, ta.sma(close, 20))',
    );

    expect(assessed.failureReason).toBeNull();
    expect(assessed.normalizedScript).toContain('ta.crossover(close');
    expect(assessed.normalizedScript).toContain('ta.crossunder(close');
    expect(assessed.normalizedScript).not.toContain('ta.crossabove');
    expect(assessed.normalizedScript).not.toContain('ta.crossbelow');
    expect(assessed.warnings).toContain('Pineで未対応の可能性がある crossabove/crossbelow を crossover/crossunder に補正しました。');
    expect(assessed.invalidReasonCodes).toContain('unsupported_function_alias');
  });
});

describe('reviewGeneratedPineScriptDeterministic', () => {
  it('passes representative safe Pine', () => {
    const reviewed = reviewGeneratedPineScriptDeterministic(
      '//@version=6\nstrategy("ok", overlay=true)\nma50 = ta.sma(close, 50)\nentryCondition = close < ma50\nif entryCondition and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)\nplot(ma50, color=color.green)',
    );

    expect(reviewed.schema_name).toBe('pine_review_result');
    expect(reviewed.status).toBe('pass');
    expect(reviewed.summary.error_count).toBe(0);
  });

  it('detects deterministic reviewer error issues', () => {
    const reviewed = reviewGeneratedPineScriptDeterministic(`//@version=6
strategy("bad", overlay=true)
setupCondition = close < ta.sma(close, 50)
triggerCondition = ta.crossover(close, ta.vwap(hlc3))
entryCondition = setupCondition and triggerCondition
stopLossPrice = na
adx = ta.adx(14)
dmiPlus = ta.dmi(14, 14).plus
if strategy.position_size > 0 and na(entryAtr)
    entryAtr := ta.atr(14)
plot(rsiValue, color=color.color.green, style=plot.style_dashed)
hline(70)
// Note: this explains too much`);

    expect(reviewed.schema_name).toBe('pine_review_result');
    expect(reviewed.status).toBe('needs_repair');
    expect(reviewed.issues.every((issue) => issue.severity === 'error')).toBe(true);
    expect(reviewed.issues.every((issue) => typeof issue.repair_hint === 'string' && issue.repair_hint.length > 0)).toBe(true);
    expect(reviewed.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'unsupported_color_namespace',
        'unsupported_plot_style',
        'unsupported_dmi_property_access',
        'unsupported_adx_function',
        'uninitialized_stop_loss_price',
        'overlay_oscillator_plot',
        'narrative_comment',
        'setup_trigger_same_bar',
        'entry_atr_na_capture',
      ]),
    );
    expect(reviewed.summary.issue_count).toBeGreaterThanOrEqual(9);
    expect(reviewed.summary.error_count).toBeGreaterThanOrEqual(9);
  });

  it('detects reviewer hardening issues for aliases, setup reset, and stop guards', () => {
    const reviewed = reviewGeneratedPineScriptDeterministic(`//@version=6
strategy("bad", overlay=true)
var bool setupActive = false
setupCondition = close < ta.vwap(hlc3)
triggerCondition = ta.crossabove(close, ta.vwap(hlc3))
if strategy.position_size == 0
    if setupCondition
        setupActive := true
    else
        setupActive := false
entryCondition = setupActive and triggerCondition
if entryCondition and strategy.position_size == 0
    strategy.entry("Long", strategy.long)
stopLossPrice = strategy.position_avg_price * 0.95
if strategy.position_size > 0
    strategy.exit("Stop Loss", "Long", stop=stopLossPrice)
plot(strategy.position_size > 0 ? stopLossPrice : na)`);

    expect(reviewed.status).toBe('needs_repair');
    expect(reviewed.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'unsupported_function_alias',
        'setup_trigger_state_risk',
        'block_local_variable_scope_risk',
        'stop_order_guard_risk',
      ]),
    );
  });

  it('detects setupActive entry blocks that do not reset after strategy.entry', () => {
    const reviewed = reviewGeneratedPineScriptDeterministic(`//@version=6
strategy("missing setup reset", overlay=true)
var bool setupActive = false
setupCondition = close < ta.sma(close, 50)
triggerCondition = ta.crossover(close, ta.vwap(hlc3))
if strategy.position_size == 0 and setupCondition
    setupActive := true
entryCondition = setupActive and triggerCondition
if entryCondition and strategy.position_size == 0
    strategy.entry("Long", strategy.long)`);

    expect(reviewed.status).toBe('needs_repair');
    expect(reviewed.issues.map((issue) => issue.code)).toContain('setup_trigger_state_risk');
  });

  it('detects direct setupActive trigger entry blocks that do not reset after strategy.entry', () => {
    const reviewed = reviewGeneratedPineScriptDeterministic(`//@version=6
strategy("missing direct setup reset", overlay=true)
var bool setupActive = false
setupCondition = close < ta.sma(close, 50)
triggerCondition = ta.crossover(close, ta.vwap(hlc3))
if strategy.position_size == 0 and setupCondition
    setupActive := true
if strategy.position_size == 0 and setupActive and triggerCondition
    strategy.entry("Long", strategy.long)`);

    expect(reviewed.status).toBe('needs_repair');
    expect(reviewed.issues.map((issue) => issue.code)).toContain('setup_trigger_state_risk');
  });

  it('detects strategy.entry without flat guard in a long-only no-pyramiding pattern', () => {
    const reviewed = reviewGeneratedPineScriptDeterministic(`//@version=6
strategy("missing entry guard", overlay=true)
ma50 = ta.sma(close, 50)
entryCondition = close > ma50
if entryCondition
    strategy.entry("Long", strategy.long)`);

    expect(reviewed.status).toBe('needs_repair');
    expect(reviewed.issues.map((issue) => issue.code)).toContain('entry_guard_risk');
  });

  it('detects top-level percentage stopLossPrice calculation before a position guard', () => {
    const reviewed = reviewGeneratedPineScriptDeterministic(`//@version=6
strategy("top-level stop", overlay=true)
ma50 = ta.sma(close, 50)
entryCondition = close > ma50
if entryCondition and strategy.position_size == 0
    strategy.entry("Long", strategy.long)
float stopLossPrice = strategy.position_avg_price * 0.95
if strategy.position_size > 0 and not na(stopLossPrice)
    strategy.exit("Stop Loss", "Long", stop=stopLossPrice)`);

    expect(reviewed.status).toBe('needs_repair');
    expect(reviewed.issues.map((issue) => issue.code)).toContain('stop_order_guard_risk');
  });

  it('allows same-block percentage stop calculation inside a position guard', () => {
    const reviewed = reviewGeneratedPineScriptDeterministic(`//@version=6
strategy("guarded stop", overlay=true)
ma50 = ta.sma(close, 50)
entryCondition = close > ma50
if entryCondition and strategy.position_size == 0
    strategy.entry("Long", strategy.long)
if strategy.position_size > 0
    stopLossPrice = strategy.position_avg_price * 0.95
    strategy.exit("Stop Loss", "Long", stop=stopLossPrice)`);

    expect(reviewed.issues.map((issue) => issue.code)).not.toContain('stop_order_guard_risk');
  });

  it('does not flag hardened setup, entry, and percentage stop guards', () => {
    const reviewed = reviewGeneratedPineScriptDeterministic(`//@version=6
strategy("safe representative", overlay=true)
ma50 = ta.sma(close, 50)
var bool setupActive = false
var float stopLossPrice = na
setupCondition = close < ma50
triggerCondition = ta.crossover(close, ma50)
if strategy.position_size == 0 and setupCondition
    setupActive := true
entryCondition = setupActive and triggerCondition
if entryCondition and strategy.position_size == 0
    strategy.entry("Long", strategy.long)
    setupActive := false
if strategy.position_size > 0
    stopLossPrice := strategy.position_avg_price * 0.95
if strategy.position_size > 0 and not na(stopLossPrice)
    strategy.exit("Stop Loss", "Long", stop=stopLossPrice)
plot(strategy.position_size > 0 ? stopLossPrice : na)`);

    expect(reviewed.issues.map((issue) => issue.code)).not.toContain('setup_trigger_state_risk');
    expect(reviewed.issues.map((issue) => issue.code)).not.toContain('entry_guard_risk');
    expect(reviewed.issues.map((issue) => issue.code)).not.toContain('stop_order_guard_risk');
  });
});
