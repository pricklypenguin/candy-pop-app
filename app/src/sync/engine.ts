/**
 * Sync engine. Keeps this device's budget and the encrypted copy on the sync server in step.
 *
 * - After each local save (1.5 s later), every 30 s while the app is visible, and when it comes back online
 *   or into view, it checks the server. Unchanged → nothing to download (cheap 304 answer).
 * - When the server copy is newer, it's decrypted and three-way merged with this device's data against the
 *   last copy both had ("base"). Real conflicts wait for the user (status 'conflict').
 * - Saving to the server names the revision it was based on; if another device saved first the server says
 *   so, and the engine fetches and merges again instead of overwriting.
 * - Only one tab syncs at a time (Web Locks), and nothing touches the network unless sync was turned on.
 *
 * Kept on this device: the recovery code and last synced revision (steady.sync), and the base copy
 * (steady.sync.base).
 */
import { SCHEMA, migrate, onSaved, readStored, replaceStored, storedToApp, writeStoredIfUnchanged } from '../lib/storage';
import { checkRecoveryCode, decryptText, deriveKeys, encryptText, newPairKeys, newRecoveryCode, pairSecret, type VaultKeys } from './crypto';
import { SYNC_URL, syncAvailable } from './flag';
import { merge3, resolve, sameData, type Conflict, type Raw } from './merge';

const CFG_KEY = 'steady.sync', BASE_KEY = 'steady.sync.base';
const POLL_MS = 30_000, AFTER_SAVE_MS = 1_500, PAIR_POLL_MS = 1_500;
interface Cfg { code: string; rev: number; lastSync?: number; since: number }

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error' | 'conflict' | 'update';
export interface SyncStatus { state: SyncState; lastSync?: number; message?: string; conflicts?: Conflict[] }

// ---------- status for the screens ----------
let status: SyncStatus = { state: 'off' };
const listeners = new Set<() => void>();
export const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getStatus = () => status;
function setStatus(p: Partial<SyncStatus>) { status = { ...status, ...p }; listeners.forEach(f => f()); }

// ---------- saved settings ----------
const readJSON = <T>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const readCfg = () => readJSON<Cfg>(CFG_KEY);
const writeCfg = (c: Cfg | null) => { try { if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c)); else localStorage.removeItem(CFG_KEY); } catch { /* ignore */ } };
const readBase = () => readJSON<Raw>(BASE_KEY);
const writeBase = (d: Raw | null) => { try { if (d) localStorage.setItem(BASE_KEY, JSON.stringify(d)); else localStorage.removeItem(BASE_KEY); } catch { /* ignore */ } };

export const isOn = () => syncAvailable && !!readCfg();
export const recoveryCode = () => readCfg()?.code ?? null;

let keysCache: { code: string; keys: VaultKeys } | null = null;
async function keysFor(code: string) {
  if (keysCache?.code !== code) keysCache = { code, keys: await deriveKeys(code) };
  return keysCache.keys;
}

// ---------- talking to the server ----------
class HttpError extends Error { constructor(public status: number) { super('http ' + status); } }
class NewerVersion extends Error {}

async function api(path: string, init: RequestInit & { key?: string } = {}) {
  const { key, headers, ...rest } = init;
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    return await fetch(SYNC_URL + path, { ...rest, signal: ctrl.signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}), ...(headers as Record<string, string>) } });
  } finally { clearTimeout(t); }
}

