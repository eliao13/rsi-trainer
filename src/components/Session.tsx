import type { Answer, TradeIndex } from '../types';
import { SESSION_LEN, repState, summarize, type Session } from '../lib/session';
import { pct, tone } from '../lib/format';

/** The strip under the header during a session: rep count, one cell per rep, and End. */
export function SessionBar({ session, onEnd }: { session: Session; onEnd: () => void }) {
  const n = session.reps.length, cur = Math.min(n + 1, SESSION_LEN);
  return (
    <div className="sessionbar" aria-label={'Session: trade ' + cur + ' of ' + SESSION_LEN}>
      <span className="rep">REP <b>{cur}</b> / {SESSION_LEN}</span>
      <div className="deck" aria-hidden="true">
        {Array.from({ length: SESSION_LEN }, (_, i) => {
          const r = session.reps[i];
          return <span key={i} className={'cell ' + (r ? repState(r) : i === n ? 'cur' : '')} />;
        })}
      </div>
      <button onClick={onEnd} title="Finish now and see the summary">End</button>
    </div>
  );
}

interface Props {
  session: Session; answers: Record<string, Answer>; trades: Map<number, TradeIndex>; pileDue: number;
  onNew: () => void; onPile: () => void; onDone: () => void; onOpen: (id: number) => void;
}

/** End-of-session summary: score, the deck, side/size/exit totals, the pile, and one thing to work on. */
export function SessionSummary({ session, answers, trades, pileDue, onNew, onPile, onDone, onOpen }: Props) {
  const s = summarize(session, answers, trades);
  const mins = Math.max(1, Math.round((Date.now() - session.ts) / 60000));
  return (
    <div id="history" className="session-summary">
      <div className="hist-head">
        <h2>Session done</h2>
        <span className="small">{session.reps.length} of {SESSION_LEN} trades · {mins} min</span>
        <button onClick={onDone}>Close<kbd>Esc</kbd></button>
      </div>
      <div className="ss-body">
        <section className="ss-main">
          <div className="ss-score"><b>{s.ok}</b><span>/{s.played}</span></div>
          <div className="small">trades where you matched his side and size{s.skipped ? ' · ' + s.skipped + ' skipped' : ''}</div>
          <div className="ss-deck">
            {session.reps.map((r, i) => { const t = trades.get(r.id), st = repState(r); return (
              <button key={i} className={'card ' + st} onClick={() => onOpen(r.id)} title={t ? t.tk + ' ' + t.d : ''}>
                <span className="n">{i + 1}</span>
                <span className="lbl">{st === 'skip' ? 'SKIP' : st === 'ok' ? (t?.r === 'C' ? 'CALLS' : 'PUTS') : r.side === false ? '✗ SIDE' : '✗ SIZE'}</span>
              </button>
            ); })}
          </div>
          <div className="kpis ss-kpis">
            <div><span>Side</span><b>{s.side[0]}/{s.side[1]}</b><em>same side as RSI Trader</em></div>
            <div><span>Size</span><b>{s.size[1] ? s.size[0] + '/' + s.size[1] : '–'}</b><em>where he labelled it</em></div>
            <div><span>Avg exit</span><b className={s.avgExit == null ? '' : tone(s.avgExit)}>{s.avgExit == null ? '–' : pct(s.avgExit)}</b><em>{s.exits} on his side</em></div>
          </div>
          <div className="ss-tip"><h3>One thing to work on</h3><p>{s.tip}</p></div>
        </section>
        <aside className="ss-side">
          <h3 className="bad">Mistakes pile</h3>
          <p className="small">{s.pileAdded} added · {s.pileMoved} one step closer · {s.pileCleared} cleared this session. {pileDue ? pileDue + ' due now.' : 'None due right now.'}</p>
          <button className="primary" onClick={onNew}>New session · {SESSION_LEN} trades<kbd>Enter</kbd></button>
          {pileDue > 0 && <button onClick={onPile}>Drill the pile ({pileDue} due)</button>}
          <button onClick={onDone}>Back to practice</button>
          <p className="small">Tap a card to review that trade; "Next trade" brings you back here.</p>
        </aside>
      </div>
    </div>
  );
}
