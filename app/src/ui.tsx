import type { CSSProperties, ReactNode } from 'react';

type Opt<T extends string> = readonly [T, string];

/** Segmented control. "ink" fills the active option with ink; "lift" raises it on a white chip. */
export function Seg<T extends string>({ value, options, onPick, variant = 'ink', btn, className = 'seg', style }: {
  value: T; options: readonly Opt<T>[]; onPick: (v: T) => void; variant?: 'ink' | 'lift'; btn?: CSSProperties; className?: string; style?: CSSProperties;
}) {
  return (
    <div className={className} style={style} role="group">
      {options.map(([id, label]) => {
        const on = id === value;
        const look: CSSProperties = variant === 'ink'
          ? { background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--on)' : 'var(--muted)' }
          : { background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--ink)' : 'var(--muted)', boxShadow: on ? 'var(--seg-sh)' : 'none' };
        return <button key={id} aria-pressed={on} onClick={() => onPick(id)} style={{ padding: '7px 12px', fontSize: 13, ...look, ...btn }}>{label}</button>;
      })}
    </div>
  );
}

/** Radio-style choice card used for budget periods and payoff strategies. */
export function RadioCard({ on, onClick, children, style, dot = 20, offRing = 'var(--surface)' }: {
  on: boolean; onClick: () => void; children: ReactNode; style?: CSSProperties; dot?: number; offRing?: string;
}) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', border: '2px solid ' + (on ? 'var(--accent-ink)' : offRing), background: on ? 'var(--accent-softer)' : 'var(--surface)', borderRadius: 24, padding: 16, color: 'var(--ink)', ...style }}>
      <RadioDot on={on} size={dot} />
      {children}
    </button>
  );
}
export function RadioDot({ on, size = 20 }: { on: boolean; size?: number }) {
  return (
    <span className="radio-ring" style={{ width: size, height: size, border: '2px solid ' + (on ? 'var(--accent-ink)' : 'var(--line3)') }}>
      <span className="dot" style={{ width: size / 2, height: size / 2, background: on ? 'var(--accent)' : 'transparent' }} />
    </span>
  );
}

export function Bar({ pct, color = 'var(--accent)', h = 10, track, style }: { pct: number | string; color?: string; h?: number; track?: string; style?: CSSProperties }) {
  return (
    <div className="bar" style={{ height: h, background: track, ...style }}>
      <div style={{ width: typeof pct === 'number' ? pct + '%' : pct, background: color }} />
    </div>
  );
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="dot" style={{ width: size, height: size, background: color }} />;
}

/** Big headline/number text in the current headline font. */
export function H({ size, tight = 0, style, children, as: Tag = 'div' }: { size: number; tight?: 0 | 2 | 3; style?: CSSProperties; children: ReactNode; as?: 'div' | 'span' }) {
  return <Tag className={'hl' + (tight ? ' hl' + tight : '')} style={{ fontSize: size, ...style }}>{children}</Tag>;
}

export function Switch({ on }: { on: boolean }) {
  return (
    <span style={{ width: 36, height: 20, borderRadius: 999, background: on ? 'var(--accent)' : 'var(--line3)', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', padding: 2, flexShrink: 0 }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--surface)' }} />
    </span>
  );
}

export const primaryBg = (ok: boolean) => ok ? 'var(--accent)' : 'var(--disabled)';
export const rowBorder = (i: number, n: number, c = 'var(--line)') => i === n - 1 ? 'none' : '1px solid ' + c;
