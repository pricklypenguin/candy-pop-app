import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CAT_PALETTE, FORMS, FREQ, PERIOD_OPTS, obFresh, paidKey, seed, type FormKind, type Onboarding, type Persisted, type Tab } from './lib/data';
import { HIST, TODAY, fromIso, isoOf, ord } from './lib/dates';
import { curOf, fmtWith } from './lib/money';
import { catsOf, leftFor, nextPayOf, period } from './lib/model';
import { DEFAULT_BG, DEFAULT_FONT, applyTheme, resolveDark, type ThemePref } from './lib/theme';

const KEY = 'steady.candypop.v1';
const SEED_VER = 1;

export type Sheet =
  | { mode: 'spend' }
  | { mode: 'goal'; id: string }
  | { mode: 'debt'; id: string }
  | { mode: 'form'; kind: FormKind; editId?: string }
  | { mode: 'budget' }
  | { mode: 'settings' };

export interface Calc { name: string; target: string; start: string; mode: 'pay' | 'time'; monthly: number; months: number }
export const CALC_DEFAULT: Calc = { name: '', target: '2000', start: '0', mode: 'pay', monthly: 100, months: 12 };

interface Prefs { tab: Tab; view: 'web' | 'mobile'; theme: ThemePref; uiFont: string; uiBg: string; seedVer: number }
interface Transient {
  ob: Onboarding | null; sheet: Sheet | null; entry: string; note: string; selCat: string;
  toast: { title: string; sub: string } | null; showBreakdown: boolean; openCat: string | null;
  form: Record<string, string>; offset: number; logType: 'spend' | 'income';
  confirmReset: boolean; confirmRemove: boolean; confirmCat: string | null; newCatName: string; calc: Calc | null;
  recentShown: number;
}
export type State = Persisted & Prefs & Transient;

const PERSIST: (keyof Persisted | keyof Prefs)[] = ['seedVer', 'theme', 'uiFont', 'uiBg', 'currency', 'onboarded', 'cats', 'tab', 'view', 'incomes', 'incomeTxns', 'budgets', 'bills', 'paidKeys', 'debts', 'goals', 'txns', 'periodType', 'customStart', 'customLen', 'excluded', 'chartMode', 'catView', 'debtStrategy', 'debtExtra', 'showHowDebt', 'startedAt'];

export const RECENT_PAGE = 8;

const TRANSIENT: Omit<Transient, 'ob'> = {
  sheet: null, entry: '', note: '', selCat: 'groceries', toast: null, showBreakdown: false, openCat: null,
  form: {}, offset: 0, logType: 'spend', confirmReset: false, confirmRemove: false, confirmCat: null, newCatName: '', calc: null, recentShown: RECENT_PAGE
};

function load(): State {
  let saved: Partial<State> | null = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* private mode etc. */ }
  if (saved && saved.seedVer !== SEED_VER) saved = null;
  const prefs: Prefs = { tab: 'home', view: 'web', theme: 'light', uiFont: DEFAULT_FONT, uiBg: DEFAULT_BG, seedVer: SEED_VER };
  // Data saved before startedAt existed: start from the earliest logged entry.
  if (saved && saved.startedAt == null) {
    const days = [...(saved.txns || []), ...(saved.incomeTxns || [])].map(t => t.d);
    saved.startedAt = Math.max(HIST, Math.min(TODAY, ...days));
  }
  const base = Object.assign(prefs, seed(), saved || {}, { seedVer: SEED_VER });
  return { ...base, ...TRANSIENT, ob: base.onboarded ? null : obFresh() };
}

type Patch = Partial<State> | ((s: State) => Partial<State> | null);

