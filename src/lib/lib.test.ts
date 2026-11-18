import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { aggBars, bands, rsi, trama, vwapOnChart } from './indicators';
import { bearStyle, firstTouch, lessonLines, optAt, pctAt } from './trade';
import { noteCutoff, relevantFor, timeline } from './messages';
import { idFromName } from './charts';

function trade(over: Partial<Trade> = {}): Trade {
  return {
    id: 1, t: 0, d: '2025-01-15', hm: '10:00', setup: 'Daytrade', tk: 'QQQ', r: 'C', k: 480, exp: '2025-01-15', dte: 0, e: 1, note: '',
    ci: 'NDQ100', mx: 0, mxm: 0, path: [[1, 100]], ev: [], img: '', tod: 'morning', b4: null, bd: null, ...over,
  };
}
// path from a list of % moves, one per minute, entry $1.00
const pathOf = (pcts: number[]): [number, number][] => pcts.map((p, i) => [i + 1, Math.round(100 + p)]);

describe('indicators', () => {
  it('VWAP: hlc3 x volume from the session start, regrouped per timeframe, reset each day, scaled to the chart', () => {
    // three 5-minute ETF bars on day 1 (one 15-minute bucket) and one on day 2; h = l = c, so hlc3 = c
    const d1 = 999990, d2 = d1 + 24 * 60;
    const etf = { base: 5, t: [d1, d1 + 5, d1 + 10, d2], h: [10, 12, 11.5, 20], l: [10, 12, 11.5, 20], c: [10, 12, 11.5, 20], v: [100, 300, 100, 50] };
    const chart = (ts: number[], c: number[]) => ({ t: ts.map((m) => m * 60), o: c, h: c, l: c, c });
    // 5-minute chart at 10x the ETF price
    const v5 = vwapOnChart(chart([d1, d1 + 5, d1 + 10, d2], [100, 120, 115, 200]), etf, 5);
    expect(v5[0]).toBeCloseTo(100, 9);
    expect(v5[1]).toBeCloseTo(((10 * 100 + 12 * 300) / 400) * 10, 9);
    expect(v5[2]).toBeCloseTo(((10 * 100 + 12 * 300 + 11.5 * 100) / 500) * 10, 9);
    expect(v5[3]).toBeCloseTo(200, 9); // new day starts over
    // 15-minute chart: the three bars become one (h 12, l 10, c 11.5, v 500), as TradingView would build it
    const v15 = vwapOnChart(chart([d1], [115]), etf, 15);
    expect(v15[0]).toBeCloseTo(((12 + 10 + 11.5) / 3) * 10, 9);
    // 1-minute chart cannot be built from 5-minute ETF bars
    expect(vwapOnChart(chart([d1], [100]), etf, 1)[0]).toBeNull();
  });
  it('TRAMA: flat until it has a window, follows a steady trend, holds still in a range', () => {
    const n = 5, up = Array.from({ length: 40 }, (_, i) => 100 + i);
    const t = trama(up.map((v) => v + 0.5), up.map((v) => v - 0.5), up, n);
    expect(t[2 * n - 2]).toBeNull();
    expect(t[2 * n - 1]).toBe(up[2 * n - 1]); // seeds on the close
    // every bar makes a new high, so tc = 1 and it tracks the close exactly
    expect(t[39]).toBeCloseTo(139, 9);
    const flat = new Array(40).fill(100), ft = trama(flat.map(() => 101), flat.map(() => 99), flat.map((v, i) => v + (i % 2 ? 0.5 : -0.5)), n);
    expect(ft[39]).toBe(ft[2 * n - 1]); // no new highs or lows: tc = 0, it does not move
  });
  it('RSI is 100 on a straight rise and 0 on a straight fall', () => {
    const up = Array.from({ length: 30 }, (_, i) => i), down = up.slice().reverse();
    expect(rsi(up)[29]).toBe(100);
    expect(rsi(down)[29]).toBe(0);
    expect(rsi(up)[13]).toBeNull();
  });
  it('RSI matches a hand-checked value', () => {
    // alternating +2 / -1: avg gain 1, avg loss 0.5 over the seed window -> RSI ~66.7
    const c = [100]; for (let i = 1; i <= 15; i++) c.push(c[i - 1] + (i % 2 ? 2 : -1));
    expect(rsi(c)[14]).toBeCloseTo(100 - 100 / (1 + 14 / 7), 6); // 7 gains of 2, 7 losses of 1
  });
  it('bands: flat series has zero width', () => {
    const b = bands(new Array(40).fill(50));
    expect(b.mid[39]).toBe(50); expect(b.up[39]).toBe(50); expect(b.lo[39]).toBe(50); expect(b.mid[32]).toBeNull();
  });
  it('aggBars builds 15-minute bars and stops at the cursor', () => {
    const S = { t: [0, 1, 2, 3, 4, 5], o: [1, 2, 3, 4, 5, 6], h: [2, 3, 9, 5, 6, 7], l: [0, 1, 2, 3, 4, 5], c: [2, 3, 4, 5, 6, 7] };
    const B = aggBars(S, 5 * 300, 15); // bars 0..4 complete
    expect(B.c).toEqual([4, 6]); expect(B.h).toEqual([9, 6]); expect(B.o).toEqual([1, 4]);
  });
});

