import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { DEF_BUD, FREQ, PERIOD_OPTS, SUG_BILLS, SUG_DEBTS, SUG_GOALS, type Bill, type Debt, type Freq, type Goal, type ObBill, type ObDebt, type ObGoal, type Onboarding as Ob, type PeriodType } from './lib/data';
import { TODAY, fromIso } from './lib/dates';
import { CUR, curOf, fmtWith, intOnly, numOnly } from './lib/money';
import { catsOf } from './lib/model';
import { useApp, type State } from './store';
import { H, RadioCard, primaryBg } from './ui';

// Steps. Everything between INCOME and PLAN shows in the progress bar.
const WELCOME = 0, INCOME = 1, PERIOD = 2, BILLS = 3, DEBTS = 4, SAVINGS = 5, PLAN = 6, DONE = 7;
const PROGRESS_STEPS = PLAN - WELCOME;

const obPer = (o: Ob): PeriodType => o.period || o.incFreq || 'monthly';
const obPf = (o: Ob) => { const p = obPer(o); return p === 'monthly' ? 1 : p === 'weekly' ? 7 / 30.4375 : p === 'biweekly' ? 14 / 30.4375 : Math.max(1, parseInt(o.cLen, 10) || 1) / 30.4375; };
const obIncM = (o: Ob) => (parseFloat(o.incAmt) || 0) * FREQ[o.incFreq].mult;
const billOk = (b: ObBill) => { const d = parseInt(b.day, 10); return !!b.name.trim() && parseFloat(b.amount) > 0 && d >= 1 && d <= 31; };
const debtOk = (d: ObDebt) => !!d.name.trim() && parseFloat(d.balance) > 0 && parseFloat(d.min) > 0;
const goalOk = (g: ObGoal) => !!g.name.trim() && parseFloat(g.target) > 0 && parseFloat(g.monthly) > 0;
const isBlank = (r: object) => Object.entries(r).every(([k, v]) => k === 'id' || !String(v).trim());
const obBillsM = (o: Ob) => o.bills.reduce((a, b) => a + (billOk(b) ? parseFloat(b.amount) : 0), 0);
const obDebtsM = (o: Ob) => o.debts.reduce((a, d) => a + (debtOk(d) ? parseFloat(d.min) : 0), 0);
const obGoalsM = (o: Ob) => o.goals.reduce((a, g) => a + (goalOk(g) && (parseFloat(g.saved) || 0) < parseFloat(g.target) ? parseFloat(g.monthly) : 0), 0);
/** Monthly money left for everyday spending once bills, debt payments and savings are set aside. */
const obAvailM = (o: Ob) => obIncM(o) - obBillsM(o) - obDebtsM(o) - obGoalsM(o);

/**
 * Suggested category amounts (unless the user typed their own).
 * Start from the default plan (810/month across the six categories), scaled to the budget period.
 * With income entered, scale it so the plan uses at most 85% of what's available, never going above
 * the defaults and never below 20% of them. Rounded to the nearest 5.
 */
function obBud(o: Ob, s: State) {
  const pf = obPf(o), incM = obIncM(o), avail = obAvailM(o) * pf, base = 810 * pf;
  const scale = incM > 0 ? Math.max(0.2, Math.min(1, avail * 0.85 / base)) : 1, out: Record<string, string> = {};
  catsOf(s).forEach(c => out[c.id] = o.budRaw && o.budRaw[c.id] != null ? o.budRaw[c.id] : String(Math.max(0, Math.round((DEF_BUD[c.id] || 50) * pf * scale / 5) * 5)));
  return out;
}

const hero: CSSProperties = { lineHeight: 1.1 };
const choiceStyle = (on: boolean): CSSProperties => ({ border: '2px solid ' + (on ? 'var(--accent-ink)' : 'var(--surface)'), background: on ? 'var(--accent-softer)' : 'var(--surface)' });
const surfaceBtn: CSSProperties = { background: 'var(--surface)', border: 'none', borderRadius: 999, padding: '10px 16px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' };
const obInput: CSSProperties = { border: 'none', background: 'var(--soft)', borderRadius: 12, padding: 12, fontSize: 16, color: 'var(--ink)', outline: 'none', width: '100%', minWidth: 0 };
const newId = (p: string) => p + Date.now() + Math.floor(Math.random() * 999);
// Focus moves synchronously (new rows are flushed first) so fast typing never lands in the previous field.
const focusCell = (list: string, row: number, col: number) =>
  (document.querySelector(`[data-cell="${list}-${row}-${col}"]`) as HTMLInputElement | null)?.focus();

