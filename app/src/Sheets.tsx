import { useEffect } from 'react';
import { FORMS, PERIOD_OPTS, emptyLists, type Persisted, type PeriodType } from './lib/data';
import { TODAY, fmtD } from './lib/dates';
import { CUR, intOnly, numOnly, scaled } from './lib/money';
import { buildView, incomeMonthly, monthly, period, unitOf } from './lib/model';
import { BGS, FONTS } from './lib/theme';
import { useApp, useCats } from './store';
import { H, RadioCard, Seg, primaryBg, rowBorder } from './ui';

export function SheetHost() {
  const { s, set, actions } = useApp();
  const sh = s.sheet;
  useEffect(() => {
    if (!sh) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.closeSheet(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sh]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sh) return null;
  const web = s.view === 'web';

  let title = '';
  if (sh.mode === 'spend') title = s.logType === 'income' ? 'Log income' : 'Log spending';
  if (sh.mode === 'goal') title = 'Add to ' + (s.goals.find(g => g.id === sh.id)?.name || '');
  if (sh.mode === 'debt') title = 'Pay ' + (s.debts.find(d => d.id === sh.id)?.name || '');
  if (sh.mode === 'form') title = sh.editId ? 'Edit ' + ((sh.kind === 'debt' ? s.debts : s.goals).find(x => x.id === sh.editId)?.name || '') : FORMS[sh.kind].title;
  if (sh.mode === 'budget') title = 'Edit budget';
  if (sh.mode === 'settings') title = 'Settings';
  if (sh.mode === 'restore') title = 'Restore a backup';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: web ? 'center' : 'flex-end', padding: web ? 24 : 0 }}>
      <div onClick={actions.closeSheet} style={{ position: 'absolute', inset: 0, background: 'rgba(34,33,30,.4)' }} />
      <div role="dialog" aria-modal="true" aria-label={title} className="card" style={{ position: 'relative', width: '100%', maxWidth: web ? 480 : 440, maxHeight: '92vh', overflow: 'auto', borderRadius: web ? 28 : '28px 28px 0 0', padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!web && <div style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--line2)', alignSelf: 'center' }} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 }}>
          <H size={22}>{title}</H>
          <button onClick={() => set({ sheet: null })} style={{ background: 'var(--soft)', border: 'none', borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Cancel</button>
        </div>
        {(sh.mode === 'spend' || sh.mode === 'goal' || sh.mode === 'debt') && <Keypad />}
        {sh.mode === 'form' && <FormSheet />}
        {sh.mode === 'budget' && <BudgetSheet />}
        {sh.mode === 'settings' && <SettingsSheet />}
        {sh.mode === 'restore' && <RestoreSheet />}
      </div>
    </div>
  );
}

function Keypad() {
  const { s, set, fx, cur, actions } = useApp();
  const CATS = useCats();
  const sh = s.sheet!, isSpend = sh.mode === 'spend', income = s.logType === 'income';
  const amt = parseFloat(s.entry) || 0;
  const label = sh.mode === 'spend' ? (amt ? (income ? 'Add ' + fx(amt) + ' income' : 'Log ' + fx(amt)) : 'Enter an amount') : sh.mode === 'goal' ? 'Add money' : 'Log payment';

  // Physical keyboard support for the number pad.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (/^[0-9.]$/.test(e.key)) actions.press(e.key);
      else if (e.key === 'Backspace') actions.press('⌫');
      else if (e.key === 'Enter') actions.saveKeypad();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isSpend && (
        <Seg variant="lift" className="seg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }} value={s.logType} options={[['spend', 'Spending'], ['income', 'Income']] as const} onPick={v => set({ logType: v })} btn={{ padding: 10, fontSize: 15 }} />
      )}
      <H size={56} tight={3} style={{ textAlign: 'center', padding: '6px 0', color: s.entry ? 'var(--ink)' : 'var(--disabled)' }}>
        {cur.after ? (s.entry || '0') + ' ' + cur.sym : cur.sym + (s.entry || '0')}
      </H>
      {isSpend && <>
        {!income && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
            {CATS.map(c => {
              const on = s.selCat === c.id;
              return (
                <button key={c.id} aria-pressed={on} onClick={() => set({ selCat: c.id })} style={{ borderRadius: 22, padding: '12px 6px', fontSize: 14, fontWeight: 600, border: '2px solid ' + (on ? 'var(--ink)' : 'var(--line)'), background: on ? 'var(--soft)' : 'var(--surface)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span className="dot" style={{ width: 8, height: 8, background: c.color }} />{c.name}
                </button>
              );
            })}
          </div>
        )}
        <input className="field" style={{ fontSize: 16 }} value={s.note} onChange={e => set({ note: e.target.value })} placeholder={income ? 'Where is it from? (optional)' : 'What was it? (optional)'} />
      </>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => (
          <button key={k} className="hl" aria-label={k === '⌫' ? 'Delete' : k} onClick={() => actions.press(k)} style={{ height: 56, border: 'none', borderRadius: 22, background: 'var(--soft)', fontSize: 24 }}>{k}</button>
        ))}
      </div>
      <button className="btn-primary" aria-disabled={!amt} onClick={actions.saveKeypad} style={{ background: primaryBg(!!amt) }}>{label}</button>
    </div>
  );
}

