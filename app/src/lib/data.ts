import { CUR_D, CUR_M, CUR_Y, DAYMS, TODAY, dn, isoOf } from './dates';

export type Tab = 'home' | 'bills' | 'debt' | 'goals';
export type PeriodType = 'monthly' | 'biweekly' | 'weekly' | 'custom';
export type Freq = 'weekly' | 'biweekly' | 'monthly';
export type Strategy = 'snowball' | 'avalanche' | 'min';

export interface Cat { id: string; name: string; color: string }
export interface Txn { id: string; amt: number; cat: string; note: string; d: number }
export interface IncomeTxn { id: string; amt: number; note: string; d: number }
export interface Income { id: string; name: string; amount: number; freq: Freq; anchor: number }
export interface Bill { id: string; name: string; amount: number; day: number; group?: 'rent' }
export interface Debt { id: string; name: string; balance: number; original: number; min: number; rate: number; skip?: boolean }
export interface Goal { id: string; name: string; saved: number; target: number; monthly: number }

// Category colours are theme tokens so they swap for their softer versions in dark mode.
export const CAT_PALETTE = [
  'var(--cat-pink)', 'var(--cat-orange)', 'var(--cat-sky)', 'var(--cat-grape)', 'var(--cat-bubblegum)', 'var(--cat-mauve)',
  'var(--cat-aqua)', 'var(--cat-tangerine)', 'var(--cat-peri)', 'var(--cat-lime)', 'var(--cat-magenta)', 'var(--cat-green)'
];
export const BASE_CATS: Cat[] = [
  { id: 'groceries', name: 'Groceries', color: 'var(--cat-pink)' },
  { id: 'eating', name: 'Eating out', color: 'var(--cat-orange)' },
  { id: 'transport', name: 'Transport', color: 'var(--cat-sky)' },
  { id: 'fun', name: 'Fun', color: 'var(--cat-grape)' },
  { id: 'shopping', name: 'Shopping', color: 'var(--cat-bubblegum)' },
  { id: 'other', name: 'Other', color: 'var(--cat-mauve)' }
];
// Bills show up in "Spending over time" as two extra series.
export const EXTRA_SERIES: Cat[] = [{ id: 'rent', name: 'Rent', color: 'var(--cat-teal)' }, { id: 'bills', name: 'Other bills', color: 'var(--cat-gold)' }];
export const UNCAT: Cat = { id: '_none', name: 'Uncategorised', color: 'var(--cat-mauve)' };

export const DEF_BUD: Record<string, number> = { groceries: 350, eating: 120, transport: 120, fun: 80, shopping: 80, other: 60 };
export const SUG_BILLS = ['Rent', 'Phone', 'Internet', 'Electric', 'Water', 'Car insurance', 'Streaming', 'Gym'];

export const FREQ: Record<Freq, { mult: number; len?: number; label: string }> = {
  weekly: { mult: 52 / 12, len: 7, label: 'Weekly' },
  biweekly: { mult: 26 / 12, len: 14, label: 'Every 2 weeks' },
  monthly: { mult: 1, label: 'Monthly' }
};

export const PERIOD_OPTS: { id: PeriodType; name: string; sub: string }[] = [
  { id: 'monthly', name: 'Monthly', sub: 'The 1st to the end of each month' },
  { id: 'biweekly', name: 'Every 2 weeks', sub: 'Lines up with a biweekly paycheck' },
  { id: 'weekly', name: 'Weekly', sub: 'Monday to Sunday' },
  { id: 'custom', name: 'Custom', sub: 'Pick your own start date and length' }
];

// Fixed anchors for weekly (a Monday) and biweekly (a Friday payday) periods.
export const WEEK_ANCHOR = dn(2026, 9, 21);
export const BIWEEK_ANCHOR = dn(2026, 9, 18);

