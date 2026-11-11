import type { BearEvent, Trade } from '../types';

// Bear's own shorthand and shouting: all-caps words that are not tickers.
const JARGON = new Set(('SL BE PA PT TP RSI GG LOL LMAO WTF OMG OMFG ATH ATL EOD HOD LOD DB DT TL TLS FOMC CPI PPI NFP FED ET AM PM US OK IV EMA SMA VWAP TRAMA MA BB DTE ODTE OTM ITM ATM YOLO IMO TBH BTW PNL PL LFG GM GN NY UK EU AI CEO IPO EPS ER SEC OPEX PCE GDP JOLTS ISM ADP PMI FOMO HUGE BIG NEW ALL OUT IN UP DOWN NOT NO YES WOW BOOM CLOSE CLOSING OPEN HOLD SELL BUY ADD ADDED DONE GREEN RED HEDGE CALLS PUTS CALL PUT CONS PROFIT TRIM TRIMS LONG LONGS SHORT SHORTS AND THE FOR YOU ME MY WE IT IS ON AT TO OF THIS THAT WHAT WHO WHY HOW OR SO BUT IF GO ARE WAS HAS HAD BE AS BY AN AVG LETS LET GOOD GREAT NICE LIVE NOW HERE WAIT STOP PLEASE TAKE TAKING PAID PAY OFF ONE TWO MOVE MOVES RUN RUNNER RUNNERS NEXT LAST DAY WEEK MON TUE WED THU FRI JAN FEB MAR APR MAY JUN JUL AUG SEP SEPT OCT NOV DEC HIT AH PIPS HALF LOTTO SWING DAYTRADE ALERT NEWS DATA KEY LEVEL BREAK SUPPORT SCALP TOP HIGH LOW HIGHS LOWS LADIES JPOW USD EST PST UTC FAQ TA DD VS AKA ASAP DM DMS NFA FYI II III IV').split(' '));
// Tickers he often trades besides the indexes; checked even when he's shouting.
const OTHER = new Set('NVDA TSLA AAPL AMD META MSFT AMZN GOOG GOOGL NFLX COIN DIA UVXY VIX VXX TLT GLD SLV BTC ETH SMCI AVGO PLTR MSTR DJT ARM MU DOCU RDDT TRMD XOM KTOS BABA HOOD SOFI NIO RIVN LCID CVNA SHOP UBER ROKU SNOW CRWD PANW ORCL INTC QCOM TSM ASML'.split(' '));
const FAM: Record<string, string[]> = {
  QQQ: ['QQQ', 'NQ', 'NDX', 'NAS', 'NASDAQ', 'TQQQ', 'SQQQ', 'NDQ', 'TECH'],
  SPY: ['SPY', 'SPX', 'ES', 'SPX500', 'SPXW'],
  SPX: ['SPX', 'SPY', 'ES', 'SPX500', 'SPXW'],
  IWM: ['IWM', 'RTY', 'RUT', 'US2000'],
};

/**
 * Bear's chat is logged per day. Hide a message when it names another ticker ($TICK,
 * an all-caps word that isn't jargon, or a known non-index ticker) or an option strike
 * far from this trade's, unless it also names this ticker. His trims/updates are kept.
 */
export function relevantFor(t: Trade, e: BearEvent): boolean {
  if (!e.x || e.k === 'trim' || e.k === 'update') return true;
  const x = String(e.x), fam = FAM[t.tk] || [t.tk];
  const words = x.toUpperCase().match(/\b[A-Z0-9]{2,7}\b/g) || [];
  if (words.some((w) => fam.includes(w))) return true;
  if (words.some((w) => OTHER.has(w))) return false;
  const letters = x.replace(/[^A-Za-z]/g, ''), caps = x.replace(/[^A-Z]/g, '').length;
  const shouting = letters.length > 0 && caps / letters.length > 0.6;
  const dollar = x.match(/\$([A-Za-z]{1,5})\b/g) || [];
  if (dollar.some((d) => !fam.includes(d.slice(1).toUpperCase()))) return false;
  if (!shouting) {
    const capsWords = x.match(/\b[A-Z]{2,5}\b/g) || [];
    if (capsWords.some((w) => !JARGON.has(w) && !fam.includes(w))) return false;
  }
  // "16c" = cents, not a strike
  const strikes: number[] = [], re = /\b(\d{2,5}(?:\.\d+)?)\s?(C|P|[Cc]alls?|[Pp]uts?|CALLS?|PUTS?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(x))) if (+m[1] >= 20) strikes.push(+m[1]);
  if (strikes.length && !strikes.some((k) => Math.abs(k - t.k) / t.k < 0.04)) return false;
  return true;
}

/** Notes after this many minutes are hidden: 45 min, or 20 min after his last trim/update. */
export function noteCutoff(t: Trade): number {
  let last = 0;
  for (const e of t.ev) if ((e.k === 'trim' || e.k === 'update') && relevantFor(t, e)) last = Math.max(last, e.m);
  return Math.max(45, last + 20);
}

/** Splits the messages up to `step` into those shown in the timeline and those hidden. */
export function timeline(t: Trade, step: number) {
  const cut = noteCutoff(t), shown: BearEvent[] = [], hidden: BearEvent[] = [];
  for (const e of t.ev) {
    if (e.m > step) continue;
    if (!relevantFor(t, e) || (e.k === 'note' && e.m > cut)) hidden.push(e); else shown.push(e);
  }
  return { shown, hidden };
}
