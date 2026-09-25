import type { CSSProperties } from 'react';
import { DEF_BUD, FREQ, PERIOD_OPTS, SUG_BILLS, autoPaid, paidKey, type Bill, type Freq, type ObBill, type Onboarding as Ob, type PeriodType } from './lib/data';
import { fromIso } from './lib/dates';
import { CUR, curOf, fmtWith, intOnly, numOnly } from './lib/money';
import { catsOf } from './lib/model';
import { useApp, type State } from './store';
import { H, RadioCard, primaryBg } from './ui';

const obPer = (o: Ob): PeriodType => o.period || o.incFreq || 'monthly';
const obPf = (o: Ob) => { const p = obPer(o); return p === 'monthly' ? 1 : p === 'weekly' ? 7 / 30.4375 : p === 'biweekly' ? 14 / 30.4375 : Math.max(1, parseInt(o.cLen, 10) || 1) / 30.4375; };
const obIncM = (o: Ob) => (parseFloat(o.incAmt) || 0) * FREQ[o.incFreq].mult;
const obBillOk = (b: ObBill) => { const d = parseInt(b.day, 10); return !!b.name.trim() && parseFloat(b.amount) > 0 && d >= 1 && d <= 31; };
const obBillsM = (o: Ob) => o.bills.reduce((a, b) => a + (obBillOk(b) ? parseFloat(b.amount) : 0), 0);

/** Suggested category amounts, scaled down to fit what's left after bills (unless the user typed their own). */
function obBud(o: Ob, s: State) {
  const pf = obPf(o), incM = obIncM(o), avail = (incM - obBillsM(o)) * pf, base = 810 * pf;
  const scale = incM > 0 ? Math.max(0.2, Math.min(1, avail * 0.85 / base)) : 1, out: Record<string, string> = {};
  catsOf(s).forEach(c => out[c.id] = o.budRaw && o.budRaw[c.id] != null ? o.budRaw[c.id] : String(Math.max(0, Math.round((DEF_BUD[c.id] || 50) * pf * scale / 5) * 5)));
  return out;
}

const hero: CSSProperties = { lineHeight: 1.1 };
const choiceStyle = (on: boolean): CSSProperties => ({ border: '2px solid ' + (on ? 'var(--accent-ink)' : 'var(--surface)'), background: on ? 'var(--accent-softer)' : 'var(--surface)' });
const surfaceBtn: CSSProperties = { background: 'var(--surface)', border: 'none', borderRadius: 999, padding: '10px 16px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' };
const obInput: CSSProperties = { border: 'none', background: 'var(--soft)', borderRadius: 12, padding: 12, fontSize: 16, color: 'var(--ink)', outline: 'none', width: '100%', minWidth: 0 };

