import type { RsiState, Series } from '../types';

/** Wilder's RSI. Returns null until there is enough history. */
export function rsi(c: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(c.length).fill(null);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n;
    l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

/** Bollinger Bands (population SD) over a series that may start with nulls. */
export function bands(v: (number | null)[], n = 34, k = 2) {
  const mid: (number | null)[] = new Array(v.length).fill(null), up = mid.slice(), lo = mid.slice();
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1 || v[i - n + 1] === null) continue;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += v[j] as number;
    const m = s / n;
    let q = 0;
    for (let j = i - n + 1; j <= i; j++) q += ((v[j] as number) - m) ** 2;
    const sd = Math.sqrt(q / n);
    mid[i] = m; up[i] = m + k * sd; lo[i] = m - k * sd;
  }
  return { mid, up, lo };
}

/**
 * Bars completed by `cursorSec`, aggregated to `mins` minutes. `S.t` is a bar index in units of
 * `S.base` minutes (5 for the main series, 1 for the 1-minute series); output `t` is in seconds.
 */
export function aggBars(S: Series, cursorSec: number, mins: number): Series {
  const base = S.base || 5, n = Math.max(1, mins / base), out: Series = { t: [], o: [], h: [], l: [], c: [] };
  let lastG: number | null = null;
  for (let i = 0; i < S.t.length; i++) {
    if ((S.t[i] + 1) * base * 60 > cursorSec) break;
    const g = Math.floor(S.t[i] / n);
    if (g !== lastG) {
      out.t.push(g * n * base * 60); out.o.push(S.o[i]); out.h.push(S.h[i]); out.l.push(S.l[i]); out.c.push(S.c[i]); lastG = g;
    } else {
      const k = out.t.length - 1;
      if (S.h[i] > out.h[k]) out.h[k] = S.h[i];
      if (S.l[i] < out.l[k]) out.l[k] = S.l[i];
      out.c[k] = S.c[i];
    }
  }
  return out;
}

/** RSI, its median and bands on a timeframe at the entry candle. */
export function rsiAt(S: Series | null, entrySec: number, mins: number): RsiState | null {
  if (!S) return null;
  const B = aggBars(S, entrySec, mins);
  if (B.c.length < 60) return null;
  const R = rsi(B.c.slice(-300)), bb = bands(R), i = R.length - 1;
  return bb.mid[i] == null ? null : [R[i] as number, bb.mid[i] as number, bb.up[i] as number, bb.lo[i] as number];
}

export function niceStep(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