function FormSheet() {
  const { s, set, f, actions } = useApp();
  const sh = s.sheet as Extract<NonNullable<typeof s.sheet>, { mode: 'form' }>;
  const form = FORMS[sh.kind];
  const setF = (k: string, v: string) => set(x => ({ form: { ...x.form, [k]: v } }));
  const valid = actions.formValid(sh.kind);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
        {form.fields.map(fl => { const Wrap = fl.choice ? 'div' : 'label'; return (
          <Wrap key={fl.k} className="label-col" style={{ gridColumn: fl.full ? '1 / -1' : 'auto' }}>{fl.label}
            {fl.choice ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {fl.choice.map(([id, label]) => {
                  const on = s.form[fl.k] === id;
                  return <button key={id} type="button" aria-pressed={on} onClick={() => setF(fl.k, id)} style={{ border: 'none', borderRadius: 999, padding: '11px 16px', fontSize: 15, fontWeight: 700, background: on ? 'var(--ink)' : 'var(--soft)', color: on ? 'var(--on)' : 'var(--ink)' }}>{label}</button>;
                })}
              </div>
            ) : (
              <input className="field" type={fl.date ? 'date' : 'text'} value={s.form[fl.k] || ''} inputMode={fl.int ? 'numeric' : fl.num ? 'decimal' : 'text'} placeholder={fl.ph === '$0' ? f(0) : fl.ph}
                onChange={e => { let v = e.target.value; if (fl.int) v = intOnly(v); else if (fl.num) v = numOnly(v); setF(fl.k, v); }} />
            )}
          </Wrap>
        ); })}
      </div>
      <div className="muted pretty" style={{ fontSize: 14 }}>{sh.editId ? 'Changes update your left to spend straight away.' : form.note}</div>
      <button className="btn-primary" aria-disabled={!valid} onClick={actions.saveForm} style={{ background: primaryBg(valid), marginTop: 4 }}>{sh.editId ? 'Save changes' : form.btn}</button>
      {sh.editId && (
        <button onClick={actions.removeItem} style={{ border: 'none', borderRadius: 24, padding: 14, fontSize: 15, fontWeight: 700, background: s.confirmRemove ? 'var(--danger)' : 'var(--danger-soft)', color: s.confirmRemove ? 'var(--on)' : 'var(--danger)' }}>
          {s.confirmRemove ? 'Tap again to remove for good' : 'Remove ' + (sh.kind === 'debt' ? 'debt' : 'goal')}
        </button>
      )}
    </div>
  );
}

/** Message under the Available / Planned / Not planned summary. `small` is the buffer size worth calling out (50 in dollar terms). */
function planMsg(raw: number, f: (n: number) => string, small: number) {
  const left = Math.round(raw);
  if (left < 0) return 'That\'s ' + f(-left) + ' more than you have. Try trimming a category.';
  if (left === 0) return 'Every bit of your money has a job. Leaving a little unplanned gives you room for surprises.';
  if (left <= small) return f(left) + ' not planned — a small buffer. A bit more would make surprises easier to handle.';
  return f(left) + ' not planned — a nice cushion for surprises.';
}

