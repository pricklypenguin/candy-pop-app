import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CAT_PALETTE, FORMS, FREQ, PERIOD_OPTS, emptyLists, obFresh, paidKey, remove, seed, touch, uid, ymOf, type FormKind, type Onboarding, type Persisted, type Tab } from './lib/data';
import { CUR_M, CUR_Y, TODAY, fromIso, isoOf, ord } from './lib/dates';
import { curOf, fmtExact, fmtWith } from './lib/money';
import { buildView, catsOf, leftFor, nextPayOf, period, type View } from './lib/model';
import * as storage from './lib/storage';
import { DATA_FIELDS, PREF_FIELDS, type ParsedBackup } from './lib/storage';
import { DEFAULT_BG, DEFAULT_FONT, applyTheme, resolveDark, type ThemePref } from './lib/theme';

export type Sheet =
  | { mode: 'spend' }
  | { mode: 'goal'; id: string }
  | { mode: 'debt'; id: string }
  | { mode: 'form'; kind: FormKind; editId?: string }
  | { mode: 'budget' }
  | { mode: 'settings' }
  | { mode: 'restore' };

export interface Calc { name: string; target: string; start: string; mode: 'pay' | 'time'; monthly: number; months: number }
export const CALC_DEFAULT: Calc = { name: '', target: '2000', start: '0', mode: 'pay', monthly: 100, months: 12 };

// lastBackup: day of the last downloaded backup; backupSnooze: don't remind before this day.
interface Prefs { tab: Tab; view: 'web' | 'mobile'; theme: ThemePref; uiFont: string; uiBg: string; lastBackup?: number; backupSnooze?: number }
interface Transient {
  ob: Onboarding | null; sheet: Sheet | null; entry: string; note: string; selCat: string;
  toast: { title: string; sub: string } | null; showBreakdown: boolean; openCat: string | null;
  form: Record<string, string>; offset: number; logType: 'spend' | 'income';
  confirmReset: boolean; confirmRemove: boolean; confirmCat: string | null; newCatName: string; calc: Calc | null;
  recentShown: number; restore: ParsedBackup | null;
}
/** Everything the app holds: saved records, device prefs and transient UI state. */
export type State = Persisted & Prefs & Transient;
/** What screens read: State with the saved records swapped for the computed view (live items, balances). */
export type Shown = Omit<State, keyof View> & View;
const withView = (st: State): Shown => ({ ...st, ...buildView(st) });

export const RECENT_PAGE = 8;

const TRANSIENT: Omit<Transient, 'ob'> = {
  sheet: null, entry: '', note: '', selCat: 'groceries', toast: null, showBreakdown: false, openCat: null,
  form: {}, offset: 0, logType: 'spend', confirmReset: false, confirmRemove: false, confirmCat: null, newCatName: '', calc: null, recentShown: RECENT_PAGE, restore: null
};

const PREF_DEFAULTS: Prefs = { tab: 'home', view: 'web', theme: 'light', uiFont: DEFAULT_FONT, uiBg: DEFAULT_BG };

/** Initial state: saved data if there is any (missing lists default to empty), otherwise the sample budget. */
function load(): { state: State; notice?: [string, string]; hadData: boolean; hadPrefs: boolean } {
  const l = storage.load();
  const base = { ...PREF_DEFAULTS, ...seed(), ...(l.data ? emptyLists() : null), ...l.prefs, ...l.data } as Persisted & Prefs;
  return { state: { ...base, ...TRANSIENT, ob: base.onboarded ? null : obFresh() }, notice: l.notice, hadData: !!l.data, hadPrefs: !!l.prefs };
}

type Fields = Record<string, unknown>;
const pickFields = (src: object, fields: readonly string[]) => { const o: Fields = {}; fields.forEach(k => o[k] = (src as Fields)[k]); return o; };
const changed = (s: object, last: Fields, fields: readonly string[]) => fields.some(k => (s as Fields)[k] !== last[k]);

type Patch = Partial<State> | ((s: State) => Partial<State> | null);

