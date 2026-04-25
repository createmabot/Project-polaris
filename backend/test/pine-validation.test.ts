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
    expect(assessed.warnings.join(' ')).toContain('removed');
    expect(assessed.invalidReasonCodes).toContain('markdown_code_fence_pollution');
  });
});
