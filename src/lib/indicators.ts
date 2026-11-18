import type { EtfSeries, RsiState, Series } from '../types';

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

/**
 * TRAMA, LuxAlgo's Trend Regularity Adaptive Moving Average (same maths as the TradingView script):
 * tc = SMA(new `n`-bar high or new `n`-bar low ? 1 : 0, n)^2, ama += tc * (close - ama).
 * Null until the SMA has a full window (bar 2n-1); RSI Trader uses n = 34.
 */
export function trama(h: number[], l: number[], c: number[], n = 34): (number | null)[] {
  const len = c.length, out: (number | null)[] = new Array(len).fill(null);
  const hit: number[] = new Array(len).fill(0);
  const hiN = (i: number) => { let m = -Infinity; for (let j = i - n + 1; j <= i; j++) if (h[j] > m) m = h[j]; return m; };
  const loN = (i: number) => { let m = Infinity; for (let j = i - n + 1; j <= i; j++) if (l[j] < m) m = l[j]; return m; };
  let prevH = NaN, prevL = NaN, sum = 0, ama: number | null = null;
  for (let i = 0; i < len; i++) {
    if (i >= n - 1) {
      const hh = hiN(i), ll = loN(i);
      if (i >= n) hit[i] = hh > prevH || ll < prevL ? 1 : 0;
      prevH = hh; prevL = ll;
    }
    sum += hit[i]; if (i >= n) sum -= hit[i - n];
    if (i >= 2 * n - 1) {
      const tc = (sum / n) ** 2;
      ama = ama == null ? c[i] : ama + tc * (c[i] - ama);
      out[i] = ama;
    }
  }
  return out;
}

/**
 * Session VWAP on chart bars, as TradingView draws it on the ETF chart: the ETF's bars are grouped into
 * the chart's timeframe, VWAP = cumulative hlc3 x volume / volume from each session's first bar, then
 * moved onto the chart's price scale by the ratio of the two closes on that bar (the chart shows the
 * index; RSI Trader trades the ETF). `bars.t` is bar start in seconds; null where the ETF has no bar.
 */
export function vwapOnChart(bars: Series, etf: EtfSeries | null, mins: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.t.length).fill(null);
  if (!etf || !etf.t.length || mins < etf.base) return out;
  const at = new Map<number, [number, number]>(); // bar start (s) -> [vwap, etf close]
  let g = NaN, h = 0, l = 0, c = 0, v = 0, pv = 0, vv = 0, last = -Infinity;
  const flush = () => { if (isNaN(g) || v <= 0) return; pv += ((h + l + c) / 3) * v; vv += v; at.set(g * mins * 60, [pv / vv, c]); };
  for (let i = 0; i < etf.t.length; i++) {
    const m = etf.t[i], gi = Math.floor(m / mins);
    if (gi !== g) {
      flush();
      if (m - last > 360) { pv = 0; vv = 0; } // more than 6 hours since the previous bar: new session
      g = gi; h = etf.h[i]; l = etf.l[i]; c = etf.c[i]; v = etf.v[i];
    } else { if (etf.h[i] > h) h = etf.h[i]; if (etf.l[i] < l) l = etf.l[i]; c = etf.c[i]; v += etf.v[i]; }
    last = m;
  }
  flush();
  for (let i = 0; i < bars.t.length; i++) {
    const hit = at.get(bars.t[i]);
    if (hit && hit[1] > 0) out[i] = hit[0] * (bars.c[i] / hit[1]);
  }
  return out;
}
