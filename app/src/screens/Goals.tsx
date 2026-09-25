import { monthLabel } from '../lib/dates';
import { numOnly } from '../lib/money';
import { leftFor, monthly, period } from '../lib/model';
import { CALC_DEFAULT, useApp, type Calc } from '../store';
import { Bar, H, Seg, primaryBg } from '../ui';

const span = (m: number) => { const y = Math.floor(m / 12), r = m % 12; return [y ? y + (y === 1 ? ' year' : ' years') : '', r ? r + (r === 1 ? ' month' : ' months') : ''].filter(Boolean).join(' ') || '0 months'; };

export function Goals() {
  const { s, f, actions } = useApp();
  const M = monthly(s);
  const gSaved = s.goals.reduce((a, g) => a + g.saved, 0), gTarget = s.goals.reduce((a, g) => a + g.target, 0) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 28 }}>
      <H size={32} tight={2}>Goals</H>
      <div className="card" style={{ borderRadius: 38, padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="muted" style={{ fontSize: 16, fontWeight: 600 }}>Total saved</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <H as="span" size={48} tight={3} style={{ lineHeight: 1 }}>{f(gSaved)}</H>
          <span className="muted" style={{ fontSize: 17 }}>of {f(s.goals.length ? gTarget : 0)}</span>
        </div>
        <Bar pct={Math.min(100, gSaved / gTarget * 100)} style={{ marginTop: 14 }} />
        <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, fontSize: 14, marginTop: 4 }}>
          <span>{!s.goals.length ? 'Add a goal to start saving' : Math.round(gSaved / gTarget * 100) + '% of the way · ' + f(Math.max(0, gTarget - gSaved)) + ' to go'}</span>
          <span>{f(M.goals)}/mo set aside</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
        {s.goals.map(g => {
          const l = Math.max(0, g.target - g.saved), pct = Math.min(1, g.saved / g.target);
          return (
            <div key={g.id} className="card" style={{ borderRadius: 32, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{g.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-ink)' }}>{Math.round(pct * 100)}%</div>
                  <button className="btn-edit" onClick={() => actions.open({ mode: 'form', kind: 'goal', editId: g.id }, { form: { name: g.name, target: String(g.target), monthly: String(g.monthly), saved: String(g.saved) } })}>Edit</button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <H as="span" size={30} tight={2}>{f(g.saved)}</H><span className="muted" style={{ fontSize: 15 }}>of {f(g.target)}</span>
              </div>
              <Bar pct={pct * 100} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div className="muted" style={{ fontSize: 14 }}>{l ? f(g.monthly) + '/mo · reach it by ' + monthLabel(Math.ceil(l / g.monthly)) : 'Goal reached'}</div>
                <button className="btn-tonal" onClick={() => actions.open({ mode: 'goal', id: g.id })}>Add money</button>
              </div>
            </div>
          );
        })}
        <button className="btn-add" onClick={() => actions.open({ mode: 'form', kind: 'goal' })} style={{ borderRadius: 32, padding: 20, minHeight: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span>+ Add a saving goal</span>
          <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>or use the planner below</span>
        </button>
      </div>

      <GoalPlanner />
    </div>
  );
}

/** "Plan a new goal": pick a monthly amount to see how long, or a timeframe to see the monthly amount. */
function GoalPlanner() {
  const { s, set, f, toast } = useApp();
  const c: Calc = { ...CALC_DEFAULT, ...(s.calc || {}) };
  const upd = (p: Partial<Calc>) => set(x => ({ calc: { ...CALC_DEFAULT, ...(x.calc || {}), ...p } }));
  const target = parseFloat(c.target) || 0, start = Math.min(parseFloat(c.start) || 0, target), need = Math.max(0, target - start);
  const byPay = c.mode === 'pay';
  const maxPay = Math.max(50, Math.ceil(need / 10) * 10 || 50);
  const monthlyAmt = byPay ? Math.min(Math.max(10, c.monthly), maxPay) : (need ? Math.ceil(need / c.months) : 0);
  const months = byPay ? (monthlyAmt ? Math.ceil(need / monthlyAmt) : 0) : c.months;
  const P0 = period(s, 0), left = leftFor(s, P0), perP = Math.round(monthlyAmt * P0.f);
  const ok = !!c.name.trim() && need > 0 && monthlyAmt > 0;
  const deep = { color: 'var(--accent-deep)' };

  const save = () => {
    if (!ok) return;
    const name = c.name.trim();
    set(x => ({ goals: [...x.goals, { id: 'g' + Date.now(), name, target, saved: start, monthly: monthlyAmt }], calc: null }));
    toast(name + ' added', f(monthlyAmt) + ' a month is now set aside');
  };

  return (
    <div className="card" style={{ borderRadius: 38, padding: 24, display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <H size={22}>Plan a new goal</H>
          <div className="muted" style={{ fontSize: 14 }}>Try out numbers before you commit. Nothing is saved until you add it.</div>
        </div>
        <Seg variant="lift" value={c.mode} options={[['pay', 'Choose monthly amount'], ['time', 'Choose how long']] as const} onPick={v => upd({ mode: v })} btn={{ padding: '9px 16px', fontSize: 14 }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
        <div style={{ flex: '1.3 1 340px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label className="label-col">What’s it for?<input className="field" value={c.name} onChange={e => upd({ name: e.target.value })} placeholder="e.g. New car deposit" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
            <label className="label-col">Target<input className="field" style={{ fontWeight: 600 }} value={c.target} onChange={e => upd({ target: numOnly(e.target.value) })} inputMode="decimal" placeholder={f(0)} /></label>
            <label className="label-col">Starting with<input className="field" style={{ fontWeight: 600 }} value={c.start} onChange={e => upd({ start: numOnly(e.target.value) })} inputMode="decimal" placeholder={f(0)} /></label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{byPay ? 'Save each month' : 'Reach it in'}</span>
              <H size={28}>{byPay ? f(monthlyAmt) : span(c.months)}</H>
            </div>
            <input type="range" aria-label={byPay ? 'Save each month' : 'Reach it in'} min={byPay ? 10 : 1} max={byPay ? maxPay : 60} step={byPay ? 10 : 1} value={byPay ? monthlyAmt : c.months}
              onChange={e => upd(byPay ? { monthly: parseInt(e.target.value, 10) } : { months: parseInt(e.target.value, 10) })} style={{ width: '100%', accentColor: 'var(--accent)', height: 24 }} />
            <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{byPay ? f(10) : '1 month'}</span><span>{byPay ? f(maxPay) : '5 years'}</span></div>
          </div>
        </div>
        <div style={{ flex: '1 1 280px', background: 'var(--accent-soft)', borderRadius: 30, padding: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, ...deep }}>{need <= 0 ? 'Already there' : byPay ? 'You’ll reach it in' : 'You’ll need to save'}</div>
          <H size={48} tight={3} style={{ lineHeight: 1 }}>{need <= 0 ? f(target) : byPay ? span(months) : f(monthlyAmt) + '/mo'}</H>
          <div className="pretty" style={{ fontSize: 15, ...deep }}>{need <= 0 ? 'Your starting amount already covers the target.' : 'That’s ' + monthLabel(months) + ', putting away ' + f(monthlyAmt) + ' a month to cover the ' + f(need) + ' still needed.'}</div>
          <Bar pct={target ? start / target * 100 : 0} track="var(--surface)" style={{ marginTop: 8 }} />
          <div style={{ fontSize: 13, ...deep }}>{f(start)} of {f(target)} to start</div>
          <div style={{ flex: 1, minHeight: 8 }} />
          <div className="pretty" style={{ fontSize: 13, ...deep }}>{perP > left ? 'Heads up: this is more than your ' + f(Math.max(0, left)) + ' left to spend right now.' : 'Adding this would leave ' + f(left - perP) + ' left to spend this period.'}</div>
          <button className="btn-primary" onClick={save} disabled={!ok} style={{ borderRadius: 22, padding: 16, fontSize: 16, background: primaryBg(ok) }}>
            {!c.name.trim() ? 'Name it to save as a goal' : need <= 0 ? 'Target already reached' : 'Save as a new goal'}
          </button>
        </div>
      </div>
    </div>
  );
}
