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

export function Results({ trade: t, facts, fade, guess, size, userExit, answer: a, review, r15 }: Props) {
  const trims = postedTrims(t), closeP = pctAt(t, maxStep(t)), bs = bearStyle(t, facts.ready ? facts.swingBreakM : undefined, postedTrims(t)[0] ?? 23), wrong = !!guess && guess !== t.r;
  const mine = userExit || (review && a && typeof a.exit === 'number' ? { p: a.exit, m: a.exitM, why: a.exitWhy } : null);
  const why = mine?.why;
  // [label, value, optional explanation shown full-width under the row]
  const rows: [React.ReactNode, React.ReactNode, React.ReactNode?][] = [
    ['Your call', guess ? <>{guess === 'C' ? 'Calls' : 'Puts'} {guess === t.r ? <span className="good">✓</span> : <span className="bad">✗</span>}</> : <span className="dim">Not answered</span>],
  ];
  rows.push(['Your size', sizeable(t)
    ? (size ? <>{size} {size === t.setup ? <span className="good">✓</span> : <span className="bad">✗ ({t.setup})</span>}</> : <span className="dim">–</span>)
    : <span className="dim" style={{ fontWeight: 400 }}>Not graded: Bear didn't label it Daytrade or Lotto</span>]);
  // What Bear actually did, from his own posts, comes before anything the price model estimates.
  const updates = t.ev.filter((e) => e.k === 'update' && e.p != null).map((e) => e.p as number);
  const bestUpdate = updates.length ? Math.max(...updates) : null;
  const noPct = trimPostsWithoutPct(t, maxStep(t));
  const tookProfit = trims.length > 0 || noPct > 0;
  const exitM = exitMinute(t, maxStep(t)); // when he said he was out, or his last trim/update
  rows.push(
    ["Bear's result (his posts)", tookProfit || bestUpdate != null
      ? <>{trims.length ? 'Trimmed at ' + trims.map(pct).join(', ') : noPct ? 'Trimmed (no % given)' : 'No trims posted'}
          {trims.length > 0 && noPct > 0 ? <span style={{ fontWeight: 400 }}> + {noPct} trim post{noPct > 1 ? 's' : ''} with no %</span> : null}
          {bestUpdate != null && (!trims.length || bestUpdate > Math.max(...trims)) ? <span style={{ fontWeight: 400 }}> · best update {pct(bestUpdate)}</span> : null}</>
      : <span className="dim">No trims or updates posted</span>],
    ['Estimates from the price model', ''],
    ['Best the option reached', <><Pct v={t.mx} /> after {t.mxm} min</>, exitM != null && t.mxm >= exitM + 5 ? 'This came after Bear was out (' + Math.round(exitM) + ' min in): what holding on would have paid, not what he got.' : undefined],
    ['Option at the close', <Pct v={closeP} />],
    ['Chart stop (5m close past entry swing)', !facts.ready ? <span className="dim">…</span> : facts.swingBreakM != null ? <><Pct v={pctAt(t, facts.swingBreakM)} /> after {facts.swingBreakM} min</> : 'Never hit'],
    ['Rule-based exit (estimate)', <Pct v={bs.r} />, bs.txt.charAt(0).toUpperCase() + bs.txt.slice(1) + '.'],
    [wrong ? <>Your exit on Bear's {sideName(t.r)}<div className="small">not counted: you picked the other side</div></> : 'Your exit',
      mine ? <><Pct v={mine.p} />{mine.m != null ? ' after ' + mine.m + ' min' : ''}{why === 'target' ? <span className="small"> (target)</span> : why === 'stop' ? <span className="small"> (stop)</span> : null}</> : <>Held to the close <Pct v={closeP} /></>],
  );
  // Say so plainly when the estimates contradict what Bear posted.
  const notes: string[] = [];
  if (tookProfit && bs.r < 0) notes.push('His posts show profit taken (' + (trims.length ? trims.map(pct).join(', ') : 'a trim with no %') + '), but the rule-based estimate shows ' + pct(bs.r) + '. The estimate uses modelled option prices and a mechanical stop, so it can\'t see his adds, his mental stops or real fills.');
  if (trims.length && Math.max(...trims) > t.mx + 10) notes.push('The price model never reached his posted ' + pct(Math.max(...trims)) + ', so it underprices this option.');

  return (
    <div className="box" id="doneBox">
      <h3>How it played out</h3>
      <table id="sumTable"><tbody>{rows.map((r, i) => r[1] === ''
        ? <tr key={i} className="section"><td colSpan={2}>{r[0]}</td></tr>
        : [<tr key={i} className={r[2] ? 'hasdetail' : undefined}><td className="dim">{r[0]}</td><td>{r[1]}</td></tr>,
           r[2] ? <tr key={i + 'd'} className="detail"><td colSpan={2}>{r[2]}</td></tr> : null])}</tbody></table>
      {notes.length > 0 && <div id="modelNote" className="banner"><b>Model vs Bear:</b> {notes.join(' ')} Where they disagree, go by his posts.</div>}
      <div id="lesson" className="lesson">{lessonLines(t, r15, facts.ready ? facts : {}, fade).map((h, i) => <p key={i} dangerouslySetInnerHTML={{ __html: h }} />)}</div>
      <div className="small" style={{ marginTop: 8 }}>Option prices are model estimates from 1-minute index data, not real quotes.</div>
    </div>
  );
}

/** Beside Bear's messages at review: the "2 lives" reminder, your journal, and his chart for the trade. */
export function Journal({ trade: t, answer: a, review, sessionLosses, chartsVersion, onNote, onLoadCharts, onChartSaved }: Pick<Props, 'trade' | 'answer' | 'review' | 'sessionLosses' | 'chartsVersion' | 'onNote' | 'onLoadCharts' | 'onChartSaved'>) {
  return (
    <div className="box" id="journalBox">
      {!review && sessionLosses >= 2 && <div id="tilt" className="banner" style={{ marginTop: 0, marginBottom: 10 }}>That's {sessionLosses} losing trades this session. Bear's "2 lives" rule: after two losers, he stops for the day. Take a break before the next one?</div>}
      <div className="lbl" style={{ marginTop: 0 }}>Journal: what did you see, and what did you miss?</div>
      <textarea id="note" placeholder="e.g. Missed the 15m bullish divergence into the daily level" value={a?.note || ''} onChange={(e) => onNote(e.target.value)} />
      <ChartImage trade={t} version={chartsVersion} onLoadCharts={onLoadCharts} onChartSaved={onChartSaved} />
    </div>
  );
}
