import type { Answer } from '../types';

/**
 * The mistakes pile: trades you got wrong (side, or size where he labelled it) come back until you
 * get them right twice in a row. `n` counts right answers since the last miss.
 */
export interface PileEntry { n: number; ts: number }
export type Pile = Record<string, PileEntry>;
export type PileStatus = 'added' | 'reset' | 'progress' | 'cleared' | null;
export const CLEAR_AFTER = 2;

export const isMiss = (a: Pick<Answer, 'match' | 'sizeOk'>) => !a.match || a.sizeOk === false;

/** Everything you have missed so far, for progress saved before the pile existed. */
export function seedPile(answers: Record<string, Answer>): Pile {
  const p: Pile = {};
  for (const [id, a] of Object.entries(answers)) if (a && a.g && isMiss(a)) p[id] = { n: 0, ts: a.ts || 0 };
  return p;
}

/** Records one answer. Returns the new pile and what happened, for the result line. */
export function applyAnswer(pile: Pile, id: number | string, wrong: boolean, now: number): { pile: Pile; status: PileStatus; cleared: boolean } {
  const k = String(id), cur = pile[k], next = { ...pile };
  if (wrong) { next[k] = { n: 0, ts: now }; return { pile: next, status: cur ? 'reset' : 'added', cleared: false }; }
  if (!cur) return { pile, status: null, cleared: false };
  if (cur.n + 1 >= CLEAR_AFTER) { delete next[k]; return { pile: next, status: 'cleared', cleared: true }; }
  next[k] = { n: cur.n + 1, ts: now };
  return { pile: next, status: 'progress', cleared: false };
}
