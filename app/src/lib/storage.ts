/**
 * All reading and writing of saved data goes through here.
 *
 * Two things are saved, under separate keys:
 * - data:  the budget itself (bills, spending, debts…), inside a versioned envelope. This is what a backup
 *          or (later) sync carries.
 * - prefs: this device's look and layout (theme, font, web/mobile…). Never part of a backup or sync.
 *
 * Money is saved as whole cents (hundredths) so totals are exact everywhere; the app works in normal
 * amounts and converts on the way in and out (toStored / fromStored).
 *
 * Saved data is never thrown away because the app changed. Each schema change gets a converter in MIGRATIONS,
 * and older data is upgraded step by step on load (a copy of the old version is kept first).
 */
import { BASE_CATS } from './data';
import { HIST, TODAY } from './dates';

/** Current data schema. Bump this and add a converter to MIGRATIONS whenever the saved shape changes. */
export const SCHEMA = 3;

const DATA_KEY = 'steady.data';
const REV_KEY = 'steady.data.rev';
const PREFS_KEY = 'steady.prefs';
/** Before schema 2 everything (data and prefs) was saved together under this key. */
const LEGACY_KEY = 'steady.candypop.v1';
const backupKey = (schema: number) => 'steady.backup.schema' + schema;
const BACKUP_APP = 'steady-budget';

// Which saved fields are budget data and which are this device's preferences.
export const DATA_FIELDS = ['currency', 'onboarded', 'isSample', 'cats', 'incomes', 'incomeTxns', 'bills', 'billPaid', 'debts', 'debtPayments',
  'goals', 'goalDeposits', 'txns', 'periodType', 'customStart', 'customLen', 'debtStrategy', 'debtExtra', 'startedAt'] as const;
export const PREF_FIELDS = ['theme', 'uiFont', 'uiBg', 'tab', 'view', 'excluded', 'chartMode', 'catView', 'showHowDebt', 'lastBackup', 'backupSnooze'] as const;

type Raw = Record<string, unknown>;
type Row = Record<string, unknown>;
interface Envelope { schema: number; savedAt: string; data: Raw }

/** Money fields in the current (schema 3) layout: list name → fields. `''` means top-level fields. */
const MONEY: Record<string, string[]> = {
  cats: ['budget'], incomes: ['amount'], incomeTxns: ['amt'], bills: ['amount'], debts: ['opening', 'original', 'min'],
  debtPayments: ['amt'], goals: ['start', 'target', 'monthly'], goalDeposits: ['amt'], txns: ['amt'], '': ['debtExtra']
};
function mapMoney(d: Raw, fn: (n: number) => number): Raw {
  const out: Raw = { ...d };
  for (const [list, fields] of Object.entries(MONEY)) {
    const conv = (r: Row) => { const o = { ...r }; fields.forEach(k => { if (typeof o[k] === 'number') o[k] = fn(o[k] as number); }); return o; };
    if (list === '') Object.assign(out, conv(out));
    else if (Array.isArray(out[list])) out[list] = (out[list] as Row[]).map(conv);
  }
  return out;
}
/** App amounts → saved whole cents. */
const toStored = (d: Raw) => mapMoney(d, n => Math.round(n * 100));
/** Saved whole cents → app amounts. */
const fromStored = (d: Raw) => mapMoney(d, n => n / 100);