type Got = { status: 304 } | { status: 404 } | { status: 200; rev: number; data: Raw };
async function getVault(keys: VaultKeys, knownRev?: number): Promise<Got> {
  const r = await api('/v1/vault/' + keys.vaultId, { key: keys.accessKey, headers: knownRev ? { 'If-None-Match': '"' + knownRev + '"' } : {} });
  if (r.status === 304 || r.status === 404) return { status: r.status };
  if (!r.ok) throw new HttpError(r.status);
  const body = await r.json() as { rev: number; blob: string };
  const env = JSON.parse(await decryptText(keys.dataKey, body.blob)) as { schema: number; data: Raw };
  if (env.schema > SCHEMA) throw new NewerVersion();
  return { status: 200, rev: body.rev, data: env.schema < SCHEMA ? migrate(env.schema, env.data) : env.data };
}
async function putVault(keys: VaultKeys, baseRev: number, data: Raw): Promise<{ ok: true; rev: number } | { ok: false }> {
  const blob = await encryptText(keys.dataKey, JSON.stringify({ schema: SCHEMA, data }));
  const r = await api('/v1/vault/' + keys.vaultId, { method: 'PUT', key: keys.accessKey, body: JSON.stringify({ baseRev, blob }) });
  if (r.status === 409) return { ok: false };
  if (!r.ok) throw new HttpError(r.status);
  return { ok: true, rev: (await r.json() as { rev: number }).rev };
}

function handleError(e: unknown) {
  if (e instanceof NewerVersion) return setStatus({ state: 'update', message: 'Another device uses a newer version of the app. Reload this page to update.' });
  if (e instanceof HttpError) return setStatus({ state: 'error', message: e.status === 429 ? 'Too many requests. Trying again shortly.' : 'The sync server had a problem (' + e.status + '). Trying again shortly.' });
  if (e instanceof TypeError || (e as Error)?.name === 'AbortError' || !navigator.onLine) return setStatus({ state: 'offline', message: undefined });
  setStatus({ state: 'error', message: 'Couldn’t read the synced data. It may have been made with a different recovery code.' });
}

// ---------- syncing ----------
let apply: (appData: Raw) => void = () => {};
let pending: { merged: Raw; conflicts: Conflict[]; remoteRev: number; remote: Raw; local: Raw } | null = null;
let running = false, again = false;

const locked = <T>(fn: () => Promise<T>): Promise<T> =>
  typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('steady-sync', fn) as Promise<T> : fn();

function done(cfg: Cfg, rev: number, data: Raw) {
  writeBase(data);
  const next = { ...cfg, rev, lastSync: Date.now() };
  writeCfg(next);
  setStatus({ state: 'idle', lastSync: next.lastSync, message: undefined, conflicts: undefined });
}

/** Save the merged result here (if it differs) and on the server (if it differs). False: something moved, go round again. */
async function finish(keys: VaultKeys, cfg: Cfg, local: Raw, merged: Raw, remoteRev: number, remote: Raw) {
  if (!sameData(merged, local)) {
    if (!writeStoredIfUnchanged(local, merged)) return false;   // edited here meanwhile
    apply(storedToApp(merged));
  }
  let rev = remoteRev;
  if (!sameData(merged, remote)) {
    const p = await putVault(keys, remoteRev, merged);
    if (!p.ok) return false;                                   // another device saved first
    rev = p.rev;
  }
  done(cfg, rev, merged);
  return true;
}

async function runOnce() {
  const cfg = readCfg();
  if (!cfg || pending) return;
  if (!navigator.onLine) return setStatus({ state: 'offline' });
  setStatus({ state: 'syncing' });
  try {
    const keys = await keysFor(cfg.code);
    for (let attempt = 0; attempt < 4; attempt++) {
      const local = readStored();
      if (!local) return setStatus({ state: 'idle' });
      const base = readBase(), got = await getVault(keys, cfg.rev || undefined);
      if (got.status === 404) {
        // The synced copy was deleted (from another device, or after ~18 months unused). Respect that:
        // stop syncing here rather than uploading it again. This device keeps its data.
        turnOff();
        return setStatus({ message: 'The synced copy was deleted, so sync is off on this device. Your budget here hasn’t changed.' });
      }
      if (got.status === 304) {
        if (base && sameData(local, base)) return done(cfg, cfg.rev, base);
        const p = await putVault(keys, cfg.rev, local);
        if (p.ok) return done(cfg, p.rev, local);
        continue;
      }
      const { data: merged, conflicts } = merge3(base, local, got.data);
      if (conflicts.length) {
        pending = { merged, conflicts, remoteRev: got.rev, remote: got.data, local };
        return setStatus({ state: 'conflict', conflicts });
      }
      // Not finished (edited here meanwhile, or another device saved first): go round again from the
      // last copy both devices had, so nothing is sent without being merged first.
      if (await finish(keys, cfg, local, merged, got.rev, got.data)) return;
    }
    setStatus({ state: 'error', message: 'Lots of changes at once. Trying again shortly.' });
  } catch (e) { handleError(e); }
}

