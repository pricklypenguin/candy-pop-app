import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { emptyLists, type Persisted } from './lib/data';
import { fmtD } from './lib/dates';
import { buildView } from './lib/model';
import * as sync from './sync/engine';
import type { Conflict, Raw } from './sync/merge';
import { useSyncStatus } from './sync/useSync';
import { useApp } from './store';
import { H } from './ui';

const box: CSSProperties = { background: 'var(--soft)', borderRadius: 22, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 };
const warn: CSSProperties = { background: 'var(--danger-soft)', borderRadius: 22, padding: '14px 16px', fontSize: 14 };
const bigCode: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 24, fontWeight: 700, letterSpacing: '.06em', textAlign: 'center', padding: '14px 8px', background: 'var(--surface)', border: '2px dashed var(--line3)', borderRadius: 18, wordBreak: 'break-all' };
const Btn = ({ children, onClick, tone = 'primary', disabled }: { children: ReactNode; onClick: () => void; tone?: 'primary' | 'soft' | 'danger' | 'dangerSoft'; disabled?: boolean }) => {
  const look: Record<string, CSSProperties> = {
    primary: { background: disabled ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on)' },
    soft: { background: 'var(--accent-soft)', color: 'var(--accent-ink)' },
    danger: { background: 'var(--danger)', color: 'var(--on)' },
    dangerSoft: { background: 'var(--danger-soft)', color: 'var(--danger)' }
  };
  return <button aria-disabled={disabled} onClick={() => !disabled && onClick()} style={{ border: 'none', borderRadius: 20, padding: '14px 16px', fontSize: 15, fontWeight: 700, ...look[tone] }}>{children}</button>;
};

