import { describe, expect, it } from 'vitest';
import { assessGeneratedPineScript, localizePineDisplayNotes } from '../src/strategy/pine';

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

  it('localizes known provider warning and assumption notes for display', () => {
    expect(localizePineDisplayNotes([
      'The strategy enters at the open of the next day after the signal. The stop loss is calculated based on the ATR value of the signal bar.',
      'Chandelier Exit uses a 20-day lookback for the highest high, consistent with the ATR average period.',
      'Risk management stop loss is fixed at entry and does not trail.',
      'Leading explanatory text was removed from generated script.',
      'The \'past 20 days\' for ATR average and SMA refers to a simple moving average over 20 periods.',
      'The Chandelier Exit \'past highest value\' is interpreted as the highest high over the same 20-day lookback period.',
      'Entry and exit occur at the open of the next trading day after the condition is met.',
      'The stop loss is calculated using the ATR value from the bar where the entry signal was generated.',
      'unknown provider note',
    ])).toEqual([
      'シグナル発生後、翌営業日の始値でエントリーし、損切り価格はシグナル発生足の ATR 値をもとに計算します。',
      'Chandelier Exit は、ATR の平均期間と同じ20期間の最高値を参照します。',
      'リスク管理用の損切り価格はエントリー時点で固定し、トレーリングしません。',
      '生成結果の先頭に含まれていた説明文を削除しました。',
      'ATR 平均や SMA における「過去20日」は、20期間の単純移動平均として解釈します。',
      'Chandelier Exit の「過去の最高値」は、同じ20期間における高値の最大値として解釈します。',
      'エントリーと手仕舞いは、条件成立後の翌営業日の始値で行う前提です。',
      '損切り価格は、エントリーシグナルが発生した足の ATR 値を使って計算します。',
      'unknown provider note',
    ]);
  });
});
