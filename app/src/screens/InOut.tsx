import { TODAY } from '../lib/dates';
import { monthly, occurrences, oneOffIn, payOcc, period } from '../lib/model';
import { useApp } from '../store';
import { H } from '../ui';

/**
 * Cash in and out for the selected period. Unlike "left to spend" (which spreads monthly amounts evenly),
 * this counts actual paydays and bill due dates that fall in the period. Debt payments and savings have no
 * dates, so they're spread evenly.
 */
export function InOutCard() {
  const { s, set, f } = useApp();
  const P = period(s, s.offset), isPast = s.offset < 0, M = monthly(s);

  const pays = s.incomes.flatMap(inc => payOcc(inc, P.start, P.end).map(n => ({ n, amt: inc.amount })));
  const payIn = pays.reduce((a, p) => a + p.amt, 0), payLater = pays.filter(p => p.n > TODAY).reduce((a, p) => a + p.amt, 0);
  const extraIn = oneOffIn(s, P);
  const occ = occurrences(s, P.start, P.end);
  const billsOut = occ.reduce((a, o) => a + o.bill.amount, 0), billsLater = occ.filter(o => !o.paid && o.n >= TODAY).reduce((a, o) => a + o.bill.amount, 0);
  const debtOut = Math.round(M.mins * P.f), saveOut = Math.round(M.goals * P.f);
  const spent = s.txns.reduce((a, t) => a + (t.d >= P.start && t.d <= P.end ? t.amt : 0), 0);
  const totalIn = payIn + extraIn, totalOut = billsOut + debtOut + saveOut + spent, net = totalIn - totalOut;
  const max = Math.max(totalIn, totalOut, 1);
  const later = (amt: number, word: string) => !isPast && amt > 0 ? f(amt) + ' ' + word : '';

  const inRows: [string, number, string][] = [
    ['Pay · ' + pays.length + ' payday' + (pays.length === 1 ? '' : 's'), payIn, later(payLater, 'still to come')],
    ['Extra income', extraIn, '']
  ];
  const outRows: [string, number, string][] = [
    ['Bills', billsOut, later(billsLater, 'still due')],
    ['Debt payments', debtOut, ''],
    ['Savings', saveOut, ''],
    ['Spending' + (isPast ? '' : ' so far'), spent, '']
  ];
  const list = (title: string, rows: [string, number, string][], total: number) => (
    <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em' }}>{title}</div>
      {rows.map(([label, amt, note]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 15 }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}><span>{label}</span>{note && <span className="muted" style={{ fontSize: 12 }}>{note}</span>}</span>
          <span style={{ fontWeight: 600 }}>{f(amt)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, paddingTop: 8, borderTop: '1px dashed var(--line2)' }}><span style={{ fontWeight: 600 }}>Total</span><span style={{ fontWeight: 700 }}>{f(total)}</span></div>
    </div>
  );
  const bar = (label: string, amt: number, color: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '38px 1fr', alignItems: 'center', gap: 10 }}>
      <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      <div style={{ height: 12, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}><div style={{ height: '100%', width: amt / max * 100 + '%', background: color, borderRadius: 999 }} /></div>
    </div>
  );

  return (
    <div className="card" style={{ borderRadius: 32, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <H size={22}>Money in &amp; out</H>
          <div className="muted" style={{ fontSize: 14 }}>{isPast ? 'Everything that came in and went out that period' : 'The whole period, including paydays and bills still to come'}</div>
        </div>
        <button aria-expanded={s.showInOut} onClick={() => set(x => ({ showInOut: !x.showInOut }))} style={{ background: 'var(--soft)', border: 'none', borderRadius: 999, padding: '9px 14px', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.showInOut ? 'Hide details' : 'Show details'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
        {([['Money in', f(totalIn), undefined], ['Money out', f(totalOut), undefined], [net >= 0 ? 'Left over' : 'Short by', f(Math.abs(net)), net >= 0 ? 'var(--accent-ink)' : 'var(--danger)']] as const).map(([label, value, color]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
            <H size={26} tight={2} style={color ? { color } : undefined}>{value}</H>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bar('In', totalIn, 'var(--cat-aqua)')}
        {bar('Out', totalOut, 'var(--accent)')}
      </div>
      {s.showInOut && <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 32px', paddingTop: 4 }}>
          {list('MONEY IN', inRows, totalIn)}
          {list('MONEY OUT', outRows, totalOut)}
        </div>
        <div className="muted pretty" style={{ fontSize: 12 }}>Pay and bills are counted on their actual dates. Debt payments and savings are spread evenly across periods{isPast ? ', using today’s amounts' : ''}.</div>
      </>}
    </div>
  );
}
