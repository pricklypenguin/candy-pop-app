import { describe, expect, it } from 'vitest';
import { checkRecoveryCode, decryptText, deriveKeys, encryptText, newPairKeys, newRecoveryCode, pairSecret } from './crypto';
import { merge3, resolve, sameData, type Raw } from './merge';

const base: Raw = {
  currency: 'USD', onboarded: true, isSample: false, periodType: 'monthly', customStart: 1, customLen: 10, debtStrategy: 'avalanche', debtExtra: 0, startedAt: 100,
  cats: [{ id: 'groceries', name: 'Groceries', color: 'x', budget: 30000 }],
  incomes: [], incomeTxns: [], billPaid: [], debts: [], debtPayments: [], goals: [], goalDeposits: [],
  bills: [{ id: 'b1', name: 'Rent', amount: 90000, day: 1, u: 1 }],
  txns: [{ id: 't1', amt: 1200, cat: 'groceries', note: 'Shop', d: 5, u: 1 }]
};
const edit = (d: Raw, list: string, id: string, patch: Raw): Raw => ({ ...d, [list]: (d[list] as Raw[]).map(r => r.id === id ? { ...r, ...patch } : r) });
const add = (d: Raw, list: string, row: Raw): Raw => ({ ...d, [list]: [...(d[list] as Raw[]), row] });

describe('merge', () => {
  it('combines new records added on both devices', () => {
    const local = add(base, 'txns', { id: 't2', amt: 500, cat: 'groceries', note: 'Milk', d: 6, u: 2 });
    const remote = add(base, 'txns', { id: 't3', amt: 700, cat: 'groceries', note: 'Bread', d: 6, u: 3 });
    const { data, conflicts } = merge3(base, local, remote);
    expect(conflicts).toEqual([]);
    expect((data.txns as Raw[]).map(t => t.id).sort()).toEqual(['t1', 't2', 't3']);
  });

  it('takes a change made on only one side', () => {
    const remote = edit(base, 'bills', 'b1', { amount: 95000, u: 5 });
    const { data, conflicts } = merge3(base, base, remote);
    expect(conflicts).toEqual([]);
    expect((data.bills as Raw[])[0].amount).toBe(95000);
  });

  it('combines different fields changed on each side', () => {
    const local = edit(base, 'bills', 'b1', { name: 'Rent (flat)', u: 5 });
    const remote = edit(base, 'bills', 'b1', { day: 3, u: 6 });
    const { data, conflicts } = merge3(base, local, remote);
    expect(conflicts).toEqual([]);
    expect((data.bills as Raw[])[0]).toMatchObject({ name: 'Rent (flat)', day: 3, u: 6 });
  });

  it('flags the same field changed differently on both sides, and applies the choice', () => {
    const local = edit(base, 'bills', 'b1', { amount: 92000, u: 5 });
    const remote = edit(base, 'bills', 'b1', { amount: 95000, u: 6 });
    const { data, conflicts } = merge3(base, local, remote);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ list: 'bills', id: 'b1', field: 'amount', local: 92000, remote: 95000 });
    expect((data.bills as Raw[])[0].amount).toBe(92000);
    expect((resolve(data, conflicts, { [conflicts[0].key]: 'remote' }).bills as Raw[])[0].amount).toBe(95000);
  });

  it('keeps a deletion even if the other side edited the record', () => {
    const local = edit(base, 'bills', 'b1', { del: 10, u: 10 });
    const remote = edit(base, 'bills', 'b1', { amount: 95000, u: 6 });
    const { data, conflicts } = merge3(base, local, remote);
    expect(conflicts).toEqual([]);
    expect((data.bills as Raw[])[0]).toMatchObject({ del: 10, amount: 95000 });
  });

  it('merges settings field by field, with sensible fixed answers', () => {
    const local = { ...base, currency: 'GBP', isSample: false, startedAt: 90 };
    const remote = { ...base, debtExtra: 5000, isSample: true, startedAt: 120 };
    const { data, conflicts } = merge3(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(data).toMatchObject({ currency: 'GBP', debtExtra: 5000, isSample: false, startedAt: 90 });
    const both = merge3(base, { ...base, currency: 'GBP' }, { ...base, currency: 'EUR' });
    expect(both.conflicts.map(c => c.key)).toEqual(['setting:currency']);
  });

  it('is stable: merging the result again changes nothing', () => {
    const local = add(base, 'txns', { id: 't2', amt: 500, cat: 'groceries', note: 'Milk', d: 6, u: 2 });
    const remote = edit(base, 'bills', 'b1', { amount: 95000, u: 6 });
    const once = merge3(base, local, remote).data;
    expect(sameData(merge3(remote, once, remote).data, once)).toBe(true);
    // The other device, merging its own way round, ends up with the same data.
    expect(sameData(merge3(base, remote, local).data, once)).toBe(true);
  });
});

describe('crypto', () => {
  it('makes recovery codes that check out, forgiving common misreadings', async () => {
    const code = await newRecoveryCode();
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);
    const typed = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l');
    expect(await checkRecoveryCode(typed)).toEqual({ ok: true, code });
    const wrong = code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6);
    expect(await checkRecoveryCode(wrong)).toEqual({ ok: false, reason: 'check' });
    expect(await checkRecoveryCode('ABC')).toEqual({ ok: false, reason: 'length' });
  });

  it('derives the same separate keys from the same code, and different ones from another', async () => {
    const code = await newRecoveryCode(), a = await deriveKeys(code), b = await deriveKeys(code), c = await deriveKeys(await newRecoveryCode());
    expect(a.vaultId).toMatch(/^[0-9a-f]{32}$/); expect(a.accessKey).toMatch(/^[0-9a-f]{64}$/);
    expect(a.vaultId).toBe(b.vaultId); expect(a.accessKey).toBe(b.accessKey);
    expect(a.accessKey.startsWith(a.vaultId)).toBe(false);
    expect(c.vaultId).not.toBe(a.vaultId);
    const blob = await encryptText(a.dataKey, JSON.stringify(base));
    expect(JSON.parse(await decryptText(b.dataKey, blob))).toEqual(base);
    await expect(decryptText(c.dataKey, blob)).rejects.toThrow();
    expect(blob).not.toContain('Rent');
  });

  it('pairs two devices: same check code and key on both sides', async () => {
    const A = await newPairKeys(), B = await newPairKeys();
    const sa = await pairSecret(A, B.pub, A.pub, B.pub), sb = await pairSecret(B, A.pub, A.pub, B.pub);
    expect(sa.check).toMatch(/^\d{3} \d{3}$/); expect(sa.check).toBe(sb.check);
    const code = await newRecoveryCode();
    expect(await decryptText(sb.key, await encryptText(sa.key, code))).toBe(code);
    // Someone swapping in their own key gets a different check code.
    const M = await newPairKeys();
    expect((await pairSecret(A, M.pub, A.pub, M.pub)).check).not.toBe(sb.check);
  });
});