/** Sync now (or right after the current run). */
export async function syncNow() {
  if (!isOn()) return;
  if (running) { again = true; return; }
  running = true;
  try { do { again = false; await locked(runOnce); } while (again); }
  finally { running = false; }
}

/** Apply the user's conflict choices ('remote' = keep the other device's value) and finish syncing. */
export async function resolveConflicts(choices: Record<string, 'local' | 'remote'>) {
  const p = pending, cfg = readCfg();
  if (!p || !cfg) return;
  pending = null;
  setStatus({ state: 'syncing', conflicts: undefined });
  try {
    const keys = await keysFor(cfg.code);
    const ok = await locked(() => finish(keys, cfg, p.local, resolve(p.merged, p.conflicts, choices), p.remoteRev, p.remote));
    if (!ok) syncNow();
  } catch (e) { handleError(e); }
}

// ---------- starting and stopping ----------
let timer: number | undefined, debounce: number | undefined, unsubSaved: (() => void) | undefined;
const kick = () => { syncNow(); };
const onVisible = () => { if (document.visibilityState === 'visible') syncNow(); };

function start() {
  stop();
  const cfg = readCfg();
  setStatus({ state: 'idle', lastSync: cfg?.lastSync, message: undefined });
  unsubSaved = onSaved(() => { clearTimeout(debounce); debounce = window.setTimeout(kick, AFTER_SAVE_MS); });
  timer = window.setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, POLL_MS);
  window.addEventListener('online', kick);
  window.addEventListener('focus', kick);
  document.addEventListener('visibilitychange', onVisible);
  syncNow();
}
function stop() {
  clearInterval(timer); clearTimeout(debounce); unsubSaved?.();
  window.removeEventListener('online', kick);
  window.removeEventListener('focus', kick);
  document.removeEventListener('visibilitychange', onVisible);
}

/** Called once by the app. `applyFn` receives synced data (app amounts) to show. */
export function init(applyFn: (appData: Raw) => void) {
  apply = applyFn;
  if (isOn()) start(); else setStatus({ state: 'off' });
  return stop;
}

/** Turn sync on with this device's data. Returns the new recovery code. */
export async function turnOn() {
  const code = await newRecoveryCode(), keys = await keysFor(code), local = readStored();
  if (!local) throw new Error('nothing to sync');
  const p = await putVault(keys, 0, local);
  if (!p.ok) throw new Error('exists');
  writeCfg({ code, rev: p.rev, lastSync: Date.now(), since: Date.now() });
  writeBase(local);
  start();
  return code;
}

export type Fetched = { ok: true; code: string; rev: number; data: Raw; appData: Raw } | { ok: false; error: string };
/** Look up the synced budget for a recovery code, without changing anything yet. */
export async function fetchWithCode(input: string): Promise<Fetched> {
  const c = await checkRecoveryCode(input);
  if (!c.ok) return { ok: false, error: c.reason === 'length' ? 'A recovery code has 20 characters.' : c.reason === 'chars' ? 'That code has characters that aren’t used in recovery codes.' : 'That code doesn’t look right. Check for a typo.' };
  try {
    const got = await getVault(await keysFor(c.code));
    if (got.status !== 200) return { ok: false, error: 'No synced budget was found for this code.' };
    return { ok: true, code: c.code, rev: got.rev, data: got.data, appData: storedToApp(got.data) };
  } catch (e) {
    if (e instanceof NewerVersion) return { ok: false, error: 'That budget was synced by a newer version of the app. Reload this page to update, then try again.' };
    return { ok: false, error: e instanceof HttpError ? 'The sync server had a problem. Please try again.' : 'Couldn’t reach the sync server. Check your connection.' };
  }
}

