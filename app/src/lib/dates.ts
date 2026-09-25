// Dates are whole-day numbers (days since the Unix epoch, UTC) so period maths stays simple.
export const DAYMS = 86400000;
export const dn = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAYMS);
export const dt = (n: number) => new Date(n * DAYMS);

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseIso(s: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? dn(+m[1], +m[2], +m[3]) : null;
}

// "Today" is the local calendar date. `?today=YYYY-MM-DD` pins it, which is handy for demos and screenshots.
function resolveToday() {
  const pinned = typeof location !== 'undefined' ? parseIso(new URLSearchParams(location.search).get('today')) : null;
  if (pinned != null) return pinned;
  const d = new Date();
  return dn(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export const TODAY = resolveToday();
const td = dt(TODAY);
export const CUR_Y = td.getUTCFullYear();
export const CUR_M = td.getUTCMonth() + 1;
export const CUR_D = td.getUTCDate();
export const MONTH_START = dn(CUR_Y, CUR_M, 1);
export const DIM = new Date(Date.UTC(CUR_Y, CUR_M, 0)).getUTCDate();
export const MONTH_END = MONTH_START + DIM - 1;
export const MONTH_TITLE = MONTHS_L[CUR_M - 1] + ' ' + CUR_Y;
// How far back you can browse past periods: six months of history.
export const HIST = Math.floor(Date.UTC(CUR_Y, CUR_M - 7, 1) / DAYMS);

/** A calendar month: its first/last day numbers, length and title. m is 1–12 and may overflow (13 = Jan next year). */
export function monthInfo(y: number, m: number) {
  const d = new Date(Date.UTC(y, m - 1, 1)), yy = d.getUTCFullYear(), mm = d.getUTCMonth() + 1;
  const start = dn(yy, mm, 1), dim = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return { y: yy, m: mm, start, end: start + dim - 1, dim, title: MONTHS_L[mm - 1] + ' ' + yy, isCurrent: yy === CUR_Y && mm === CUR_M, isPast: yy * 12 + mm < CUR_Y * 12 + CUR_M };
}

export const fmtD = (n: number) => { const d = dt(n); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate(); };
export function isoOf(n: number) {
  const d = dt(n);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
export const fromIso = (s: string) => parseIso(s);
/** "Oct 2026" for `add` months after the current month. */
export function monthLabel(add: number) {
  const d = new Date(Date.UTC(CUR_Y, CUR_M - 1 + add, 1));
  return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}
export function spanTxt(m: number) {
  const y = Math.floor(m / 12), mo = m % 12;
  return [y ? y + (y === 1 ? ' year' : ' years') : '', mo ? mo + (mo === 1 ? ' month' : ' months') : ''].filter(Boolean).join(' ');
}
export function ord(n: number) { const v = n % 100; return (v >= 11 && v <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; }
export const dayName = (n: number) => n === TODAY ? 'Today' : n === TODAY - 1 ? 'Yesterday' : WD[dt(n).getUTCDay()].slice(0, 3) + ', ' + fmtD(n);
