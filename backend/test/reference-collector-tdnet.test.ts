import { describe, expect, it } from 'vitest';
import { _internal } from '../src/references/collector';

const TDNET_HTML_FIXTURE = `
<table>
  <tr>
    <td class="kjTime">15:30</td>
    <td class="kjCode">72030</td>
    <td class="kjName">トヨタ自動車株式会社</td>
    <td class="kjTitle"><a href="20260501999999.pdf">2026年3月期 決算短信〔日本基準〕(連結)</a></td>
    <td class="kjXbrl"><a href="xbrl/20260501999999.zip">XBRL</a></td>
    <td class="kjPlace">東証プライム</td>
    <td class="kjHistroy">-</td>
  </tr>
  <tr>
    <td class="kjTime">13:00</td>
    <td class="kjCode">67580</td>
    <td class="kjName">ソニーグループ株式会社</td>
    <td class="kjTitle"><a href="20260501888888.pdf">自己株式の取得状況に関するお知らせ</a></td>
    <td class="kjXbrl"></td>
    <td class="kjPlace">東証プライム</td>
    <td class="kjHistroy">-</td>
  </tr>
</table>
`;

describe('TDnet collector internals', () => {
  it('parseTdnetRows parses current-style TDnet table rows', () => {
    const rows = _internal.parseTdnetRows(TDNET_HTML_FIXTURE);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      timeText: '15:30',
      codeText: '72030',
      companyName: 'トヨタ自動車株式会社',
      title: '2026年3月期 決算短信〔日本基準〕(連結)',
      pdfPath: '20260501999999.pdf',
      xbrlPath: 'xbrl/20260501999999.zip',
    });
  });

  it('normalizeTdnetCode normalizes 5-digit trailing-zero codes to 4-digit symbols', () => {
    expect(_internal.normalizeTdnetCode('72030')).toBe('7203');
    expect(_internal.normalizeTdnetCode('67580')).toBe('6758');
    expect(_internal.normalizeTdnetCode('1234')).toBe('1234');
  });

  it('buildCodeCandidates includes symbol_code and tradingviewSymbol candidates', () => {
    const candidates = _internal.buildCodeCandidates('7203', 'TSE:7203');

    expect([...candidates]).toEqual(expect.arrayContaining(['7203', '72030']));
  });

  it('matchesSymbol matches by code for symbolCode/tradingviewSymbol', () => {
    const [row] = _internal.parseTdnetRows(TDNET_HTML_FIXTURE);

    expect(
      _internal.matchesSymbol(row, {
        symbolCode: '7203',
        displayName: '別名',
        tradingviewSymbol: 'TSE:7203',
      }),
    ).toEqual({ matched: true, reason: 'code' });
  });

  it('matchesSymbol matches by displayName when code is not available', () => {
    const [row] = _internal.parseTdnetRows(TDNET_HTML_FIXTURE);

    expect(
      _internal.matchesSymbol(row, {
        symbolCode: null,
        displayName: 'トヨタ自動車',
        tradingviewSymbol: null,
      }),
    ).toEqual({ matched: true, reason: 'name' });
  });

  it('isEarningsTitle recognizes earnings-related disclosures', () => {
    expect(_internal.isEarningsTitle('2026年3月期 決算短信〔日本基準〕(連結)')).toBe(true);
    expect(_internal.classifyEarningsCategory('2026年3月期 決算短信〔日本基準〕(連結)')).toBe('earnings_results');
  });

  it('non-earnings disclosures stay outside earnings classification', () => {
    const [, row] = _internal.parseTdnetRows(TDNET_HTML_FIXTURE);

    expect(row.title).toContain('自己株式');
    expect(_internal.isEarningsTitle(row.title)).toBe(false);
  });
});
