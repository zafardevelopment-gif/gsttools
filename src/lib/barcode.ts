/**
 * Minimal Code 128-B barcode encoder (no external deps).
 * Returns the module (bar/space) widths for a given ASCII string, which the
 * label page renders as SVG rects. Code 128-B covers ASCII 32–127, which is
 * enough for typical SKUs/EAN digits stored in items.barcode.
 */

// Each code (0–106) is 6 alternating bar/space widths; stop code has 7.
const PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

/**
 * Encode text as Code 128-B module widths. Returns null if the text contains
 * characters outside ASCII 32–127 (or is empty).
 */
export function code128Widths(text: string): number[] | null {
  if (!text) return null;
  const values: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 127) return null;
    values.push(code - 32);
  }

  let checksum = START_B;
  values.forEach((v, i) => {
    checksum += v * (i + 1);
  });
  checksum %= 103;

  const codes = [START_B, ...values, checksum, STOP];
  const widths: number[] = [];
  for (const c of codes) {
    for (const w of PATTERNS[c]) widths.push(Number(w));
  }
  return widths;
}

/** Total module count (sum of widths) — used to scale the SVG viewBox. */
export function code128TotalModules(widths: number[]): number {
  return widths.reduce((s, w) => s + w, 0);
}