function useAppState() {
  const [initial] = useState(load);
  const [raw, setS] = useState<State>(initial.state);
  const s = useMemo(() => withView(raw), [raw]);
  const [, force] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);
  // What was last written (or loaded), so only real changes are saved.
  const lastSaved = useRef<{ data: Fields; prefs: Fields }>({
    data: initial.hadData ? pickFields(initial.state, DATA_FIELDS) : {},
    prefs: initial.hadPrefs ? pickFields(initial.state, PREF_FIELDS) : {}
  });

  /** Update state. A function patch receives the saved records (not the computed view). */
  const set = useCallback((p: Patch) => setS(prev => {
    const u = typeof p === 'function' ? p(prev) : p;
    return u ? { ...prev, ...u } : prev;
  }), []);

  /** Replace the budget data with a newer copy (from another tab), keeping what's on screen. */
  const applyExternal = useCallback((data: Fields) => {
    const full = { ...emptyLists(), ...data } as Partial<State>;
    lastSaved.current.data = pickFields(full, DATA_FIELDS);
    set(x => ({ ...full, ob: full.onboarded ? null : x.ob }));
  }, [set]);

  // Save budget data and device prefs when they change. Transient UI state is never saved.
  useEffect(() => {
    const last = lastSaved.current;
    if (changed(raw, last.data, DATA_FIELDS)) {
      if (storage.saveData(raw as unknown as Fields) === 'conflict') {
        // Another tab saved first: load its version instead of overwriting it.
        const latest = storage.load().data;
        if (latest) {
          applyExternal(latest);
          toast('Updated from another tab', 'Your last change here wasn’t saved. Please do it again.');
          return;
        }
      }
      last.data = pickFields(raw, DATA_FIELDS);
    }
    if (changed(raw, last.prefs, PREF_FIELDS)) { storage.savePrefs(raw as unknown as Fields); last.prefs = pickFields(raw, PREF_FIELDS); }
  }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick up changes saved by the app in another tab.
  useEffect(() => storage.watchOtherTabs(applyExternal), [applyExternal]);
  useEffect(() => { if (initial.notice) toast(...initial.notice); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Once there's a real budget, ask the browser to keep it even when space runs low.
  useEffect(() => { if (raw.onboarded && !raw.isSample) storage.requestPersistence(); }, [raw.onboarded, raw.isSample]);

  const dark = resolveDark(s.theme);
  useEffect(() => { applyTheme(dark, s.uiFont, s.uiBg); }, [dark, s.uiFont, s.uiBg]);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = matchMedia('(prefers-color-scheme: dark)'), fn = () => force(x => x + 1);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const cur = curOf(s.currency);
  /** Rounded amount, for headline numbers and totals. */
  const f = (n: number) => fmtWith(cur, n);
  /** Exact amount with cents, for single transactions, bills and breakdowns. */
  const fx = (n: number) => fmtExact(cur, n);

  const toast = (title: string, sub: string) => {
    clearTimeout(toastTimer.current);
    set({ toast: { title, sub } });
    toastTimer.current = window.setTimeout(() => set({ toast: null }), 2800);
  };

  /** Apply a patch, then show a toast computed from the resulting state. */
  const commit = (p: (st: State) => Partial<State>, msg: (next: Shown) => [string, string]) => {
    const next = withView({ ...raw, ...p(raw) });
    set(p);
    const [t, sub] = msg(next);
    toast(t, sub);
  };

  const open = (sheet: Sheet, extra?: Partial<State>) =>
    set({ sheet, entry: '', note: '', form: {}, logType: 'spend', confirmReset: false, confirmRemove: false, ...extra });

  const actions = {
    open,
    closeSheet: () => set({ sheet: null }),
    openLog: (selCat?: string) => open({ mode: 'spend' }, selCat ? { selCat } : undefined),
    openAddIncome: () => open({ mode: 'form', kind: 'income' }, { form: { freq: 'biweekly', next: isoOf(TODAY + 7) } }),
    openBudget: () => {
      const pf = period(s, 0).f, form: Record<string, string> = {};
      catsOf(s).forEach(c => form[c.id] = String(Math.round((s.budgets[c.id] || 0) * pf)));
      open({ mode: 'budget' }, { form });
    },
    openSettings: () => open({ mode: 'settings' }, { form: { currency: s.currency, type: s.periodType, start: isoOf(s.customStart), len: String(s.customLen) } }),

    press: (k: string) => set(x => {
      let e = x.entry;
      if (k === '⌫') e = e.slice(0, -1);
      else if (k === '.') { if (!e.includes('.')) e = (e || '0') + '.'; }
      else {
        if (e.includes('.') && e.split('.')[1].length >= 2) return null;
        if (e.replace('.', '').length >= 6) return null;
        e = e === '0' ? k : e + k;
      }
      return { entry: e };
    }),

    saveKeypad: () => {
      const amt = parseFloat(s.entry), sh = s.sheet;
      if (!amt || !sh) return;
      if (sh.mode === 'spend' && s.logType === 'income') {
        commit(x => ({ incomeTxns: [touch({ id: uid(), amt, note: x.note.trim(), d: TODAY }), ...x.incomeTxns], sheet: null }),
          n => ['Added ' + fx(amt) + ' income', f(Math.max(0, leftFor(n, period(n, 0)))) + ' left to spend now']);
      } else if (sh.mode === 'spend') {
        const cats = catsOf(s), cat = cats.find(c => c.id === s.selCat) || cats[0];
        commit(x => ({ txns: [touch({ id: uid(), amt, cat: cat.id, note: x.note.trim(), d: TODAY }), ...x.txns], sheet: null }),
          n => { const left = leftFor(n, period(n, 0)); return ['Logged ' + fx(amt) + ' · ' + cat.name, left >= 0 ? f(left) + ' left to spend' : 'You\'re ' + f(-left) + ' over this period']; });
      } else if (sh.mode === 'goal') {
        const g = s.goals.find(x => x.id === sh.id)!;
        set(x => ({ goalDeposits: [...x.goalDeposits, touch({ id: uid(), goalId: sh.id, amt, d: TODAY })], sheet: null }));
        toast('Added ' + fx(amt) + ' to ' + g.name, f(Math.max(0, g.target - g.saved - amt)) + ' to go');
      } else if (sh.mode === 'debt') {
        // Paying more than is owed only counts up to the balance.
        const d = s.debts.find(x => x.id === sh.id)!, pay = Math.min(amt, d.balance), nb = Math.max(0, d.balance - amt);
        set(x => ({ debtPayments: [...x.debtPayments, touch({ id: uid(), debtId: sh.id, amt: pay, d: TODAY })], sheet: null }));
        toast('Paid ' + fx(amt) + ' on ' + d.name, nb ? f(nb) + ' left' : 'Paid off. Huge.');
      }
    },

    formValid: (kind: FormKind) => FORMS[kind].fields.every(fl => {
      const v = (s.form[fl.k] || '').trim();
      if (!fl.req) return true;
      if (fl.k === 'name' || fl.choice || fl.date) return !!v;
      if (fl.k === 'day') { const d = parseInt(v, 10); return d >= 1 && d <= 31; }
      return parseFloat(v) > 0;
    }),

    saveForm: () => {
      const sh = s.sheet;
      if (!sh || sh.mode !== 'form' || !actions.formValid(sh.kind)) return;
      const fm = s.form, n = (k: string) => parseFloat(fm[k]) || 0, name = fm.name.trim(), eid = sh.editId, kind = sh.kind;
      if (eid && kind === 'debt') {
        // Editing the balance moves the opening balance, so payments already logged still count.
        const paid = raw.debtPayments.filter(p => p.debtId === eid && !p.del).reduce((a, p) => a + p.amt, 0);
        set(x => ({ debts: x.debts.map(d => d.id === eid ? touch({ ...d, name, opening: n('balance') + paid, original: Math.max(d.original, n('balance')), min: n('min'), rate: n('rate') }) : d), sheet: null }));
        toast(name + ' updated', 'Your payoff plan is recalculated');
      } else if (eid && kind === 'goal') {
        const deposited = raw.goalDeposits.filter(p => p.goalId === eid && !p.del).reduce((a, p) => a + p.amt, 0);
        set(x => ({ goals: x.goals.map(g => g.id === eid ? touch({ ...g, name, target: n('target'), monthly: n('monthly'), start: n('saved') - deposited }) : g), sheet: null }));
        toast(name + ' updated', f(n('monthly')) + ' a month set aside');
      } else if (kind === 'income') {
        const inc = touch({ id: uid(), name, amount: n('amount'), freq: fm.freq as keyof typeof FREQ, anchor: fromIso(fm.next)! });
        set(x => ({ incomes: [...x.incomes, inc], sheet: null }));
        toast(name + ' added', 'About ' + f(inc.amount * FREQ[inc.freq].mult) + ' a month');
      } else if (kind === 'bill') {
        const day = parseInt(fm.day, 10);
        set(x => ({ bills: [...x.bills, touch({ id: uid(), name, amount: n('amount'), day, addedOn: TODAY })], sheet: null }));
        toast(name + ' added', 'Due on the ' + day + ord(day) + ' each month');
      } else if (kind === 'debt') {
        set(x => ({ debts: [...x.debts, touch({ id: uid(), name, opening: n('balance'), original: n('balance'), min: n('min'), rate: n('rate') })], sheet: null }));
        toast(name + ' added', f(n('min')) + ' a month is now set aside');
      } else {
        set(x => ({ goals: [...x.goals, touch({ id: uid(), name, target: n('target'), monthly: n('monthly'), start: n('saved') })], sheet: null }));
        toast(name + ' added', f(n('monthly')) + ' a month is now set aside');
      }
    },

    removeItem: () => {
      const sh = s.sheet;
      if (!sh || sh.mode !== 'form' || !sh.editId) return;
      if (!s.confirmRemove) return set({ confirmRemove: true });
      const isDebt = sh.kind === 'debt', item = (isDebt ? s.debts : s.goals).find(x => x.id === sh.editId);
      set(x => isDebt ? { debts: x.debts.map(d => d.id === sh.editId ? remove(d) : d), sheet: null, confirmRemove: false }
        : { goals: x.goals.map(g => g.id === sh.editId ? remove(g) : g), sheet: null, confirmRemove: false });
      toast((item ? item.name : 'Item') + ' removed', isDebt ? 'Its payment is no longer set aside' : 'Its monthly amount is back in your left to spend');
    },

    removeIncome: (id: string) => set(x => ({ incomes: x.incomes.map(i => i.id === id ? remove(i) : i) })),

    addCat: () => {
      const cats = catsOf(s), name = s.newCatName.trim();
      if (!name || cats.some(c => c.name.toLowerCase() === name.toLowerCase())) return;
      const used = cats.map(c => c.color), color = CAT_PALETTE.find(p => !used.includes(p)) || CAT_PALETTE[cats.length % CAT_PALETTE.length];
      const cat = touch({ id: uid(), name, color, budget: 0 });
      set(x => ({ cats: [...x.cats, cat], newCatName: '', form: { ...x.form, [cat.id]: '0' } }));
      toast(name + ' added', 'Set how much you plan to spend on it');
    },

    // The category is marked deleted; its past spending isn't rewritten, it just shows under Other.
    removeCat: (id: string) => {
      const cats = catsOf(s);
      if (cats.length <= 1) return;
      const cat = cats.find(c => c.id === id)!, rest = cats.filter(c => c.id !== id), to = rest.find(c => c.id === 'other') || null;
      const form = { ...s.form }; delete form[id];
      set(x => ({ cats: x.cats.map(c => c.id === id ? remove(c) : c), form, confirmCat: null, selCat: x.selCat === id ? rest[0].id : x.selCat, excluded: x.excluded.filter(e => e !== id) }));
      toast(cat.name + ' removed', to ? 'Its spending now shows under ' + to.name : 'Its spending shows as Uncategorised');
    },

    saveBudget: () => {
      const pf = period(s, 0).f;
      set(x => ({ cats: x.cats.map(c => {
        if (c.del || s.form[c.id] == null) return c;
        const budget = (parseFloat(s.form[c.id]) || 0) / pf;
        return Math.abs(budget - (c.budget || 0)) < 0.005 ? c : touch({ ...c, budget });
      }), sheet: null }));
      toast('Budget saved', 'Your numbers are updated');
    },

    saveSettings: () => {
      const fm = s.form, type = fm.type as State['periodType'];
      const upd: Partial<State> = { periodType: type, currency: fm.currency || s.currency, sheet: null, offset: 0 };
      if (type === 'custom') {
        const len = parseInt(fm.len, 10), start = fromIso(fm.start);
        if (!(len >= 1 && len <= 90) || start == null) return;
        upd.customLen = len; upd.customStart = start;
      }
      set(upd);
      toast('Settings saved', PERIOD_OPTS.find(o => o.id === type)!.name + ' · ' + (fm.currency || s.currency));
    },

    // Each bill-and-month tick is its own record, so ticking and unticking on two devices can merge.
    toggleBill: (billId: string) => {
      const id = paidKey(billId);
      set(x => {
        const mark = x.billPaid.find(m => m.id === id);
        return { billPaid: mark ? x.billPaid.map(m => m.id === id ? touch({ ...m, paid: !m.paid, del: undefined }) : m)
          : [...x.billPaid, touch({ id, billId, ym: ymOf(CUR_Y, CUR_M), paid: true })] };
      });
    },

    resetTest: () => {
      if (!s.confirmReset) return set({ confirmReset: true });
      set({ ...seed(), onboarded: true, currency: s.currency, tab: 'home', view: s.view, offset: 0, ob: null, sheet: null, confirmReset: false, openCat: null, showBreakdown: false });
      toast('Test data loaded', 'Sample budget is back');
    },

    downloadBackup: () => {
      const { text, filename } = storage.makeBackup(raw as unknown as Fields);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      set({ lastBackup: TODAY, backupSnooze: undefined });
      toast('Backup downloaded', 'Keep the file somewhere safe, like your cloud drive or email.');
    },
    /** Read a chosen backup file and show what's in it before anything is replaced. */
    chooseRestore: async (file: File) => {
      const parsed = storage.parseBackup(await file.text());
      set({ restore: parsed, sheet: { mode: 'restore' } });
    },
    confirmRestore: () => {
      const r = s.restore;
      if (!r || !r.ok) return;
      set({ ...emptyLists(), ...(r.data as Partial<State>), ob: null, sheet: null, restore: null, offset: 0, openCat: null, showBreakdown: false, tab: 'home' });
      toast('Backup restored', 'Everything is back as it was in the backup.');
    },
    snoozeBackup: () => set({ backupSnooze: TODAY + 7 }),

    /** Prefill onboarding from current data for "Run setup again". */
    obInit: (): Onboarding => {
      const inc = s.incomes[0], pf = period(s, 0).f, budRaw: Record<string, string> = {};
      catsOf(s).forEach(c => budRaw[c.id] = String(Math.round((s.budgets[c.id] || 0) * pf)));
      const np = inc ? nextPayOf(inc) : null;
      return { step: 1, fresh: false, currency: s.currency, incAmt: inc ? String(inc.amount) : '', incFreq: inc ? inc.freq : 'biweekly', incNext: isoOf(np != null ? np : TODAY + 7),
        period: s.periodType, cStart: isoOf(s.customStart), cLen: String(s.customLen), bills: s.bills.map(b => ({ id: b.id, name: b.name, amount: String(b.amount), day: String(b.day) })),
        debts: s.debts.map(d => ({ id: d.id, name: d.name, balance: String(d.balance), min: String(d.min), rate: d.rate ? String(d.rate) : '' })),
        goals: s.goals.map(g => ({ id: g.id, name: g.name, target: String(g.target), monthly: String(g.monthly), saved: g.saved ? String(g.saved) : '' })), budRaw };
    }
  };

  return { s, raw, set, f, fx, cur, dark, toast, actions };
}

export type App = ReturnType<typeof useAppState>;
const Ctx = createContext<App | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const app = useAppState();
  return <Ctx.Provider value={app}>{children}</Ctx.Provider>;
}
export function useApp() {
  const app = useContext(Ctx);
  if (!app) throw new Error('useApp outside AppProvider');
  return app;
}
/** Current category list (falls back to the defaults). */
export const useCats = () => { const { s } = useApp(); return useMemo(() => catsOf(s), [s]); };
