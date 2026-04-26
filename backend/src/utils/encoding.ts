/**
 * encoding.ts
 *
 * 日本語文字列のエンコーディング検知ユーティリティ（最小実装）
 *
 * 目的:
 * - PowerShell / API 経由で日本語 JSON を送る際、UTF-8 未指定により
 *   CP932 → UTF-8 誤変換（mojibake）が起きたことを検知する
 *
 * 方針:
 * - 自動修復は行わない（文字列を変換しない）
 * - 検知した場合は isSuspect=true と hint を返すのみ
 * - 日本語として正常な Unicode 文字列は isSuspect=false を返す
 * - false positive を最小化するため、明確なパターンのみ対象とする
 *
 * 注意:
 * - Node.js / Fastify は JSON body を UTF-8 として解析する
 * - PowerShell で UTF-8 未指定の場合、送信バイト列が CP932 になり
 *   Fastify 側では「UTF-8 として不正なバイト列」として 400 を返す
 *   または、送信自体が Shift_JIS バイト列になりバイナリとして届く
 * - このユーティリティは、正常に届いた文字列に対してパターンマッチで
 *   mojibake 疑いを検出するものである
 */

/**
 * CP932 → UTF-8 誤解釈時によく現れるパターン
 *
 * CP932 の2バイト文字が UTF-8 として誤解釈されると、
 * Latin-1 Supplement や Miscellaneous symbols 等が混在する。
 * 代表的なパターン:
 * - \uFFFD (REPLACEMENT CHARACTER) が含まれる
 * - Latin Extended: é, ü, ä, â, ê 等が日本語文脈で不自然に現れる
 * - Fullwidth Latin と半角記号の不自然な混在
 * - \x82〜\x9F 等の Windows-1252 特殊文字
 *
 * ここでは保守的なパターンのみ採用する。
 */
const MOJIBAKE_PATTERNS: RegExp[] = [
  // REPLACEMENT CHARACTER (U+FFFD) — バイト列が不正と判断された確実な証拠
  /\uFFFD/,
  // NUL バイト — バイナリ混入の証拠
  /\x00/,
  // Windows-1252 の制御文字域 (0x80-0x9F) が文字列に混入
  // JSON 解析後の文字列にこれが残っていれば mojibake の可能性が高い
  /[\x80-\x9F]/,
];

export type MojibakeCheckResult = {
  /** mojibake 疑いがある場合 true */
  isSuspect: boolean;
  /** 疑いの理由（英語・短文）。isSuspect=false の場合は null */
  hint: string | null;
};

/**
 * 文字列が mojibake（文字化け）している疑いがあるかどうかを検知する。
 *
 * @param text チェック対象の文字列
 * @returns { isSuspect, hint }
 */
export function detectMojibake(text: string): MojibakeCheckResult {
  if (typeof text !== 'string' || text.length === 0) {
    return { isSuspect: false, hint: null };
  }

  if (MOJIBAKE_PATTERNS[0].test(text)) {
    return { isSuspect: true, hint: 'Contains replacement character (U+FFFD). Likely encoding mismatch.' };
  }
  if (MOJIBAKE_PATTERNS[1].test(text)) {
    return { isSuspect: true, hint: 'Contains NUL byte. Possible binary/encoding issue.' };
  }
  if (MOJIBAKE_PATTERNS[2].test(text)) {
    return { isSuspect: true, hint: 'Contains Windows-1252 control characters (0x80-0x9F). Likely CP932/Shift_JIS sent as UTF-8.' };
  }

  return { isSuspect: false, hint: null };
}
