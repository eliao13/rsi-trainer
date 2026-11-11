import type { Answer, RsiState, Side, Size, Trade, UserExit } from '../types';
import type { ChartFacts } from '../lib/trade';
import { bearStyle, lessonLines, maxStep, pctAt, postedTrims, sideName, sizeable } from '../lib/trade';
import { pct, tone } from '../lib/format';
import { ChartImage } from './ChartImage';

interface Props {
  trade: Trade; facts: ChartFacts & { ready: boolean }; guess: Side | null; size: Size | null; userExit: UserExit | null; answer: Answer | undefined; review: boolean;
  r15: RsiState | null; sessionLosses: number; chartsVersion: number;
  onNote: (s: string) => void; onLoadCharts: () => void; onChartSaved: () => void;
}

const Pct = ({ v }: { v: number }) => <span className={tone(v)}>{pct(v)}</span>;

export function Results({ trade: t, facts, guess, size, userExit, answer: a, review, r15, sessionLosses, chartsVersion, onNote, onLoadCharts, onChartSaved }: Props) {
  const trims = postedTrims(t), closeP = pctAt(t, maxStep(t)), bs = bearStyle(t, facts.ready ? facts.swingBreakM : undefined), wrong = !!guess && guess !== t.r;
  const mine = userExit || (review && a && typeof a.exit === 'number' ? { p: a.exit, m: a.exitM, why: a.exitWhy } : null);
  const why = mine?.why;
  const rows: [React.ReactNode, React.ReactNode][] = [
    ['Your call', guess ? <>{guess === 'C' ? 'Calls' : 'Puts'} {guess === t.r ? <span className="good">✓</span> : <span className="bad">✗</span>}</> : <span className="dim">Not answered</span>],
  ];
  if (sizeable(t)) rows.push(['Your size', size ? <>{size} {size === t.setup ? <span className="good">✓</span> : <span className="bad">✗ ({t.setup})</span>}</> : <span className="dim">–</span>]);
  rows.push(
    ["Bear's posted trims", trims.length ? trims.map(pct).join(', ') : 'None posted'],
    ['Best the option reached (model)', <><Pct v={t.mx} /> after {t.mxm} min</>],
    ['Option at the close (model)', <Pct v={closeP} />],
    ['Chart stop (5m close past entry swing)', !facts.ready ? <span className="dim">…</span> : facts.swingBreakM != null ? <><Pct v={pctAt(t, facts.swingBreakM)} /> after {facts.swingBreakM} min</> : 'Never hit'],
    ['Bear-style exit', <><Pct v={bs.r} /><div className="small" style={{ fontWeight: 400 }}>{bs.txt}</div></>],
    [wrong ? <>Your exit on Bear's {sideName(t.r)}<div className="small">not counted: you picked the other side</div></> : 'Your exit',
      mine ? <><Pct v={mine.p} />{mine.m != null ? ' after ' + mine.m + ' min' : ''}{why === 'target' ? <span className="small"> (target)</span> : why === 'stop' ? <span className="small"> (stop)</span> : null}</> : <>Held to the close <Pct v={closeP} /></>],
  );
  if (trims.length && Math.max(...trims) > t.mx + 10) rows.push([<span className="warn">Note</span>, <span className="warn" style={{ fontWeight: 400 }}>The price model never reached his posted trim. Trust his post over the model here.</span>]);
  return (
    <div className="box" id="doneBox">
      <h3>How it played out</h3>
      <table id="sumTable"><tbody>{rows.map((r, i) => <tr key={i}><td className="dim">{r[0]}</td><td>{r[1]}</td></tr>)}</tbody></table>
      <div id="lesson" className="lesson">{lessonLines(t, r15, facts.ready ? facts : {}).map((h, i) => <p key={i} dangerouslySetInnerHTML={{ __html: h }} />)}</div>
      {!review && sessionLosses >= 2 && <div id="tilt" className="banner">That's {sessionLosses} losing trades this session. Bear's "2 lives" rule: after two losers, he stops for the day. Take a break before the next one?</div>}
      <div className="lbl">Journal: what did you see, and what did you miss?</div>
      <textarea id="note" placeholder="e.g. Missed the 15m bullish divergence into the daily level" value={a?.note || ''} onChange={(e) => onNote(e.target.value)} />
      <ChartImage trade={t} version={chartsVersion} onLoadCharts={onLoadCharts} onChartSaved={onChartSaved} />
      <div className="small" style={{ marginTop: 8 }}>Option prices are model estimates from 1-minute index data, not real quotes.</div>
    </div>
  );
}
