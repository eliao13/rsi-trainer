import type { ExitPlan, RsiState, Size, Trade } from '../types';

export const sizeable = (t: Trade) => t.setup === 'Daytrade' || t.setup === 'Lotto';
export const sideName = (s: string) => (s === 'C' ? 'calls' : 'puts');
export const maxStep = (t: Trade) => t.path[t.path.length - 1][0];

/** Modelled option price ($) at `m` minutes after entry. */
export function optAt(t: Trade, m: number): number {
  let v = t.path[0][1];
  for (const [pm, pv] of t.path) { if (pm <= m) v = pv; else break; }
  return v / 100;
}
export const pctAt = (t: Trade, m: number) => (optAt(t, m) / t.e - 1) * 100;

export const postedTrims = (t: Trade) => t.ev.filter((e) => e.k === 'trim' && e.p != null).map((e) => e.p as number);

/** First minute in (from, to] where the exit plan's target or stop is touched. */
export function firstTouch(t: Trade, from: number, to: number, plan: ExitPlan): { m: number; p: number; why: 'target' | 'stop' } | null {
  if (!plan.t && !plan.s) return null;
  for (const [m, v] of t.path) {
    if (m <= from) continue;
    if (m > to) break;
    const r = (v / 100 / t.e - 1) * 100;
    if (plan.t && r >= plan.t) return { m, p: r, why: 'target' };
    if (plan.s && r <= -plan.s) return { m, p: r, why: 'stop' };
  }
  return null;
}

/** Bear's management, roughly: first trim around +23%, then the stop to break-even on the rest. */
export function bearStyle(t: Trade): { r: number; txt: string } {
  let trimmed = false, last = 0;
  for (const [, v] of t.path) {
    const r = (v / 100 / t.e - 1) * 100;
    last = r;
    if (!trimmed) {
      if (r >= 23) trimmed = true;
      else if (r <= -30) return { r: -30, txt: 'never reached +23%; hit the assumed −30% stop' };
    } else if (r <= 0) return { r: 11.5, txt: 'half off at +23%, rest stopped at break-even' };
  }
  return trimmed ? { r: (23 + last) / 2, txt: 'half off at +23%, rest held to the close' } : { r: last, txt: 'never reached +23%; held to the close' };
}

/** Short teaching notes for the results panel (HTML with <b> only; no user content). */
export function lessonLines(t: Trade, r15: RsiState | null): string[] {
  const L: string[] = [];
  const isCall = t.r === 'C';
  if (t.b4 && (t.b4[0] > t.b4[2] || t.b4[0] < t.b4[3])) {
    const trendUp = t.b4[0] > t.b4[2];
    L.push('The 4h RSI was <b>' + (trendUp ? 'above its upper band' : 'below its lower band') + '</b>. His rule: don\'t fight that trend until it closes back inside. ' + (trendUp === isCall ? 'He traded with it.' : 'He traded against it, so treat this as a scalp.'));
  } else if (t.b4) {
    const withBias = (t.b4[0] >= t.b4[1]) === isCall;
    L.push(withBias ? 'Bear traded <b>with</b> the 4h bias (RSI ' + (isCall ? 'above' : 'below') + ' its median).' : 'Bear traded <b>against</b> the 4h bias. By his checklist that makes it a scalp, so expect quick trims, not a runner.');
  }
  if (r15) {
    if (r15[0] < r15[3]) L.push('The 15m RSI was <b>below its lower band</b>, which he reads as a temporary bottom. ' + (isCall ? 'He bought calls into it, a band fade.' : 'He still took puts, so he saw continuation.'));
    else if (r15[0] > r15[2]) L.push('The 15m RSI was <b>above its upper band</b>, which he reads as a temporary top. ' + (!isCall ? 'He bought puts into it, a band fade.' : 'He still took calls, so he saw continuation.'));
    else {
      const below = r15[0] < r15[1], fade = below === isCall;
      L.push('The 15m RSI was ' + (below ? 'below' : 'above') + ' its median and inside the bands. ' + (fade ? (isCall ? 'He bought the dip, expecting RSI to reclaim the median.' : 'He shorted the pop, expecting RSI to lose the median.') : 'He traded in the direction of the 15m.'));
    }
  }
  if (sizeable(t)) L.push(t.setup === 'Daytrade' ? 'He labelled this a <b>Daytrade</b>: all confluences present, full size.' : 'He labelled this a <b>Lotto</b>: only one or two confluences, small size.');
  L.push('<span class="small">Look for the pattern (wedge, channel, flag, double top/bottom, trendline) and the key level in his chart below. That\'s what the RSI alone can\'t show.</span>');
  return L;
}

export type { Size };
