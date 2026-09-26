/**
 * Steady sync API. Everything stored here is already encrypted by the app; the server can't read budgets.
 *
 *   GET    /v1/vault/:id              → { rev, blob }          (304 if If-None-Match matches the revision)
 *   PUT    /v1/vault/:id  { baseRev, blob } → { rev }          (baseRev 0 creates; 409 { rev } if out of date)
 *   DELETE /v1/vault/:id                                        (204)
 *   POST   /v1/pair       { pub }     → { code, expiresAt }    (start pairing on the device that already syncs)
 *   POST   /v1/pair/:code/join { pub } → { pubA }             (the new device joins)
 *   GET    /v1/pair/:code             → { pubB }               (first device waits for the new one)
 *   POST   /v1/pair/:code/payload { payload }                  (first device sends the encrypted recovery code)
 *   GET    /v1/pair/:code/payload     → { payload }            (new device collects it; the session is then deleted)
 *
 * Vault requests carry `Authorization: Bearer <access key>`; only a SHA-256 hash of it is stored.
 * A wrong key gets the same 404 as a missing vault, so nobody can probe which vaults exist.
 */
import type { Store } from './store';

export interface Env { ALLOWED_ORIGINS?: string }

export const LIMITS = {
  maxBlob: 4_000_000,            // characters of base64 (~3 MB of encrypted data)
  maxPayload: 4_000,
  pairTtlMs: 10 * 60_000,
  vaultIdleDays: 540,            // delete vaults untouched for ~18 months
  general: [900, 10 * 60_000],   // requests per IP per 10 minutes
  pairStart: [10, 10 * 60_000],
  pairJoin: [20, 10 * 60_000]
} as const;

const enc = new TextEncoder();
async function sha256hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...d].map(b => b.toString(16).padStart(2, '0')).join('');
}
const ID = /^[0-9a-f]{32}$/, SECRET = /^[0-9a-f]{64}$/, CODE = /^[0-9]{6}$/, B64 = /^[A-Za-z0-9+/=]+$/;

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return ok ? {
    'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  } : { 'Vary': 'Origin' };
}

export async function handle(req: Request, store: Store, env: Env, now = Date.now()): Promise<Response> {
  const h = cors(req, env);
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
  const empty = (status: number, extra: Record<string, string> = {}) => new Response(null, { status, headers: { ...h, 'Cache-Control': 'no-store', ...extra } });
  const err = (status: number, error: string) => json({ error }, status);

  if (req.method === 'OPTIONS') return empty(204);
  const url = new URL(req.url), parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'v1') return err(404, 'not_found');
  if (parts[1] === 'health') return json({ ok: true });

  // Rate limits are keyed by a hash of the IP address, never the address itself.
  const ipKey = (await sha256hex('steady-ip:' + (req.headers.get('CF-Connecting-IP') || 'local'))).slice(0, 32);
  const limited = async (name: string, [limit, win]: readonly [number, number]) => !(await store.hit(name + ':' + ipKey, limit, win, now));
  if (await limited('all', LIMITS.general)) return err(429, 'slow_down');

  const body = async <T>() => { try { return await req.json() as T; } catch { return null; } };

  // ---------- vaults ----------
  if (parts[1] === 'vault' && parts.length === 3) {
    const id = parts[2], auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!ID.test(id) || !SECRET.test(auth)) return err(400, 'bad_request');
    const authHash = await sha256hex(auth);

    if (req.method === 'GET') {
      const v = await store.getVault(id);
      if (!v || v.authHash !== authHash) return err(404, 'not_found');
      const etag = '"' + v.rev + '"';
      if (req.headers.get('If-None-Match') === etag) return empty(304, { ETag: etag });
      return json({ rev: v.rev, blob: v.blob }, 200, { ETag: etag });
    }
    if (req.method === 'PUT') {
      const b = await body<{ baseRev?: unknown; blob?: unknown }>();
      if (!b || typeof b.baseRev !== 'number' || typeof b.blob !== 'string' || !B64.test(b.blob)) return err(400, 'bad_request');
      if (b.blob.length > LIMITS.maxBlob) return err(413, 'too_large');
      const rev = b.baseRev === 0 ? (await store.createVault(id, authHash, b.blob, now) ? 1 : null) : await store.updateVault(id, authHash, b.baseRev, b.blob, now);
      if (rev != null) return json({ rev });
      const v = await store.getVault(id);
      if (!v || v.authHash !== authHash) return err(404, 'not_found');
      return json({ error: 'out_of_date', rev: v.rev }, 409);
    }
    if (req.method === 'DELETE') return (await store.deleteVault(id, authHash)) ? empty(204) : err(404, 'not_found');
    return err(405, 'method');
  }

  // ---------- pairing ----------
  if (parts[1] === 'pair') {
    if (parts.length === 2 && req.method === 'POST') {
      if (await limited('pair', LIMITS.pairStart)) return err(429, 'slow_down');
      const b = await body<{ pub?: unknown }>();
      if (!b || typeof b.pub !== 'string' || !B64.test(b.pub) || b.pub.length > 200) return err(400, 'bad_request');
      const expiresAt = now + LIMITS.pairTtlMs;
      for (let i = 0; i < 8; i++) {
        const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000, code = String(n).padStart(6, '0');
        const existing = await store.getPair(code);
        if (existing && existing.expiresAt < now) await store.deletePair(code);
        if (await store.createPair(code, b.pub, expiresAt)) return json({ code, expiresAt });
      }
      return err(503, 'busy');
    }
    const code = parts[2];
    if (!code || !CODE.test(code)) return err(400, 'bad_request');
    const p = await store.getPair(code);
    const live = p && p.expiresAt >= now;

    if (parts.length === 4 && parts[3] === 'join' && req.method === 'POST') {
      // Joining is the step a guesser would try, so it has its own, tighter limit.
      if (await limited('join', LIMITS.pairJoin)) return err(429, 'slow_down');
      const b = await body<{ pub?: unknown }>();
      if (!b || typeof b.pub !== 'string' || !B64.test(b.pub) || b.pub.length > 200) return err(400, 'bad_request');
      if (!live || !(await store.joinPair(code, b.pub))) return err(404, 'not_found');
      return json({ pubA: p!.pubA });
    }
    if (parts.length === 3 && req.method === 'GET') {
      if (!live) return err(404, 'not_found');
      return json({ pubB: p!.pubB });
    }
    if (parts.length === 4 && parts[3] === 'payload') {
      if (!live) return err(404, 'not_found');
      if (req.method === 'POST') {
        const b = await body<{ payload?: unknown }>();
        if (!b || typeof b.payload !== 'string' || !B64.test(b.payload) || b.payload.length > LIMITS.maxPayload) return err(400, 'bad_request');
        return (await store.setPairPayload(code, b.payload)) ? empty(204) : err(409, 'not_ready');
      }
      if (req.method === 'GET') {
        if (!p!.payload) return json({ payload: null });
        await store.deletePair(code);
        return json({ payload: p!.payload });
      }
    }
    return err(405, 'method');
  }
  return err(404, 'not_found');
}

/** Daily clean-up: idle vaults, expired pairing sessions, old rate-limit counters. */
export const cleanup = (store: Store, now = Date.now()) => store.cleanup(now, now - LIMITS.vaultIdleDays * 86400000);
