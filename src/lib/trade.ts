import type { ExitPlan, RsiState, Size, Trade } from '../types';
import { CHART_STOP } from '../types';
import type { Divergence } from './divergence';

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

/**
 * First minute in (from, to] where the exit plan's target or stop is hit. With the chart stop,
 * `swingBreakM` is the minute a 5m candle closed past the entry swing (null if it never did).
 */
export function firstTouch(t: Trade, from: number, to: number, plan: ExitPlan, swingBreakM: number | null = null): { m: number; p: number; why: 'target' | 'stop' } | null {
  const chart = plan.s === CHART_STOP;
  if (!plan.t && !plan.s) return null;
  for (const [m, v] of t.path) {
    if (m <= from) continue;
    if (m > to) break;
    const r = (v / 100 / t.e - 1) * 100;
    // small tolerance: prices are cents, so "exactly -20%" can compute as -19.9999...
    if (plan.t && r >= plan.t - 1e-9) return { m, p: r, why: 'target' };
    if (!chart && plan.s > 0 && r <= -plan.s + 1e-9) return { m, p: r, why: 'stop' };
    if (chart && swingBreakM != null && m >= swingBreakM) return { m, p: r, why: 'stop' };
  }
  return null;
}

/**
 * Bear's management, roughly: first trim around +23%, then the stop to break-even on the rest.
 * Before the trim, the stop is the swing break when known (`swingBreakM`, `undefined` = not
 * computed yet), else an assumed −30%.
 */
export function bearStyle(t: Trade, swingBreakM?: number | null): { r: number; txt: string } {
  let trimmed = false, last = 0;
  const useSwing = swingBreakM !== undefined;
  for (const [m, v] of t.path) {
    const r = (v / 100 / t.e - 1) * 100;
    last = r;
    if (!trimmed) {
      if (r >= 23) trimmed = true;
      else if (useSwing && swingBreakM != null && m >= swingBreakM) return { r, txt: 'never reached +23%; stopped when a 5m candle closed past the entry swing' };
      else if (!useSwing && r <= -30) return { r: -30, txt: 'never reached +23%; hit the assumed −30% stop' };
    } else if (r <= 0) return { r: 11.5, txt: 'half off at +23%, rest stopped at break-even' };
  }
  return trimmed ? { r: (23 + last) / 2, txt: 'half off at +23%, rest held to the close' } : { r: last, txt: 'never reached +23%; held to the close' };
}

/** Short teaching notes for the results panel (HTML with <b> only; no user content). */
export interface ChartFacts { div15?: Divergence[]; div5?: Divergence[]; swing?: number | null; swingBreakM?: number | null }

const fmtLevel = (v: number) => v.toFixed(v > 2000 ? 1 : 2);

export function lessonLines(t: Trade, r15: RsiState | null, facts: ChartFacts = {}): string[] {
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
  const divNote = (tf: string, d?: Divergence[]) => {
    if (!d) return;
    const want = isCall ? 'bull' : 'bear', match = d.find((x) => x.type === want), other = d.find((x) => x.type !== want);
    if (match) L.push('Possible <b>' + (isCall ? 'bullish' : 'bearish') + ' ' + tf + ' divergence</b> into entry (price made a ' + (isCall ? 'lower low' : 'higher high') + ', RSI didn\'t). That lines up with his ' + (isCall ? 'calls' : 'puts') + '.');
    else if (other) L.push('The ' + tf + ' showed a possible <b>' + (other.type === 'bull' ? 'bullish' : 'bearish') + '</b> divergence, the opposite of his ' + (isCall ? 'calls' : 'puts') + '. He may have been trading its invalidation, or a bigger-timeframe level.');
  };
  divNote('15m', facts.div15);
  divNote('5m', facts.div5);
  if (facts.div15 && facts.div5 && !facts.div15.length && !facts.div5.length) L.push('No clear divergence on the 15m or 5m by the simple detector. Check his chart for the pattern he was trading.');
  if (facts.swing != null) L.push('Invalidation: a 5m close ' + (isCall ? 'below the entry swing low' : 'above the entry swing high') + ' (' + fmtLevel(facts.swing) + '). ' + (facts.swingBreakM != null ? 'That happened after ' + facts.swingBreakM + ' min.' : 'It held for the rest of the trade.'));
  if (sizeable(t)) L.push(t.setup === 'Daytrade' ? 'He labelled this a <b>Daytrade</b>: all confluences present, full size.' : 'He labelled this a <b>Lotto</b>: only one or two confluences, small size.');
  L.push('<span class="small">Look for the pattern (wedge, channel, flag, double top/bottom, trendline) and the key level in his chart below. That\'s what the RSI alone can\'t show.</span>');
  return L;
}

export type { Size };
