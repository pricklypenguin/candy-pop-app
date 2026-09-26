/**
 * Whether sync is offered in this build / on this device.
 *
 * VITE_SYNC (set at build time):
 *   off  – sync is never shown.
 *   labs – hidden, except in browsers that opened the app once with ?labs=sync (?labs=off hides it again).
 *   on   – shown to everyone.
 * With sync hidden or never turned on, the app makes no network requests to the sync server.
 */
const LABS_KEY = 'steady.labs';
const mode = import.meta.env.VITE_SYNC || 'labs';
export const SYNC_URL = (import.meta.env.VITE_SYNC_URL || '').replace(/\/$/, '');

function labsOn() {
  try {
    const q = new URLSearchParams(location.search).get('labs');
    if (q === 'sync') localStorage.setItem(LABS_KEY, 'sync');
    if (q === 'off') localStorage.removeItem(LABS_KEY);
    return localStorage.getItem(LABS_KEY) === 'sync';
  } catch { return false; }
}

export const syncAvailable = !!SYNC_URL && (mode === 'on' || (mode === 'labs' && labsOn()));
