import { describe, expect, it } from 'vitest';
import type { Series, Trade } from '../types';
import { CHART_STOP } from '../types';
import { aggBars, rsi } from './indicators';
import { entrySwing, swingBreakMinute } from './levels';
import { findDivergences } from './divergence';
import { bearStyle, firstTouch, lessonLines } from './trade';

const T0 = 1_700_000_100; // entry time (s); bar index of its 5m bar = floor(T0/300)
function trade(over: Partial<Trade> = {}): Trade {
  return { id: 1, t: T0, d: '2023-11-14', hm: '10:00', setup: 'Daytrade', tk: 'QQQ', r: 'C', k: 400, exp: '2023-11-14', dte: 0, e: 1, note: '',
    ci: 'NDQ100', mx: 0, mxm: 0, path: Array.from({ length: 60 }, (_, i) => [i + 1, 100] as [number, number]), ev: [], img: '', tod: 'morning', b4: null, bd: null, ...over };
}
/** 5-minute series from [low, high, close] triples, the last `before` bars completing before entry. */
function series5(bars: [number, number, number][], before: number): Series {
  const first = Math.floor(T0 / 300) - before;
  return { t: bars.map((_, i) => first + i), o: bars.map((b) => b[2]), l: bars.map((b) => b[0]), h: bars.map((b) => b[1]), c: bars.map((b) => b[2]) };
}

describe('entry swing stop', () => {
  // three bars before entry with lows 98, 97, 99 -> swing low 97; then bars after entry
  const S = series5([[98, 101, 100], [97, 100, 99], [99, 102, 101], [98, 101, 99], [96, 99, 96.5], [95, 97, 96]], 3);
  it('uses the lowest low of the last three candles for calls, highest high for puts', () => {
    expect(entrySwing(S, trade({ r: 'C' }))).toBe(97);
    expect(entrySwing(S, trade({ r: 'P' }))).toBe(102);
  });
  it('triggers on the first 5m close past the level, not a wick', () => {
    // bar 3 (the entry bar) closes 99 > 97: holds. bar 4 closes 96.5 < 97 -> stop at its close
    const m = swingBreakMinute(S, trade(), 97)!;
    const barEnd = (Math.floor(T0 / 300) + 2) * 300;
    expect(m).toBe(Math.ceil((barEnd - T0) / 60));
  });
  it('returns null when it never breaks', () => expect(swingBreakMinute(S, trade(), 90)).toBeNull());
  it('the chart stop exits at that minute; a % stop ignores it', () => {
    const t = trade({ path: Array.from({ length: 30 }, (_, i) => [i + 1, 100 - i] as [number, number]) });
    expect(firstTouch(t, 0, 30, { t: 0, s: CHART_STOP }, 7)).toMatchObject({ m: 7, why: 'stop' });
    expect(firstTouch(t, 0, 30, { t: 0, s: CHART_STOP }, null)).toBeNull();
    expect(firstTouch(t, 0, 30, { t: 0, s: 20 }, 7)).toMatchObject({ m: 21, why: 'stop' });
  });
  it('Bear-style exit uses the swing break before the first trim', () => {
    const t = trade({ path: [[1, 95], [2, 90], [3, 85], [4, 130]] });
    expect(bearStyle(t, 2).r).toBeCloseTo(-10); // broke at minute 2, option -10%
    expect(bearStyle(t, null).r).toBeCloseTo((23 + 30) / 2); // never broke: trims at +23%, holds
    expect(bearStyle(t).r).toBeCloseTo((23 + 30) / 2); // unknown: old -30% rule, never hit
  });
});

describe('divergences', () => {
  // price: falls to a low, bounces, then a lower low; RSI makes a higher low (selling slowed)
  const closes = [...Array.from({ length: 30 }, (_, i) => 120 - i), 92, 93, 95, 96, 95, 94, 93, 92, 91.5, 91.2, 90.5, 92, 93];
  const B: Series = { t: closes.map((_, i) => i), o: closes, h: closes.map((c) => c + 0.2), l: closes.map((c) => c - 0.2), c: closes };
  it('finds a bullish divergence: lower low in price, higher low in RSI', () => {
    const d = findDivergences(B, rsi(B.c));
    expect(d.map((x) => x.type)).toContain('bull');
    const bull = d.find((x) => x.type === 'bull')!;
    expect(B.l[bull.i2]).toBeLessThan(B.l[bull.i1]);
  });
  it('finds nothing in a steady trend', () => {
    const up = Array.from({ length: 60 }, (_, i) => 100 + i);
    const U: Series = { t: up.map((_, i) => i), o: up, h: up, l: up, c: up };
    expect(findDivergences(U, rsi(U.c))).toEqual([]);
  });
  it('lesson mentions a divergence that matches the side', () => {
    const L = lessonLines(trade({ r: 'C' }), null, { div15: [{ type: 'bull', i1: 1, i2: 9 }], div5: [], swing: 97, swingBreakM: null });
    expect(L.join(' ')).toContain('bullish 15m divergence');
    expect(L.join(' ')).toContain('held for the rest of the trade');
  });
});

describe('1-minute series', () => {
  it('aggregates 1-minute bars to 5-minute bars', () => {
    const S: Series = { base: 1, t: [0, 1, 2, 3, 4, 5], o: [1, 2, 3, 4, 5, 6], h: [1, 9, 3, 4, 5, 6], l: [1, 2, 0, 4, 5, 6], c: [1, 2, 3, 4, 5, 6] };
    const B = aggBars(S, 6 * 60, 5);
    expect(B.c).toEqual([5, 6]); expect(B.h[0]).toBe(9); expect(B.l[0]).toBe(0); expect(B.t).toEqual([0, 300]);
    expect(aggBars(S, 3 * 60, 1).c).toEqual([1, 2, 3]); // only bars completed by the cursor
  });
});
