import type { Answer } from '../types';

/**
 * The mistakes pile: trades you got wrong (side, or size where he labelled it) come back until you
 * get them right twice in a row, spaced out so they return once you have half-forgotten them:
 * a miss comes back after a day, the first right answer after three more, the second clears it.
 * `n` counts right answers since the last miss; `due` is when it is next shown (missing = due now).
 */
export interface PileEntry { n: number; ts: number; due?: number }
export type Pile = Record<string, PileEntry>;
export type PileStatus = 'added' | 'reset' | 'progress' | 'cleared' | null;
export const CLEAR_AFTER = 2;
const HOUR = 3600e3, DAY = 24 * HOUR;
export const AFTER_MISS = 1 * DAY;
export const AFTER_RIGHT = 3 * DAY;
/** In normal practice, the share of new trades that are due pile trades (when any are due). */
export const MIX_SHARE = 0.25;

export const isMiss = (a: Pick<Answer, 'match' | 'sizeOk'>) => !a.match || a.sizeOk === false;
export const isDue = (e: PileEntry | undefined, now: number) => !!e && (e.due ?? 0) <= now;

/** Everything you have missed so far, for progress saved before the pile existed (due now). */
export function seedPile(answers: Record<string, Answer>): Pile {
  const p: Pile = {};
  for (const [id, a] of Object.entries(answers)) if (a && a.g && isMiss(a)) p[id] = { n: 0, ts: a.ts || 0 };
  return p;
}

/** Records one answer. Returns the new pile and what happened, for the result line. */
export function applyAnswer(pile: Pile, id: number | string, wrong: boolean, now: number): { pile: Pile; status: PileStatus; cleared: boolean } {
  const k = String(id), cur = pile[k], next = { ...pile };
  if (wrong) { next[k] = { n: 0, ts: now, due: now + AFTER_MISS }; return { pile: next, status: cur ? 'reset' : 'added', cleared: false }; }
  if (!cur) return { pile, status: null, cleared: false };
  if (cur.n + 1 >= CLEAR_AFTER) { delete next[k]; return { pile: next, status: 'cleared', cleared: true }; }
  next[k] = { n: cur.n + 1, ts: now, due: now + AFTER_RIGHT };
  return { pile: next, status: 'progress', cleared: false };
}

/** "due now", "back in 5 h", "back in 2 days". */
export function dueText(e: PileEntry, now: number): string {
  const ms = (e.due ?? 0) - now;
  if (ms <= 0) return 'due now';
  const h = Math.round(ms / HOUR);
  if (h < 24) return 'back in ' + Math.max(1, h) + ' h';
  const d = Math.round(ms / DAY);
  return 'back in ' + d + (d === 1 ? ' day' : ' days');
}

/** The soonest a waiting entry comes back, or null if none are waiting. */
export function nextDue(pile: Pile, now: number): PileEntry | null {
  let best: PileEntry | null = null;
  for (const e of Object.values(pile)) if (!isDue(e, now) && (!best || (e.due ?? 0) < (best.due ?? 0))) best = e;
  return best;
}
