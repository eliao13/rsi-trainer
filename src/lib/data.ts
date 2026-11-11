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
