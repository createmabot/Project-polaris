import { afterEach, describe, expect, it, vi } from 'vitest';
import { _internal } from '../src/references/collector';

const TDNET_HTML_FIXTURE = `
<table>
  <tr>
    <td class="kjTime">15:30</td>
    <td class="kjCode">21480</td>
    <td class="kjName">ＩＴＭ株式会社</td>
    <td class="kjTitle"><a href="20260501214801.pdf">2026年３月期 決算短信〔ＩＦＲＳ〕（連結）</a></td>
    <td class="kjXbrl"><a href="xbrl/20260501214801.zip">XBRL</a></td>
    <td class="kjPlace">東証プライム</td>
    <td class="kjHistroy">-</td>
  </tr>
  <tr>
    <td class="kjTime">13:00</td>
    <td class="kjCode">51320</td>
    <td class="kjName">Ｇ－ｐｌｕｓｚｅｒｏ</td>
    <td class="kjTitle"><a href="20260501513201.pdf">自己株式の取得状況に関するお知らせ</a></td>
    <td class="kjXbrl"></td>
    <td class="kjPlace">東証グロース</td>
    <td class="kjHistroy">-</td>
  </tr>
</table>
`;

function createCollector() {
  return _internal.createCollectorWithConfig({
    enabledSources: 'disclosure,earnings',
    newsRssBaseUrl: 'https://news.example.test/rss',
    fetchTimeoutMs: 1_000,
    newsMaxItems: 5,
    disclosureListUrlTemplate: 'https://tdnet.example.test/disclosure/{date}.html',
    disclosureMaxItems: 10,
    disclosureAlertLookbackDays: 1,
    disclosureSymbolLookbackDays: 1,
    earningsListUrlTemplate: 'https://tdnet.example.test/earnings/{date}.html',
    earningsMaxItems: 10,
    earningsAlertLookbackDays: 1,
    earningsSymbolLookbackDays: 1,
  });
}

describe('reference collector save-path inputs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('collectForSymbol yields disclosure + earnings refs for earnings disclosure symbols', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T09:00:00+09:00'));

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => TDNET_HTML_FIXTURE,
      })) as any,
    );

    const collector = createCollector();
    const refs = await collector.collectForSymbol({
      symbolId: 'sym-2148',
      symbolCode: '2148',
      displayName: 'ＩＴＭ',
      tradingviewSymbol: 'TSE:2148',
    });

    const disclosure = refs.find((ref) => ref.referenceType === 'disclosure');
    const earnings = refs.find((ref) => ref.referenceType === 'earnings');
    const diagnostics = (refs as typeof refs & { diagnostics?: any }).diagnostics;

    expect(refs).toHaveLength(2);
    expect(disclosure).toMatchObject({
      sourceName: 'tdnet_disclosure',
      referenceType: 'disclosure',
      title: '2026年３月期 決算短信〔ＩＦＲＳ〕（連結）',
      category: 'financial_results',
    });
    expect(disclosure?.metadataJson).toMatchObject({
      disclosure_code: '2148',
      query_date: '20260508',
      match_reason: 'code',
    });

    expect(earnings).toMatchObject({
      sourceName: 'tdnet_earnings',
      referenceType: 'earnings',
      title: '2026年３月期 決算短信〔ＩＦＲＳ〕（連結）',
      category: 'earnings_results',
    });
    expect(earnings?.metadataJson).toMatchObject({
      disclosure_code: '2148',
      query_date: '20260508',
      match_reason: 'code',
    });

    expect(diagnostics?.disclosure).toMatchObject({
      source_type: 'disclosure',
      symbol_matches: 1,
      returned_count: 1,
      reason: null,
    });
    expect(diagnostics?.earnings).toMatchObject({
      source_type: 'earnings',
      symbol_matches: 1,
      earnings_candidates: 1,
      returned_count: 1,
      reason: null,
    });
  });

  it('collectForSymbol returns disclosure but keeps earnings zero-reason for non-earnings disclosure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T09:00:00+09:00'));

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => TDNET_HTML_FIXTURE,
      })) as any,
    );

    const collector = createCollector();
    const refs = await collector.collectForSymbol({
      symbolId: 'sym-5132',
      symbolCode: '5132',
      displayName: 'Ｇ－ｐｌｕｓｚｅｒｏ',
      tradingviewSymbol: 'TSE:5132',
    });

    const diagnostics = (refs as typeof refs & { diagnostics?: any }).diagnostics;

    expect(refs.filter((ref) => ref.referenceType === 'disclosure')).toHaveLength(1);
    expect(refs.filter((ref) => ref.referenceType === 'earnings')).toHaveLength(0);
    expect(diagnostics?.disclosure).toMatchObject({
      symbol_matches: 1,
      returned_count: 1,
      reason: null,
    });
    expect(diagnostics?.earnings).toMatchObject({
      symbol_matches: 1,
      earnings_candidates: 1,
      returned_count: 0,
      reason: 'tdnet_symbol_match_but_no_earnings_title',
    });
  });
});
