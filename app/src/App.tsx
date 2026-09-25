import type { CSSProperties } from 'react';
import type { Tab } from './lib/data';
import { Onboarding } from './Onboarding';
import { Bills } from './screens/Bills';
import { Debt } from './screens/Debt';
import { Goals } from './screens/Goals';
import { Home } from './screens/Home';
import { SheetHost } from './Sheets';
import { useApp } from './store';
import { H, Seg } from './ui';

const TABS: [Tab, string][] = [['home', 'Home'], ['bills', 'Bills'], ['debt', 'Debt'], ['goals', 'Goals']];

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 28, height: 28, borderRadius: 12, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--surface)' }} />
      </span>
      <H as="span" size={21} tight={2}>Steady</H>
    </div>
  );
}

function NavButtons({ style }: { style: CSSProperties }) {
  const { s, set } = useApp();
  return <>{TABS.map(([id, label]) => {
    const on = s.tab === id;
    return <button key={id} aria-current={on ? 'page' : undefined} onClick={() => set({ tab: id, openCat: null })} style={{ border: 'none', fontWeight: 700, background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent-ink)' : 'var(--muted)', ...style }}>{label}</button>;
  })}</>;
}

function Header() {
  const { s, set, dark, actions } = useApp();
  const web = s.view === 'web';
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'var(--surface)', borderBottom: '1px solid var(--line2)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 12px' }}>
        <Logo />
        {web && <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><NavButtons style={{ borderRadius: 999, padding: '10px 18px', fontSize: 15 }} /></nav>}
        <div style={{ flex: 1 }} />
        {web && <button className="btn-pop" onClick={() => actions.openLog()} style={{ padding: '11px 20px', fontSize: 15 }}><span style={{ fontSize: 20, lineHeight: 1, fontWeight: 500 }}>+</span>Log spending</button>}
        <button className="btn-soft" onClick={actions.openSettings}>Settings</button>
        <button className="btn-soft" onClick={() => set({ theme: dark ? 'light' : 'dark' })} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid currentColor', background: 'linear-gradient(90deg,currentColor 50%,transparent 50%)' }} />{dark ? 'Light' : 'Dark'}
        </button>
        <Seg variant="lift" value={s.view} options={[['web', 'Web'], ['mobile', 'Mobile']] as const} onPick={v => set({ view: v })} btn={{ padding: '8px 14px', fontSize: 14 }} />
      </div>
    </header>
  );
}

function Toast() {
  const { s } = useApp();
  if (!s.toast) return null;
  return (
    <div role="status" style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 40px)', maxWidth: 400, zIndex: 60, background: 'var(--ink)', color: 'var(--on)', borderRadius: 24, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 2, boxShadow: 'var(--toast-sh)' }}>
      <div style={{ fontWeight: 600, fontSize: 16 }}>{s.toast.title}</div>
      <div style={{ fontSize: 14, color: 'var(--toast-sub)' }}>{s.toast.sub}</div>
    </div>
  );
}

function MobileNav() {
  const { actions } = useApp();
  return (
    <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 440, zIndex: 30, padding: '0 16px 16px', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 12 }}>
        <button className="btn-pop" onClick={() => actions.openLog()} style={{ pointerEvents: 'auto', padding: '16px 24px', fontSize: 17 }}><span style={{ fontSize: 22, lineHeight: 1, fontWeight: 500 }}>+</span>Log spending</button>
      </div>
      <nav className="card" style={{ pointerEvents: 'auto', borderRadius: 32, padding: 6, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 4 }}>
        <NavButtons style={{ borderRadius: 24, padding: '14px 0', fontSize: 15 }} />
      </nav>
    </div>
  );
}

export function App() {
  const { s } = useApp();
  const web = s.view === 'web';
  return (
    <div style={{ minHeight: '100vh', background: web ? 'var(--page)' : 'var(--mobile-bg)' }}>
      <Header />
      <Onboarding />
      <Toast />
      <main style={{ maxWidth: web ? 1200 : 440, margin: '0 auto', padding: web ? '8px 32px 80px' : '0 20px 180px', background: web ? 'transparent' : 'var(--page)', minHeight: 'calc(100vh - 66px)' }}>
        {s.tab === 'home' && <Home />}
        {s.tab === 'bills' && <Bills />}
        {s.tab === 'debt' && <Debt />}
        {s.tab === 'goals' && <Goals />}
      </main>
      {!web && <MobileNav />}
      <SheetHost />
    </div>
  );
}
