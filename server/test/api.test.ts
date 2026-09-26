import { describe, expect, it } from 'vitest';
import { LIMITS, cleanup, handle } from '../src/handler';
import { MemoryStore } from '../src/store';

const ID = 'a'.repeat(32), KEY = 'b'.repeat(64), OTHER = 'c'.repeat(64);
const env = { ALLOWED_ORIGINS: 'https://app.example' };

function api(store: MemoryStore, now = 1_000_000) {
  return (method: string, path: string, opts: { body?: unknown; key?: string; headers?: Record<string, string>; ip?: string } = {}) =>
    handle(new Request('https://sync.example' + path, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.example', 'CF-Connecting-IP': opts.ip || '1.2.3.4', ...(opts.key ? { Authorization: 'Bearer ' + opts.key } : {}), ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }), store, env, now);
}

describe('vaults', () => {
  it('creates, reads, updates with revision checks, and deletes', async () => {
    const store = new MemoryStore(), call = api(store);
    let r = await call('PUT', `/v1/vault/${ID}`, { key: KEY, body: { baseRev: 0, blob: 'AAAA' } });
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ rev: 1 });
    expect(store.vaults.get(ID)!.authHash).not.toContain(KEY); // only a hash is stored

    r = await call('GET', `/v1/vault/${ID}`, { key: KEY });
    expect(await r.json()).toEqual({ rev: 1, blob: 'AAAA' });
    r = await call('GET', `/v1/vault/${ID}`, { key: KEY, headers: { 'If-None-Match': '"1"' } });
    expect(r.status).toBe(304);

    r = await call('PUT', `/v1/vault/${ID}`, { key: KEY, body: { baseRev: 1, blob: 'BBBB' } });
    expect(await r.json()).toEqual({ rev: 2 });
    // A device still on revision 1 is told it's out of date instead of overwriting.
    r = await call('PUT', `/v1/vault/${ID}`, { key: KEY, body: { baseRev: 1, blob: 'CCCC' } });
    expect(r.status).toBe(409); expect(await r.json()).toEqual({ error: 'out_of_date', rev: 2 });
    expect(store.vaults.get(ID)!.blob).toBe('BBBB');

    r = await call('DELETE', `/v1/vault/${ID}`, { key: KEY });
    expect(r.status).toBe(204);
    expect((await call('GET', `/v1/vault/${ID}`, { key: KEY })).status).toBe(404);
  });

  it('treats a wrong key exactly like a missing vault', async () => {
    const store = new MemoryStore(), call = api(store);
    await call('PUT', `/v1/vault/${ID}`, { key: KEY, body: { baseRev: 0, blob: 'AAAA' } });
    expect((await call('GET', `/v1/vault/${ID}`, { key: OTHER })).status).toBe(404);
    expect((await call('PUT', `/v1/vault/${ID}`, { key: OTHER, body: { baseRev: 1, blob: 'XXXX' } })).status).toBe(404);
    expect((await call('PUT', `/v1/vault/${ID}`, { key: OTHER, body: { baseRev: 0, blob: 'XXXX' } })).status).toBe(404);
    expect((await call('DELETE', `/v1/vault/${ID}`, { key: OTHER })).status).toBe(404);
    expect(store.vaults.get(ID)!.blob).toBe('AAAA');
  });

  it('rejects malformed requests and oversized blobs', async () => {
    const call = api(new MemoryStore());
    expect((await call('GET', `/v1/vault/nope`, { key: KEY })).status).toBe(400);
    expect((await call('GET', `/v1/vault/${ID}`)).status).toBe(400);
    expect((await call('PUT', `/v1/vault/${ID}`, { key: KEY, body: { baseRev: 0, blob: 'not base64!' } })).status).toBe(400);
    expect((await call('PUT', `/v1/vault/${ID}`, { key: KEY, body: { baseRev: 0, blob: 'A'.repeat(LIMITS.maxBlob + 4) } })).status).toBe(413);
  });
});

describe('pairing', () => {
  it('relays keys and one payload, then forgets the session', async () => {
    const store = new MemoryStore(), call = api(store);
    let r = await call('POST', '/v1/pair', { body: { pub: 'PUBA' } });
    const { code } = await r.json() as { code: string };
    expect(code).toMatch(/^\d{6}$/);
    expect(await (await call('GET', `/v1/pair/${code}`)).json()).toEqual({ pubB: null });
    r = await call('POST', `/v1/pair/${code}/join`, { body: { pub: 'PUBB' } });
    expect(await r.json()).toEqual({ pubA: 'PUBA' });
    // Only one device can join a code.
    expect((await call('POST', `/v1/pair/${code}/join`, { body: { pub: 'EVIL' } })).status).toBe(404);
    expect(await (await call('GET', `/v1/pair/${code}`)).json()).toEqual({ pubB: 'PUBB' });
    expect(await (await call('GET', `/v1/pair/${code}/payload`)).json()).toEqual({ payload: null });
    expect((await call('POST', `/v1/pair/${code}/payload`, { body: { payload: 'SECRET' } })).status).toBe(204);
    expect(await (await call('GET', `/v1/pair/${code}/payload`)).json()).toEqual({ payload: 'SECRET' });
    expect(store.pairs.size).toBe(0);
  });

  it('expires codes after 10 minutes', async () => {
    const store = new MemoryStore();
    const { code } = await (await api(store)('POST', '/v1/pair', { body: { pub: 'PUBA' } })).json() as { code: string };
    const later = api(store, 1_000_000 + LIMITS.pairTtlMs + 1);
    expect((await later('POST', `/v1/pair/${code}/join`, { body: { pub: 'PUBB' } })).status).toBe(404);
  });

  it('limits guessing of pairing codes', async () => {
    const call = api(new MemoryStore());
    const statuses = [];
    for (let i = 0; i < LIMITS.pairJoin[0] + 2; i++) statuses.push((await call('POST', `/v1/pair/${String(i).padStart(6, '0')}/join`, { body: { pub: 'X' }, ip: '9.9.9.9' })).status);
    expect(statuses.slice(0, LIMITS.pairJoin[0]).every(s => s === 404)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('housekeeping', () => {
  it('answers CORS only for allowed sites', async () => {
    const store = new MemoryStore();
    const ok = await handle(new Request('https://s/v1/health', { headers: { Origin: 'https://app.example' } }), store, env);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
    const bad = await handle(new Request('https://s/v1/health', { headers: { Origin: 'https://evil.example' } }), store, env);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('deletes vaults idle for ~18 months', async () => {
    const store = new MemoryStore();
    await api(store, 0)('PUT', `/v1/vault/${ID}`, { key: KEY, body: { baseRev: 0, blob: 'AAAA' } });
    await cleanup(store, (LIMITS.vaultIdleDays - 1) * 86400000);
    expect(store.vaults.size).toBe(1);
    await cleanup(store, (LIMITS.vaultIdleDays + 1) * 86400000);
    expect(store.vaults.size).toBe(0);
  });
});
