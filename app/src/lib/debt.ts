import type { Debt, Strategy } from './data';

export interface SimDebt { id: string; name: string; bal: number; rate: number; min: number; inc: boolean; roll: boolean; paidAt: number | null; interest: number }
export interface SimResult { months: number; interest: number; series: number[]; debts: SimDebt[]; order: SimDebt[]; stuck: boolean }

/**
 * Month-by-month payoff simulation.
 * Every debt gets its minimum. The extra (plus freed-up minimums from paid-off debts that "roll over")
 * goes to debts in strategy order: smallest balance first (snowball) or highest rate first (avalanche).
 */
export function simDebts(debts: Debt[], strat: Strategy, extra: number): SimResult {
  const ds: SimDebt[] = debts.filter(d => d.balance > 0).map(d => ({ id: d.id, name: d.name, bal: d.balance, rate: d.rate || 0, min: d.min, inc: strat !== 'min', roll: strat !== 'min' && !d.skip, paidAt: null, interest: 0 }));
  const order = ds.filter(d => d.inc).sort(strat === 'snowball' ? (a, b) => a.bal - b.bal : (a, b) => b.rate - a.rate || a.bal - b.bal);
  const series = [ds.reduce((a, d) => a + d.bal, 0)]; let m = 0, total = 0;
  const ex = strat === 'min' ? 0 : extra;
  while (ds.some(d => d.bal > 0.005) && m < 600) {
    m++; let pool = ex;
    ds.forEach(d => {
      if (d.bal <= 0.005) { if (d.roll) pool += d.min; return; }
      const i = d.bal * d.rate / 1200; d.bal += i; d.interest += i; total += i;
      const p = Math.min(d.min, d.bal); d.bal -= p; if (d.inc) pool += d.min - p;
    });
    for (const d of order) { if (pool <= 0) break; if (d.bal <= 0.005) continue; const p = Math.min(pool, d.bal); d.bal -= p; pool -= p; }
    ds.forEach(d => { if (d.bal <= 0.005 && d.paidAt === null) { d.bal = 0; d.paidAt = m; } });
    series.push(ds.reduce((a, d) => a + Math.max(0, d.bal), 0));
  }
  return { months: m, interest: total, series, debts: ds, order, stuck: m >= 600 };
}

export const STRATS: [Strategy, string, string][] = [
  ['snowball', 'Snowball', 'Smallest balance first. Quick wins keep you going.'],
  ['avalanche', 'Avalanche', 'Highest interest first. Pays the least interest overall.'],
  ['min', 'Minimums only', 'Just the minimum on each. Simplest, but slowest.']
];