export type FormKind = 'bill' | 'debt' | 'goal' | 'income';
export interface FormField { k: string; label: string; ph?: string; full?: boolean; req?: boolean; num?: boolean; int?: boolean; date?: boolean; choice?: [string, string][] }
export const FORMS: Record<FormKind, { title: string; btn: string; note: string; fields: FormField[] }> = {
  bill: { title: 'New bill', btn: 'Add bill', note: 'It repeats every month. We\'ll set the money aside automatically.', fields: [
    { k: 'name', label: 'What\'s the bill?', ph: 'e.g. Water', full: true, req: true },
    { k: 'amount', label: 'How much?', ph: '$0', num: true, req: true },
    { k: 'day', label: 'Due on day', ph: '1–31', int: true, req: true }] },
  debt: { title: 'New debt', btn: 'Add debt', note: 'We\'ll set the monthly payment aside before showing what\'s left to spend.', fields: [
    { k: 'name', label: 'What\'s it called?', ph: 'e.g. Store card', full: true, req: true },
    { k: 'balance', label: 'How much you owe', ph: '$0', num: true, req: true },
    { k: 'min', label: 'Monthly payment', ph: '$0', num: true, req: true },
    { k: 'rate', label: 'Interest rate % (optional)', ph: 'e.g. 19.9', num: true, full: true }] },
  goal: { title: 'New saving goal', btn: 'Add goal', note: 'We\'ll set the monthly amount aside before showing what\'s left to spend.', fields: [
    { k: 'name', label: 'What are you saving for?', ph: 'e.g. Holiday gifts', full: true, req: true },
    { k: 'target', label: 'How much you need', ph: '$0', num: true, req: true },
    { k: 'monthly', label: 'Save each month', ph: '$0', num: true, req: true },
    { k: 'saved', label: 'Already saved (optional)', ph: '$0', num: true, full: true }] },
  income: { title: 'New income', btn: 'Add income', note: 'Regular pay is spread evenly across your budget periods, so your left to spend stays steady. Got a one-off payment? Use Log → Income instead.', fields: [
    { k: 'name', label: 'What is it?', ph: 'e.g. Paycheck, side gig', full: true, req: true },
    { k: 'amount', label: 'Amount each time', ph: '$0', num: true, req: true },
    { k: 'next', label: 'Next payday', date: true, req: true },
    { k: 'freq', label: 'How often?', full: true, req: true, choice: [['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly']] }] }
};

// Bills whose due day has already passed this month start out as paid.
export const autoPaid = (day: number) => day < CUR_D;
export const paidKeyOf = (billId: string, y: number, m: number) => billId + ':' + y + '-' + m;
export const paidKey = (billId: string) => paidKeyOf(billId, CUR_Y, CUR_M);