/** "Synced 3 min ago", "Offline", … */
export function syncStatusText(st: sync.SyncStatus) {
  if (st.state === 'syncing') return 'Syncing…';
  if (st.state === 'offline') return 'Offline. Changes will sync when you’re back online.';
  if (st.state === 'conflict') return 'Some changes clash between devices. Please review them.';
  if (st.state === 'error' || st.state === 'update') return st.message || 'Something went wrong. Trying again shortly.';
  if (st.state === 'off') return 'Off';
  if (!st.lastSync) return 'On';
  const mins = Math.round((Date.now() - st.lastSync) / 60000);
  return 'Synced ' + (mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : 'at ' + new Date(st.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
}

type View = 'home' | 'code' | 'add' | 'joinPair' | 'joinCode' | 'confirm';

/** Settings → Sync between devices. */
export function SyncSheet() {
  const st = useSyncStatus();
  const { actions } = useApp();
  const on = st.state !== 'off';
  const [view, setView] = useState<View>('home');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');            // recovery code shown after turning on
  const [saved, setSaved] = useState(false);
  const [fetched, setFetched] = useState<Extract<sync.Fetched, { ok: true }> | null>(null);
  const [confirmOff, setConfirmOff] = useState<'' | 'off' | 'delete'>('');
  const [showCode, setShowCode] = useState(false);
  const go = (v: View) => { setError(''); setView(v); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message || 'Something went wrong.'); } finally { setBusy(false); } };

  if (view === 'code') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="pretty" style={{ fontSize: 15 }}>This is your <b>recovery code</b>. It’s the only way back into your synced budget if you lose your devices. We can’t reset it for you.</div>
      <div style={bigCode}>{code}</div>
      <Btn tone="soft" onClick={() => { navigator.clipboard?.writeText(code); }}>Copy code</Btn>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15 }}>
        <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, accentColor: 'var(--accent)' }} />
        I’ve written it down or saved it somewhere safe (not only on this device).
      </label>
      <Btn disabled={!saved} onClick={() => go('home')}>Done</Btn>
    </div>
  );
  if (view === 'add') return <AddDevice onDone={() => go('home')} />;
  if (view === 'joinPair') return <JoinWithPairing onFetched={f => { setFetched(f); go('confirm'); }} onBack={() => go('home')} />;
  if (view === 'joinCode') return <JoinWithRecovery onFetched={f => { setFetched(f); go('confirm'); }} onBack={() => go('home')} />;
  if (view === 'confirm' && fetched) {
    const v = buildView({ ...emptyLists(), cats: [], ...(fetched.appData as Partial<Persisted>) });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={box}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Synced budget found</div>
          <div className="muted" style={{ fontSize: 14 }}>{v.txns.length} transactions · {v.bills.length} bills · {v.debts.length} debts · {v.goals.length} saving goals</div>
        </div>
        <div className="pretty" style={warn}>This replaces everything in the app on this device with the synced budget. If you might want this device’s current data, download a backup of it first.</div>
        <Btn tone="soft" onClick={actions.downloadBackup}>Download this device’s data first</Btn>
        <Btn tone="danger" onClick={() => { sync.adopt(fetched); setFetched(null); go('home'); }}>Replace and start syncing</Btn>
      </div>
    );
  }

  if (!on) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {st.message && <div className="pretty" style={warn}>{st.message}</div>}
      <div className="pretty" style={{ fontSize: 15 }}>Keep your budget the same on your phone, tablet and computer.</div>
      <div style={box}>
        {['Your budget is locked on this device before it’s sent. Only your devices can read it; we can’t.', 'No account or password. Devices connect with a short code, and a recovery code gets you back in.', 'You can turn it off or delete the synced copy any time.'].map(t => (
          <div key={t} className="pretty" style={{ display: 'flex', gap: 10, fontSize: 14 }}><span style={{ color: 'var(--accent-ink)', fontWeight: 800 }}>✓</span><span>{t}</span></div>
        ))}
      </div>
      <Btn disabled={busy} onClick={() => run(async () => { setCode(await sync.turnOn()); setSaved(false); go('code'); })}>{busy ? 'Turning on…' : 'Turn on sync with this device’s budget'}</Btn>
      <Btn tone="soft" onClick={() => go('joinPair')}>Connect to a device that already syncs</Btn>
      <Btn tone="soft" onClick={() => go('joinCode')}>Use a recovery code</Btn>
      {error && <div style={warn}>{error.includes('fetch') ? 'Couldn’t reach the sync server. Check your connection.' : error}</div>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={box}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Sync is on</div>
        <div className="muted" role="status" style={{ fontSize: 14 }}>{syncStatusText(st)}</div>
      </div>
      {st.state === 'conflict' && <Btn onClick={() => actions.open({ mode: 'conflicts' })}>Review clashing changes</Btn>}
      <Btn tone="soft" onClick={() => sync.syncNow()}>Sync now</Btn>
      <Btn tone="soft" onClick={() => go('add')}>Add another device</Btn>
      <Btn tone="soft" onClick={() => setShowCode(x => !x)}>{showCode ? 'Hide recovery code' : 'Show recovery code'}</Btn>
      {showCode && <div style={bigCode}>{sync.recoveryCode()}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
        {confirmOff === 'off'
          ? <Btn tone="danger" onClick={() => { sync.turnOff(); setConfirmOff(''); }}>Yes, stop syncing on this device</Btn>
          : <Btn tone="dangerSoft" onClick={() => setConfirmOff('off')}>Turn off on this device</Btn>}
        {confirmOff === 'off' && <div className="muted" style={{ fontSize: 13 }}>Your budget stays on this device and on your other devices.</div>}
        {confirmOff === 'delete'
          ? <Btn tone="danger" disabled={busy} onClick={() => run(async () => { await sync.deleteFromServer(); setConfirmOff(''); })}>Yes, delete the synced copy</Btn>
          : <Btn tone="dangerSoft" onClick={() => setConfirmOff('delete')}>Delete the synced copy from the server</Btn>}
        {confirmOff === 'delete' && <div className="muted pretty" style={{ fontSize: 13 }}>Your devices keep their own copy, but stop syncing. Other devices will need to be set up again.</div>}
      </div>
      {error && <div style={warn}>{error}</div>}
    </div>
  );
}

