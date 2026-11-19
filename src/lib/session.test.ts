import { describe, expect, it } from 'vitest';
import type { Answer, TradeIndex } from '../types';
import { repState, summarize } from './session';

const tr = (id: number, over: Partial<TradeIndex> = {}): TradeIndex => ({
  id, t: 0, d: '2025-01-15', hm: '10:00', setup: 'Daytrade', tk: 'QQQ', r: 'C', k: 480, exp: '2025-01-15', dte: 0, e: 1, note: '',
  ci: 'NDQ100', mx: 0, mxm: 0, img: '', tod: 'morning', b4: [60, 50, 80, 20], bd: null, t1: 30, ...over,
});

describe('sessions', () => {
  it('marks a rep ok only when side and (graded) size are right', () => {
    expect(repState({ id: 1, side: true, size: true })).toBe('ok');
    expect(repState({ id: 1, side: true, size: null })).toBe('ok');
    expect(repState({ id: 1, side: true, size: false })).toBe('miss');
    expect(repState({ id: 1, side: false, size: true })).toBe('miss');
    expect(repState({ id: 1, skip: true })).toBe('skip');
  });
  it('totals a session and picks the most common miss as the tip', () => {
    // trades 1-3: he bought calls against a 4h RSI below its median; trade 4 with it; 5 skipped
    const T = new Map([1, 2, 3].map((i) => [i, tr(i, { b4: [30, 50, 70, 35] })] as [number, TradeIndex]));
    T.set(4, tr(4)); T.set(5, tr(5));
    const A: Record<string, Answer> = {
      1: { g: 'P', match: false }, 2: { g: 'P', match: false }, 3: { g: 'C', match: true, exit: 40 }, 4: { g: 'C', match: true, exit: 10 },
    };
    const s = summarize({ ts: 0, reps: [
      { id: 1, side: false, size: true, pile: 'added' }, { id: 2, side: false, size: true, pile: 'added' },
      { id: 3, side: true, size: true, pile: 'cleared' }, { id: 4, side: true, size: false, pile: 'added' }, { id: 5, skip: true },
    ] }, A, T);
    expect(s.played).toBe(4); expect(s.skipped).toBe(1); expect(s.ok).toBe(1);
    expect(s.side).toEqual([2, 4]); expect(s.size).toEqual([3, 4]);
    expect(s.avgExit).toBe(25); expect(s.pileAdded).toBe(3); expect(s.pileCleared).toBe(1);
    expect(s.tip).toMatch(/against the 4h bias/); // 2 side misses against the bias beat 1 size miss and 1 early exit
  });
  it('only counts early exits you sold by hand', () => {
    const T = new Map([[1, tr(1)], [2, tr(2)]] as [number, TradeIndex][]);
    const held = summarize({ ts: 0, reps: [{ id: 1, side: true, size: true }, { id: 2, side: true, size: true }] },
      { 1: { g: 'C', match: true, exit: 5 }, 2: { g: 'C', match: true, exit: 5, exitWhy: 'stop' } }, T);
    expect(held.tip).not.toMatch(/sold below/);
    const sold = summarize({ ts: 0, reps: [{ id: 1, side: true, size: true }] }, { 1: { g: 'C', match: true, exit: 5, exitWhy: 'manual' } }, T);
    expect(sold.tip).toMatch(/sold below his first trim on 1 trade /);
  });
});
