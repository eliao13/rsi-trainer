import type { Series } from '../types';

export interface Divergence { type: 'bull' | 'bear'; i1: number; i2: number }

/** Swing points: bar i is a pivot if it is the extreme of the k bars on each side. */
function pivots(v: number[], k: number, low: boolean): number[] {
  const out: number[] = [];
  for (let i = k; i < v.length - k; i++) {
    let ok = true;
    for (let j = i - k; j <= i + k && ok; j++) if (j !== i && (low ? v[j] < v[i] : v[j] > v[i])) ok = false;
    if (ok) out.push(i);
  }
  return out;
}

/**
 * Classic RSI divergences on bars completed by entry: price makes a lower low while RSI makes
 * a higher low (bullish), or a higher high while RSI makes a lower high (bearish). Only the
 * most recent pair of swings counts, and the later swing must be close to entry.
 */
export function findDivergences(B: Series, R: (number | null)[], opts = { k: 2, recent: 12, minGap: 4, maxGap: 40 }): Divergence[] {
  const n = B.c.length, out: Divergence[] = [];
  const check = (low: boolean) => {
    const pv = pivots(low ? B.l : B.h, opts.k, low).filter((i) => R[i] != null);
    if (pv.length < 2) return;
    const i2 = pv[pv.length - 1];
    if (n - 1 - i2 > opts.recent) return;
    for (let a = pv.length - 2; a >= 0; a--) {
      const i1 = pv[a], gap = i2 - i1;
      if (gap < opts.minGap) continue;
      if (gap > opts.maxGap) break;
      const r1 = R[i1] as number, r2 = R[i2] as number;
      if (low && B.l[i2] < B.l[i1] && r2 > r1) out.push({ type: 'bull', i1, i2 });
      if (!low && B.h[i2] > B.h[i1] && r2 < r1) out.push({ type: 'bear', i1, i2 });
      break; // compare with the previous swing only
    }
  };
  check(true); check(false);
  return out;
}
