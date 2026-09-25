import { CUR_M, CUR_Y, monthLabel, spanTxt } from '../lib/dates';
import { STRATS, simDebts } from '../lib/debt';
import { monthly } from '../lib/model';
import { useApp } from '../store';
import { Bar, H, RadioDot, Switch } from '../ui';

const ORD = ['1st', '2nd', '3rd'];

export function Debt() {
  const { s, set, f, actions } = useApp();
  const M = monthly(s);
  const strat = s.debtStrategy || 'avalanche', extra = s.debtExtra || 0;
  const plan = simDebts(s.debts, strat, extra), base = simDebts(s.debts, 'min', 0);
  const debtTotal = s.debts.reduce((a, d) => a + d.balance, 0), debtOrig = s.debts.reduce((a, d) => a + d.original, 0) || 1;
  const hasDebts = s.debts.length > 0;

  const orderIds = plan.order.filter(d => d.bal > 0 || d.paidAt).map(d => d.id);
  const rows = s.debts.map(d => {
    const p = plan.debts.find(x => x.id === d.id), idx = orderIds.indexOf(d.id), inPlan = !d.skip;
    let badge = 'Minimums only', badgeBg = 'var(--soft)', badgeColor = 'var(--muted)', rank = 100;
    if (d.balance <= 0) { badge = 'Paid off'; badgeBg = 'var(--accent-soft)'; badgeColor = 'var(--accent-ink)'; rank = 200; }
    else if (idx >= 0) { rank = idx; badge = idx === 0 ? 'Focus now' : (ORD[idx] || (idx + 1) + 'th') + ' in line'; badgeBg = idx === 0 ? 'var(--accent)' : 'var(--accent-soft)'; badgeColor = idx === 0 ? 'var(--on)' : 'var(--accent-ink)'; }
    return { d, p, inPlan, badge, badgeBg, badgeColor, rank };
  }).sort((a, b) => a.rank - b.rank);

  // Chart: plan vs minimums-only balance over time, scaled into a 600×200 box.
  const NM = Math.max(1, base.series.length - 1, plan.series.length - 1), maxBal = Math.max(1, base.series[0] || 0);
  const X = (i: number) => (i / NM * 600).toFixed(1), Y = (v: number) => (200 - v / maxBal * 190).toFixed(1);
  const lineOf = (ser: number[]) => ser.map((v, i) => (i ? 'L' : 'M') + X(i) + ',' + Y(v)).join(' ');
  const planLine = lineOf(plan.series), baseLine = lineOf(base.series);
  const planArea = planLine + ' L' + X(plan.series.length - 1) + ',200 L0,200 Z';
  const dots = plan.debts.filter(d => d.paidAt).map(d => ({ id: d.id, left: (d.paidAt! / NM * 100) + '%', top: ((200 - (plan.series[d.paidAt!] || 0) / maxBal * 190) / 2) + '%', title: d.name + ' paid off · ' + monthLabel(d.paidAt!) }));
  const years: { left: string; label: string }[] = [];
  for (let i = 1; i <= NM; i++) {
    if ((CUR_M - 1 + i) % 12 === 0) { const yr = CUR_Y + (CUR_M - 1 + i) / 12; if (NM <= 96 || yr % 2 === 0) years.push({ left: (i / NM * 100) + '%', label: String(yr) }); }
  }

  const target = strat === 'snowball' ? 'the debt with the smallest balance' : 'the debt with the highest interest rate';
  const howTexts = strat === 'min' ? [
    'Every debt gets its minimum payment each month, so nothing falls behind.',
    'No extra money goes in, and when a debt is paid off its payment stays in your budget instead of moving to the next one.',
    'This is the simplest option, but it takes the longest and costs the most interest.'
  ] : [
    'Every debt gets its minimum payment each month, so nothing falls behind.',
    'Your extra money (' + f(extra) + '/mo) goes to ' + target + ' first.',
    'When that debt is paid off, its minimum payment is freed up. That freed-up money rolls onto the next debt in line, so each payment gets bigger as you go.',
    'On each debt you can turn off "Roll over when paid off". Then, once that debt is gone, its old payment goes back into your left to spend instead of moving to the next debt.'
  ];
  const howWhy = strat === 'snowball' ? 'Why Snowball: you see debts disappear sooner, which makes it easier to stick with.' : strat === 'avalanche' ? 'Why Avalanche: you pay the least interest overall.' : 'Tip: even a small extra amount with Snowball or Avalanche can save a lot.';
  const savedM = base.months - plan.months, savedI = base.interest - plan.interest;
  const extraResult = plan.stuck ? 'A payment is too low to ever finish — try adding more.' : base.stuck ? 'Debt-free by ' + monthLabel(plan.months) + '. Minimums alone would never finish.' : savedM > 0 ? spanTxt(savedM) + ' sooner · ' + f(Math.round(savedI)) + ' less interest' : 'Same as paying the minimums';
  // Snowball and Avalanche only differ in which debt gets the extra first.
  const active = s.debts.filter(d => d.balance > 0);
  const orderKey = (st: 'snowball' | 'avalanche') => simDebts(s.debts, st, extra).order.map(d => d.id).join();
  const stratNote = active.length === 1
    ? 'You have one debt, so Snowball and Avalanche work exactly the same. They only change which debt gets extra money first, and that makes a difference once you have two or more. The extra-money slider below still shows how much sooner you’d finish and how much interest you’d save.'
    : active.length > 1 && orderKey('snowball') === orderKey('avalanche')
      ? 'Right now your smallest debt is also your highest-interest one, so Snowball and Avalanche pay debts off in the same order and give the same result.'
      : '';
  const stratName = (STRATS.find(x => x[0] === s.debtStrategy) || [])[1] || 'Payoff';

  const goPlan = () => { const el = document.getElementById('payoff-plan'); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 28 }}>
      <H size={32} tight={2}>Debt</H>
      {!hasDebts && (
        <div className="card" style={{ borderRadius: 38, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
          <H size={24}>No debts added</H>
          <div className="muted pretty" style={{ fontSize: 16 }}>Add a credit card, loan or anything you’re paying off. We’ll set the payments aside and show you when you’ll be debt-free.</div>
        </div>
      )}
      {hasDebts && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
          <div className="card" style={{ flex: '1 1 320px', borderRadius: 38, padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="muted" style={{ fontSize: 16, fontWeight: 600 }}>Total you owe</div>
            <H size={48} tight={3} style={{ lineHeight: 1 }}>{f(debtTotal)}</H>
            <Bar pct={Math.max(0, Math.round((1 - debtTotal / debtOrig) * 100))} style={{ marginTop: 14 }} />
            <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>{f(Math.max(0, debtOrig - debtTotal))} paid off so far</div>
            <button onClick={goPlan} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, background: 'var(--accent-soft)', border: '2px solid var(--bd)', borderRadius: 999, padding: '8px 14px', minHeight: 40, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
              <span className="dot" style={{ width: 8, height: 8, background: 'var(--accent)' }} />{stratName} plan<span style={{ color: 'var(--accent-ink)' }}>Change ↓</span>
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 'auto', paddingTop: 18, borderTop: '1px solid var(--line)' }}>
              {[['Debt-free by', plan.stuck ? 'Not yet' : monthLabel(plan.months)], ['Interest to pay', f(Math.round(plan.interest))], ['Paying monthly', f(M.mins)]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}><span className="muted" style={{ fontSize: 13 }}>{l}</span><span style={{ fontSize: 17, fontWeight: 700 }}>{v}</span></div>
              ))}
            </div>
          </div>
          <div className="card" style={{ flex: '1.6 1 420px', minWidth: 0, borderRadius: 38, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <H size={22}>Your path to debt-free</H>
              <div className="muted" style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 3, borderRadius: 3, background: 'var(--accent)' }} />Your plan</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 0, borderTop: '2px dashed var(--faint)' }} />Minimums only</span>
              </div>
            </div>
            <div style={{ position: 'relative', height: 200, borderBottom: '1px solid var(--line2)' }}>
              <div className="muted" style={{ position: 'absolute', left: 0, top: -4, fontSize: 11 }}>{f(maxBal)}</div>
              <svg viewBox="0 0 600 200" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
                <path d={planArea} style={{ fill: 'var(--accent-soft)' }} />
                <path d={baseLine} fill="none" style={{ stroke: 'var(--faint)' }} strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
                <path d={planLine} fill="none" style={{ stroke: 'var(--accent-ink)' }} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </svg>
              {dots.map(d => <div key={d.id} title={d.title} style={{ position: 'absolute', left: d.left, top: d.top, transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: 'var(--surface)', border: '3px solid var(--accent-ink)' }} />)}
            </div>
            <div style={{ position: 'relative', height: 16, marginTop: -6 }}>
              {years.map(y => <span key={y.label} className="muted" style={{ position: 'absolute', left: y.left, transform: 'translateX(-50%)', fontSize: 11 }}>{y.label}</span>)}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>Circles mark when each debt is paid off on your plan.</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
        {rows.map(({ d, p, inPlan, badge, badgeBg, badgeColor }) => (
          <div key={d.id} className="card" style={{ borderRadius: 32, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.03em', borderRadius: 999, padding: '5px 10px', background: badgeBg, color: badgeColor }}>{badge}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="muted" style={{ fontSize: 13 }}>{d.balance <= 0 ? 'Done' : !p || p.paidAt === null ? 'Payment doesn\'t cover interest' : 'Paid off by ' + monthLabel(p.paidAt)}</span>
                <button className="btn-edit" onClick={() => actions.open({ mode: 'form', kind: 'debt', editId: d.id }, { form: { name: d.name, balance: String(d.balance), min: String(d.min), rate: d.rate ? String(d.rate) : '' } })}>Edit</button>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{d.name}</div>
                <div className="muted" style={{ fontSize: 14 }}>{f(d.min) + '/mo minimum' + (d.rate ? ' · ' + d.rate + '% interest' : '')}</div>
              </div>
              <H size={24}>{f(d.balance)}</H>
            </div>
            <Bar pct={Math.round((1 - d.balance / d.original) * 100)} h={8} />
            <div className="muted" style={{ fontSize: 13 }}>{p ? f(Math.round(p.interest)) + ' interest on this plan' : 'No more interest'}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: 4, borderTop: '1px solid var(--line)' }}>
              <button role="switch" aria-checked={inPlan} onClick={() => set(st => ({ debts: st.debts.map(x => x.id === d.id ? { ...x, skip: !x.skip } : x) }))} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: '8px 0', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                <Switch on={inPlan} />{inPlan ? 'Roll over when paid off' : 'Back to spending when paid off'}
              </button>
              <button className="btn-tonal" onClick={() => actions.open({ mode: 'debt', id: d.id })}>Log payment</button>
            </div>
          </div>
        ))}
        <button className="btn-add" onClick={() => actions.open({ mode: 'form', kind: 'debt' })} style={{ borderRadius: 32, padding: 20, minHeight: 72 }}>+ Add a debt</button>
      </div>

      {hasDebts && (
        <div id="payoff-plan" className="card" style={{ scrollMarginTop: 90, borderRadius: 38, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <H size={22}>Your payoff plan</H>
              <div className="muted" style={{ fontSize: 14 }}>Pick how extra money gets shared out between your debts.</div>
            </div>
            <button aria-expanded={s.showHowDebt} onClick={() => set(x => ({ showHowDebt: !x.showHowDebt }))} style={{ background: 'var(--soft)', border: 'none', borderRadius: 999, padding: '9px 14px', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.showHowDebt ? 'Hide how this works' : 'How this works'}</button>
          </div>
          {s.showHowDebt && (
            <div style={{ background: 'var(--soft)', borderRadius: 27, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {howTexts.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <span className="pretty" style={{ fontSize: 15, lineHeight: 1.45, paddingTop: 3 }}>{t}</span>
                </div>
              ))}
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-ink)', paddingLeft: 38 }}>{howWhy}</div>
            </div>
          )}
          {stratNote && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--soft)', borderRadius: 22, padding: '14px 16px' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</span>
              <span className="pretty" style={{ fontSize: 14, lineHeight: 1.45 }}>{stratNote}</span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
            {STRATS.map(([id, name, desc]) => {
              const r = id === strat ? plan : simDebts(s.debts, id, extra), on = id === strat;
              return (
                <button key={id} aria-pressed={on} onClick={() => set({ debtStrategy: id })} style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', border: '2px solid ' + (on ? 'var(--accent-ink)' : 'var(--line)'), background: on ? 'var(--accent-softer)' : 'var(--surface)', borderRadius: 27, padding: 16, color: 'var(--ink)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><RadioDot on={on} /><span style={{ fontSize: 17, fontWeight: 700 }}>{name}</span></span>
                  <span className="muted pretty" style={{ fontSize: 14 }}>{desc}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-ink)' }}>{r.stuck ? 'Never finishes at these payments' : 'Free by ' + monthLabel(r.months) + ' · ' + f(Math.round(r.interest)) + ' interest'}</span>
                </button>
              );
            })}
          </div>
          {strat !== 'min' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
              <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 15, fontWeight: 600 }}>Extra each month</span><H size={28}>{f(extra)}</H></div>
                <input type="range" min={0} max={1000} step={10} value={extra} aria-label="Extra each month" onChange={e => set({ debtExtra: parseInt(e.target.value, 10) || 0 })} style={{ width: '100%', accentColor: 'var(--accent)', height: 24 }} />
                <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{f(0)}</span><span>{f(500)}</span><span>{f(1000)}</span></div>
              </div>
              <div style={{ flex: '1 1 280px', background: 'var(--accent-soft)', borderRadius: 27, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                <div className="pretty" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{extraResult}</div>
                <div className="pretty" style={{ fontSize: 13, color: 'var(--accent-deep)' }}>Compared with paying only the minimums. The extra comes out of your left to spend.</div>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ background: 'var(--soft)', borderRadius: 22, padding: '14px 16px', fontSize: 14 }}>Pick Snowball or Avalanche to add extra money and see how much sooner you'd be done.</div>
          )}
        </div>
      )}
    </div>
  );
}
