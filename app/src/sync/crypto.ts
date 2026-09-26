/**
 * Sync encryption. Everything uses the browser's built-in Web Crypto.
 *
 * Recovery code: 18 random characters (90 bits) + 2 check characters, shown as XXXX-XXXX-XXXX-XXXX-XXXX.
 * The alphabet leaves out I, L, O and U so a handwritten code reads back correctly.
 * From the code's random part we derive, each with its own label so they can't be confused or reversed:
 *   - the vault id        (tells the server which vault)
 *   - the access key      (sent to the server to prove access; the server keeps only a hash)
 *   - the data key        (encrypts the budget; never leaves the device)
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const enc = new TextEncoder(), dec = new TextDecoder();
const SALT = enc.encode('steady-sync-v1');

export const toB64 = (b: Uint8Array) => { let s = ''; b.forEach(x => s += String.fromCharCode(x)); return btoa(s); };
export const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));

async function checkChars(data: string) {
  const h = await sha256(enc.encode(data));
  return ALPHABET[h[0] & 31] + ALPHABET[h[1] & 31];
}
const group = (s: string) => s.match(/.{1,4}/g)!.join('-');

/** A new random recovery code, formatted for display. */
export async function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const data = [...bytes].map(b => ALPHABET[b & 31]).join('');
  return group(data + await checkChars(data));
}

export type CodeCheck = { ok: true; code: string } | { ok: false; reason: 'length' | 'chars' | 'check' };
/**
 * Tidy up a typed recovery code: ignore case, spaces and dashes, and fix the usual misreadings
 * (O → 0, I or L → 1). Returns the formatted code, or why it isn't valid.
 */
export async function checkRecoveryCode(input: string): Promise<CodeCheck> {
  const s = input.toUpperCase().replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== 20) return { ok: false, reason: 'length' };
  if ([...s].some(c => !ALPHABET.includes(c))) return { ok: false, reason: 'chars' };
  if (await checkChars(s.slice(0, 18)) !== s.slice(18)) return { ok: false, reason: 'check' };
  return { ok: true, code: group(s) };
}

export interface VaultKeys { vaultId: string; accessKey: string; dataKey: CryptoKey }

/** Derive the vault id, access key and data key from a (valid, formatted) recovery code. */
export async function deriveKeys(code: string): Promise<VaultKeys> {
  const data = code.replace(/-/g, '').slice(0, 18);
  const base = await crypto.subtle.importKey('raw', enc.encode(data), 'HKDF', false, ['deriveBits']);
  const bits = async (info: string, n: number) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode(info) }, base, n));
  const dataKey = await crypto.subtle.importKey('raw', await bits('data-key', 256), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { vaultId: hex(await bits('vault-id', 128)), accessKey: hex(await bits('access-key', 256)), dataKey };
}

// ---------- encrypting data ----------

async function gzip(b: Uint8Array, mode: 'compress' | 'decompress') {
  const stream = new Blob([b as BlobPart]).stream().pipeThrough(mode === 'compress' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const canGzip = () => typeof CompressionStream !== 'undefined';

/**
 * Encrypt text with AES-GCM (which also detects tampering). Output: base64 of
 * [format byte: 1 = gzipped, 0 = plain][12-byte IV][ciphertext].
 */
export async function encryptText(key: CryptoKey, text: string) {
  const zipped = canGzip(), plain = zipped ? await gzip(enc.encode(text), 'compress') : enc.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource));
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = zipped ? 1 : 0; out.set(iv, 1); out.set(ct, 13);
  return toB64(out);
}
/** Decrypt text from encryptText. Throws if the key is wrong or the data was altered. */
export async function decryptText(key: CryptoKey, b64: string) {
  const b = fromB64(b64);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(1, 13) }, key, b.slice(13)));
  return dec.decode(b[0] === 1 ? await gzip(plain, 'decompress') : plain);
}

// ---------- pairing two devices ----------

export interface PairKeys { keyPair: CryptoKeyPair; pub: string }
/** A fresh key pair for one pairing attempt. */
export async function newPairKeys(): Promise<PairKeys> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { keyPair, pub: toB64(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))) };
}

/**
 * Both devices compute the same secret from their own private key and the other's public key.
 * From it: a key to encrypt the recovery code in transit, and a 6-digit check code the user compares
 * on both screens. If anyone swapped a key in the middle, the check codes won't match.
 */
export async function pairSecret(mine: PairKeys, theirPub: string, pubA: string, pubB: string) {
  const peer = await crypto.subtle.importKey('raw', fromB64(theirPub) as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, mine.keyPair.privateKey, 256));
  const base = await crypto.subtle.importKey('raw', shared as BufferSource, 'HKDF', false, ['deriveBits']);
  const salt = await sha256(enc.encode(pubA + '|' + pubB));
  const bits = async (info: string, n: number) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: enc.encode(info) }, base, n));
  const key = await crypto.subtle.importKey('raw', await bits('pair-key', 256), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const n = new DataView((await bits('pair-check', 32)).buffer).getUint32(0) % 1_000_000;
  const check = String(n).padStart(6, '0');
  return { key, check: check.slice(0, 3) + ' ' + check.slice(3) };
}
