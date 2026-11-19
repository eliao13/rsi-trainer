import type { Answer, TradeIndex } from '../types';
import type { PileStatus } from './pile';

/** A practice session: a fixed number of trades ("reps"), then a summary. */
export const SESSION_LEN = 20;
export interface Rep { id: number; skip?: boolean; side?: boolean; size?: boolean | null; pile?: PileStatus }
export interface Session { ts: number; reps: Rep[] }

export type RepState = 'ok' | 'miss' | 'skip';
/** Both right (size only where he labelled it) is "ok"; any miss is "miss". */
export const repState = (r: Rep): RepState => (r.skip ? 'skip' : r.side && r.size !== false ? 'ok' : 'miss');

export interface SessionSummary {
  played: number; skipped: number; ok: number;
  side: [number, number]; size: [number, number];
  avgExit: number | null; exits: number;
  pileAdded: number; pileCleared: number; pileMoved: number;
  tip: string;
}

/** Totals for the summary screen, plus the one thing to work on: the most common miss this session. */
export function summarize(s: Session, answers: Record<string, Answer>, trades: Map<number, TradeIndex>): SessionSummary {
  const played = s.reps.filter((r) => !r.skip), skipped = s.reps.length - played.length;
  const side = played.filter((r) => r.side).length, graded = played.filter((r) => r.size != null), size = graded.filter((r) => r.size).length;
  const exits = played.map((r) => answers[r.id]).filter((a): a is Answer => !!a && a.match && typeof a.exit === 'number');
  const avgExit = exits.length ? exits.reduce((t, a) => t + (a.exit as number), 0) / exits.length : null;
  // what went wrong, by kind
  const c = { against: 0, withB: 0, toLotto: 0, toDay: 0, early: 0 };
  for (const r of played) {
    const t = trades.get(r.id); if (!t) continue;
    if (!r.side) { const withBias = !t.b4 ? null : (t.b4[0] >= t.b4[1]) === (t.r === 'C'); if (withBias === false) c.against++; else c.withB++; }
    if (r.size === false) { if (t.setup === 'Daytrade') c.toLotto++; else c.toDay++; }
    const a = answers[r.id];
    // sold by hand below his first trim (not a plan's target/stop, not held to the close)
    if (a && a.match && a.exitWhy === 'manual' && typeof a.exit === 'number' && t.t1 != null && a.exit < t.t1) c.early++;
  }
  const tips: [number, string][] = [
    [c.against, `You missed his side ${c.against}× when he went against the 4h bias. Before calling it, check whether the 4h RSI is stretched outside its bands: that's when he fades it.`],
    [c.withB, `You missed his side ${c.withB}× when he traded with the 4h bias. Start from the 4h direction and only go against it when the 4h is stretched.`],
    [c.toLotto, `You called ${c.toLotto} Daytrade${c.toLotto > 1 ? 's' : ''} a Lotto. Daytrade means all the confluences line up: 4h bias, a pattern, the 15m divergence and a 5m trigger.`],
    [c.toDay, `You called ${c.toDay} Lotto${c.toDay > 1 ? 's' : ''} a Daytrade. When only one or two confluences are there, he sizes it as a Lotto.`],
    [c.early, `You sold below his first trim on ${c.early} trade${c.early > 1 ? 's' : ''} you got right. Try holding to your plan's target or the swing stop instead of selling by hand.`],
  ];
  const best = tips.reduce((m, t) => (t[0] > m[0] ? t : m), [0, ''] as [number, string]);
  const tip = best[0] > 0 ? best[1] : played.length ? 'No pattern in your misses this time. Keep the same routine: 4h bias first, then the 15m, then the 5m trigger.' : 'Play a few trades to get a summary.';
  return {
    played: played.length, skipped, ok: played.filter((r) => repState(r) === 'ok').length,
    side: [side, played.length], size: [size, graded.length], avgExit, exits: exits.length,
    pileAdded: played.filter((r) => r.pile === 'added' || r.pile === 'reset').length, pileCleared: played.filter((r) => r.pile === 'cleared').length,
    pileMoved: played.filter((r) => r.pile === 'progress').length, tip,
  };
}
