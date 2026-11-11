import type { Series, Trade } from '../types';
import { aggBars } from './indicators';

/**
 * Bear's invalidation, simplified: the entry swing. For calls, the lowest low of the last
 * three completed 5-minute candles before entry; for puts, the highest high.
 */
export function entrySwing(S: Series | null, t: Trade, candles = 3): number | null {
  if (!S) return null;
  const B = aggBars(S, t.t, 5), n = B.c.length;
  if (n < candles) return null;
  const lows = B.l.slice(n - candles), highs = B.h.slice(n - candles);
  return t.r === 'C' ? Math.min(...lows) : Math.max(...highs);
}

/**
 * Minutes after entry when a 5-minute candle first *closes* beyond the swing
 * ("you need a candle close"), or null if it held until the trade's last minute.
 */
export function swingBreakMinute(S: Series | null, t: Trade, level: number | null): number | null {
  if (!S || level == null) return null;
  const last = t.path[t.path.length - 1][0];
  for (let i = 0; i < S.t.length; i++) {
    const end = (S.t[i] + 1) * 300; // bar close time, seconds
    if (end <= t.t) continue;
    const m = Math.ceil((end - t.t) / 60);
    if (m > last) break;
    if (t.r === 'C' ? S.c[i] < level : S.c[i] > level) return m;
  }
  return null;
}
