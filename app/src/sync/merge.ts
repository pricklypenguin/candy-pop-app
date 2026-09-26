/**
 * Three-way merge of two copies of the budget (this device and the synced copy) against the last copy both
 * had in common ("base"). Works on saved data (whole cents).
 *
 * - Records are matched by id. Something changed on only one side is simply taken from that side.
 * - If both sides changed the same record, fields are merged one by one; only a field changed to different
 *   values on both sides is a real conflict. Those are returned for the user to decide (local value is kept
 *   in the meantime).
 * - `u` (last changed) takes the later time; `del` (deleted) wins over an edit.
 * - A few settings have an obvious answer and never conflict (onboarded, isSample, startedAt).
 */
export type Raw = Record<string, unknown>;
type Row = Record<string, unknown> & { id: string };

export const LISTS = ['cats', 'incomes', 'incomeTxns', 'bills', 'billPaid', 'debts', 'debtPayments', 'goals', 'goalDeposits', 'txns'] as const;
export const SETTINGS = ['currency', 'onboarded', 'isSample', 'periodType', 'customStart', 'customLen', 'debtStrategy', 'debtExtra', 'startedAt'] as const;

export interface Conflict {
  /** Stable key for this decision. */
  key: string;
  list: string | null; id: string | null; field: string;
  local: unknown; remote: unknown;
}
export interface MergeResult { data: Raw; conflicts: Conflict[] }

/** Deep equality where a missing field equals `undefined`. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) { const bb = b as unknown[]; return a.length === bb.length && a.every((x, i) => same(x, bb[i])); }
  const ao = a as Raw, bo = b as Raw;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!same(ao[k], bo[k])) return false;
  return true;
}

const byId = (xs: unknown) => new Map(((Array.isArray(xs) ? xs : []) as Row[]).map(r => [r.id, r]));

/** Same data, ignoring the order of records in lists (order doesn't matter to the app). */
export function sameData(a: Raw, b: Raw) {
  for (const k of SETTINGS) if (!same(a[k], b[k])) return false;
  for (const l of LISTS) {
    const am = byId(a[l]), bm = byId(b[l]);
    if (am.size !== bm.size) return false;
    for (const [id, r] of am) if (!same(r, bm.get(id))) return false;
  }
  return true;
}

function mergeRow(list: string, b: Row | undefined, l: Row, r: Row, conflicts: Conflict[]): Row {
  if (same(l, r)) return l;
  if (b && same(l, b)) return r;
  if (b && same(r, b)) return l;
  const out: Raw = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b || {})])) {
    const lv = l[k], rv = r[k], bv = b?.[k];
    let v: unknown;
    if (k === 'u') v = Math.max(Number(lv) || 0, Number(rv) || 0) || undefined;
    else if (same(lv, rv)) v = lv;
    else if (b && same(lv, bv)) v = rv;
    else if (b && same(rv, bv)) v = lv;
    else if (k === 'del') v = lv != null && rv != null ? Math.min(lv as number, rv as number) : (lv ?? rv);
    else { v = lv; conflicts.push({ key: list + ':' + l.id + ':' + k, list, id: l.id, field: k, local: lv, remote: rv }); }
    if (v !== undefined) out[k] = v;
  }
  return out as Row;
}

function mergeList(list: string, base: unknown, local: unknown, remote: unknown, conflicts: Conflict[]): Row[] {
  const bm = byId(base), lm = byId(local), rm = byId(remote);
  // Order: the synced copy's order, then anything new on this device. Both devices converge on the same order.
  const out: Row[] = [];
  for (const [id, r] of rm) {
    const l = lm.get(id);
    out.push(l ? mergeRow(list, bm.get(id), l, r, conflicts) : r);
  }
  for (const [id, l] of lm) if (!rm.has(id)) out.push(l);
  return out;
}

function mergeSetting(k: string, b: unknown, l: unknown, r: unknown, hasBase: boolean, conflicts: Conflict[]) {
  if (same(l, r)) return l;
  if (k === 'onboarded') return !!(l || r);
  if (k === 'isSample') return !!(l && r);          // real data on either side wins
  if (k === 'startedAt') return Math.min(Number(l) || Infinity, Number(r) || Infinity);
  if (hasBase && same(l, b)) return r;
  if (hasBase && same(r, b)) return l;
  conflicts.push({ key: 'setting:' + k, list: null, id: null, field: k, local: l, remote: r });
  return l;
}

export function merge3(base: Raw | null, local: Raw, remote: Raw): MergeResult {
  const conflicts: Conflict[] = [], data: Raw = {}, b = base || {};
  for (const k of SETTINGS) data[k] = mergeSetting(k, b[k], local[k], remote[k], !!base, conflicts);
  for (const l of LISTS) data[l] = mergeList(l, b[l], local[l], remote[l], conflicts);
  return { data, conflicts };
}

/** Apply the user's choices ('remote' = keep the other device's value). Unchosen conflicts keep this device's value. */
export function resolve(data: Raw, conflicts: Conflict[], choices: Record<string, 'local' | 'remote'>): Raw {
  const out: Raw = { ...data };
  for (const c of conflicts) {
    if (choices[c.key] !== 'remote') continue;
    if (c.list == null) { out[c.field] = c.remote; continue; }
    out[c.list] = (out[c.list] as Row[]).map(r => {
      if (r.id !== c.id) return r;
      const n: Raw = { ...r, u: Date.now() };
      if (c.remote === undefined) delete n[c.field]; else n[c.field] = c.remote;
      return n as Row;
    });
  }
  return out;
}
