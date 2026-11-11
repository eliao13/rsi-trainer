import type { RsiState } from '../types';

function Row({ name, b, note }: { name: string; b: RsiState | null; note?: string }) {
  if (!b) return <tr><td className="dim">{name}</td><td className="dim">{note || 'Not enough history'}</td></tr>;
  const above = b[0] >= b[1];
  const band = b[0] > b[2] ? 'above upper band' : b[0] < b[3] ? 'below lower band' : null;
  return (
    <tr>
      <td className="dim">{name} RSI {b[0].toFixed(1)}<br /><span className="small">median {b[1].toFixed(1)}, bands {b[3].toFixed(0)}–{b[2].toFixed(0)}</span></td>
      <td><span className={above ? 'good' : 'bad'}>{above ? 'Above median' : 'Below median'}</span><span style={{ fontWeight: 400 }}> · {band ? <span className="warn">{band}</span> : 'inside bands'}</span></td>
    </tr>
  );
}

export function BiasPanel({ b4, bd, r15, r5, loading }: { b4: RsiState | null; bd: RsiState | null; r15: RsiState | null; r5: RsiState | null; loading: boolean }) {
  const note = loading ? 'Loading…' : undefined;
  return (
    <div className="box" id="biasBox">
      <h3>RSI at entry</h3>
      <table id="biasTable"><tbody>
        <Row name="4-hour" b={b4} /><Row name="Daily" b={bd} /><Row name="15-min" b={r15} note={note} /><Row name="5-min" b={r5} note={note} />
      </tbody></table>
      <div className="small" style={{ marginTop: 8 }}>Bear's checklist: the 4h and daily set the bias (against it, a trade is only a scalp). The setup is a 15m divergence inside a pattern, into a key level. The trigger comes on the 5m, after a candle close. If the 4h RSI is outside its bands, he doesn't fight that trend.</div>
    </div>
  );
}