export function Onboarding() {
  const { s, set, toast } = useApp();
  const o = s.ob;
  if (!o) return null;
  const web = s.view === 'web';
  const CATS = catsOf(s);
  const cur = curOf(o.currency), fm = (n: number) => fmtWith(cur, n), sym = cur.sym.trim();
  const upd = (p: Partial<Ob>) => set(x => ({ ob: { ...x.ob!, ...p } }));
  const setBills = (fn: (b: ObBill[]) => ObBill[]) => set(x => ({ ob: { ...x.ob!, bills: fn(x.ob!.bills) } }));
  const per = obPer(o), pf = obPf(o), len = parseInt(o.cLen, 10) || 1;
  const unit = per === 'monthly' ? 'per month' : per === 'weekly' ? 'per week' : per === 'biweekly' ? 'per 2 weeks' : 'per ' + len + ' days';
  const incM = obIncM(o), billsM = obBillsM(o), avail = Math.round((incM - billsM) * pf);
  const bud = obBud(o, s), planned = CATS.reduce((a, c) => a + (parseFloat(bud[c.id]) || 0), 0), over = planned > avail;
  const incOk = parseFloat(o.incAmt) > 0 && !!o.incNext;
  const customOk = per !== 'custom' || (len >= 1 && len <= 90 && !!o.cStart);
  const ok = [true, incOk, customOk, true, true, true][o.step];

  const finish = () => {
    const id = Date.now(), amt = parseFloat(o.incAmt), anchor = fromIso(o.incNext);
    const first = !o.fresh && s.incomes[0];
    const inc = amt > 0 && anchor != null ? { id: first ? first.id : 'i' + id, name: first ? first.name : 'Paycheck', amount: amt, freq: o.incFreq, anchor } : null;
    const incomes = o.fresh ? (inc ? [inc] : []) : inc ? [inc, ...s.incomes.slice(1)] : s.incomes;
    const bills: Bill[] = o.bills.filter(obBillOk).map((b, i) => ({ id: b.id || 'b' + id + i, name: b.name.trim(), amount: parseFloat(b.amount), day: Math.min(31, parseInt(b.day, 10)), group: /rent|mortgage/i.test(b.name) ? 'rent' as const : undefined }));
    const budgets: Record<string, number> = {}; CATS.forEach(c => budgets[c.id] = (parseFloat(bud[c.id]) || 0) / pf);
    const patch: Partial<State> = { currency: o.currency, incomes, bills, budgets, periodType: per, onboarded: true, ob: null, tab: 'home', offset: 0, sheet: null,
      paidKeys: o.fresh ? bills.filter(b => autoPaid(b.day)).map(b => paidKey(b.id)) : s.paidKeys };
    if (per === 'custom') { patch.customStart = fromIso(o.cStart) ?? s.customStart; patch.customLen = parseInt(o.cLen, 10); }
    // A fresh setup starts a clean account; "Run setup again" keeps spending, debts and goals.
    if (o.fresh) Object.assign(patch, { txns: [], incomeTxns: [], debts: [], goals: [] });
    set(patch);
    toast('You’re all set', 'Tap Log spending whenever you buy something');
  };
  const next = () => {
    if (!ok) return;
    if (o.step === 2) upd({ period: per, step: 3 });
    else if (o.step === 5) finish();
    else upd({ step: o.step + 1 });
  };
  const labels = ['Continue', 'Continue', 'Continue', 'Continue', 'Looks good', 'Go to my dashboard'];
  const skips = [o.fresh ? 'Just looking? Explore with sample data' : '', 'I’ll add my income later', '', o.bills.length ? '' : 'No bills to add right now', '', ''];
  const skipAct = [() => set({ onboarded: true, currency: o.currency, ob: null }), () => upd({ incAmt: '', step: 2 }), null, () => upd({ step: 4 }), null, null][o.step];
  const names = o.bills.map(b => b.name.trim().toLowerCase());
  const addBill = (name: string) => setBills(bs => [...bs, { id: 'b' + Date.now() + Math.floor(Math.random() * 999), name, amount: '', day: '' }]);
  const row = (bid: string, k: keyof ObBill, v: string) => setBills(bs => bs.map(b => b.id === bid ? { ...b, [k]: v } : b));

  const title = (t: string, sub: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <H size={34} tight={3} style={hero} >{t}</H>
      <div className="muted pretty" style={{ fontSize: 17 }}>{sub}</div>
    </div>
  );
  const planStat = (label: string, value: string, color?: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <H size={24} tight={2} style={color ? { color } : undefined}>{value}</H>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--soft)', overflow: 'auto' }}>
      <div style={{ maxWidth: web ? 600 : 440, margin: '0 auto', minHeight: '100%', padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 40 }}>
          {!o.fresh && o.step < 5 && <button style={surfaceBtn} onClick={() => set({ ob: null })}>Cancel</button>}
          {o.step > (o.fresh ? 0 : 1) && <button style={surfaceBtn} onClick={() => upd({ step: Math.max(0, o.step - 1) })}>Back</button>}
          {o.step >= 1 && o.step <= 4 && <>
            <div style={{ flex: 1, display: 'flex', gap: 6 }}>{[1, 2, 3, 4].map(i => <span key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: i <= o.step ? 'var(--accent)' : 'var(--dot-off)' }} />)}</div>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{o.step} of 4</span>
          </>}
        </div>

        {o.step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ width: 52, height: 52, borderRadius: 22, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--surface)' }} /></span>
              <H size={40} tight={3} style={{ lineHeight: 1.05, marginTop: 6 }}>Let’s get your money sorted.</H>
              <div className="muted pretty" style={{ fontSize: 17 }}>Four quick questions, about two minutes. You can change any of it later.</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>First, which currency do you use?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(132px,1fr))', gap: 8 }}>
                {CUR.map(c => {
                  const on = c.code === o.currency;
                  return (
                    <button key={c.code} aria-pressed={on} onClick={() => upd({ currency: c.code })} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', ...choiceStyle(on), borderRadius: 22, padding: '10px 12px', color: 'var(--ink)', minWidth: 0 }}>
                      <span style={{ width: 36, height: 36, borderRadius: 14, background: on ? 'var(--accent)' : 'var(--soft)', color: on ? 'var(--on)' : 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{c.sym.trim()}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><span style={{ fontSize: 15, fontWeight: 700 }}>{c.code}</span><span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span></span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {o.step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {title('How much do you get paid?', 'Your take-home pay each payday, after tax.')}
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 30, padding: '14px 20px' }}>
              <H as="span" size={34} style={{ color: 'var(--faint)' }}>{sym}</H>
              <input className="hl hl2" aria-label="Take-home pay" value={o.incAmt} onChange={e => upd({ incAmt: numOnly(e.target.value) })} inputMode="decimal" placeholder="0" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 42 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>How often?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                {(Object.keys(FREQ) as Freq[]).map(id => {
                  const on = o.incFreq === id;
                  return <button key={id} aria-pressed={on} onClick={() => upd({ incFreq: id, budRaw: null })} style={{ ...choiceStyle(on), borderRadius: 22, padding: '14px 8px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{FREQ[id].label}</button>;
                })}
              </div>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15, fontWeight: 700 }}>When’s your next payday?
              <input type="date" value={o.incNext} onChange={e => upd({ incNext: e.target.value })} style={{ border: 'none', background: 'var(--surface)', borderRadius: 16, padding: '15px 16px', fontSize: 17, fontWeight: 500, color: 'var(--ink)', outline: 'none', width: '100%' }} />
            </label>
            {incM > 0 && <div style={{ background: 'var(--accent-soft)', borderRadius: 22, padding: '14px 16px', fontSize: 15, fontWeight: 600, color: 'var(--accent-deep)' }}>That’s about {fm(Math.round(incM))} a month.</div>}
            <div className="muted" style={{ fontSize: 14 }}>More than one income? Add the rest later on Bills &amp; paydays.</div>
          </div>
        )}

        {o.step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {title('How often should your budget reset?', 'Each time it resets you get a fresh left-to-spend number. Matching your payday is easiest.')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PERIOD_OPTS.map(po => (
                <RadioCard key={po.id} on={per === po.id} dot={22} onClick={() => upd({ period: po.id, budRaw: null })}>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 17, fontWeight: 700 }}>{po.name}</span><span className="muted" style={{ fontSize: 14 }}>{po.sub}</span></span>
                  {po.id === o.incFreq && incM > 0 && <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '5px 10px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', flexShrink: 0 }}>Matches your pay</span>}
                </RadioCard>
              ))}
            </div>
            {per === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
                <label className="label-col">Starts on<input className="field" type="date" value={o.cStart} onChange={e => upd({ cStart: e.target.value, budRaw: null })} style={{ background: 'var(--surface)', padding: '13px 14px', fontSize: 16 }} /></label>
                <label className="label-col">Length in days<input className="field" value={o.cLen} onChange={e => upd({ cLen: intOnly(e.target.value), budRaw: null })} inputMode="numeric" placeholder="e.g. 10" style={{ background: 'var(--surface)', padding: '13px 14px', fontSize: 16 }} /></label>
              </div>
            )}
          </div>
        )}

        {o.step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {title('Which bills do you pay each month?', 'Just the regular ones. Tap to add, then fill in how much and the due day.')}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUG_BILLS.filter(n => !names.includes(n.toLowerCase())).map(n => <button key={n} onClick={() => addBill(n)} style={{ ...surfaceBtn, padding: '11px 16px', fontSize: 15 }}>+ {n}</button>)}
              <button onClick={() => addBill('')} style={{ border: '2px dashed var(--line3)', borderRadius: 999, padding: '9px 16px', fontSize: 15, fontWeight: 700, background: 'transparent', color: 'var(--ink)' }}>+ Something else</button>
            </div>
            {o.bills.length > 0 && (
              <div className="card" style={{ borderRadius: 30, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="muted" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr) 64px 32px', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '.03em', padding: '0 2px' }}>
                  <span>BILL</span><span>AMOUNT</span><span>DUE DAY</span><span />
                </div>
                {o.bills.map(b => (
                  <div key={b.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr) 64px 32px', gap: 8, alignItems: 'center' }}>
                    <input aria-label="Bill name" value={b.name} onChange={e => row(b.id, 'name', e.target.value)} placeholder="Name" style={{ ...obInput, fontWeight: 600 }} />
                    <input aria-label="Amount" value={b.amount} onChange={e => row(b.id, 'amount', numOnly(e.target.value))} inputMode="decimal" placeholder={fm(0)} style={obInput} />
                    <input aria-label="Due day" value={b.day} onChange={e => row(b.id, 'day', intOnly(e.target.value))} inputMode="numeric" placeholder="1–31" style={{ ...obInput, padding: '12px 8px', textAlign: 'center' }} />
                    <button aria-label="Remove" className="muted" onClick={() => setBills(bs => bs.filter(x => x.id !== b.id))} style={{ width: 32, height: 32, border: 'none', borderRadius: '50%', background: 'transparent', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 2px 2px', borderTop: '1px solid var(--line)', fontSize: 15 }}><span className="muted">Bills each month</span><span style={{ fontWeight: 700 }}>{fm(Math.round(billsM))}</span></div>
              </div>
            )}
          </div>
        )}

        {o.step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {title('Plan your everyday spending', incM > 0 ? 'We’ve suggested amounts ' + unit + ' based on what’s left after bills. Change any you like.' : 'Set a rough amount ' + unit + ' for each. You can fine-tune it any time.')}
            <div style={{ borderRadius: 27, padding: 16, background: over ? 'var(--danger-soft)' : 'var(--accent-soft)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                {planStat('After bills', fm(avail))}
                {planStat('Planned', fm(planned))}
                {planStat(over ? 'Over by' : 'Not planned', fm(Math.abs(avail - planned)), over ? 'var(--danger)' : 'var(--accent-ink)')}
              </div>
              <div className="bar" style={{ height: 10, background: 'var(--surface)' }}><div style={{ width: Math.min(100, avail > 0 ? planned / avail * 100 : 100) + '%', background: over ? 'var(--danger)' : 'var(--accent-ink)' }} /></div>
            </div>
            <div className="card" style={{ borderRadius: 30, padding: '6px 16px' }}>
              {CATS.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i === CATS.length - 1 ? 'none' : '1px solid var(--line)' }}>
                  <span className="dot" style={{ width: 10, height: 10, background: c.color }} />
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{c.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--soft)', borderRadius: 16, padding: '0 12px', width: 130 }}>
                    <span className="muted" style={{ fontSize: 15 }}>{sym}</span>
                    <input aria-label={c.name + ' budget'} value={bud[c.id]} inputMode="decimal" onChange={e => { const v = numOnly(e.target.value); set(x => ({ ob: { ...x.ob!, budRaw: { ...obBud(x.ob!, x), [c.id]: v } } })); }} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', padding: '12px 0', fontSize: 16, fontWeight: 600, color: 'var(--ink)', outline: 'none', textAlign: 'right' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {o.step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700 }}>✓</span>
              <H size={40} tight={3} style={{ lineHeight: 1.05, marginTop: 6 }}>You’re all set.</H>
            </div>
            <div className="card" style={{ borderRadius: 38, padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent-ink)' }}>Left to spend {unit}</div>
              <H size={60} tight={3} style={{ lineHeight: 1, textShadow: 'var(--hero-sh)' }}>{fm(avail)}</H>
              <div className="muted pretty" style={{ fontSize: 16, marginTop: 4 }}>Bills are already set aside. This goes down as you log what you spend.</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>What’s next</div>
              {['Tap the pink Log spending button whenever you buy something. It takes three taps.', 'Add debts and saving goals in their tabs whenever you’re ready.', 'Change your currency or budget period any time in Settings.'].map((text, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <span className="pretty" style={{ fontSize: 16, lineHeight: 1.45, paddingTop: 2 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className="btn-primary" aria-disabled={!ok} onClick={next} style={{ background: primaryBg(ok) }}>{labels[o.step]}</button>
          {skips[o.step] && <button className="muted" onClick={() => skipAct && skipAct()} style={{ background: 'none', border: 'none', padding: 12, fontSize: 15, fontWeight: 700 }}>{skips[o.step]}</button>}
        </div>
      </div>
    </div>
  );
}
