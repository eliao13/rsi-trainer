import { describe, expect, it } from 'vitest';
import { applyAnswer, seedPile } from './pile';

describe('mistakes pile', () => {
  it('a miss joins the pile, two rights in a row clear it', () => {
    let r = applyAnswer({}, 7, true, 1);
    expect(r.status).toBe('added'); expect(r.pile['7']).toEqual({ n: 0, ts: 1 });
    r = applyAnswer(r.pile, 7, false, 2);
    expect(r.status).toBe('progress'); expect(r.pile['7'].n).toBe(1);
    r = applyAnswer(r.pile, 7, false, 3);
    expect(r.status).toBe('cleared'); expect(r.cleared).toBe(true); expect(r.pile['7']).toBeUndefined();
  });
  it('a miss on a retry starts the count again', () => {
    let r = applyAnswer({ '7': { n: 1, ts: 1 } }, 7, true, 5);
    expect(r.status).toBe('reset'); expect(r.pile['7']).toEqual({ n: 0, ts: 5 });
    r = applyAnswer(r.pile, 7, false, 6);
    expect(r.status).toBe('progress');
  });
  it('right answers on trades not in the pile change nothing', () => {
    const p = { '1': { n: 0, ts: 1 } }, r = applyAnswer(p, 2, false, 9);
    expect(r.status).toBeNull(); expect(r.pile).toBe(p);
  });
  it('seeds from earlier answers: wrong side or wrong size, not ungraded size', () => {
    const p = seedPile({
      '1': { g: 'C', match: false, ts: 10 }, '2': { g: 'C', match: true, sizeOk: false }, '3': { g: 'P', match: true, sizeOk: null }, '4': { g: 'P', match: true, sizeOk: true },
    });
    expect(Object.keys(p).sort()).toEqual(['1', '2']); expect(p['1'].ts).toBe(10);
  });
});
