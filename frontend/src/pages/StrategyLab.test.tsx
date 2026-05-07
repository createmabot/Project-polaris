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
  };
});

import StrategyLab from './StrategyLab';

describe('StrategyLab', () => {
  it('renders default Japanese natural language rule and rule lab actions', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-lab', vi.fn()]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
    });

    const html = renderToStaticMarkup(<StrategyLab />);
    expect(html).toContain('ルール検証ラボ');
    expect(html).toContain('自然言語ルール');
    expect(html).toContain('25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が5日線を下回ったら手仕舞い。');
    expect(html).toContain('保存してPine生成');
    expect(html).toContain('日本語入力中心 / 日足(D)中心 / long_only');
  });
});