interface Col<R> { key: keyof R & string; head: string; ph: string; clean?: (v: string) => string; mode?: 'text' | 'decimal' | 'numeric'; style?: CSSProperties }

/**
 * Editable rows (bills, debts, goals). Enter moves to the next field, then to the next row;
 * on the last field of the last row it adds a new row.
 */
function RowList<R extends { id: string }>({ list, rows, isOk, cols, grid, onChange, onRemove, onAdd, addLabel, total }: {
  list: string; rows: R[]; isOk: (r: R) => boolean; cols: Col<R>[]; grid: string; onChange: (id: string, key: keyof R & string, v: string) => void;
  onRemove: (id: string) => void; onAdd: () => void; addLabel: string; total: ReactNode;
}) {
  const onKey = (e: KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (col < cols.length - 1) focusCell(list, row, col + 1);
    else if (row < rows.length - 1) focusCell(list, row + 1, 0);
    else { flushSync(onAdd); focusCell(list, rows.length, 0); }
  };
  const incomplete = rows.some(r => !isBlank(r) && !isOk(r));
  return (
    <div className="card" style={{ borderRadius: 30, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="muted" style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '.03em', padding: '0 2px' }}>
        {cols.map(c => <span key={c.key}>{c.head}</span>)}<span />
      </div>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, alignItems: 'center' }}>
          {cols.map((c, j) => (
            <input key={c.key} data-cell={list + '-' + i + '-' + j} aria-label={c.head} enterKeyHint="next" value={String(r[c.key] ?? '')} inputMode={c.mode || 'text'} placeholder={c.ph}
              onChange={e => onChange(r.id, c.key, c.clean ? c.clean(e.target.value) : e.target.value)} onKeyDown={e => onKey(e, i, j)}
              style={{ ...obInput, ...(j === 0 ? { fontWeight: 600 } : null), ...c.style }} />
          ))}
          <button aria-label="Remove" className="muted" onClick={() => onRemove(r.id)} style={{ width: 32, height: 32, border: 'none', borderRadius: '50%', background: 'transparent', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      ))}
      <button onClick={() => { flushSync(onAdd); focusCell(list, rows.length, 0); }} style={{ alignSelf: 'flex-start', border: '2px dashed var(--line3)', borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: 700, background: 'transparent', color: 'var(--ink)' }}>{addLabel}</button>
      {incomplete && <div className="muted" style={{ fontSize: 13 }}>Rows that aren’t filled in yet won’t be saved.</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 2px 2px', borderTop: '1px solid var(--line)', fontSize: 15 }}>{total}</div>
    </div>
  );
}