/**
 * Converters from schema N to N+1, keyed by N. Each takes the saved data object and returns the upgraded one.
 * Never edit a converter once released; add a new one instead.
 */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  // 1 → 2: add startedAt (the first day the budget has data), taken from the earliest logged entry.
  1: d => {
    if (d.startedAt == null) {
      const days = [...((d.txns as { d: number }[]) || []), ...((d.incomeTxns as { d: number }[]) || [])].map(t => t.d);
      d.startedAt = Math.max(HIST, Math.min(TODAY, ...days));
    }
    return d;
  },
  // 2 → 3: records ready for sync, and money in whole cents.
  // - each category carries its own budget (was a separate budgets table)
  // - paid ticks become records (was a list of "billId:year-month" keys)
  // - a debt keeps its opening balance and payments are separate records (balance was overwritten)
  // - a goal keeps its starting amount and deposits are separate records (saved was overwritten)
  2: d => {
    const budgets = (d.budgets || {}) as Record<string, number>;
    const cats = (Array.isArray(d.cats) && d.cats.length ? d.cats : BASE_CATS) as Row[];
    const out: Raw = { ...d };
    delete out.budgets; delete out.paidKeys;
    out.cats = cats.map(c => ({ ...c, budget: budgets[c.id as string] ?? 0 }));
    out.billPaid = ((d.paidKeys || []) as string[]).map(k => { const i = k.lastIndexOf(':'); return { id: k, billId: k.slice(0, i), ym: k.slice(i + 1), paid: true }; });
    out.debts = ((d.debts || []) as Row[]).map(({ balance, ...rest }) => ({ ...rest, opening: balance }));
    out.debtPayments = [];
    out.goals = ((d.goals || []) as Row[]).map(({ saved, ...rest }) => ({ ...rest, start: saved }));
    out.goalDeposits = [];
    if (out.isSample == null) out.isSample = false;
    return toStored(out);
  }
};

/** Upgrade saved data from schema `from` to the current schema. Throws if it's from a newer app version. */
export function migrate(from: number, data: Raw): Raw {
  if (from > SCHEMA) throw new Error('newer');
  let d = { ...data };
  for (let v = from; v < SCHEMA; v++) d = MIGRATIONS[v](d);
  return d;
}

const pick = (src: Raw, fields: readonly string[]) => { const o: Raw = {}; fields.forEach(k => { if (k in src) o[k] = src[k]; }); return o; };

function read(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, v: string) { try { localStorage.setItem(key, v); return true; } catch { return false; } }

// The revision this tab last loaded or saved. If storage has moved on, another tab wrote in between.
let knownRev = 0;
// Set when the saved data comes from a newer app version: this tab must not write an older format over it.
let readOnly = false;
const storedRev = () => parseInt(read(REV_KEY) || '0', 10) || 0;

function writeStored(stored: Raw) {
  const env: Envelope = { schema: SCHEMA, savedAt: new Date().toISOString(), data: stored };
  if (!write(DATA_KEY, JSON.stringify(env))) return;
  knownRev = storedRev() + 1;
  write(REV_KEY, String(knownRev));
}

export interface Loaded { data: Raw | null; prefs: Raw | null; notice?: [string, string] }

/** Load saved data and prefs, upgrading older formats. Returns nulls when nothing is saved yet. */
export function load(): Loaded {
  let raw = read(DATA_KEY), prefs: Raw | null = null;
  try { prefs = JSON.parse(read(PREFS_KEY) || 'null'); } catch { /* ignore broken prefs */ }

  // One-time move from the old single-key format (schema 1): split data from prefs, keep a copy.
  if (raw == null) {
    const legacy = read(LEGACY_KEY);
    if (legacy != null) {
      try {
        const old = JSON.parse(legacy) as Raw;
        write(backupKey(1), legacy);
        prefs = prefs || pick(old, PREF_FIELDS);
        raw = JSON.stringify({ schema: 1, savedAt: new Date().toISOString(), data: pick(old, [...DATA_FIELDS, 'budgets', 'paidKeys']) });
        write(PREFS_KEY, JSON.stringify(prefs));
      } catch { raw = legacy; }
      try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    }
  }
  if (raw == null) return { data: null, prefs };

  let env: Envelope;
  try { env = JSON.parse(raw); if (!env || typeof env.schema !== 'number' || !env.data) throw new Error('shape'); }
  catch {
    // Unreadable: keep the raw text somewhere safe rather than overwriting it, then start fresh.
    write('steady.unreadable.' + Date.now(), raw);
    try { localStorage.removeItem(DATA_KEY); } catch { /* ignore */ }
    return { data: null, prefs, notice: ['We couldn’t read your saved data', 'A copy was kept. Starting fresh for now.'] };
  }

  if (env.schema > SCHEMA) {
    // Saved by a newer version of the app (e.g. another tab already updated). Don't touch it.
    readOnly = true;
    return { data: fromStored(env.data), prefs, notice: ['A newer version is available', 'Reload the page to update.'] };
  }
  let stored = env.data;
  knownRev = storedRev();
  if (env.schema < SCHEMA) {
    if (read(backupKey(env.schema)) == null) write(backupKey(env.schema), raw);
    stored = migrate(env.schema, stored);
    writeStored(stored);
  }
  return { data: fromStored(stored), prefs };
}

