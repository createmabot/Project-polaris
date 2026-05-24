import { describe, expect, it } from 'vitest';
import { assessGeneratedPineScript } from '../src/strategy/pine';

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
