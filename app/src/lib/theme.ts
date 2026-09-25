export type ThemePref = 'light' | 'dark' | 'auto';

export const FONTS: Record<string, { ff: string; weight: string; ls: string; ff2: string }> = {
  'Baloo': { ff: "'Baloo 2',sans-serif", weight: '800', ls: '-0.01em', ff2: "'tnum' 1" },
  'Sora': { ff: "'Sora',sans-serif", weight: '600', ls: '-0.02em', ff2: "'tnum' 1" },
  'Outfit': { ff: "'Outfit',sans-serif", weight: '700', ls: '-0.02em', ff2: "'tnum' 1" },
  'Young Serif': { ff: "'Young Serif',serif", weight: '400', ls: '-0.01em', ff2: 'normal' }
};
export const FONT_IDS = Object.keys(FONTS);
export const DEFAULT_FONT = 'Baloo';

// [light, dark] page backgrounds.
export const BGS: Record<string, [string, string]> = {
  'Candy stripes': ['repeating-linear-gradient(135deg, #FFE3EF 0 22px, #FFD2E5 22px 44px)', 'repeating-linear-gradient(135deg, #1C1020 0 22px, #22142A 22px 44px)'],
  'Polka dots': ['radial-gradient(#FFB3D4 2.2px, transparent 2.6px) 0 0/24px 24px, #FFE3EF', 'radial-gradient(#3A2340 2.2px, transparent 2.6px) 0 0/24px 24px, #1C1020'],
  'Sprinkles': ['radial-gradient(circle at 20% 30%, #9B5CFF 2.6px, transparent 3.2px) 0 0/64px 64px, radial-gradient(circle at 70% 62%, #1FC7A0 2.6px, transparent 3.2px) 0 0/64px 64px, radial-gradient(circle at 45% 88%, #FFB81A 2.6px, transparent 3.2px) 0 0/64px 64px, radial-gradient(circle at 88% 14%, #3DA9FF 2.6px, transparent 3.2px) 0 0/64px 64px, #FFE3EF', 'radial-gradient(circle at 20% 30%, rgba(183,138,255,.5) 2.6px, transparent 3.2px) 0 0/64px 64px, radial-gradient(circle at 70% 62%, rgba(79,221,185,.5) 2.6px, transparent 3.2px) 0 0/64px 64px, radial-gradient(circle at 45% 88%, rgba(255,203,85,.5) 2.6px, transparent 3.2px) 0 0/64px 64px, radial-gradient(circle at 88% 14%, rgba(111,192,255,.5) 2.6px, transparent 3.2px) 0 0/64px 64px, #1C1020'],
  'Bubblegum': ['#FFD6E8', '#241329']
};
export const BG_IDS = Object.keys(BGS);
export const DEFAULT_BG = 'Candy stripes';

export const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
export const resolveDark = (pref: ThemePref | undefined) => pref === 'dark' || (pref === 'auto' && systemDark());

export function applyTheme(dark: boolean, font: string, bg: string) {
  const root = document.documentElement, r = root.style;
  root.dataset.theme = dark ? 'dark' : 'light';
  r.colorScheme = dark ? 'dark' : 'light';
  const f = FONTS[font] || FONTS[DEFAULT_FONT];
  r.setProperty('--hf', f.ff); r.setProperty('--hw', f.weight); r.setProperty('--hls', f.ls); r.setProperty('--hff', f.ff2);
  r.setProperty('--page', (BGS[bg] || BGS[DEFAULT_BG])[dark ? 1 : 0]);
}
