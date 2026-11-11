import type { Series, Trade } from '../types';

// The data files are plain scripts that assign window globals, so they load without a bundler step.
const loading: Record<string, Promise<void>> = {};
function loadScript(src: string): Promise<void> {
  if (!loading[src]) {
    loading[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(el);
    });
  }
  return loading[src];
}

export async function loadTrades(): Promise<Trade[]> {
  await loadScript('data/trades.js');
  return window.BEAR_TRADES || [];
}

async function loadBars(ci: string, yr: number) {
  const key = ci + '_' + yr;
  if (!window.BEAR_BARS?.[key]) await loadScript('data/bars_' + key + '.js').catch(() => undefined);
  return window.BEAR_BARS?.[key] || null;
}

/** 5-minute bars for the trade's year (plus the previous year early in January, for history). */
export async function loadSeries(t: Trade): Promise<Series> {
  const yr = +t.d.slice(0, 4), mo = +t.d.slice(5, 7), dy = +t.d.slice(8, 10);
  const years = mo === 1 && dy <= 9 ? [yr - 1, yr] : [yr];
  const parts = await Promise.all(years.map((y) => loadBars(t.ci, y)));
  const s: Series = { t: [], o: [], h: [], l: [], c: [] };
  for (const p of parts) {
    if (!p) continue;
    const sc = p.scale;
    for (let i = 0; i < p.t.length; i++) {
      s.t.push(p.t[i]); s.o.push(p.o[i] / sc); s.h.push(p.h[i] / sc); s.l.push(p.l[i] / sc); s.c.push(p.c[i] / sc);
    }
  }
  return s;
}

// ---------- optional 1-minute bars (trade days only), produced by build_data.py ----------
let m1Keys: Promise<Set<string>> | null = null;
/** Instrument-years that have 1-minute data; empty until build_data.py has exported it. */
export function loadM1Keys(): Promise<Set<string>> {
  if (!m1Keys) m1Keys = loadScript('data/m1_index.js').then(() => new Set(window.BEAR_M1_KEYS || [])).catch(() => new Set<string>());
  return m1Keys;
}
export const m1Key = (t: Trade) => t.ci + '_' + t.d.slice(0, 4);

/** 1-minute bars for the trade's day, or null if not exported. */
export async function loadM1(t: Trade): Promise<Series | null> {
  const key = m1Key(t);
  if (!(await loadM1Keys()).has(key)) return null;
  if (!window.BEAR_M1?.[key]) await loadScript('data/m1_' + key + '.js').catch(() => undefined);
  const p = window.BEAR_M1?.[key];
  if (!p) return null;
  // the trade's ET session: 8:30 to 16:00 (minute indexes are unix minutes)
  const from = Math.floor(t.t / 60) - 600, to = Math.floor(t.t / 60) + 600;
  const s: Series = { base: 1, t: [], o: [], h: [], l: [], c: [] };
  let mn = 0;
  for (let i = 0; i < p.dt.length; i++) {
    mn += p.dt[i]; // delta-encoded minute index
    if (mn < from) continue;
    if (mn > to) break;
    s.t.push(mn); s.o.push(p.o[i] / p.scale); s.h.push(p.h[i] / p.scale); s.l.push(p.l[i] / p.scale); s.c.push(p.c[i] / p.scale);
  }
  return s.t.length ? s : null;
}
