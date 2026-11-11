import { useState } from 'react';
import type { BearEvent, Stage, Trade } from '../types';
import { timeline } from '../lib/messages';
import { fmtET, pct } from '../lib/format';
import { sideName } from '../lib/trade';

function EventRow({ t, e, off }: { t: Trade; e: BearEvent; off?: boolean }) {
  const tm = fmtET.format(new Date((t.t + e.m * 60) * 1000));
  const label = e.k === 'trim' ? <b className="good">Bear trims{e.p != null ? ' at ' + pct(e.p) : ''}</b>
    : e.k === 'update' ? <b>Bear update{e.p != null ? ': ' + pct(e.p) : ''}</b> : <span className="dim">Bear:</span>;
  return <div className={off ? 'off' : undefined}><span className="tm">{tm}</span>{label}{e.x ? ' ' + e.x : ''}</div>;
}

/** Bear's alert plus his messages so far, newest first. */
export function TradePanel({ trade: t, step, stage }: { trade: Trade; step: number; stage: Stage }) {
  const [showAll, setShowAll] = useState(false);
  const { shown, hidden } = timeline(t, step);
  const list = showAll ? t.ev.filter((e) => e.m <= step) : shown;
  return (
    <div className="box" id="tradeBox">
      <div id="bearTrade">
        Bear bought <b>{t.tk} {t.k}{t.r}</b> exp {t.exp.slice(5)} at <b>${t.e.toFixed(2)}</b>{' '}
        <span className="pill">{t.setup === 'From note' ? 'From a note' : t.setup}</span> <span className="pill">{sideName(t.r)}</span>
        {t.note && <div className="small" style={{ marginTop: 6, whiteSpace: 'pre-line' }}>His note: “{t.note}”</div>}
      </div>
      <div id="timeline">
        {list.slice().reverse().map((e, i) => <EventRow key={i} t={t} e={e} off={showAll && hidden.includes(e)} />)}
        {stage === 'done' && !showAll && hidden.length > 0 && (
          <div className="more small" onClick={() => setShowAll(true)}>Show {hidden.length} more of Bear's messages that day (other tickers, or after this trade)</div>
        )}
      </div>
    </div>
  );
}