describe('trade maths', () => {
  it('optAt holds the last known price', () => {
    const t = trade({ path: [[1, 100], [5, 150]] });
    expect(optAt(t, 3)).toBe(1); expect(optAt(t, 7)).toBe(1.5); expect(pctAt(t, 5)).toBeCloseTo(50);
  });
  it('firstTouch finds the first minute the target or stop is hit', () => {
    const t = trade({ path: pathOf([5, -10, 25, -40]) });
    expect(firstTouch(t, 0, 10, { t: 23, s: 30 })).toEqual({ m: 3, p: 25, why: 'target' });
    expect(firstTouch(t, 3, 10, { t: 23, s: 30 })).toEqual({ m: 4, p: -40, why: 'stop' });
    expect(firstTouch(t, 0, 2, { t: 23, s: 30 })).toBeNull(); // not reached within the step
    expect(firstTouch(t, 0, 10, { t: 0, s: 0 })).toBeNull(); // no plan
  });
  it('bearStyle: trim at +23%, stop at break-even', () => {
    expect(bearStyle(trade({ path: pathOf([10, 30, -5]) })).r).toBe(11.5);
    expect(bearStyle(trade({ path: pathOf([10, 30, 80]) })).r).toBeCloseTo((23 + 80) / 2);
    expect(bearStyle(trade({ path: pathOf([-10, -35]) })).r).toBe(-30);
  });
  it('lesson wording matches the side', () => {
    const r15: [number, number, number, number] = [60, 50, 80, 20];
    expect(lessonLines(trade({ r: 'P' }), r15).join(' ')).toContain('shorted the pop');
    expect(lessonLines(trade({ r: 'C' }), [40, 50, 80, 20]).join(' ')).toContain('bought the dip');
  });
});

describe('message filter', () => {
  const q = trade({ tk: 'QQQ', k: 480 });
  const note = (x: string) => ({ m: 5, k: 'note' as const, x });
  it.each([
    ['De risk out of entire avg down! that a 16c move', true],
    ['Actually I’m going to fully close my 240C to cover some losses', false],
    ['Today was payout on TRMD and they are flying lol', false],
    ['PT HIT', true],
    ['UVXY HEDGE IN THE GREEN!', false],
    ['Trimming my 480C here', true],
    ['SL to BE on runners, PA looking heavy', true],
    ['$MRO 32C 6/10 putting a SL 0.55', false],
    ['With NQ falling will close out the rest of NVDA', true], // names this index too
  ])('%s', (x, want) => expect(relevantFor(q, note(x))).toBe(want));
  it('always keeps his trims and updates', () => expect(relevantFor(q, { m: 1, k: 'trim', p: 20, x: 'AMZN news hurt' })).toBe(true));
  it('hides notes after the cutoff', () => {
    const t = trade({ ev: [{ m: 10, k: 'trim', p: 30 }, note('runners left'), { m: 50, k: 'note', x: 'see you tomorrow' }] });
    expect(noteCutoff(t)).toBe(45);
    const tl = timeline(t, 999);
    expect(tl.shown.length).toBe(2); expect(tl.hidden.map((e) => e.x)).toEqual(['see you tomorrow']);
    expect(timeline(t, 6).shown.length).toBe(1); // only what has happened by minute 6
  });
});

describe('chart files', () => {
  it('reads the trade id from a screenshot name', () => {
    expect(idFromName('bear-ideas_charts_by_outcome/2_x/0008_2022-06-06_Lotto_SPY_414C.png')).toBe(8);
    expect(idFromName('3174_2026-08-11_Lotto.jpg')).toBe(3174);
    expect(idFromName('notes.txt')).toBeNull();
  });
});