/**
 * Save the budget data. Returns 'conflict' (and writes nothing) if another tab saved since this tab
 * last loaded or saved, so one tab can never silently overwrite the other's changes.
 */
export function saveData(data: Raw): 'ok' | 'conflict' {
  if (readOnly) return 'ok';
  if (storedRev() !== knownRev) return 'conflict';
  writeStored(toStored(pick(data, DATA_FIELDS)));
  return 'ok';
}

export function savePrefs(prefs: Raw) { write(PREFS_KEY, JSON.stringify(pick(prefs, PREF_FIELDS))); }

/**
 * Call `onChange` with the latest data whenever another tab saves. If that tab runs a newer
 * version of the app, reload this one so both use the same format.
 */
export function watchOtherTabs(onChange: (data: Raw) => void) {
  const fn = (e: StorageEvent) => {
    if (e.key !== REV_KEY) return;
    try {
      const env = JSON.parse(read(DATA_KEY) || 'null') as Envelope | null;
      if (!env) return;
      if (env.schema > SCHEMA) { location.reload(); return; }
      knownRev = storedRev();
      onChange(fromStored(env.schema < SCHEMA ? migrate(env.schema, env.data) : env.data));
    } catch { /* ignore */ }
  };
  window.addEventListener('storage', fn);
  return () => window.removeEventListener('storage', fn);
}

/** Ask the browser not to clear this app's data when space runs low (granted mostly for installed apps). */
export async function requestPersistence() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* not supported */ }
}

// ---------- backups ----------

/** A backup file's contents: the saved data (whole cents) with its schema, so old backups restore into newer apps. */
export function makeBackup(data: Raw) {
  const text = JSON.stringify({ app: BACKUP_APP, kind: 'backup', schema: SCHEMA, exportedAt: new Date().toISOString(), data: toStored(pick(data, DATA_FIELDS)) }, null, 1);
  const d = new Date(), pad = (n: number) => String(n).padStart(2, '0');
  return { text, filename: `steady-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json` };
}

export type ParsedBackup = { ok: true; data: Raw; exportedAt: string } | { ok: false; error: string };

/** Read a backup file, upgrading it if it came from an older version of the app. */
export function parseBackup(text: string): ParsedBackup {
  let f: { app?: string; schema?: number; exportedAt?: string; data?: Raw };
  try { f = JSON.parse(text); } catch { return { ok: false, error: 'This file isn’t a Steady backup (it couldn’t be read).' }; }
  if (!f || f.app !== BACKUP_APP || typeof f.schema !== 'number' || !f.data || typeof f.data !== 'object') return { ok: false, error: 'This file isn’t a Steady backup.' };
  if (f.schema > SCHEMA) return { ok: false, error: 'This backup was made with a newer version of the app. Reload the page to update, then try again.' };
  try { return { ok: true, data: fromStored(migrate(f.schema, f.data)), exportedAt: f.exportedAt || '' }; }
  catch { return { ok: false, error: 'This backup couldn’t be converted. It may be damaged.' }; }
}
