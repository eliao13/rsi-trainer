import { describe, expect, it } from 'vitest';
import { AFTER_MISS, AFTER_RIGHT, applyAnswer, dueText, isDue, nextDue, seedPile } from './pile';

const H = 3600e3, D = 24 * H;

describe('mistakes pile', () => {
  it('a miss joins the pile and waits a day; two rights in a row clear it', () => {
    let r = applyAnswer({}, 7, true, 1000);
    expect(r.status).toBe('added'); expect(r.pile['7']).toEqual({ n: 0, ts: 1000, due: 1000 + AFTER_MISS });
    expect(isDue(r.pile['7'], 1000 + AFTER_MISS - 1)).toBe(false);
    expect(isDue(r.pile['7'], 1000 + AFTER_MISS)).toBe(true);
    r = applyAnswer(r.pile, 7, false, 2000);
    expect(r.status).toBe('progress'); expect(r.pile['7']).toEqual({ n: 1, ts: 2000, due: 2000 + AFTER_RIGHT });
    r = applyAnswer(r.pile, 7, false, 3000);
    expect(r.status).toBe('cleared'); expect(r.cleared).toBe(true); expect(r.pile['7']).toBeUndefined();
  });
  it('a miss on a retry starts the count and the wait again', () => {
    const r = applyAnswer({ '7': { n: 1, ts: 1, due: 5 } }, 7, true, 50);
    expect(r.status).toBe('reset'); expect(r.pile['7']).toEqual({ n: 0, ts: 50, due: 50 + AFTER_MISS });
  });
  it('right answers on trades not in the pile change nothing', () => {
    const p = { '1': { n: 0, ts: 1 } }, r = applyAnswer(p, 2, false, 9);
    expect(r.status).toBeNull(); expect(r.pile).toBe(p);
  });
  it('seeds from earlier answers (due now): wrong side or wrong size, not ungraded size', () => {
    const p = seedPile({
      '1': { g: 'C', match: false, ts: 10 }, '2': { g: 'C', match: true, sizeOk: false }, '3': { g: 'P', match: true, sizeOk: null }, '4': { g: 'P', match: true, sizeOk: true },
    });
    expect(Object.keys(p).sort()).toEqual(['1', '2']); expect(isDue(p['1'], 0)).toBe(true);
  });
  it('says when an entry is back, and finds the soonest waiting one', () => {
    const now = 100 * D;
    expect(dueText({ n: 0, ts: 0 }, now)).toBe('due now');
    expect(dueText({ n: 0, ts: 0, due: now + 5 * H }, now)).toBe('back in 5 h');
    expect(dueText({ n: 0, ts: 0, due: now + D }, now)).toBe('back in 1 day');
    expect(dueText({ n: 0, ts: 0, due: now + D - 60e3 }, now)).toBe('back in 1 day'); // just under a day still reads as a day
    expect(dueText({ n: 0, ts: 0, due: now + 3 * D }, now)).toBe('back in 3 days');
    const soon = { n: 0, ts: 0, due: now + 2 * H };
    expect(nextDue({ a: { n: 0, ts: 0, due: now + D }, b: soon, c: { n: 0, ts: 0 } }, now)).toBe(soon);
    expect(nextDue({ c: { n: 0, ts: 0 } }, now)).toBeNull();
  });
});