export function Onboarding() {
  const { s, set, toast } = useApp();
  const o = s.ob;
  if (!o) return null;
  const web = s.view === 'web';
  const CATS = catsOf(s);
  const cur = curOf(o.currency), fm = (n: number) => fmtWith(cur, n), sym = cur.sym.trim();
  const upd = (p: Partial<Ob>) => set(x => ({ ob: { ...x.ob!, ...p } }));
  const setList = <K extends 'bills' | 'debts' | 'goals'>(k: K, fn: (rows: Ob[K]) => Ob[K]) => set(x => ({ ob: { ...x.ob!, [k]: fn(x.ob![k]) } }));
  const editRow = <K extends 'bills' | 'debts' | 'goals'>(k: K) => (id: string, key: string, v: string) =>
    setList(k, rows => (rows as { id: string }[]).map(r => r.id === id ? { ...r, [key]: v } : r) as Ob[K]);
  const removeRow = <K extends 'bills' | 'debts' | 'goals'>(k: K) => (id: string) => setList(k, rows => (rows as { id: string }[]).filter(r => r.id !== id) as Ob[K]);

  const per = obPer(o), pf = obPf(o), len = parseInt(o.cLen, 10) || 1;
  const unit = per === 'monthly' ? 'per month' : per === 'weekly' ? 'per week' : per === 'biweekly' ? 'per 2 weeks' : 'per ' + len + ' days';
  const incM = obIncM(o), avail = Math.round(obAvailM(o) * pf);
  const bud = obBud(o, s), planned = CATS.reduce((a, c) => a + (parseFloat(bud[c.id]) || 0), 0), over = planned > avail;
  const incOk = parseFloat(o.incAmt) > 0 && !!o.incNext;
  const customOk = per !== 'custom' || (len >= 1 && len <= 90 && !!o.cStart);
  const ok = o.step === INCOME ? incOk : o.step === PERIOD ? customOk : true;

  const finish = () => {
    const id = Date.now(), amt = parseFloat(o.incAmt), anchor = fromIso(o.incNext);
    const first = !o.fresh && s.incomes[0];
    const inc = amt > 0 && anchor != null ? { id: first ? first.id : 'i' + id, name: first ? first.name : 'Paycheck', amount: amt, freq: o.incFreq, anchor } : null;
    const incomes = o.fresh ? (inc ? [inc] : []) : inc ? [inc, ...s.incomes.slice(1)] : s.incomes;
    const oldBill = (bid: string) => o.fresh ? undefined : s.bills.find(b => b.id === bid);
    const bills: Bill[] = o.bills.filter(billOk).map(b => ({ ...oldBill(b.id), id: b.id, name: b.name.trim(), amount: parseFloat(b.amount), day: Math.min(31, parseInt(b.day, 10)), group: /rent|mortgage/i.test(b.name) ? 'rent' as const : undefined, addedOn: oldBill(b.id)?.addedOn ?? TODAY }));
    // "Run setup again" keeps what isn't edited here (a debt's starting balance, the roll-over switch).
    const debts: Debt[] = o.debts.filter(debtOk).map(d => {
      const old = o.fresh ? undefined : s.debts.find(x => x.id === d.id), balance = parseFloat(d.balance);
      return { ...old, id: d.id, name: d.name.trim(), balance, original: Math.max(old?.original ?? 0, balance), min: parseFloat(d.min), rate: parseFloat(d.rate) || 0 };
    });
    const goals: Goal[] = o.goals.filter(goalOk).map(g => ({ id: g.id, name: g.name.trim(), target: parseFloat(g.target), monthly: parseFloat(g.monthly), saved: parseFloat(g.saved) || 0 }));
    const budgets: Record<string, number> = {}; CATS.forEach(c => budgets[c.id] = (parseFloat(bud[c.id]) || 0) / pf);
    const patch: Partial<State> = { currency: o.currency, incomes, bills, debts, goals, budgets, periodType: per, onboarded: true, ob: null, tab: 'home', offset: 0, sheet: null };
    if (per === 'custom') { patch.customStart = fromIso(o.cStart) ?? s.customStart; patch.customLen = parseInt(o.cLen, 10); }
    // A fresh setup starts a clean account; "Run setup again" keeps logged spending.
    if (o.fresh) Object.assign(patch, { txns: [], incomeTxns: [], paidKeys: [], startedAt: TODAY, debtExtra: 0 });
    set(patch);
    toast('You’re all set', 'Tap Log spending whenever you buy something');
  };
  const next = () => {
    if (!ok) return;
    if (o.step === PERIOD) upd({ period: per, step: BILLS });
    else if (o.step === DONE) finish();
    else upd({ step: o.step + 1 });
  };
  const labels: Record<number, string> = { [PLAN]: 'Looks good', [DONE]: 'Go to my dashboard' };
  const skips: Record<number, string> = {
    [WELCOME]: o.fresh ? 'Just looking? Explore with sample data' : '',
    [INCOME]: 'I’ll add my income later',
    [BILLS]: o.bills.length ? '' : 'No bills to add right now',
    [DEBTS]: o.debts.length ? '' : 'No debts, or I’ll add them later — skip',
    [SAVINGS]: o.goals.length ? '' : 'Not right now — skip'
  };
  const skipAct: Record<number, () => void> = {
    [WELCOME]: () => set({ onboarded: true, currency: o.currency, ob: null }),
    [INCOME]: () => upd({ incAmt: '', step: PERIOD }),
    [BILLS]: () => upd({ step: DEBTS }),
    [DEBTS]: () => upd({ step: SAVINGS }),
    [SAVINGS]: () => upd({ step: PLAN })
  };

  const title = (t: string, sub: ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <H size={34} tight={3} style={hero}>{t}</H>
      <div className="muted pretty" style={{ fontSize: 17 }}>{sub}</div>
    </div>
  );
  const optionalTag = <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '4px 10px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', alignSelf: 'flex-start' }}>Optional</span>;
  const chips = (names: string[], taken: string[], add: (n: string) => void, blankLabel: string) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {names.filter(n => !taken.includes(n.toLowerCase())).map(n => <button key={n} onClick={() => add(n)} style={{ ...surfaceBtn, padding: '11px 16px', fontSize: 15 }}>+ {n}</button>)}
      <button onClick={() => add('')} style={{ border: '2px dashed var(--line3)', borderRadius: 999, padding: '9px 16px', fontSize: 15, fontWeight: 700, background: 'transparent', color: 'var(--ink)' }}>{blankLabel}</button>
    </div>
  );
  const totalRow = (label: string, v: number) => <><span className="muted">{label}</span><span style={{ fontWeight: 700 }}>{fm(Math.round(v))}</span></>;
  const numCell: CSSProperties = { padding: '12px 8px' };
  // Adding from a suggestion chip jumps straight to the amount; a blank row starts at the name.
  const addTo = <K extends 'bills' | 'debts' | 'goals'>(k: K, blank: Omit<Ob[K][number], 'id' | 'name'>) => (name: string) => {
    const idx = o[k].length;
    flushSync(() => setList(k, rows => [...rows, { id: newId(k[0]), name, ...blank }] as Ob[K]));
    focusCell(k, idx, name ? 1 : 0);
  };
  const addBill = addTo('bills', { amount: '', day: '' });
  const addDebt = addTo('debts', { balance: '', min: '', rate: '' });
  const addGoal = addTo('goals', { target: '', monthly: '', saved: '' });
  const planStat = (label: string, value: string, color?: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <H size={24} tight={2} style={color ? { color } : undefined}>{value}</H>
    </div>
  );
  const taken = (rows: { name: string }[]) => rows.map(r => r.name.trim().toLowerCase());

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--soft)', overflow: 'auto' }}>
      <div style={{ maxWidth: web ? 600 : 440, margin: '0 auto', minHeight: '100%', padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 40 }}>
          {!o.fresh && o.step < DONE && <button style={surfaceBtn} onClick={() => set({ ob: null })}>Cancel</button>}
          {o.step > (o.fresh ? WELCOME : INCOME) && <button style={surfaceBtn} onClick={() => upd({ step: Math.max(0, o.step - 1) })}>Back</button>}
          {o.step >= INCOME && o.step <= PLAN && <>
            <div style={{ flex: 1, display: 'flex', gap: 6 }}>{Array.from({ length: PROGRESS_STEPS }, (_, i) => <span key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: i < o.step ? 'var(--accent)' : 'var(--dot-off)' }} />)}</div>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{o.step} of {PROGRESS_STEPS}</span>
          </>}
        </div>

        {o.step === WELCOME && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ width: 52, height: 52, borderRadius: 22, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--surface)' }} /></span>
              <H size={40} tight={3} style={{ lineHeight: 1.05, marginTop: 6 }}>Let’s get your money sorted.</H>
              <div className="muted pretty" style={{ fontSize: 17 }}>A few quick questions, about three minutes. Debts and savings are optional, and you can change any of it later.</div>
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

        {o.step === INCOME && (
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

        {o.step === PERIOD && (
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

        {o.step === BILLS && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {title('Which bills do you pay each month?', 'Just the regular ones. Tap to add, then fill in how much and the due day.')}
            {chips(SUG_BILLS, taken(o.bills), addBill, '+ Something else')}
            {o.bills.length > 0 && (
              <RowList list="bills" rows={o.bills} isOk={billOk} grid="minmax(0,1.5fr) minmax(0,1fr) 64px 32px" onChange={editRow('bills')} onRemove={removeRow('bills')} onAdd={() => addBill('')} addLabel="+ Add another bill"
                cols={[
                  { key: 'name', head: 'BILL', ph: 'Name' },
                  { key: 'amount', head: 'AMOUNT', ph: fm(0), clean: numOnly, mode: 'decimal' },
                  { key: 'day', head: 'DUE DAY', ph: '1–31', clean: v => intOnly(v), mode: 'numeric', style: { padding: '12px 8px', textAlign: 'center' } }
                ]}
                total={totalRow('Bills each month', obBillsM(o))} />
            )}
          </div>
        )}

        {o.step === DEBTS && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {optionalTag}
            {title('Paying off any debts?', 'Credit cards, loans, anything you’re paying back. We’ll set the monthly payments aside for you. No debts, or rather do this later? Just skip — you can add them any time on the Debt tab.')}
            {chips(SUG_DEBTS, taken(o.debts), addDebt, '+ Something else')}
            {o.debts.length > 0 && (
              <RowList list="debts" rows={o.debts} isOk={debtOk} grid="minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 58px 32px" onChange={editRow('debts')} onRemove={removeRow('debts')} onAdd={() => addDebt('')} addLabel="+ Add another debt"
                cols={[
                  { key: 'name', head: 'DEBT', ph: 'Name' },
                  { key: 'balance', head: 'YOU OWE', ph: fm(0), clean: numOnly, mode: 'decimal', style: numCell },
                  { key: 'min', head: 'PER MONTH', ph: fm(0), clean: numOnly, mode: 'decimal', style: numCell },
                  { key: 'rate', head: 'RATE %', ph: 'opt.', clean: numOnly, mode: 'decimal', style: { ...numCell, textAlign: 'center' } }
                ]}
                total={totalRow('Debt payments each month', obDebtsM(o))} />
            )}
          </div>
        )}

        {o.step === SAVINGS && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {optionalTag}
            {title('Saving up for anything?', 'An emergency fund, a holiday, a rainy-day pot. Add what you’d like to put away each month and we’ll set it aside. Not saving yet? That’s completely fine — skip this and add goals whenever you’re ready.')}
            {chips(SUG_GOALS, taken(o.goals), addGoal, '+ Something else')}
            {o.goals.length > 0 && (
              <RowList list="goals" rows={o.goals} isOk={goalOk} grid="minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 32px" onChange={editRow('goals')} onRemove={removeRow('goals')} onAdd={() => addGoal('')} addLabel="+ Add another goal"
                cols={[
                  { key: 'name', head: 'GOAL', ph: 'Name' },
                  { key: 'target', head: 'TARGET', ph: fm(0), clean: numOnly, mode: 'decimal', style: numCell },
                  { key: 'monthly', head: 'PER MONTH', ph: fm(0), clean: numOnly, mode: 'decimal', style: numCell },
                  { key: 'saved', head: 'SAVED', ph: fm(0), clean: numOnly, mode: 'decimal', style: numCell }
                ]}
                total={totalRow('Saving each month', obGoalsM(o))} />
            )}
          </div>
        )}

        {o.step === PLAN && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {title('Plan your everyday spending', incM > 0 ? 'We’ve suggested amounts ' + unit + ' based on what’s left after bills, debt payments and savings. Change any you like.' : 'Set a rough amount ' + unit + ' for each. You can fine-tune it any time.')}
            <div style={{ borderRadius: 27, padding: 16, background: over ? 'var(--danger-soft)' : 'var(--accent-soft)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                {planStat('Available', fm(avail))}
                {planStat('Planned', fm(planned))}
                {planStat(over ? 'Over by' : 'Not planned', fm(Math.abs(avail - planned)), over ? 'var(--danger)' : 'var(--accent-ink)')}
              </div>
              <div className="bar" style={{ height: 10, background: 'var(--surface)' }}><div style={{ width: Math.min(100, avail > 0 ? planned / avail * 100 : 100) + '%', background: over ? 'var(--danger)' : 'var(--accent-ink)' }} /></div>
              <div className="muted" style={{ fontSize: 12 }}>Available = your pay minus bills, debt payments and savings.</div>
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

        {o.step === DONE && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700 }}>✓</span>
              <H size={40} tight={3} style={{ lineHeight: 1.05, marginTop: 6 }}>You’re all set.</H>
            </div>
            <div className="card" style={{ borderRadius: 38, padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent-ink)' }}>Left to spend {unit}</div>
              <H size={60} tight={3} style={{ lineHeight: 1, textShadow: 'var(--hero-sh)' }}>{fm(avail)}</H>
              <div className="muted pretty" style={{ fontSize: 16, marginTop: 4 }}>Bills, debt payments and savings are already set aside. This goes down as you log what you spend.</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>What’s next</div>
              {['Tap the pink Log spending button whenever you buy something. It takes three taps.', 'Add or change debts and saving goals in their tabs any time.', 'Change your currency or budget period any time in Settings.'].map((text, i) => (
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
          <button className="btn-primary" aria-disabled={!ok} onClick={next} style={{ background: primaryBg(ok) }}>{labels[o.step] || 'Continue'}</button>
          {skips[o.step] && <button className="muted" onClick={() => skipAct[o.step]?.()} style={{ background: 'none', border: 'none', padding: 12, fontSize: 15, fontWeight: 700 }}>{skips[o.step]}</button>}
        </div>
      </div>
    </div>
  );
}
