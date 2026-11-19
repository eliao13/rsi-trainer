import type { Answer, RsiState, Side, Size, Trade, UserExit } from '../types';
import type { ChartFacts, FadeStat } from '../lib/trade';
import { bearStyle, lessonLines, maxStep, pctAt, postedTrims, sideName, sizeable } from '../lib/trade';
import { pct, tone } from '../lib/format';
import { exitMinute, trimPostsWithoutPct } from '../lib/messages';
import { ChartImage } from './ChartImage';

interface Props {
  trade: Trade; facts: ChartFacts & { ready: boolean }; fade?: FadeStat; guess: Side | null; size: Size | null; userExit: UserExit | null; answer: Answer | undefined; review: boolean;
  r15: RsiState | null; sessionLosses: number; chartsVersion: number;
  onNote: (s: string) => void; onLoadCharts: () => void; onChartSaved: () => void;
}

const Pct = ({ v }: { v: number }) => <span className={tone(v)}>{pct(v)}</span>;
const Mark = ({ ok }: { ok: boolean }) => <span className={'mark ' + (ok ? 'good' : 'bad')} aria-label={ok ? 'matches' : 'differs'}>{ok ? '✓' : '✗'}</span>;

/** One exit rule on the same entry: what it paid, as a number and as a bar from a shared zero line. */
interface ExitRow { key: string; name: string; how: React.ReactNode; when?: string; v: number | null; mine?: boolean; hindsight?: boolean; note?: React.ReactNode }

function ExitBars({ rows }: { rows: ExitRow[] }) {
  const vals = rows.map((r) => r.v).filter((v): v is number => v != null);
  const pos = Math.max(1, ...vals.map((v) => Math.max(0, v))), neg = Math.max(0, ...vals.map((v) => Math.max(0, -v)));
  const span = pos + neg, zero = (neg / span) * 100;
  return (
    <table className="exits"><tbody>{rows.map((r) => [
      <tr key={r.key} className={(r.mine ? 'mine ' : '') + (r.note ? 'hasnote' : '')}>
        <th scope="row">{r.name}</th>
        <td className="how">{r.how}</td>
        <td className="when">{r.when || ''}</td>
        <td className="bar" aria-hidden="true">{r.v != null && <div className="track"><div className="zero" style={{ left: zero + '%' }} />
          <div className={'fill ' + (r.v >= 0 ? 'up' : 'down') + (r.hindsight ? ' ghost' : '')} style={{ left: (r.v >= 0 ? zero : zero - (-r.v / span) * 100) + '%', width: Math.max(0.6, (Math.abs(r.v) / span) * 100) + '%' }} /></div>}</td>
        <td className="val">{r.v != null ? <Pct v={r.v} /> : <span className="dim">–</span>}</td>
      </tr>,
      r.note ? <tr key={r.key + 'n'} className="note"><td colSpan={5}>{r.note}</td></tr> : null,
    ])}</tbody></table>
  );
}

