// Not part of CI: run with  STATS=1 npx vitest run realdata  to print how the detectors behave on the real trades.
import { it } from 'vitest';
import fs from 'node:fs';
import type { Series, Trade } from '../src/types';
import { aggBars, rsi } from '../src/lib/indicators';
import { findDivergences } from '../src/lib/divergence';
import { entrySwing, swingBreakMinute } from '../src/lib/levels';
import { bearStyle, postedTrims } from '../src/lib/trade';

it.runIf(process.env.STATS)('real-data stats', () => {
  const load = (f: string) => { const w: Record<string, unknown> = {}; new Function('window', fs.readFileSync('public/data/' + f, 'utf8'))(w); return w; };
  const T = (load('trades.js').BEAR_TRADES as Trade[]);
  const bars: Record<string, { scale: number; t: number[]; o: number[]; h: number[]; l: number[]; c: number[] }> = {};
  for (const f of fs.readdirSync('public/data').filter((f: string) => f.startsWith('bars_'))) Object.assign(bars, (load(f).BEAR_BARS as object));
  const cache: Record<string, Series> = {};
  const seriesFor = (t: Trade): Series => {
    const yr = +t.d.slice(0, 4), key = t.ci + yr;
    if (!cache[key]) { const s: Series = { t: [], o: [], h: [], l: [], c: [] }; for (const y of [yr - 1, yr]) { const p = bars[t.ci + '_' + y]; if (!p) continue; for (let i = 0; i < p.t.length; i++) { s.t.push(p.t[i]); s.o.push(p.o[i] / p.scale); s.h.push(p.h[i] / p.scale); s.l.push(p.l[i] / p.scale); s.c.push(p.c[i] / p.scale); } } cache[key] = s; }
    const s = cache[key]; let j = s.t.findIndex((x) => x * 300 >= t.t + 86400); if (j < 0) j = s.t.length; const i = Math.max(0, j - 2000);
    return { t: s.t.slice(i, j), o: s.o.slice(i, j), h: s.h.slice(i, j), l: s.l.slice(i, j), c: s.c.slice(i, j) };
  };
  const c = { n: 0, d15: 0, d15ok: 0, d5: 0, d5ok: 0, any: 0, anyOk: 0, brk: 0, brkBeforeTrim: 0, trimmed: 0, swingSum: 0, pct30Sum: 0 };
  for (const t of T) {
    const S = seriesFor(t); if (S.t.length < 100) continue; c.n++;
    const want = t.r === 'C' ? 'bull' : 'bear';
    const dv = (m: number) => { const B = aggBars(S, t.t, m); return findDivergences(B, rsi(B.c)); };
    const a = dv(15), b = dv(5);
    if (a.length) { c.d15++; if (a.some((x) => x.type === want)) c.d15ok++; }
    if (b.length) { c.d5++; if (b.some((x) => x.type === want)) c.d5ok++; }
    if (a.length || b.length) { c.any++; if ([...a, ...b].some((x) => x.type === want)) c.anyOk++; }
    const sw = entrySwing(S, t), bm = swingBreakMinute(S, t, sw);
    const firstTrim = t.ev.find((e) => e.k === 'trim')?.m;
    if (bm != null) { c.brk++; if (firstTrim != null && bm < firstTrim) c.brkBeforeTrim++; }
    if (postedTrims(t).length) c.trimmed++;
    c.swingSum += bearStyle(t, bm).r; c.pct30Sum += bearStyle(t).r;
  }
  const p = (a: number, b: number) => (100 * a / b).toFixed(0) + '%';
  console.log(JSON.stringify({
    trades: c.n,
    '15m divergence found': p(c.d15, c.n), '15m agrees with Bear': p(c.d15ok, c.d15),
    '5m divergence found': p(c.d5, c.n), '5m agrees with Bear': p(c.d5ok, c.d5),
    'any divergence agrees': p(c.anyOk, c.any) + ' of ' + p(c.any, c.n) + ' of trades',
    'swing broke during trade': p(c.brk, c.n), 'broke before his first trim': p(c.brkBeforeTrim, c.n),
    'Bear-style avg, swing stop': (c.swingSum / c.n).toFixed(1) + '%', 'Bear-style avg, -30% stop': (c.pct30Sum / c.n).toFixed(1) + '%',
  }, null, 1));
}, 120000);
