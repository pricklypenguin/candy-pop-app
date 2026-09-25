/**
 * All reading and writing of saved data goes through here.
 *
 * Two things are saved, under separate keys:
 * - data:  the budget itself (bills, spending, debts…), inside a versioned envelope. This is what a backup
 *          or (later) sync carries.
 * - prefs: this device's look and layout (theme, font, web/mobile…). Never part of a backup or sync.
 *
 * Saved data is never thrown away because the app changed. Each schema change gets a converter in MIGRATIONS,
 * and older data is upgraded step by step on load (a copy of the old version is kept first).
 */
import { HIST, TODAY } from './dates';

/** Current data schema. Bump this and add a converter to MIGRATIONS whenever the saved shape changes. */
export const SCHEMA = 2;

const DATA_KEY = 'steady.data';
const REV_KEY = 'steady.data.rev';
const PREFS_KEY = 'steady.prefs';
/** Before schema 2 everything (data and prefs) was saved together under this key. */
const LEGACY_KEY = 'steady.candypop.v1';
const backupKey = (schema: number) => 'steady.backup.schema' + schema;

// Which saved fields are budget data and which are this device's preferences.
export const DATA_FIELDS = ['currency', 'onboarded', 'cats', 'incomes', 'incomeTxns', 'budgets', 'bills', 'paidKeys', 'debts', 'goals', 'txns',
  'periodType', 'customStart', 'customLen', 'debtStrategy', 'debtExtra', 'startedAt'] as const;
export const PREF_FIELDS = ['theme', 'uiFont', 'uiBg', 'tab', 'view', 'excluded', 'chartMode', 'catView', 'showHowDebt'] as const;

type Raw = Record<string, unknown>;
interface Envelope { schema: number; savedAt: string; data: Raw }

/**
 * Converters from schema N to N+1, keyed by N. Each takes the data object and returns the upgraded one.
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
  }
};

/** Upgrade data saved at `from` to the current schema. Throws if it's from a newer app version. */
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

export interface Loaded { data: Raw | null; prefs: Raw | null; notice?: [string, string] }

/** Load saved data and prefs, upgrading older formats. Returns nulls when nothing is saved yet. */
export function load(): Loaded {
  let raw = read(DATA_KEY), prefs: Raw | null = null, notice: Loaded['notice'];
  try { prefs = JSON.parse(read(PREFS_KEY) || 'null'); } catch { /* ignore broken prefs */ }

  // One-time move from the old single-key format (schema 1): split data from prefs, keep a copy.
  if (raw == null) {
    const legacy = read(LEGACY_KEY);
    if (legacy != null) {
      try {
        const old = JSON.parse(legacy) as Raw;
        write(backupKey(1), legacy);
        prefs = prefs || pick(old, PREF_FIELDS);
        raw = JSON.stringify({ schema: 1, savedAt: new Date().toISOString(), data: pick(old, DATA_FIELDS) });
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
    return { data: env.data, prefs, notice: ['A newer version is available', 'Reload the page to update.'] };
  }
  let data = env.data;
  if (env.schema < SCHEMA) {
    if (read(backupKey(env.schema)) == null) write(backupKey(env.schema), raw);
    data = migrate(env.schema, data);
    knownRev = storedRev();
    saveData(data);
  }
  knownRev = storedRev();
  return { data, prefs, notice };
}

/**
 * Save the budget data. Returns 'conflict' (and writes nothing) if another tab saved since this tab
 * last loaded or saved, so one tab can never silently overwrite the other's changes.
 */
export function saveData(data: Raw): 'ok' | 'conflict' {
  if (readOnly) return 'ok';
  if (storedRev() !== knownRev) return 'conflict';
  const env: Envelope = { schema: SCHEMA, savedAt: new Date().toISOString(), data: pick(data, DATA_FIELDS) };
  if (!write(DATA_KEY, JSON.stringify(env))) return 'ok';
  knownRev = knownRev + 1;
  write(REV_KEY, String(knownRev));
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
      onChange(env.schema < SCHEMA ? migrate(env.schema, env.data) : env.data);
    } catch { /* ignore */ }
  };
  window.addEventListener('storage', fn);
  return () => window.removeEventListener('storage', fn);
}
