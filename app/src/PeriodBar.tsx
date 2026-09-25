import type { CSSProperties } from 'react';
import { TODAY, WD, dt, fmtD } from './lib/dates';
import { firstDay, nextPayOf, period } from './lib/model';
import { RECENT_PAGE, useApp } from './store';
import { H } from './ui';

const roundBtn: CSSProperties = { width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--surface)', fontSize: 18, fontWeight: 700, color: 'var(--ink)' };

/** Budget period switcher shown at the top of every tab. The selected period applies app-wide. */
export function PeriodBar() {
  const { s, set } = useApp();
  const P = period(s, s.offset), isPast = s.offset < 0;
  const canPrev = period(s, s.offset - 1).end >= firstDay(s);
  const daysLeft = P.end - TODAY + 1;
  const nextPay = Math.min(...s.incomes.map(nextPayOf).filter(x => x != null), Infinity);
  const go = (offset: number) => set({ offset, openCat: null, recentShown: RECENT_PAGE });
  const meta = isPast ? 'Past period · ' + fmtD(P.start) + ' – ' + fmtD(P.end)
    : 'Today is ' + WD[dt(TODAY).getUTCDay()] + ', ' + fmtD(TODAY) + (nextPay < Infinity ? ' · payday in ' + (nextPay - TODAY) + ' day' + (nextPay - TODAY === 1 ? '' : 's') : '') + ' · new period in ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's');
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button aria-label="Previous period" style={{ ...roundBtn, opacity: canPrev ? 1 : 0.35 }} onClick={() => canPrev && go(s.offset - 1)}>‹</button>
        <H size={20} style={{ padding: '0 6px' }}>{P.label}</H>
        <button aria-label="Next period" style={{ ...roundBtn, opacity: isPast ? 1 : 0.35 }} onClick={() => isPast && go(s.offset + 1)}>›</button>
        {isPast && <button onClick={() => go(0)} style={{ marginLeft: 6, background: 'var(--surface)', color: 'var(--accent-ink)', border: '2px solid var(--bd)', boxShadow: 'var(--sh-sm)', borderRadius: 999, padding: '7px 14px', fontSize: 14, fontWeight: 700 }}>Back to now</button>}
      </div>
      <div className="muted" style={{ fontSize: 14 }}>{meta}</div>
    </div>
  );
}

/** Shown on tabs that don't keep history (Debt, Goals) while a past period is selected. */
export function CurrentOnlyNotice({ what }: { what: string }) {
  const { s, set } = useApp();
  if (s.offset >= 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--surface)', border: '2px dashed var(--line3)', borderRadius: 22, padding: '12px 16px' }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</span>
      <span className="pretty" style={{ flex: 1, minWidth: 200, fontSize: 14 }}>You’re looking at a past period, but {what} always show today’s figures.</span>
      <button className="btn-link" onClick={() => set({ offset: 0, openCat: null, recentShown: RECENT_PAGE })} style={{ padding: 0, fontSize: 14 }}>Back to now</button>
    </div>
  );
}