/** Replace this device's data with the synced budget and keep it in sync from now on. */
export function adopt(f: Extract<Fetched, { ok: true }>) {
  replaceStored(f.data);
  writeBase(f.data);
  writeCfg({ code: f.code, rev: f.rev, lastSync: Date.now(), since: Date.now() });
  apply(f.appData);
  start();
}

/** Stop syncing on this device. The data here stays; the server copy stays too. */
export function turnOff() {
  stop(); pending = null;
  writeCfg(null); writeBase(null);
  setStatus({ state: 'off', lastSync: undefined, message: undefined, conflicts: undefined });
}

/** Delete the synced copy from the server, then stop syncing here. */
export async function deleteFromServer() {
  const cfg = readCfg();
  if (!cfg) return;
  const keys = await keysFor(cfg.code);
  const r = await api('/v1/vault/' + keys.vaultId, { method: 'DELETE', key: keys.accessKey });
  if (!r.ok && r.status !== 404) throw new HttpError(r.status);
  turnOff();
}

// ---------- pairing ----------
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
});

/**
 * On the device that already syncs: get a pairing code to show, wait for the other device,
 * then return the check code. Call `send()` once the user confirms both screens match.
 */
export async function startPairing(onCode: (code: string) => void, signal: AbortSignal) {
  const cfg = readCfg();
  if (!cfg) throw new Error('not on');
  const mine = await newPairKeys();
  const r = await api('/v1/pair', { method: 'POST', body: JSON.stringify({ pub: mine.pub }) });
  if (!r.ok) throw new HttpError(r.status);
  const { code } = await r.json() as { code: string };
  onCode(code);
  for (;;) {
    await wait(PAIR_POLL_MS, signal);
    const g = await api('/v1/pair/' + code);
    if (!g.ok) throw new Error('expired');
    const { pubB } = await g.json() as { pubB: string | null };
    if (pubB) {
      const s = await pairSecret(mine, pubB, mine.pub, pubB);
      return {
        check: s.check,
        send: async () => {
          const p = await api('/v1/pair/' + code + '/payload', { method: 'POST', body: JSON.stringify({ payload: await encryptText(s.key, cfg.code) }) });
          if (!p.ok) throw new HttpError(p.status);
        }
      };
    }
  }
}

/** On the new device: join with the pairing code; returns the check code and a way to receive the recovery code. */
export async function joinPairing(code: string, signal: AbortSignal) {
  const mine = await newPairKeys();
  const r = await api('/v1/pair/' + code.replace(/\D/g, '') + '/join', { method: 'POST', body: JSON.stringify({ pub: mine.pub }) });
  if (r.status === 404) throw new Error('That code didn’t work. Codes last 10 minutes and can be used once.');
  if (!r.ok) throw new HttpError(r.status);
  const { pubA } = await r.json() as { pubA: string };
  const s = await pairSecret(mine, pubA, pubA, mine.pub);
  return {
    check: s.check,
    /** Waits until the other device confirms, then returns the recovery code. */
    receive: async () => {
      for (;;) {
        await wait(PAIR_POLL_MS, signal);
        const g = await api('/v1/pair/' + code.replace(/\D/g, '') + '/payload');
        if (!g.ok) throw new Error('The pairing code expired. Start again on the other device.');
        const { payload } = await g.json() as { payload: string | null };
        if (payload) return decryptText(s.key, payload);
      }
    }
  };
}
