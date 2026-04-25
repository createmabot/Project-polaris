import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockUseLocation = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => mockUseLocation(),
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    postApi: vi.fn(),
    patchApi: vi.fn(),
  };
});

import StrategyVersionDetail from './StrategyVersionDetail';

function setupDetail(status: 'draft' | 'generated' | 'failed', generatedPine: string | null, warnings: string[]) {
  mockUseSWR.mockImplementation((key: string | null) => {
    if (typeof key === 'string' && key.startsWith('/api/strategy-versions/')) {
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: {
          strategy_version: {
            id: 'ver-1',
            strategy_id: 'str-1',
            natural_language_rule: 'Buy above MA25, exit below MA25',
            market: 'JP_STOCK',
            timeframe: 'D',
            status,
            normalized_rule_json: {},
            generated_pine: generatedPine,
            forward_validation_note: null,
            forward_validation_note_updated_at: null,
            warnings,
            assumptions: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          compare_base: null,
        },
      };
    }
    return { isLoading: false, error: null, mutate: vi.fn(), data: null };
  });
}

describe('StrategyVersionDetail pine state', () => {
  it('shows warning state when warnings exist', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupDetail('generated', '//@version=6\nstrategy("ok", overlay=true)', ['warning_one']);

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="pine-generation-state"');
    expect(html).toContain('Pine 状態: warning あり');
  });

  it('shows failed state when generation failed', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupDetail('failed', null, []);

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="pine-generation-state"');
    expect(html).toContain('Pine 状態: failed');
  });
});
