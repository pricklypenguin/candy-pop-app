import type { CSSProperties } from 'react';
import { FREQ } from '../lib/data';
import { DIM, MONTH_END, MONTH_START, MONTH_TITLE, TODAY, dayName, dn, dt, fmtD, CUR_M, CUR_Y } from '../lib/dates';
import { incomeMonthly, nextPayOf, occurrences, payOcc, type Occ } from '../lib/model';
import { useApp } from '../store';
import { Bar, H, rowBorder } from '../ui';

export function Bills() {
  const { s, set, f, actions } = useApp();
  const web = s.view === 'web';

  const payDays: Record<number, typeof s.incomes> = {};
  s.incomes.forEach(inc => payOcc(inc, MONTH_START, MONTH_END).forEach(n => (payDays[n] = payDays[n] || []).push(inc)));

  const monthOcc = occurrences(s, MONTH_START, MONTH_END).sort((a, b) => a.n - b.n);
  const unpaid = monthOcc.filter(o => !o.paid), paid = monthOcc.filter(o => o.paid);
  const total = monthOcc.reduce((a, o) => a + o.bill.amount, 0), paidAmt = paid.reduce((a, o) => a + o.bill.amount, 0);

  const whenTxt = (o: Occ) => {
    if (o.paid) return 'Paid · ' + fmtD(o.n);
    const d = o.n - TODAY;
    return d < 0 ? 'Overdue · was due ' + fmtD(o.n) : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : 'Due in ' + d + ' days · ' + fmtD(o.n);
  };

  const first = dt(MONTH_START).getUTCDay();
  const cellH = web ? 92 : 44;

  const billList = (list: Occ[], muted: boolean) => list.map((o, i) => (
    <div key={o.bill.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: rowBorder(i, list.length) }}>
      <button onClick={() => actions.toggleBill(o.bill.id)} aria-label={o.paid ? 'Mark unpaid' : 'Mark paid'} style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid ' + (o.paid ? 'var(--accent-ink)' : 'var(--line3)'), background: o.paid ? 'var(--accent)' : 'var(--surface)', color: 'var(--on)', fontSize: 16, fontWeight: 700, flexShrink: 0, padding: 0 }}>{o.paid ? '✓' : ''}</button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: muted ? 'var(--muted)' : undefined }}>{o.bill.name}</div>
        <div style={{ fontSize: 13, fontWeight: muted ? undefined : 600, color: muted ? 'var(--muted)' : o.n - TODAY <= 2 ? 'var(--warn-ink)' : 'var(--muted)' }}>{whenTxt(o)}</div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: muted ? 'var(--muted)' : undefined }}>{f(o.bill.amount)}</div>
    </div>
  ));

  const legendSwatch = (bg: string, border?: string): CSSProperties => ({ width: 10, height: 10, borderRadius: 4, background: bg, border: border ? '1px solid ' + border : undefined });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 28 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <H size={32} tight={2}>Bills &amp; paydays</H>
        <div className="muted" style={{ fontSize: 16 }}>
          {unpaid.length ? f(unpaid.reduce((a, o) => a + o.bill.amount, 0)) + ' left to pay this month · ' + unpaid.length + ' bill' + (unpaid.length > 1 ? 's' : '') : 'Everything is paid this month'}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '1.7 1 520px', minWidth: 0, borderRadius: 32, padding: '18px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px 20px', padding: '0 4px 4px' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{MONTH_TITLE}</div>
            <div style={{ flex: '0 1 300px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bar pct={paidAmt / (total || 1) * 100} h={8} style={{ flex: 1 }} />
              <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Paid {f(paidAmt)} of {f(total)}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: web ? 6 : 4 }}>
            {(web ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((w, i) => (
              <div key={i} className="muted" style={{ fontSize: 12, fontWeight: 600, padding: '4px 0', textAlign: web ? 'left' : 'center' }}>{w}</div>
            ))}
            {Array.from({ length: first }, (_, i) => <div key={'b' + i} style={{ minHeight: cellH }} />)}
            {Array.from({ length: DIM }, (_, i) => {
              const d = i + 1, n = dn(CUR_Y, CUR_M, d), os = monthOcc.filter(o => o.n === n), due = os.some(o => !o.paid), isT = n === TODAY, pays = payDays[n] || [];
              const num = (
                <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: isT || (!web && due) ? 700 : 500, background: isT ? 'var(--ink)' : 'transparent', color: isT ? 'var(--on)' : n < TODAY ? 'var(--faint)' : 'var(--ink)', flexShrink: 0 }}>{d}</span>
              );
              if (web) {
                const chips = [
                  ...pays.map(inc => ({ name: 'Payday ' + f(inc.amount), title: inc.name + ' · ' + f(inc.amount), bg: 'var(--pay-bg)', color: 'var(--accent-deep)' })),
                  ...os.map(o => ({ name: o.bill.name, title: o.bill.name + ' · ' + f(o.bill.amount), bg: o.paid ? 'var(--line2)' : 'var(--due-bg)', color: o.paid ? 'var(--muted)' : 'var(--due-ink)' }))
                ];
                return (
                  <div key={d} style={{ minHeight: cellH, borderRadius: 16, background: 'var(--soft2)', padding: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
                    {num}
                    {chips.map((c, k) => <div key={k} title={c.title} style={{ width: '100%', background: c.bg, color: c.color, fontSize: 12, fontWeight: 600, borderRadius: 8, padding: '3px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>)}
                  </div>
                );
              }
              const dot = due ? 'var(--warn)' : pays.length ? 'var(--accent)' : os.length ? 'var(--disabled)' : 'transparent';
              return (
                <div key={d} style={{ minHeight: cellH, borderRadius: 16, background: due ? 'var(--due-bg)' : pays.length ? 'var(--accent-soft)' : 'transparent', padding: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0 }}>
                  {num}
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot }} />
                </div>
              );
            })}
          </div>
          <div className="muted" style={{ display: 'flex', gap: 16, padding: '4px 4px 0', fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={legendSwatch('var(--due-bg)', 'var(--warn)')} />Due</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={legendSwatch('var(--line2)')} />Paid</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={legendSwatch('var(--pay-bg)', 'var(--accent-ink)')} />Payday</span>
          </div>
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ borderRadius: 32, padding: '18px 20px 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <H size={22}>Money in</H>
              <div className="muted" style={{ fontSize: 14 }}>{f(Math.round(incomeMonthly(s)))}/mo</div>
            </div>
            {s.incomes.map(inc => {
              const np = nextPayOf(inc), d = np - TODAY;
              return (
                <div key={inc.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{inc.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: d <= 2 ? 'var(--accent-ink)' : 'var(--muted)' }}>
                      {FREQ[inc.freq].label + ' · ' + (d === 0 ? 'payday today' : d === 1 ? 'next payday tomorrow' : 'next ' + dayName(np) + ' (in ' + d + ' days)')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent-ink)' }}>{f(inc.amount)}</div>
                    <button className="muted" onClick={() => set(st => ({ incomes: st.incomes.filter(x => x.id !== inc.id) }))} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 600 }}>Remove</button>
                  </div>
                </div>
              );
            })}
            {!s.incomes.length && <div className="muted" style={{ padding: '16px 0 4px', fontSize: 15 }}>No regular income yet. Add your paycheck so we know when money arrives.</div>}
            <button className="btn-link" onClick={actions.openAddIncome} style={{ padding: '14px 0', fontSize: 15 }}>+ Add income</button>
          </div>

          <H size={22} style={{ padding: '8px 4px 0' }}>Coming up</H>
          <div className="card" style={{ borderRadius: 32, padding: '4px 20px' }}>
            {billList(unpaid, false)}
            {!unpaid.length && <div className="muted" style={{ padding: '18px 0', fontSize: 15 }}>All paid for this month. Nice.</div>}
          </div>
          <H size={22} style={{ padding: '8px 4px 0' }}>Paid</H>
          <div className="card" style={{ borderRadius: 32, padding: '4px 20px' }}>
            {billList(paid, true)}
            {!paid.length && <div className="muted" style={{ padding: '18px 0', fontSize: 15 }}>Nothing paid yet this month.</div>}
          </div>
          <button className="btn-add" onClick={() => actions.open({ mode: 'form', kind: 'bill' })} style={{ borderRadius: 27, padding: 16 }}>+ Add a bill</button>
        </div>
      </div>
    </div>
  );
}
