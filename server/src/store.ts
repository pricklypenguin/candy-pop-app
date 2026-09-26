/**
 * Where the server keeps things. The server only ever sees:
 * - vaults: an id, a hash of the vault's access key, a revision number and an encrypted blob;
 * - pairing sessions: a short code, two public keys and one encrypted payload, for 10 minutes;
 * - rate-limit counters keyed by a hash of the caller's IP address.
 */
export interface Vault { authHash: string; rev: number; blob: string; updatedAt: number }
export interface Pair { pubA: string; pubB: string | null; payload: string | null; expiresAt: number }

export interface Store {
  getVault(id: string): Promise<Vault | null>;
  /** Create a vault. False if it already exists. */
  createVault(id: string, authHash: string, blob: string, now: number): Promise<boolean>;
  /** Replace the blob if the vault is still at `baseRev`. Returns the new revision, or null if it moved on. */
  updateVault(id: string, authHash: string, baseRev: number, blob: string, now: number): Promise<number | null>;
  deleteVault(id: string, authHash: string): Promise<boolean>;
  createPair(code: string, pubA: string, expiresAt: number): Promise<boolean>;
  getPair(code: string): Promise<Pair | null>;
  /** Record the joining device's key. False if someone already joined. */
  joinPair(code: string, pubB: string): Promise<boolean>;
  /** Store the encrypted payload once. */
  setPairPayload(code: string, payload: string): Promise<boolean>;
  deletePair(code: string): Promise<void>;
  /** Count a hit for `key` in a fixed window. True while under `limit`. */
  hit(key: string, limit: number, windowMs: number, now: number): Promise<boolean>;
  /** Delete vaults untouched since `vaultCutoff`, expired pairing sessions and old counters. */
  cleanup(now: number, vaultCutoff: number): Promise<void>;
}

/** In-memory store for tests and local development. */
export class MemoryStore implements Store {
  vaults = new Map<string, Vault>();
  pairs = new Map<string, Pair>();
  hits = new Map<string, { n: number; start: number }>();

  async getVault(id: string) { const v = this.vaults.get(id); return v ? { ...v } : null; }
  async createVault(id: string, authHash: string, blob: string, now: number) {
    if (this.vaults.has(id)) return false;
    this.vaults.set(id, { authHash, rev: 1, blob, updatedAt: now });
    return true;
  }
  async updateVault(id: string, authHash: string, baseRev: number, blob: string, now: number) {
    const v = this.vaults.get(id);
    if (!v || v.authHash !== authHash || v.rev !== baseRev) return null;
    v.rev += 1; v.blob = blob; v.updatedAt = now;
    return v.rev;
  }
  async deleteVault(id: string, authHash: string) {
    const v = this.vaults.get(id);
    if (!v || v.authHash !== authHash) return false;
    this.vaults.delete(id);
    return true;
  }
  async createPair(code: string, pubA: string, expiresAt: number) {
    if (this.pairs.has(code)) return false;
    this.pairs.set(code, { pubA, pubB: null, payload: null, expiresAt });
    return true;
  }
  async getPair(code: string) { const p = this.pairs.get(code); return p ? { ...p } : null; }
  async joinPair(code: string, pubB: string) {
    const p = this.pairs.get(code);
    if (!p || p.pubB) return false;
    p.pubB = pubB;
    return true;
  }
  async setPairPayload(code: string, payload: string) {
    const p = this.pairs.get(code);
    if (!p || !p.pubB || p.payload) return false;
    p.payload = payload;
    return true;
  }
  async deletePair(code: string) { this.pairs.delete(code); }
  async hit(key: string, limit: number, windowMs: number, now: number) {
    const h = this.hits.get(key);
    if (!h || now - h.start >= windowMs) { this.hits.set(key, { n: 1, start: now }); return true; }
    h.n += 1;
    return h.n <= limit;
  }
  async cleanup(now: number, vaultCutoff: number) {
    for (const [id, v] of this.vaults) if (v.updatedAt < vaultCutoff) this.vaults.delete(id);
    for (const [c, p] of this.pairs) if (p.expiresAt < now) this.pairs.delete(c);
    this.hits.clear();
  }
}