export function Results({ trade: t, facts, fade, guess, size, userExit, answer: a, review, r15 }: Props) {
  const trims = postedTrims(t), closeP = pctAt(t, maxStep(t)), bs = bearStyle(t, facts.ready ? facts.swingBreakM : undefined, postedTrims(t)[0] ?? 23), wrong = !!guess && guess !== t.r;
  const mine = userExit || (review && a && typeof a.exit === 'number' ? { p: a.exit, m: a.exitM, why: a.exitWhy } : null);
  const why = mine?.why;
  // What RSI Trader actually did, from his own posts, comes before anything the price model estimates.
  const updates = t.ev.filter((e) => e.k === 'update' && e.p != null).map((e) => e.p as number);
  const bestUpdate = updates.length ? Math.max(...updates) : null;
  const noPct = trimPostsWithoutPct(t, maxStep(t));
  const tookProfit = trims.length > 0 || noPct > 0;
  const exitM = exitMinute(t, maxStep(t)); // when he said he was out, or his last trim/update
  const hisText = tookProfit || bestUpdate != null
    ? <>{trims.length ? 'Trimmed at ' + trims.map(pct).join(', ') : noPct ? 'Trimmed (no % given)' : 'No trims posted'}
        {trims.length > 0 && noPct > 0 ? <> + {noPct} trim post{noPct > 1 ? 's' : ''} with no %</> : null}
        {bestUpdate != null && (!trims.length || bestUpdate > Math.max(...trims)) ? <> · best update {pct(bestUpdate)}</> : null}</>
    : <span className="dim">No trims or updates posted</span>;
  const hisBest = trims.length ? Math.max(...trims) : bestUpdate;
  const minLbl = (m: number | null | undefined) => (m == null ? undefined : Math.round(m) + ' min');

  const exits: ExitRow[] = [
    { key: 'you', mine: true, name: wrong ? 'You (his ' + sideName(t.r) + ')' : 'You',
      how: mine ? (why === 'target' ? 'Your plan\'s target filled' : why === 'stop' ? 'Your plan\'s stop filled' : 'You sold') : 'Held to the close',
      when: mine ? minLbl(mine.m) : undefined, v: mine ? mine.p : closeP,
      note: wrong ? 'Not counted: you picked the other side. This is what your exit would have paid on his trade.' : undefined },
    { key: 'his', name: 'RSI Trader', how: hisText, when: minLbl(exitM), v: hisBest,
      note: hisBest != null ? 'Bar shows his best posted ' + (trims.length ? 'trim' : 'update') + '; he scaled out, so his average is lower.' : undefined },
    { key: 'rule', name: 'Rule-based', how: bs.txt.charAt(0).toUpperCase() + bs.txt.slice(1), v: bs.r },
    { key: 'stop', name: 'Chart stop', how: '5m close past the entry swing',
      when: facts.ready && facts.swingBreakM != null ? minLbl(facts.swingBreakM) : undefined,
      v: !facts.ready || facts.swingBreakM == null ? null : pctAt(t, facts.swingBreakM),
      note: facts.ready && facts.swingBreakM == null ? 'Never hit: price held the swing all day.' : undefined },
    { key: 'best', name: 'Best possible', hindsight: true, how: 'Perfect hindsight, never reachable live', when: minLbl(t.mxm), v: t.mx,
      note: exitM != null && t.mxm >= exitM + 5 ? 'This came after RSI Trader was out (' + Math.round(exitM) + ' min in): what holding on would have paid, not what he got.' : undefined },
    { key: 'close', name: 'Hold to close', how: 'No exit at all', v: closeP },
  ];

  // Say so plainly when the estimates contradict what RSI Trader posted.
  const notes: string[] = [];
  if (tookProfit && bs.r < 0) notes.push('His posts show profit taken (' + (trims.length ? trims.map(pct).join(', ') : 'a trim with no %') + '), but the rule-based estimate shows ' + pct(bs.r) + '. The estimate uses modelled option prices and a mechanical stop, so it can\'t see his adds, his mental stops or real fills.');
  if (trims.length && Math.max(...trims) > t.mx + 10) notes.push('The price model never reached his posted ' + pct(Math.max(...trims)) + ', so it underprices this option.');

  const sized = sizeable(t);
  return (
    <div className="box" id="doneBox">
      <h3>Your calls vs RSI Trader</h3>
      <table className="calls-vs"><thead><tr><th></th><th>You</th><th>RSI Trader</th><th></th></tr></thead><tbody>
        <tr><th scope="row">Side</th><td>{guess ? sideName(guess).toUpperCase() : <span className="dim">–</span>}</td><td>{sideName(t.r).toUpperCase()}</td><td>{guess && <Mark ok={guess === t.r} />}</td></tr>
        <tr><th scope="row">Size</th>{sized
          ? <><td>{size ? size.toUpperCase() : <span className="dim">–</span>}</td><td>{t.setup.toUpperCase()}</td><td>{size && <Mark ok={size === t.setup} />}</td></>
          : <td colSpan={3} className="dim">Not graded: he didn't label it Daytrade or Lotto</td>}</tr>
        <tr><th scope="row">Exit</th><td>{mine ? pct(mine.p) + (mine.m != null ? ' · ' + Math.round(mine.m) + 'm' : '') : 'HELD'}</td><td>{hisBest != null ? 'BEST ' + pct(hisBest) + (exitM != null ? ' · OUT ' + Math.round(exitM) + 'm' : '') : '–'}</td><td></td></tr>
      </tbody></table>

      <h3 style={{ marginTop: 18 }}>Exits · same entry, different rules</h3>
      <ExitBars rows={exits} />
      {notes.length > 0 && <div id="modelNote" className="banner"><b>Model vs RSI Trader:</b> {notes.join(' ')} Where they disagree, go by his posts.</div>}
      <h3 style={{ marginTop: 18 }}>Takeaway</h3>
      <div id="lesson" className="lesson">{lessonLines(t, r15, facts.ready ? facts : {}, fade).map((h, i) => <p key={i} dangerouslySetInnerHTML={{ __html: h }} />)}</div>
      <div className="small" style={{ marginTop: 8 }}>Option prices except his posts are model estimates from 1-minute index data, not real quotes.</div>
    </div>
  );
}

/** Beside RSI Trader's messages at review: the "2 lives" reminder, your journal, and his chart for the trade. */
export function Journal({ trade: t, answer: a, review, sessionLosses, chartsVersion, onNote, onLoadCharts, onChartSaved }: Pick<Props, 'trade' | 'answer' | 'review' | 'sessionLosses' | 'chartsVersion' | 'onNote' | 'onLoadCharts' | 'onChartSaved'>) {
  return (
    <div className="box" id="journalBox">
      {!review && sessionLosses >= 2 && <div id="tilt" className="banner" style={{ marginTop: 0, marginBottom: 10 }}>That's {sessionLosses} losing trades this session. RSI Trader's "2 lives" rule: after two losers, he stops for the day. Take a break before the next one?</div>}
      <div className="lbl" style={{ marginTop: 0 }}>Journal: what did you see, and what did you miss?</div>
      <textarea id="note" placeholder="e.g. Missed the 15m bullish divergence into the daily level" value={a?.note || ''} onChange={(e) => onNote(e.target.value)} />
      <ChartImage trade={t} version={chartsVersion} onLoadCharts={onLoadCharts} onChartSaved={onChartSaved} />
    </div>
  );
}