/** On a device that syncs: show a pairing code, then the check code to compare. */
function AddDevice({ onDone }: { onDone: () => void }) {
  const [pairCode, setPairCode] = useState('');
  const [check, setCheck] = useState('');
  const [state, setState] = useState<'wait' | 'compare' | 'sending' | 'done' | 'error'>('wait');
  const [error, setError] = useState('');
  const sendRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const ctrl = new AbortController();
    sync.startPairing(setPairCode, ctrl.signal)
      .then(p => { sendRef.current = p.send; setCheck(p.check); setState('compare'); })
      .catch(e => { if (!ctrl.signal.aborted) { setError(e.message === 'expired' ? 'The code expired. Start again.' : 'Couldn’t start pairing. Check your connection.'); setState('error'); } });
    return () => ctrl.abort();
  }, []);
  if (state === 'error') return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><div style={warn}>{error}</div><Btn tone="soft" onClick={onDone}>Back</Btn></div>;
  if (state === 'done') return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><div style={box}><b>Done</b><span className="muted" style={{ fontSize: 14 }}>The other device will finish setting up in a moment.</span></div><Btn onClick={onDone}>OK</Btn></div>;
  if (state === 'compare' || state === 'sending') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pretty" style={{ fontSize: 15 }}>Does your other device show this check code?</div>
      <div style={bigCode} data-testid="check-code">{check}</div>
      <Btn disabled={state === 'sending'} onClick={async () => { setState('sending'); try { await sendRef.current(); setState('done'); } catch { setError('Couldn’t finish pairing. Start again.'); setState('error'); } }}>Yes, they match</Btn>
      <Btn tone="dangerSoft" onClick={() => { setError('For safety, pairing was stopped. Start again on both devices.'); setState('error'); }}>No, they’re different</Btn>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pretty" style={{ fontSize: 15 }}>On your other device, open Settings → Sync between devices → <b>Connect to a device that already syncs</b>, and enter:</div>
      <div style={bigCode} data-testid="pair-code">{pairCode ? pairCode.slice(0, 3) + ' ' + pairCode.slice(3) : '…'}</div>
      <div className="muted" style={{ fontSize: 13 }}>The code works once and lasts 10 minutes. Waiting for the other device…</div>
      <Btn tone="soft" onClick={onDone}>Cancel</Btn>
    </div>
  );
}

