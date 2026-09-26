/** mag: roughly how many units of this currency buy what 1 US dollar does. Used to scale thresholds and rounding, not for conversion. */
export interface Currency { code: string; sym: string; name: string; dec: number; after: boolean; mag: number }

export const CUR: Currency[] = ([
  ['USD', '$', 'US dollar', 1], ['EUR', '€', 'Euro', 1], ['GBP', '£', 'British pound', 1], ['CAD', '$', 'Canadian dollar', 1],
  ['AUD', '$', 'Australian dollar', 1.5], ['NZD', '$', 'NZ dollar', 1.5], ['INR', '₹', 'Indian rupee', 80], ['JPY', '¥', 'Japanese yen', 150, 0],
  ['CHF', 'CHF ', 'Swiss franc', 1], ['SEK', 'kr', 'Swedish krona', 10, 2, 1], ['NOK', 'kr', 'Norwegian krone', 10, 2, 1], ['PLN', 'zł', 'Polish złoty', 4, 2, 1],
  ['ZAR', 'R', 'South African rand', 18], ['BRL', 'R$', 'Brazilian real', 5], ['MXN', '$', 'Mexican peso', 18], ['SGD', '$', 'Singapore dollar', 1.3]
] as [string, string, string, number, number?, number?][]).map(([code, sym, name, mag, dec, after]) => ({ code, sym, name, mag, dec: dec ?? 2, after: !!after }));

/** Nearest "round" number (1, 2 or 5 × a power of ten). */
export function nice(x: number) {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
/** A dollar-sized amount (e.g. "50") expressed as a round number in this currency (£50, ¥10,000, ₹5,000). */
export const scaled = (cur: Currency, usd: number) => nice(usd * cur.mag);

export const curOf = (code: string) => CUR.find(c => c.code === code) || CUR[0];

function fmt(cur: Currency, n: number, decimals: number) {
  // Round first so e.g. −0.4 shows as 0, not −0.
  const v = Math.round(n * 10 ** decimals) / 10 ** decimals, neg = v < 0;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (neg ? '−' : '') + (cur.after ? s + ' ' + cur.sym : cur.sym + s);
}
/** Rounded to whole units: for headline numbers and totals, which are calmer to read without cents. */
export const fmtWith = (cur: Currency, n: number) => fmt(cur, n, 0);
/** Exact, with cents (unless the currency has none): for single transactions, bills and breakdowns. */
export const fmtExact = (cur: Currency, n: number) => fmt(cur, n, cur.dec);

export const numOnly = (v: string) => v.replace(/[^0-9.]/g, '');
export const intOnly = (v: string, max = 2) => v.replace(/[^0-9]/g, '').slice(0, max);
