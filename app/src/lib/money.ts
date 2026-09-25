export interface Currency { code: string; sym: string; name: string; dec: number; after: boolean }

export const CUR: Currency[] = ([
  ['USD', '$', 'US dollar'], ['EUR', '€', 'Euro'], ['GBP', '£', 'British pound'], ['CAD', '$', 'Canadian dollar'],
  ['AUD', '$', 'Australian dollar'], ['NZD', '$', 'NZ dollar'], ['INR', '₹', 'Indian rupee'], ['JPY', '¥', 'Japanese yen', 0],
  ['CHF', 'CHF ', 'Swiss franc'], ['SEK', 'kr', 'Swedish krona', 2, 1], ['NOK', 'kr', 'Norwegian krone', 2, 1], ['PLN', 'zł', 'Polish złoty', 2, 1],
  ['ZAR', 'R', 'South African rand'], ['BRL', 'R$', 'Brazilian real'], ['MXN', '$', 'Mexican peso'], ['SGD', '$', 'Singapore dollar']
] as [string, string, string, number?, number?][]).map(([code, sym, name, dec, after]) => ({ code, sym, name, dec: dec ?? 2, after: !!after }));

export const curOf = (code: string) => CUR.find(c => c.code === code) || CUR[0];

// Cents are hidden by default: whole numbers are calmer to read.
export const HIDE_CENTS = true;

export function fmtWith(cur: Currency, n: number) {
  const hide = cur.dec === 0 || HIDE_CENTS;
  const neg = n < 0; n = Math.abs(n);
  const s = n.toLocaleString('en-US', { minimumFractionDigits: hide ? 0 : 2, maximumFractionDigits: hide ? 0 : 2 });
  return (neg ? '−' : '') + (cur.after ? s + ' ' + cur.sym : cur.sym + s);
}

export const numOnly = (v: string) => v.replace(/[^0-9.]/g, '');
export const intOnly = (v: string, max = 2) => v.replace(/[^0-9]/g, '').slice(0, max);
