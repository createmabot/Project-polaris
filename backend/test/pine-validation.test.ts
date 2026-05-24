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
});