/** On a new device: enter the pairing code, compare the check code, then receive the budget. */
function JoinWithPairing({ onFetched, onBack }: { onFetched: (f: Extract<sync.Fetched, { ok: true }>) => void; onBack: () => void }) {
  const [input, setInput] = useState('');
  const [check, setCheck] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  const start = async () => {
    setBusy(true); setError('');
    ctrl.current = new AbortController();
    try {
      const j = await sync.joinPairing(input, ctrl.current.signal);
      setCheck(j.check);
      const code = await j.receive();
      const f = await sync.fetchWithCode(code);
      if (f.ok) onFetched(f); else setError(f.error);
    } catch (e) { if (!ctrl.current?.signal.aborted) setError((e as Error).message.includes('fetch') ? 'Couldn’t reach the sync server. Check your connection.' : (e as Error).message); }
    finally { setBusy(false); setCheck(''); }
  };
  if (check) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pretty" style={{ fontSize: 15 }}>Check that your other device shows the same code, then tap <b>Yes, they match</b> there.</div>
      <div style={bigCode} data-testid="check-code">{check}</div>
      <div className="muted" style={{ fontSize: 13 }}>If the codes are different, tap No on the other device.</div>
      <Btn tone="soft" onClick={() => { ctrl.current?.abort(); setCheck(''); onBack(); }}>Cancel</Btn>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pretty" style={{ fontSize: 15 }}>On the device that already syncs, open Settings → Sync between devices → <b>Add another device</b>. Enter the 6-digit code it shows.</div>
      <input className="field" aria-label="Pairing code" inputMode="numeric" autoComplete="one-time-code" value={input} onChange={e => setInput(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123 456" style={{ fontSize: 24, textAlign: 'center', letterSpacing: '.2em' }} />
      <Btn disabled={input.length !== 6 || busy} onClick={start}>{busy ? 'Connecting…' : 'Connect'}</Btn>
      {error && <div style={warn}>{error}</div>}
      <Btn tone="soft" onClick={onBack}>Back</Btn>
    </div>
  );
}

function JoinWithRecovery({ onFetched, onBack }: { onFetched: (f: Extract<sync.Fetched, { ok: true }>) => void; onBack: () => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pretty" style={{ fontSize: 15 }}>Type your 20-character recovery code. Dashes, spaces and capitals don’t matter.</div>
      <input className="field" aria-label="Recovery code" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={input} onChange={e => setInput(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" style={{ fontFamily: 'ui-monospace, monospace', textAlign: 'center' }} />
      <Btn disabled={busy || input.replace(/[^0-9a-z]/gi, '').length < 20} onClick={async () => { setBusy(true); setError(''); const f = await sync.fetchWithCode(input); setBusy(false); if (f.ok) onFetched(f); else setError(f.error); }}>{busy ? 'Looking…' : 'Find my budget'}</Btn>
      {error && <div style={warn}>{error}</div>}
      <Btn tone="soft" onClick={onBack}>Back</Btn>
    </div>
  );
}

// ---------- conflicts ----------

const LIST_LABEL: Record<string, string> = { cats: 'Category', incomes: 'Income', incomeTxns: 'Extra income', bills: 'Bill', billPaid: 'Bill paid', debts: 'Debt', debtPayments: 'Debt payment', goals: 'Saving goal', goalDeposits: 'Goal deposit', txns: 'Spending' };
const FIELD_LABEL: Record<string, string> = {
  name: 'name', amount: 'amount', amt: 'amount', budget: 'monthly budget', day: 'due day', min: 'monthly payment', rate: 'interest rate', opening: 'balance',
  original: 'starting balance', target: 'target', monthly: 'monthly amount', start: 'starting amount', note: 'note', cat: 'category', d: 'date', paid: 'paid',
  freq: 'how often', anchor: 'next payday', color: 'colour', skip: 'roll over when paid off', group: 'type',
  currency: 'Currency', periodType: 'Budget period', customStart: 'Custom period start', customLen: 'Custom period length', debtStrategy: 'Payoff plan', debtExtra: 'Extra debt payment each month'
};
const MONEY = new Set(['amount', 'amt', 'budget', 'min', 'opening', 'original', 'target', 'monthly', 'start', 'debtExtra']);

/** The clashing changes, one choice each. This device's value is picked by default. */
export function ConflictSheet() {
  const st = useSyncStatus();
  const { fx, set, raw } = useApp();
  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({});
  const conflicts = st.conflicts || [];
  if (!conflicts.length) return <div className="muted" style={{ fontSize: 15 }}>Nothing to review.</div>;
  const show = (c: Conflict, v: unknown) => {
    if (v === undefined || v === null || v === '') return '—';
    if (MONEY.has(c.field) && typeof v === 'number') return fx(v / 100);
    if ((c.field === 'd' || c.field === 'anchor' || c.field === 'customStart') && typeof v === 'number') return fmtD(v);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  };
  const title = (c: Conflict) => {
    if (!c.list) return FIELD_LABEL[c.field] || c.field;
    const list = (raw as unknown as Raw)[c.list];
    const rec = Array.isArray(list) ? (list as Raw[]).find(r => r.id === c.id) : null;
    const name = rec ? String(rec.name || rec.note || '') : '';
    return LIST_LABEL[c.list] + (name ? ' “' + name + '”' : '') + ': ' + (FIELD_LABEL[c.field] || c.field);
  };
  const pick = (k: string, v: 'local' | 'remote') => setChoices(x => ({ ...x, [k]: v }));
  const opt = (on: boolean): CSSProperties => ({ flex: '1 1 140px', textAlign: 'left', border: '2px solid ' + (on ? 'var(--accent-ink)' : 'var(--line)'), background: on ? 'var(--accent-softer)' : 'var(--surface)', borderRadius: 16, padding: '10px 12px', color: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: 2 });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="pretty" style={{ fontSize: 15 }}>The same thing was changed differently on two devices. Pick which version to keep. Everything else has been combined already.</div>
      {conflicts.map(c => {
        const ch = choices[c.key] || 'local';
        return (
          <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <H size={16}>{title(c)}</H>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button aria-pressed={ch === 'local'} onClick={() => pick(c.key, 'local')} style={opt(ch === 'local')}><span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>THIS DEVICE</span><span style={{ fontSize: 16, fontWeight: 700 }}>{show(c, c.local)}</span></button>
              <button aria-pressed={ch === 'remote'} onClick={() => pick(c.key, 'remote')} style={opt(ch === 'remote')}><span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>OTHER DEVICE</span><span style={{ fontSize: 16, fontWeight: 700 }}>{show(c, c.remote)}</span></button>
            </div>
          </div>
        );
      })}
      <button className="btn-primary" onClick={() => { sync.resolveConflicts(choices); set({ sheet: null }); }} style={{ background: 'var(--accent)' }}>Keep these</button>
    </div>
  );
}

/** Banner on Home when clashing changes are waiting. */
export function ConflictBanner() {
  const st = useSyncStatus();
  const { actions } = useApp();
  if (st.state !== 'conflict') return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--surface)', border: '2px dashed var(--warn)', borderRadius: 24, padding: '14px 18px' }}>
      <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Changes clash between your devices</span>
        <span className="muted" style={{ fontSize: 14 }}>{st.conflicts?.length} thing{st.conflicts?.length === 1 ? ' was' : 's were'} changed differently. Pick which to keep.</span>
      </div>
      <button className="btn-tonal" onClick={() => actions.open({ mode: 'conflicts' })}>Review</button>
    </div>
  );
}
