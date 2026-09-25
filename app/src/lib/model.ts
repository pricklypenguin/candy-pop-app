import { BASE_CATS, BIWEEK_ANCHOR, EXTRA_SERIES, FREQ, WEEK_ANCHOR, paidKeyOf, type Bill, type Cat, type Income, type Persisted, type PeriodType } from './data';
import { CUR_M, CUR_Y, DAYMS, HIST, MONTHS, MONTHS_L, TODAY, dn, dt, fmtD } from './dates';

export interface Period { start: number; end: number; f: number; offset: number; label: string; short: string }

type S = Pick<Persisted, 'periodType' | 'customLen' | 'customStart' | 'bills' | 'paidKeys' | 'debts' | 'goals' | 'incomes' | 'incomeTxns' | 'txns' | 'debtStrategy' | 'debtExtra' | 'cats' | 'startedAt'>;

export const catsOf = (s: Pick<Persisted, 'cats'>): Cat[] => s.cats && s.cats.length ? s.cats : BASE_CATS;
export const seriesOf = (s: Pick<Persisted, 'cats'>): Cat[] => catsOf(s).concat(EXTRA_SERIES);

/** Budget period `offset` periods from the current one. `f` scales monthly amounts to the period's length. */
export function period(s: Pick<S, 'periodType' | 'customLen' | 'customStart'>, offset: number): Period {
  if (s.periodType === 'monthly') {
    const start = Math.floor(Date.UTC(CUR_Y, CUR_M - 1 + offset, 1) / DAYMS), end = Math.floor(Date.UTC(CUR_Y, CUR_M + offset, 1) / DAYMS) - 1, sd = dt(start);
    return { start, end, f: 1, offset, label: MONTHS_L[sd.getUTCMonth()] + ' ' + sd.getUTCFullYear(), short: MONTHS[sd.getUTCMonth()] };
  }
  const len = periodLen(s.periodType, s.customLen);
  const anchor = s.periodType === 'weekly' ? WEEK_ANCHOR : s.periodType === 'biweekly' ? BIWEEK_ANCHOR : s.customStart;
  const k = Math.floor((TODAY - anchor) / len) + offset, start = anchor + k * len, end = start + len - 1;
  return { start, end, f: len / 30.4375, offset, label: fmtD(start) + ' – ' + fmtD(end), short: fmtD(start) };
}
export const periodLen = (t: PeriodType, customLen: number) => t === 'weekly' ? 7 : t === 'biweekly' ? 14 : Math.max(1, customLen);

export function unitOf(t: PeriodType, customLen: number) {
  return t === 'monthly' ? 'per month' : t === 'weekly' ? 'per week' : t === 'biweekly' ? 'per 2 weeks' : 'per ' + customLen + ' days';
}

/** Monthly amounts set aside before spending: bills, debt payments (+ extra), and goal savings. */
export function monthly(s: S) {
  return {
    bills: s.bills.reduce((a, b) => a + b.amount, 0),
    mins: s.debts.reduce((a, d) => a + Math.min(d.min, d.balance), 0) + (s.debtStrategy !== 'min' && s.debts.some(d => d.balance > 0 && !d.skip) ? (s.debtExtra || 0) : 0),
    goals: s.goals.reduce((a, g) => a + (g.saved < g.target ? g.monthly : 0), 0)
  };
}

export const incomeMonthly = (s: Pick<S, 'incomes'>) => s.incomes.reduce((a, i) => a + i.amount * FREQ[i.freq].mult, 0);
export const oneOffIn = (s: Pick<S, 'incomeTxns'>, P: Period) => s.incomeTxns.reduce((a, t) => a + (t.d >= P.start && t.d <= P.end ? t.amt : 0), 0);
export const spentIn = (s: Pick<S, 'txns'>, P: Period) => s.txns.reduce((a, t) => a + (t.d >= P.start && t.d <= P.end ? t.amt : 0), 0);

export function leftFor(s: S, P: Period) {
  const M = monthly(s);
  return Math.round(incomeMonthly(s) * P.f - (M.bills + M.mins + M.goals) * P.f) + oneOffIn(s, P) - spentIn(s, P);
}

/** Months before the current one count as paid; this month uses the paid list. */
export function isPaid(s: Pick<S, 'paidKeys'>, bill: Bill, y: number, m: number) {
  return (y * 12 + m) < (CUR_Y * 12 + CUR_M) || s.paidKeys.includes(paidKeyOf(bill.id, y, m));
}

export interface Occ { bill: Bill; n: number; y: number; m: number; paid: boolean }
/** Unpaid, but due before the bill was added to the app — we don't know if it was paid, so it isn't "overdue". */
export const dueBeforeAdded = (s: Pick<S, 'startedAt'>, o: Occ) => !o.paid && o.n < (o.bill.addedOn ?? s.startedAt);
/** Earliest day worth showing in charts and period browsing. */
export const firstDay = (s: Pick<S, 'startedAt'>) => Math.max(HIST, s.startedAt);
export function occurrences(s: Pick<S, 'bills' | 'paidKeys'>, a: number, b: number): Occ[] {
  const out: Occ[] = [], da = dt(a), db = dt(b);
  for (let y = da.getUTCFullYear(), m = da.getUTCMonth() + 1; y * 12 + m <= db.getUTCFullYear() * 12 + db.getUTCMonth() + 1; m === 12 ? (y++, m = 1) : m++) {
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthStart = dn(y, m, 1);
    s.bills.forEach(bill => {
      // A bill only exists from the month it was added.
      if (bill.addedOn != null && monthStart < bill.addedOn - dt(bill.addedOn).getUTCDate() + 1) return;
      const n = dn(y, m, Math.min(bill.day, dim));
      if (n >= a && n <= b) out.push({ bill, n, y, m, paid: isPaid(s, bill, y, m) });
    });
  }
  return out;
}

/** Paydays for an income between day numbers a and b. */
export function payOcc(inc: Income, a: number, b: number) {
  const out: number[] = [];
  if (inc.freq === 'monthly') {
    const day = dt(inc.anchor).getUTCDate(), da = dt(a);
    for (let y = da.getUTCFullYear(), m = da.getUTCMonth() + 1, g = 0; g < 14; g++, m === 12 ? (y++, m = 1) : m++) {
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate(), n = dn(y, m, Math.min(day, dim));
      if (n > b) break; if (n >= a) out.push(n);
    }
  } else {
    const len = FREQ[inc.freq].len!;
    for (let n = inc.anchor + Math.ceil((a - inc.anchor) / len) * len; n <= b; n += len) out.push(n);
  }
  return out;
}
export const nextPayOf = (inc: Income) => payOcc(inc, TODAY, TODAY + 400)[0];