function BudgetSheet() {
  const { s, set, f, cur, actions } = useApp();
  const CATS = useCats();
  const P0 = period(s, 0), M = monthly(s), unit = unitOf(s.periodType, s.customLen);
  const avail = Math.round(incomeMonthly(s) * P0.f) - Math.round((M.bills + M.mins + M.goals) * P0.f);
  const planned = CATS.reduce((a, c) => a + (parseFloat(s.form[c.id]) || 0), 0);
  const over = planned > avail;
  const setF = (k: string, v: string) => set(x => ({ form: { ...x.form, [k]: v } }));
  // "Usually about" hint: average spend over the last three periods.
  const spentAvg = (id: string) => {
    let t = 0, k = 0;
    for (let o = -3; o <= -1; o++) { const Q = period(s, o); k++; t += s.txns.reduce((a, x) => a + (x.cat === id && x.d >= Q.start && x.d <= Q.end ? x.amt : 0), 0); }
    return k ? Math.round(t / k) : 0;
  };
  const stat = (label: string, value: string, color?: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <H size={26} tight={2} style={color ? { color } : undefined}>{value}</H>
    </div>
  );
  const addOk = !!s.newCatName.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--soft)', borderRadius: 24, padding: '14px 16px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>Money coming in {unit}</span>
          <H size={24}>{f(Math.round(incomeMonthly(s) * P0.f))}</H>
          <span className="muted" style={{ fontSize: 12 }}>{s.incomes.length + ' regular income source' + (s.incomes.length === 1 ? '' : 's') + ' · change these on Bills & paydays'}</span>
        </div>
        <button onClick={actions.openAddIncome} style={{ background: 'var(--surface)', color: 'var(--accent-ink)', border: 'none', borderRadius: 999, padding: '10px 14px', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>+ Add income</button>
      </div>
      <div style={{ borderRadius: 24, padding: 16, background: over ? 'var(--danger-soft)' : 'var(--accent-soft)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
          {stat('Available', f(avail))}
          {stat('Planned', f(planned))}
          {stat(over ? 'Over by' : 'Not planned', f(Math.abs(avail - planned)), over ? 'var(--danger)' : 'var(--accent-ink)')}
        </div>
        <div className="bar" style={{ height: 10, background: 'var(--surface)' }}><div style={{ width: Math.min(100, avail > 0 ? planned / avail * 100 : 100) + '%', background: over ? 'var(--over-a)' : 'var(--accent)' }} /></div>
        <div style={{ fontSize: 14, fontWeight: 600, color: over ? 'var(--warn-ink)' : 'var(--accent-ink)' }}>{planMsg(avail - planned, f, scaled(cur, 50))}</div>
        <div className="muted" style={{ fontSize: 12 }}>Available = money coming in minus bills, debt and savings.</div>
      </div>
      <div className="muted" style={{ fontSize: 14, fontWeight: 600, paddingTop: 4 }}>Spending plan {unit}</div>
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--soft)', borderRadius: 24, padding: '4px 16px' }}>
        {CATS.map((c, i) => {
          const avg = spentAvg(c.id);
          return (
            <div key={c.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: rowBorder(i, CATS.length, 'var(--line2)') }}>
                <span className="dot" style={{ width: 10, height: 10, background: c.color }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{c.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{avg ? 'Usually about ' + f(avg) : 'New category'}</span>
                </div>
                <div className="card" style={{ display: 'flex', alignItems: 'center', borderRadius: 16, padding: '0 12px', width: 120 }}>
                  <span className="muted" style={{ fontSize: 16 }}>{cur.sym.trim()}</span>
                  <input aria-label={c.name + ' budget'} value={s.form[c.id] || ''} onChange={e => setF(c.id, numOnly(e.target.value))} inputMode="decimal" style={{ border: 'none', background: 'transparent', padding: '11px 6px', fontSize: 16, fontWeight: 600, color: 'var(--ink)', outline: 'none', width: '100%', textAlign: 'right' }} />
                </div>
                <button aria-label={'Remove ' + c.name} onClick={() => CATS.length > 1 && set({ confirmCat: c.id })} className="muted" style={{ width: 30, height: 30, border: 'none', borderRadius: '50%', background: 'transparent', fontSize: 20, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
              </div>
              {s.confirmCat === c.id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--danger-soft)', borderRadius: 19, padding: '10px 12px', marginBottom: 8 }}>
                  <span style={{ flex: 1, minWidth: 180, fontSize: 14, color: 'var(--ink)' }}>
                    {'Remove ' + c.name + '? ' + (c.id !== 'other' && CATS.some(x => x.id === 'other') ? 'Its spending moves to Other.' : 'Its spending will show as Uncategorised.')}
                  </span>
                  <button onClick={() => set({ confirmCat: null })} style={{ border: 'none', borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: 700, background: 'var(--surface)', color: 'var(--ink)' }}>Keep</button>
                  <button onClick={() => actions.removeCat(c.id)} style={{ border: 'none', borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: 700, background: 'var(--danger)', color: 'var(--on)' }}>Remove</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={s.newCatName} onChange={e => set({ newCatName: e.target.value })} onKeyDown={e => e.key === 'Enter' && actions.addCat()} placeholder="New category, e.g. Pets" style={{ flex: 1, minWidth: 0, border: '2px dashed var(--line3)', background: 'transparent', borderRadius: 14, padding: '12px 14px', fontSize: 16, color: 'var(--ink)', outline: 'none' }} />
        <button aria-disabled={!addOk} onClick={actions.addCat} style={{ border: 'none', borderRadius: 19, padding: '12px 18px', fontSize: 15, fontWeight: 700, background: primaryBg(addOk), color: 'var(--on)', flexShrink: 0 }}>Add</button>
      </div>
      <button className="btn-primary" onClick={actions.saveBudget} style={{ background: 'var(--accent)', border: '3px solid var(--bd)', boxShadow: 'var(--sh-sm)' }}>Save budget</button>
    </div>
  );
}

function SettingsSheet() {
  const { s, set, dark, actions } = useApp();
  const setF = (k: string, v: string) => set(x => ({ form: { ...x.form, [k]: v } }));
  const lenOk = s.form.type !== 'custom' || (parseInt(s.form.len, 10) >= 1 && parseInt(s.form.len, 10) <= 90 && !!s.form.start);
  const sub = { fontSize: 14, fontWeight: 600, color: 'var(--muted)' } as const;
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 12, borderTop: '1px solid var(--line)' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={sub}>Appearance</div>
        <Seg variant="lift" className="seg" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', borderRadius: 22 }} value={s.theme} options={[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match device']] as const} onPick={v => set({ theme: v })} btn={{ borderRadius: 16, padding: '12px 8px', minHeight: 44, fontSize: 14 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
        <div style={sub}>Customise theme</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Headline font</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
          {Object.entries(FONTS).map(([id, fo]) => {
            const on = s.uiFont === id;
            return (
              <button key={id} aria-pressed={on} onClick={() => set({ uiFont: id })} style={{ border: '2px solid ' + (on ? 'var(--bd)' : 'transparent'), background: on ? 'var(--accent-soft)' : 'var(--soft)', borderRadius: 16, padding: '10px 8px', minHeight: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: 'var(--ink)' }}>
                <span style={{ fontFamily: fo.ff, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>Aa 12</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{id}</span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, paddingTop: 4 }}>Background</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
          {Object.entries(BGS).map(([id, bg]) => {
            const on = s.uiBg === id;
            return (
              <button key={id} aria-pressed={on} onClick={() => set({ uiBg: id })} style={{ border: '2px solid ' + (on ? 'var(--bd)' : 'var(--line2)'), background: 'var(--surface)', borderRadius: 16, padding: '6px 6px 8px', display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--ink)' }}>
                <span style={{ height: 44, borderRadius: 11, background: bg[dark ? 1 : 0] }} />
                <span style={{ fontSize: 12, fontWeight: on ? 800 : 600 }}>{on ? '✓ ' : ''}{id}</span>
              </button>
            );
          })}
        </div>
      </div>
      <label className="label-col">Currency
        <select value={s.form.currency || s.currency} onChange={e => setF('currency', e.target.value)} style={{ border: 'none', background: 'var(--soft)', borderRadius: 14, padding: '14px 16px', fontSize: 16, fontWeight: 600, color: 'var(--ink)', outline: 'none', width: '100%' }}>
          {CUR.map(c => <option key={c.code} value={c.code}>{c.code + ' · ' + c.name + ' (' + c.sym.trim() + ')'}</option>)}
        </select>
      </label>
      <div style={{ ...sub, paddingTop: 6 }}>Budget period</div>
      {PERIOD_OPTS.map(o => (
        <RadioCard key={o.id} on={s.form.type === o.id} onClick={() => setF('type', o.id as PeriodType)} offRing="var(--line)" style={{ padding: '14px 16px' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 16, fontWeight: 600 }}>{o.name}</span><span className="muted" style={{ fontSize: 13 }}>{o.sub}</span></span>
        </RadioCard>
      ))}
      {s.form.type === 'custom' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
          <label className="label-col">Starts on<input className="field" type="date" value={s.form.start || ''} onChange={e => setF('start', e.target.value)} style={{ padding: '13px 14px', fontSize: 16 }} /></label>
          <label className="label-col">Length in days<input className="field" value={s.form.len || ''} onChange={e => setF('len', intOnly(e.target.value))} inputMode="numeric" placeholder="e.g. 10" style={{ padding: '13px 14px', fontSize: 16 }} /></label>
        </div>
      )}
      <div className="muted pretty" style={{ fontSize: 14 }}>Your monthly income, bills, debt and savings get split evenly across each period, so the number stays steady.</div>
      <button className="btn-primary" aria-disabled={!lenOk} onClick={actions.saveSettings} style={{ background: primaryBg(lenOk) }}>Save</button>
      <div style={row}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15, fontWeight: 600 }}>Download a backup</span><span className="muted" style={{ fontSize: 13 }}>Your budget is saved only in this browser. A backup file keeps it safe. {s.lastBackup != null ? 'Last backup: ' + (s.lastBackup === TODAY ? 'today' : fmtD(s.lastBackup)) + '.' : 'No backup yet.'}</span></div>
        <button className="btn-tonal" onClick={actions.downloadBackup}>Download</button>
      </div>
      <div style={row}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15, fontWeight: 600 }}>Restore from a backup</span><span className="muted" style={{ fontSize: 13 }}>Pick a backup file. You’ll see what’s in it before anything changes.</span></div>
        <label className="btn-tonal" style={{ cursor: 'pointer' }}>Choose file
          <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) actions.chooseRestore(file); }} />
        </label>
      </div>
      <div style={row}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15, fontWeight: 600 }}>Run setup again</span><span className="muted" style={{ fontSize: 13 }}>Walk through income, bills, debts, savings and your plan again. Your logged spending stays.</span></div>
        <button className="btn-tonal" onClick={() => set({ sheet: null, ob: actions.obInit() })}>Start</button>
      </div>
      <div style={row}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15, fontWeight: 600 }}>Reset to test data</span><span className="muted" style={{ fontSize: 13 }}>{s.confirmReset ? 'This replaces everything you’ve entered. Tap again to confirm.' : 'Swap your data for the sample budget.'}</span></div>
        <button onClick={actions.resetTest} style={{ background: s.confirmReset ? 'var(--danger)' : 'var(--danger-soft)', color: s.confirmReset ? 'var(--on)' : 'var(--danger)', border: 'none', borderRadius: 999, padding: '10px 16px', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{s.confirmReset ? 'Yes, reset' : 'Reset'}</button>
      </div>
    </div>
  );
}

/** Shows what's in a chosen backup file and asks before replacing everything. */
function RestoreSheet() {
  const { s, set, actions } = useApp();
  const r = s.restore;
  if (!r) return null;
  if (!r.ok) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--danger-soft)', borderRadius: 22, padding: '14px 16px', fontSize: 15 }}>{r.error}</div>
      <button className="btn-primary" onClick={() => set({ restore: null, sheet: null })} style={{ background: 'var(--accent)' }}>OK</button>
    </div>
  );
  const v = buildView({ ...emptyLists(), cats: [], ...(r.data as Partial<Persisted>) });
  const when = r.exportedAt ? new Date(r.exportedAt) : null;
  const n = (k: number, one: string, many = one + 's') => k + ' ' + (k === 1 ? one : many);
  const lines = [
    n(v.txns.length, 'transaction'), n(v.bills.length, 'bill'), n(v.incomes.length, 'income source'),
    n(v.debts.length, 'debt'), n(v.goals.length, 'saving goal'), n(v.cats.length, 'category', 'categories')
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--soft)', borderRadius: 22, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Backup{when ? ' from ' + when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</div>
        <div className="muted" style={{ fontSize: 14 }}>{lines.join(' · ')} · currency {String((r.data as { currency?: string }).currency || 'USD')}</div>
      </div>
      <div className="pretty" style={{ background: 'var(--danger-soft)', borderRadius: 22, padding: '14px 16px', fontSize: 14 }}>
        Restoring replaces everything in the app on this device with this backup. If you might want today’s data back, download a backup of it first.
      </div>
      <button className="btn-tonal" onClick={actions.downloadBackup} style={{ alignSelf: 'flex-start' }}>Download current data first</button>
      <button className="btn-primary" onClick={actions.confirmRestore} style={{ background: 'var(--danger)' }}>Replace with this backup</button>
    </div>
  );
}