/** Cloudflare D1 store. Tables are created by migrations/0001_init.sql. */
export class D1Store implements Store {
  constructor(private db: D1Database) {}

  async getVault(id: string) {
    const r = await this.db.prepare('SELECT auth_hash, rev, blob, updated_at FROM vaults WHERE id = ?').bind(id).first<{ auth_hash: string; rev: number; blob: string; updated_at: number }>();
    return r ? { authHash: r.auth_hash, rev: r.rev, blob: r.blob, updatedAt: r.updated_at } : null;
  }
  async createVault(id: string, authHash: string, blob: string, now: number) {
    const r = await this.db.prepare('INSERT OR IGNORE INTO vaults (id, auth_hash, rev, blob, updated_at) VALUES (?, ?, 1, ?, ?)').bind(id, authHash, blob, now).run();
    return r.meta.changes === 1;
  }
  async updateVault(id: string, authHash: string, baseRev: number, blob: string, now: number) {
    // One conditional statement, so two devices saving at once can't both win.
    const r = await this.db.prepare('UPDATE vaults SET rev = rev + 1, blob = ?, updated_at = ? WHERE id = ? AND auth_hash = ? AND rev = ?')
      .bind(blob, now, id, authHash, baseRev).run();
    return r.meta.changes === 1 ? baseRev + 1 : null;
  }
  async deleteVault(id: string, authHash: string) {
    const r = await this.db.prepare('DELETE FROM vaults WHERE id = ? AND auth_hash = ?').bind(id, authHash).run();
    return r.meta.changes === 1;
  }
  async createPair(code: string, pubA: string, expiresAt: number) {
    const r = await this.db.prepare('INSERT OR IGNORE INTO pairs (code, pub_a, expires_at) VALUES (?, ?, ?)').bind(code, pubA, expiresAt).run();
    return r.meta.changes === 1;
  }
  async getPair(code: string) {
    const r = await this.db.prepare('SELECT pub_a, pub_b, payload, expires_at FROM pairs WHERE code = ?').bind(code).first<{ pub_a: string; pub_b: string | null; payload: string | null; expires_at: number }>();
    return r ? { pubA: r.pub_a, pubB: r.pub_b, payload: r.payload, expiresAt: r.expires_at } : null;
  }
  async joinPair(code: string, pubB: string) {
    const r = await this.db.prepare('UPDATE pairs SET pub_b = ? WHERE code = ? AND pub_b IS NULL').bind(pubB, code).run();
    return r.meta.changes === 1;
  }
  async setPairPayload(code: string, payload: string) {
    const r = await this.db.prepare('UPDATE pairs SET payload = ? WHERE code = ? AND pub_b IS NOT NULL AND payload IS NULL').bind(payload, code).run();
    return r.meta.changes === 1;
  }
  async deletePair(code: string) { await this.db.prepare('DELETE FROM pairs WHERE code = ?').bind(code).run(); }
  async hit(key: string, limit: number, windowMs: number, now: number) {
    const r = await this.db.prepare(
      `INSERT INTO hits (key, n, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         n = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE n + 1 END,
         window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
       RETURNING n`).bind(key, now, windowMs).first<{ n: number }>();
    return (r?.n ?? 1) <= limit;
  }
  async cleanup(now: number, vaultCutoff: number) {
    await this.db.batch([
      this.db.prepare('DELETE FROM vaults WHERE updated_at < ?').bind(vaultCutoff),
      this.db.prepare('DELETE FROM pairs WHERE expires_at < ?').bind(now),
      this.db.prepare('DELETE FROM hits WHERE window_start < ?').bind(now - 86400000)
    ]);
  }
}
