import type { CSSProperties } from 'react';
import { UNCAT } from '../lib/data';
import { TODAY, WD, dayName, dt, fmtD, monthLabel } from '../lib/dates';
import { simDebts } from '../lib/debt';
import { dueBeforeAdded, firstDay, incomeMonthly, monthly, occurrences, oneOffIn, period, seriesOf } from '../lib/model';
import { PeriodBar } from '../PeriodBar';
import { InOutCard } from './InOut';
import { RECENT_PAGE, useApp, useCats } from '../store';
import { Bar, Dot, H, Seg, rowBorder } from '../ui';

const card = (radius: number, extra?: CSSProperties): CSSProperties => ({ borderRadius: radius, ...extra });

export function Home() {
  const { s, set, f, actions } = useApp();
  const CATS = useCats();
  const M = monthly(s);
  const P = period(s, s.offset), P0 = period(s, 0), isPast = s.offset < 0;
  const inP = (t: { d: number }) => t.d >= P.start && t.d <= P.end;
  const pTx = s.txns.filter(inP).sort((a, b) => b.d - a.d || (b.id > a.id ? 1 : -1));
  const spent = pTx.reduce((a, t) => a + t.amt, 0);
  const incomeP = Math.round(incomeMonthly(s) * P.f) + oneOffIn(s, P), billsP = Math.round(M.bills * P.f), minsP = Math.round(M.mins * P.f), goalsP = Math.round(M.goals * P.f);
  const left = incomeP - billsP - minsP - goalsP - spent;
  const daysLeft = P.end - TODAY + 1;

  let heroLabel = 'Left to spend', heroLabelColor = 'var(--accent-ink)', safeSub: string;
  if (isPast) {
    heroLabel = left >= 0 ? 'Left over' : 'Went over by'; heroLabelColor = left >= 0 ? 'var(--accent-ink)' : 'var(--warn-ink)';
    safeSub = left >= 0 ? 'This period is closed. You stayed within your budget.' : 'This period is closed. Worth a look at which categories ran over.';
  } else {
    safeSub = !s.incomes.length ? 'Add your income on Bills & paydays so we can work out what’s left.'
      : left < 0 ? 'You\'re ' + f(-left) + ' over for this period. That\'s okay — a new period starts soon.'
      : 'About ' + f(Math.floor(left / daysLeft)) + ' a day for the next ' + daysLeft + ' days. Bills, debt and savings are already set aside.';
  }
  const safeTxt = f(Math.abs(isPast ? left : Math.max(0, left)));

  // Summary tiles
  const upcoming = occurrences(s, TODAY - 31, TODAY + 45).filter(o => !o.paid && !dueBeforeAdded(s, o)).sort((a, b) => a.n - b.n);
  const next = upcoming[0];
  const relDay = (n: number) => { const d = n - TODAY; return d < 0 ? 'Overdue' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : 'In ' + d + ' days'; };
  const debtTotal = s.debts.reduce((a, d) => a + d.balance, 0), debtOrig = s.debts.reduce((a, d) => a + d.original, 0) || 1;
  const plan = simDebts(s.debts, s.debtStrategy || 'avalanche', s.debtExtra || 0);
  const debtFree = plan.stuck ? 'One payment is too low to finish' : 'free by ' + (plan.months ? monthLabel(plan.months) : 'now');
  const gSaved = s.goals.reduce((a, g) => a + g.saved, 0), gTarget = s.goals.reduce((a, g) => a + g.target, 0) || 1;
  const budgetP = (id: string) => Math.round((s.budgets[id] || 0) * P.f);
  const plannedP = CATS.reduce((a, c) => a + budgetP(c.id), 0);
  const debtPct = Math.round((1 - debtTotal / debtOrig) * 100);
  const go = (tab: typeof s.tab) => () => set({ tab });

  type Tile = { label: string; value: string; sub: string; w: string; track: string; barColor: string; bg: string; labelColor: string; go?: () => void };
  const tiles: Tile[] = [
    next ? { label: 'NEXT BILL · ' + relDay(next.n).toUpperCase(), value: next.bill.name + ' ' + f(next.bill.amount),
      sub: (() => { const r = upcoming.slice(1).filter(o => o.n <= P0.end); return r.length ? r.length + ' more this period · ' + f(r.reduce((a, o) => a + o.bill.amount, 0)) : 'Last bill this period'; })(),
      w: '0%', track: 'transparent', barColor: 'transparent', bg: 'var(--due-bg)', labelColor: 'var(--warn-ink)', go: go('bills') }
      : { label: 'BILLS', value: 'All paid', sub: 'Nothing due right now', w: '100%', track: 'var(--line)', barColor: 'var(--accent)', bg: 'var(--t1)', labelColor: 'var(--muted)', go: go('bills') },
    { label: 'SPENT ' + (isPast ? 'THAT PERIOD' : 'SO FAR'), value: f(spent), sub: 'of ' + f(plannedP) + ' planned', w: Math.min(100, spent / (plannedP || 1) * 100) + '%', track: 'var(--line)', barColor: spent > plannedP ? 'var(--warn)' : 'var(--ink)', bg: 'var(--t2)', labelColor: 'var(--muted)' },
    !s.debts.length
      ? { label: 'DEBT', value: 'None', sub: 'Add one to plan your payoff', w: '0%', track: 'var(--line)', barColor: 'var(--accent)', bg: 'var(--t3)', labelColor: 'var(--muted)', go: go('debt') }
      : { label: 'DEBT', value: f(debtTotal), sub: debtPct + '% paid off · ' + debtFree, w: debtPct + '%', track: 'var(--line)', barColor: 'var(--accent)', bg: 'var(--t4)', labelColor: 'var(--muted)', go: go('debt') },
    { label: 'SAVINGS', value: f(gSaved), sub: !s.goals.length ? 'No goals yet. Add one any time' : 'of ' + f(gTarget) + ' across ' + s.goals.length + ' goal' + (s.goals.length === 1 ? '' : 's'), w: Math.min(100, gSaved / gTarget * 100) + '%', track: 'var(--line)', barColor: 'var(--accent)', bg: 'var(--surface)', labelColor: 'var(--muted)', go: go('goals') }
  ];


  const allRecent = [...pTx.map(t => ({ ...t, inc: false })), ...s.incomeTxns.filter(inP).map(t => ({ ...t, cat: '', inc: true }))].sort((a, b) => b.d - a.d || (b.id > a.id ? 1 : -1));
  const recentList = allRecent.slice(0, s.recentShown);
  const moreLeft = allRecent.length - recentList.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 24 }}>
      <PeriodBar />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
        <div className="card" style={card(38, { flex: '1 1 340px', padding: '26px 24px 22px', display: 'flex', flexDirection: 'column', gap: 6 })}>
          <div style={{ fontSize: 16, fontWeight: 600, color: heroLabelColor }}>{heroLabel}</div>
          <H size={64} tight={3} style={{ lineHeight: 1, textShadow: 'var(--hero-sh)' }}>{safeTxt}</H>
          <div className="muted pretty" style={{ fontSize: 16, marginTop: 4 }}>{safeSub}</div>
          <button onClick={() => set(x => ({ showBreakdown: !x.showBreakdown }))} style={{ alignSelf: 'flex-start', marginTop: 10, background: 'var(--soft)', border: 'none', borderRadius: 999, padding: '9px 14px', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            {s.showBreakdown ? 'Hide the math' : 'How is this worked out?'}
          </button>
          {s.showBreakdown && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, paddingTop: 14, borderTop: '1px solid var(--line2)' }}>
              {[['Money coming in', '+' + f(incomeP)], ['Bills (set aside)', '−' + f(billsP)], ['Debt payments', '−' + f(minsP)], ['Saving for goals', '−' + f(goalsP)], ['Spent', '−' + f(spent)]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}><span className="muted">{l}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, paddingTop: 10, borderTop: '1px dashed var(--line2)' }}><span style={{ fontWeight: 600 }}>{heroLabel}</span><span style={{ fontWeight: 700, color: 'var(--accent-ink)' }}>{safeTxt}</span></div>
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 340px', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
          {tiles.map(t => (
            <button key={t.label} className="card" onClick={t.go} style={{ background: t.bg, borderRadius: 30, padding: 16, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', color: 'var(--ink)', minWidth: 0, cursor: t.go ? 'pointer' : 'default' }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', color: t.labelColor }}>{t.label}</div>
              <H size={24} tight={2} style={{ lineHeight: 1.1 }}>{t.value}</H>
              <Bar pct={t.w} h={6} track={t.track} color={t.barColor} style={{ width: '100%', marginTop: 2 }} />
              <div className="muted pretty" style={{ fontSize: 13 }}>{t.sub}</div>
            </button>
          ))}
        </div>
      </div>

      <InOutCard />

      <SpendingChart />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '0 4px 8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <H size={22}>Where it's going</H>
              <div className="muted" style={{ fontSize: 14 }}>{f(spent)} spent of {f(plannedP)} planned</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Seg className="seg card" style={{ background: 'var(--surface)' }} value={s.catView} options={[['bars', 'Bars'], ['donut', 'Donut']] as const} onPick={v => set({ catView: v })} />
              <button onClick={actions.openBudget} style={{ background: 'var(--surface)', color: 'var(--accent-ink)', border: '2px solid var(--bd)', boxShadow: 'var(--sh-sm)', borderRadius: 999, padding: '9px 14px', minHeight: 40, fontSize: 13, fontWeight: 700 }}>Edit budgets</button>
            </div>
          </div>
          <CategoryList pTx={pTx} spent={spent} plannedP={plannedP} budgetP={budgetP} />
        </div>

        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 4px 8px' }}>
            <H size={22}>{isPast ? 'Transactions' : 'Recent'}</H>
            <div className="muted" style={{ fontSize: 14 }}>{allRecent.length ? 'Showing ' + recentList.length + ' of ' + allRecent.length + ' transaction' + (allRecent.length === 1 ? '' : 's') + ' this period' : 'No transactions this period'}</div>
          </div>
          <div className="card" style={{ borderRadius: 32, padding: '4px 20px' }}>
            {recentList.map((t, i) => {
              const border = rowBorder(i, recentList.length);
              const c = t.inc ? null : CATS.find(x => x.id === t.cat) || UNCAT;
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: border }}>
                  <Dot color={c ? c.color : 'var(--accent-ink)'} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{t.note || (c ? c.name : 'Extra income')}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{c ? (t.note ? c.name + ' · ' : '') + dayName(t.d) : 'Income · ' + dayName(t.d)}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: c ? 'var(--ink)' : 'var(--accent-ink)' }}>{c ? f(t.amt) : '+' + f(t.amt)}</div>
                </div>
              );
            })}
            {!recentList.length && <div className="muted" style={{ padding: '16px 0', fontSize: 15 }}>Nothing logged in this period.</div>}
            {(moreLeft > 0 || recentList.length > RECENT_PAGE) && (
              <div style={{ display: 'flex', gap: 16, borderTop: '1px solid var(--line)', padding: '4px 0' }}>
                {moreLeft > 0 && <button className="btn-link" onClick={() => set(x => ({ recentShown: x.recentShown + RECENT_PAGE }))} style={{ padding: '12px 0', fontSize: 14 }}>Show {Math.min(RECENT_PAGE, moreLeft)} more</button>}
                {recentList.length > RECENT_PAGE && <button className="btn-link" onClick={() => set({ recentShown: RECENT_PAGE })} style={{ padding: '12px 0', fontSize: 14, color: 'var(--muted)' }}>Show less</button>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryList({ pTx, spent, plannedP, budgetP }: { pTx: { id: string; amt: number; cat: string; note: string; d: number }[]; spent: number; plannedP: number; budgetP: (id: string) => number }) {
  const { s, set, f, actions } = useApp();
  const CATS = useCats();
  const donut = s.catView === 'donut';
  const parts: string[] = []; let acc = 0;
  const rows = CATS.map(c => {
    const list = pTx.filter(t => t.cat === c.id), sp = list.reduce((a, t) => a + t.amt, 0), bud = budgetP(c.id);
    if (sp > 0) { const deg = sp / (spent || 1) * 360; parts.push(c.color + ' ' + acc + 'deg ' + (acc + deg) + 'deg'); acc += deg; }
    return { c, list, sp, bud, over: sp - bud };
  });
  return (
    <div className="card" style={{ borderRadius: 32, padding: '4px 20px' }}>
      {donut && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '22px 0 10px' }}>
          <div style={{ position: 'relative', width: 200, height: 200, borderRadius: '50%', background: parts.length ? 'conic-gradient(' + parts.join(',') + ')' : 'var(--line)' }}>
            <div style={{ position: 'absolute', inset: 34, borderRadius: '50%', background: 'var(--surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Spent</div>
              <H size={30} tight={2}>{f(spent)}</H>
              <div className="muted" style={{ fontSize: 13 }}>of {f(plannedP)}</div>
            </div>
          </div>
        </div>
      )}
      {rows.map(({ c, list, sp, bud, over }, i) => {
        const open = s.openCat === c.id;
        return (
          <div key={c.id} style={{ borderBottom: rowBorder(i, rows.length) }}>
            <button aria-expanded={open} onClick={() => set(x => ({ openCat: x.openCat === c.id ? null : c.id }))} style={{ width: '100%', background: 'none', border: 'none', padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', color: 'var(--ink)' }}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Dot color={c.color} /><span style={{ fontSize: 16, fontWeight: 600 }}>{c.name}</span>
                  {donut && spent > 0 && <span className="muted" style={{ fontSize: 13 }}>{Math.round(sp / spent * 100)}%</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: over > 0 ? 'var(--danger)' : 'var(--muted)' }}>{donut ? f(sp) + ' / ' + f(bud) : over > 0 ? f(over) + ' over' : f(-over) + ' left'}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" style={{ transform: 'rotate(' + (open ? 180 : 0) + 'deg)', transition: 'transform .2s' }}><path d="M3.5 5.5L7 9l3.5-3.5" fill="none" style={{ stroke: 'var(--muted)' }} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              </div>
              {!donut && (
                <div style={{ position: 'relative', width: '100%', height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, width: Math.min(100, bud ? sp / bud * 100 : (sp ? 100 : 0)) + '%', background: c.color }} />
                  {/* Over budget: a striped bar growing back from the right shows by how much. */}
                  <div style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: over > 0 ? Math.min(100, bud ? over / bud * 100 : 100) + '%' : '0%', borderRadius: '999px 0 0 999px', background: 'repeating-linear-gradient(-45deg,var(--over-a) 0 4px,var(--over-b) 4px 8px)', boxShadow: 'var(--over-sh)' }} />
                </div>
              )}
            </button>
            {open && (
              <div style={{ background: 'var(--soft2)', borderRadius: 22, padding: '6px 14px', marginBottom: 14, display: 'flex', flexDirection: 'column' }}>
                <div className="muted" style={{ fontSize: 13, padding: '8px 0 4px' }}>
                  {f(sp) + ' of ' + f(bud) + ' planned · ' + list.length + ' purchase' + (list.length === 1 ? '' : 's') + (over > 0 ? ' · ' + f(over) + ' over' : '')}
                </div>
                {list.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{t.note || c.name}</div><div className="muted" style={{ fontSize: 13 }}>{dayName(t.d)}</div></div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{f(t.amt)}</div>
                  </div>
                ))}
                {!list.length && <div className="muted" style={{ fontSize: 14, padding: '10px 0' }}>Nothing spent here in this period.</div>}
                <button className="btn-link" onClick={() => actions.openLog(c.id)} style={{ alignSelf: 'flex-start', padding: '12px 0 8px', fontSize: 14 }}>+ Log in {c.name}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SpendingChart() {
  const { s, set, f } = useApp();
  const P = period(s, s.offset);
  const SERIES = seriesOf(s);
  const incl = SERIES.filter(x => !s.excluded.includes(x.id));
  // Day → series id → amount. Bills are counted on their due date (rent separately from other bills).
  const bucket = (a: number, b: number) => {
    const map: Record<number, Record<string, number>> = {};
    s.txns.forEach(t => { if (t.d >= a && t.d <= b) { const m = (map[t.d] = map[t.d] || {}); m[t.cat] = (m[t.cat] || 0) + t.amt; } });
    occurrences(s, Math.max(a, s.startedAt), Math.min(b, TODAY)).forEach(o => { const g = o.bill.group === 'rent' ? 'rent' : 'bills', m = (map[o.n] = map[o.n] || {}); m[g] = (m[g] || 0) + o.bill.amount; });
    return map;
  };
  const raw: { total: number; future: boolean; title: string; label: string }[] = [];
  const sumOf = (vals: Record<string, number>) => incl.reduce((a, x) => a + (vals[x.id] || 0), 0);
  if (s.chartMode === 'day') {
    const map = bucket(P.start, P.end), len = P.end - P.start + 1, step = len > 20 ? 7 : len > 8 ? 2 : 1;
    for (let n = P.start, i = 0; n <= P.end; n++, i++) {
      raw.push({ total: sumOf(map[n] || {}), future: n > TODAY, title: fmtD(n), label: i % step === 0 ? (len > 8 ? String(dt(n).getUTCDate()) : WD[dt(n).getUTCDay()].slice(0, 3)) : '' });
    }
  } else {
    for (let o = P.offset - 5; o <= P.offset; o++) {
      const Q = period(s, o); if (Q.end < firstDay(s)) continue;
      const tot: Record<string, number> = {};
      Object.values(bucket(Q.start, Q.end)).forEach(day => Object.keys(day).forEach(k => tot[k] = (tot[k] || 0) + day[k]));
      raw.push({ total: sumOf(tot), future: false, title: Q.label, label: Q.short });
    }
  }
  const cmax = Math.max(1, ...raw.map(r => r.total));
  const hasData = raw.some(r => r.total > 0);
  const gap = raw.length > 20 ? 3 : 8;
  const sub = s.chartMode === 'day'
    ? f(raw.reduce((a, r) => a + r.total, 0)) + ' in this period' + (s.excluded.length ? ' · ' + s.excluded.length + ' hidden' : '')
    : (raw.length === 1 ? 'This period' : 'Last ' + raw.length + ' periods') + ' · avg ' + f(Math.round(raw.reduce((a, r) => a + r.total, 0) / (raw.length || 1)));
  const axisLbl: CSSProperties = { position: 'absolute', right: 0, fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', paddingLeft: 4 };

  return (
    <div className="card" style={{ borderRadius: 32, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <H size={22}>Spending over time</H>
          <div className="muted" style={{ fontSize: 14 }}>{sub}</div>
        </div>
        <Seg value={s.chartMode} options={[['day', 'By day'], ['period', 'By period']] as const} onPick={v => set({ chartMode: v })} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {SERIES.map(x => {
          const on = !s.excluded.includes(x.id);
          return (
            <button key={x.id} aria-pressed={on} onClick={() => set(st => ({ excluded: on ? [...st.excluded, x.id] : st.excluded.filter(e => e !== x.id) }))}
              style={{ border: '1.5px solid ' + (on ? 'var(--line2)' : 'var(--line)'), background: on ? 'var(--surface)' : 'var(--soft)', color: on ? 'var(--ink)' : 'var(--faint)', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, textDecoration: on ? 'none' : 'line-through' }}>
              <Dot size={8} color={on ? x.color : 'var(--line3)'} />{x.name}
            </button>
          );
        })}
        <button className="btn-link" onClick={() => set({ excluded: [] })} style={{ padding: 6, fontSize: 13 }}>All</button>
        <button className="btn-link" onClick={() => set({ excluded: SERIES.map(x => x.id) })} style={{ padding: 6, fontSize: 13 }}>None</button>
      </div>
      <div style={{ position: 'relative', height: 180, display: 'flex', alignItems: 'flex-end', gap, borderBottom: '1px solid var(--line2)' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, borderTop: '1px dashed var(--line)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px dashed var(--line)' }} />
        {hasData ? <>
          <div style={{ ...axisLbl, top: -9 }}>{f(cmax)}</div>
          <div style={{ ...axisLbl, top: 'calc(50% - 9px)' }}>{f(Math.round(cmax / 2))}</div>
        </> : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            <span className="muted" style={{ background: 'var(--surface)', borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: 600 }}>Nothing logged yet this period</span>
          </div>
        )}
        {raw.map((r, i) => (
          <div key={i} title={r.title + ' · ' + f(r.total)} style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column-reverse' }}>
            {r.future ? <div style={{ height: 3, background: 'var(--line)', borderRadius: 4 }} />
              : r.total > 0 && <div style={{ height: (r.total / cmax * 100) + '%', background: 'var(--accent-ink)', borderRadius: 4, flexShrink: 0 }} />}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap, marginTop: -8 }}>
        {raw.map((r, i) => <div key={i} className="muted" style={{ flex: 1, minWidth: 0, fontSize: 11, whiteSpace: 'nowrap', overflow: 'visible' }}>{r.label}</div>)}
      </div>
    </div>
  );
}
