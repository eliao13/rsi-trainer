import type { Series, Trade, TradeIndex } from '../types';

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

/** The trade list: small enough to load first. Per-minute prices and messages come from loadTrade. */
export async function loadTrades(): Promise<TradeIndex[]> {
  await loadScript('data/trades_index.js');
  return window.BEAR_TRADES || [];
}

const full = new Map<number, Trade>(); // one object per trade, so identity checks stay stable
/** A trade with its option-price path and Bear's messages, from its month's detail file. */
export async function loadTrade(t: TradeIndex): Promise<Trade> {
  const hit = full.get(t.id); if (hit) return hit;
  const month = t.d.slice(0, 7);
  await loadScript('data/detail/' + month + '.js');
  const d = window.BEAR_DETAIL?.[month]?.[t.id];
  if (!d) throw new Error('No detail for trade ' + t.id);
  const tr: Trade = { ...t, path: d[0], ev: d[1] };
  full.set(t.id, tr);
  return tr;
}

async function loadBars(ci: string, month: string) {
  const key = ci + '_' + month;
  if (!window.BEAR_BARS?.[key]) await loadScript('data/bars/' + key + '.js').catch(() => undefined);
  return window.BEAR_BARS?.[key] || null;
}

/** UTC months ("YYYY-MM") of the bars a trade needs: about nine days before entry through the next day. */
export function barMonths(entrySec: number): string[] {
  const a = new Date((entrySec - 9 * 86400) * 1000).toISOString().slice(0, 7), b = new Date((entrySec + 86400) * 1000).toISOString().slice(0, 7);
  return a === b ? [a] : [a, b];
}

/** 5-minute bars around the trade: its month, plus the previous one early in a month (for RSI history). */
export async function loadSeries(t: TradeIndex): Promise<Series> {
  const parts = await Promise.all(barMonths(t.t).map((m) => loadBars(t.ci, m)));
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
export const m1Key = (t: TradeIndex) => t.ci + '_' + t.d.slice(0, 4);

/** 1-minute bars for the trade's day, or null if not exported. */
export async function loadM1(t: TradeIndex): Promise<Series | null> {
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