// ---------- sample data ----------
const GEN: Record<string, [number, number, number, string[]]> = {
  groceries: [.28, 12, 70, ['Corner market', 'Big shop', 'Farmers market', 'Bakery', 'Top-up shop']],
  eating: [.16, 9, 40, ['Lunch', 'Coffee', 'Takeout', 'Pizza night', 'Brunch']],
  transport: [.09, 20, 65, ['Gas', 'Bus pass', 'Parking', 'Rideshare']],
  fun: [.07, 8, 55, ['Movie', 'Concert', 'Games', 'Bowling']],
  shopping: [.05, 15, 90, ['Clothes', 'Shoes', 'Home stuff', 'Books']],
  other: [.06, 6, 45, ['Pharmacy', 'Haircut', 'Gift', 'Pet supplies']]
};
function rng(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// Six past months plus this one. This month runs a little under budget, except Eating out.
function genTxns(): Txn[] {
  const r = rng(7), out: Txn[] = []; let i = 0;
  for (let back = 6; back >= 0; back--) {
    const start = Math.floor(Date.UTC(CUR_Y, CUR_M - 1 - back, 1) / DAYMS);
    const dim = new Date(Date.UTC(CUR_Y, CUR_M - back, 0)).getUTCDate(), last = Math.min(start + dim - 1, TODAY - 1);
    const elapsed = Math.max(0, last - start + 1) / dim;
    for (const c of BASE_CATS) {
      const [, lo, hi, pool] = GEN[c.id];
      const mult = back === 0 ? (c.id === 'eating' ? 0.95 : 0.55 + r() * 0.25) : 0.72 + r() * 0.38;
      const target = DEF_BUD[c.id] * mult * elapsed, avg = (lo + hi) / 2;
      const cnt = Math.max(1, Math.round(target / avg));
      const raw: number[] = []; for (let k = 0; k < cnt; k++) raw.push(0.6 + r() * 0.8);
      const sum = raw.reduce((a, b) => a + b, 0);
      raw.forEach(w => out.push({ id: 'h' + (i++), amt: Math.max(3, Math.round(target * w / sum)), cat: c.id, note: r() < 0.75 ? pool[Math.floor(r() * pool.length)] : '', d: start + Math.floor(r() * Math.max(0, last - start + 1)) }));
    }
  }
  out.push({ id: 'hx', amt: 48, cat: 'eating', note: 'Birthday dinner', d: TODAY - 5 });
  out.push({ id: 'hy', amt: 14, cat: 'groceries', note: 'Corner market', d: TODAY });
  return out;
}

export function seed() {
  const bills: Bill[] = [
    { id: 'b1', name: 'Rent', amount: 1200, day: 1, group: 'rent' },
    { id: 'b2', name: 'Phone', amount: 55, day: 5 }, { id: 'b3', name: 'Internet', amount: 60, day: 12 },
    { id: 'b4', name: 'Car insurance', amount: 110, day: 18 }, { id: 'b5', name: 'Electric', amount: 85, day: 26 },
    { id: 'b6', name: 'Streaming', amount: 11, day: 28 }, { id: 'b7', name: 'Gym', amount: 30, day: 30 }
  ];
  return {
    incomes: [{ id: 'i1', name: 'Paycheck', amount: 1477, freq: 'biweekly', anchor: BIWEEK_ANCHOR }] as Income[],
    incomeTxns: [] as IncomeTxn[],
    budgets: { ...DEF_BUD } as Record<string, number>,
    bills, paidKeys: bills.filter(b => autoPaid(b.day)).map(b => paidKey(b.id)),
    debts: [
      { id: 'd1', name: 'Credit card', balance: 2400, original: 3100, min: 75, rate: 22.9 },
      { id: 'd2', name: 'Car loan', balance: 8200, original: 14000, min: 240, rate: 6.5 },
      { id: 'd3', name: 'Student loan', balance: 14500, original: 21000, min: 160, rate: 5 }
    ] as Debt[],
    goals: [
      { id: 'g1', name: 'Emergency fund', saved: 1000, target: 3000, monthly: 150 },
      { id: 'g2', name: 'Summer trip', saved: 420, target: 1200, monthly: 100 },
      { id: 'g3', name: 'New laptop', saved: 300, target: 900, monthly: 50 }
    ] as Goal[],
    txns: genTxns(),
    currency: 'USD', onboarded: false, cats: BASE_CATS.slice(),
    periodType: 'monthly' as PeriodType, customStart: TODAY - 5, customLen: 10,
    excluded: ['rent'], chartMode: 'day' as 'day' | 'period', catView: 'bars' as 'bars' | 'donut',
    debtStrategy: 'avalanche' as Strategy, debtExtra: 100, showHowDebt: false
  };
}
export type Persisted = ReturnType<typeof seed>;

// ---------- onboarding ----------
export interface ObBill { id: string; name: string; amount: string; day: string }
export interface Onboarding {
  step: number; fresh: boolean; currency: string; incAmt: string; incFreq: Freq; incNext: string;
  period: PeriodType | null; cStart: string; cLen: string; bills: ObBill[]; budRaw: Record<string, string> | null;
}
export function obFresh(): Onboarding {
  return { step: 0, fresh: true, currency: 'USD', incAmt: '', incFreq: 'biweekly', incNext: isoOf(TODAY + 7), period: null, cStart: isoOf(TODAY), cLen: '10', bills: [], budRaw: null };
}
