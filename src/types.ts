export type Side = 'C' | 'P';
export type Size = 'Daytrade' | 'Lotto';
export type Stage = 'guess' | 'replay' | 'done';

/** One of Bear's messages on the trade's day, `m` minutes after entry. */
export interface BearEvent {
  m: number;
  k: 'trim' | 'update' | 'note';
  p?: number | null; // percent gain he posted, for trims/updates
  x?: string; // message text
}

/** [rsi, median, upper band, lower band] */
export type RsiState = [number, number, number, number];

export interface Trade {
  id: number;
  t: number; // entry time, unix seconds
  d: string; // entry date YYYY-MM-DD (ET)
  hm: string; // entry time HH:MM (ET)
  setup: string; // Daytrade | Lotto | Swing | From note
  tk: string; // QQQ, SPY, SPX, IWM
  r: Side; // Bear's side
  k: number; // strike
  exp: string;
  dte: number;
  e: number; // entry price ($)
  note: string;
  ci: string; // chart instrument (NDQ100, SPX500, IWM)
  mx: number; // best % the modelled option reached
  mxm: number; // minutes until that best
  path: [number, number][]; // [minutes after entry, modelled option price in cents]
  ev: BearEvent[];
  img: string; // relative path of Bear's chart screenshot, '' if none
  tod: string; // open | morning | midday | late
  b4: RsiState | null; // 4-hour RSI at entry
  bd: RsiState | null; // daily RSI at entry
}

/** Price bars; `t` is the bar index in units of `base` minutes (unix seconds / (base*60)). */
export interface Series {
  base?: number; // minutes per bar index; 5 when omitted
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}

export type ExitWhy = 'manual' | 'target' | 'stop';
export interface UserExit {
  m: number;
  p: number;
  why?: ExitWhy;
}

/** What the player did on one trade (persisted). */
export interface Answer {
  g: Side;
  match: boolean;
  size?: Size | null;
  sizeOk?: boolean | null;
  ts?: number;
  note?: string;
  exit?: number;
  exitM?: number;
  exitWhy?: ExitWhy;
}

export interface Filters {
  fTod: string;
  fSetup: string;
  fTk: string;
  fYr: string;
  fSeen: string;
}

export interface ExitPlan {
  t: number; // target %, 0 = off
  s: number; // stop %, 0 = off, -1 = chart stop (5m close past the entry swing)
}
export const CHART_STOP = -1;

export interface SavedState {
  a: Record<string, Answer>;
  f?: Filters | null;
  plan?: ExitPlan;
}

declare global {
  interface Window {
    BEAR_TRADES?: Trade[];
    BEAR_M1?: Record<string, { scale: number; dt: number[]; o: number[]; h: number[]; l: number[]; c: number[] }>;
    BEAR_M1_KEYS?: string[];
    BEAR_BARS?: Record<string, { scale: number; t: number[]; o: number[]; h: number[]; l: number[]; c: number[] }>;
  }
}