function useAppState() {
  const [s, setS] = useState<State>(load);
  const [, force] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);

  const set = useCallback((p: Patch) => setS(prev => {
    const u = typeof p === 'function' ? p(prev) : p;
    return u ? { ...prev, ...u } : prev;
  }), []);

  // Persist everything except transient UI state.
  useEffect(() => {
    const keep: Record<string, unknown> = {};
    PERSIST.forEach(k => keep[k] = s[k]);
    try { localStorage.setItem(KEY, JSON.stringify(keep)); } catch { /* ignore */ }
  }, [s]);

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
  const f = (n: number) => fmtWith(cur, n);

  const toast = (title: string, sub: string) => {
    clearTimeout(toastTimer.current);
    set({ toast: { title, sub } });
    toastTimer.current = window.setTimeout(() => set({ toast: null }), 2800);
  };

  /** Apply a patch, then show a toast computed from the resulting state. */
  const commit = (p: (s: State) => Partial<State>, msg: (next: State) => [string, string]) => {
    const next = { ...s, ...p(s) };
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
        commit(x => ({ incomeTxns: [{ id: 'x' + Date.now(), amt, note: x.note.trim(), d: TODAY }, ...x.incomeTxns], sheet: null }),
          n => ['Added ' + f(amt) + ' income', f(Math.max(0, leftFor(n, period(n, 0)))) + ' left to spend now']);
      } else if (sh.mode === 'spend') {
        const cats = catsOf(s), cat = cats.find(c => c.id === s.selCat) || cats[0];
        commit(x => ({ txns: [{ id: 't' + Date.now(), amt, cat: cat.id, note: x.note.trim(), d: TODAY }, ...x.txns], sheet: null }),
          n => { const left = leftFor(n, period(n, 0)); return ['Logged ' + f(amt) + ' · ' + cat.name, left >= 0 ? f(left) + ' left to spend' : 'You\'re ' + f(-left) + ' over this period']; });
      } else if (sh.mode === 'goal') {
        const g = s.goals.find(x => x.id === sh.id)!;
        set(x => ({ goals: x.goals.map(y => y.id === sh.id ? { ...y, saved: y.saved + amt } : y), sheet: null }));
        toast('Added ' + f(amt) + ' to ' + g.name, f(Math.max(0, g.target - g.saved - amt)) + ' to go');
      } else if (sh.mode === 'debt') {
        const d = s.debts.find(x => x.id === sh.id)!, nb = Math.max(0, d.balance - amt);
        set(x => ({ debts: x.debts.map(y => y.id === sh.id ? { ...y, balance: nb } : y), sheet: null }));
        toast('Paid ' + f(amt) + ' on ' + d.name, nb ? f(nb) + ' left' : 'Paid off. Huge.');
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
      const fm = s.form, n = (k: string) => parseFloat(fm[k]) || 0, name = fm.name.trim(), id = Date.now(), eid = sh.editId, kind = sh.kind;
      if (eid && kind === 'debt') {
        set(x => ({ debts: x.debts.map(d => d.id === eid ? { ...d, name, balance: n('balance'), original: Math.max(d.original, n('balance')), min: n('min'), rate: n('rate') } : d), sheet: null }));
        toast(name + ' updated', 'Your payoff plan is recalculated');
      } else if (eid && kind === 'goal') {
        set(x => ({ goals: x.goals.map(g => g.id === eid ? { ...g, name, target: n('target'), monthly: n('monthly'), saved: n('saved') } : g), sheet: null }));
        toast(name + ' updated', f(n('monthly')) + ' a month set aside');
      } else if (kind === 'income') {
        const inc = { id: 'i' + id, name, amount: n('amount'), freq: fm.freq as keyof typeof FREQ, anchor: fromIso(fm.next)! };
        set(x => ({ incomes: [...x.incomes, inc], sheet: null }));
        toast(name + ' added', 'About ' + f(Math.round(inc.amount * FREQ[inc.freq].mult)) + ' a month');
      } else if (kind === 'bill') {
        const day = parseInt(fm.day, 10), bid = 'b' + id;
        set(x => ({ bills: [...x.bills, { id: bid, name, amount: n('amount'), day, addedOn: TODAY }], sheet: null }));
        toast(name + ' added', 'Due on the ' + day + ord(day) + ' each month');
      } else if (kind === 'debt') {
        set(x => ({ debts: [...x.debts, { id: 'd' + id, name, balance: n('balance'), original: n('balance'), min: n('min'), rate: n('rate') }], sheet: null }));
        toast(name + ' added', f(n('min')) + ' a month is now set aside');
      } else {
        set(x => ({ goals: [...x.goals, { id: 'g' + id, name, target: n('target'), monthly: n('monthly'), saved: n('saved') }], sheet: null }));
        toast(name + ' added', f(n('monthly')) + ' a month is now set aside');
      }
    },

    removeItem: () => {
      const sh = s.sheet;
      if (!sh || sh.mode !== 'form' || !sh.editId) return;
      if (!s.confirmRemove) return set({ confirmRemove: true });
      const isDebt = sh.kind === 'debt', item = (isDebt ? s.debts : s.goals).find(x => x.id === sh.editId);
      set(x => isDebt ? { debts: x.debts.filter(d => d.id !== sh.editId), sheet: null, confirmRemove: false } : { goals: x.goals.filter(g => g.id !== sh.editId), sheet: null, confirmRemove: false });
      toast((item ? item.name : 'Item') + ' removed', isDebt ? 'Its payment is no longer set aside' : 'Its monthly amount is back in your left to spend');
    },

    addCat: () => {
      const cats = catsOf(s), name = s.newCatName.trim();
      if (!name || cats.some(c => c.name.toLowerCase() === name.toLowerCase())) return;
      const used = cats.map(c => c.color), color = CAT_PALETTE.find(p => !used.includes(p)) || CAT_PALETTE[cats.length % CAT_PALETTE.length];
      const cat = { id: 'c' + Date.now(), name, color };
      set(x => ({ cats: [...catsOf(x), cat], newCatName: '', form: { ...x.form, [cat.id]: '0' } }));
      toast(name + ' added', 'Set how much you plan to spend on it');
    },

    removeCat: (id: string) => {
      const cats = catsOf(s);
      if (cats.length <= 1) return;
      const cat = cats.find(c => c.id === id)!, rest = cats.filter(c => c.id !== id), to = rest.find(c => c.id === 'other') || null;
      const budgets = { ...s.budgets }; delete budgets[id];
      const form = { ...s.form }; delete form[id];
      set({ cats: rest, budgets, form, confirmCat: null, selCat: s.selCat === id ? rest[0].id : s.selCat,
        excluded: s.excluded.filter(e => e !== id), txns: to ? s.txns.map(t => t.cat === id ? { ...t, cat: to.id } : t) : s.txns });
      toast(cat.name + ' removed', to ? 'Its spending moved to ' + to.name : 'Its spending shows as Uncategorised');
    },

    saveBudget: () => {
      const pf = period(s, 0).f, budgets: Record<string, number> = {};
      catsOf(s).forEach(c => budgets[c.id] = (parseFloat(s.form[c.id]) || 0) / pf);
      set({ budgets, sheet: null });
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

    toggleBill: (id: string) => {
      const k = paidKey(id);
      set(x => ({ paidKeys: x.paidKeys.includes(k) ? x.paidKeys.filter(y => y !== k) : [...x.paidKeys, k] }));
    },

    resetTest: () => {
      if (!s.confirmReset) return set({ confirmReset: true });
      set({ ...seed(), onboarded: true, currency: s.currency, tab: 'home', view: s.view, offset: 0, ob: null, sheet: null, confirmReset: false, openCat: null, showBreakdown: false });
      toast('Test data loaded', 'Sample budget is back');
    },

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

  return { s, set, f, cur, dark, toast, actions };
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
