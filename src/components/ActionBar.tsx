import type { ExitPlan, Side, Size, Stage, Trade, UserExit } from '../types';
import { CHART_STOP } from '../types';
import { optAt, pctAt, sideName, sizeable, maxStep } from '../lib/trade';
import { pct, tone } from '../lib/format';

interface Props {
  trade: Trade; stage: Stage; step: number; guess: Side | null; size: Size | null; userExit: UserExit | null; review: boolean;
  flashSize: boolean; plan: ExitPlan; onPlan: (p: ExitPlan) => void;
  onSize: (s: Size) => void; onAnswer: (g: Side) => void; onSkip: () => void; onAdvance: (n: number) => void; onSell: () => void; onNext: () => void;
}

export function Verdict({ trade, guess, size }: { trade: Trade; guess: Side | null; size: Size | null }) {
  return (
    <>
      {guess === trade.r ? <b className="good">Same side as Bear.</b> : <b className="bad">Bear took {sideName(trade.r)}.</b>}
      {sizeable(trade) && size && (size === trade.setup ? <span className="good"> Size right: {trade.setup}.</span> : <span className="bad"> He called it a {trade.setup}.</span>)}
    </>
  );
}

/** Stage-dependent controls. On phones this is pinned to the bottom of the screen. */
export function ActionBar(p: Props) {
  const { trade: t, stage, step } = p;
  if (stage === 'guess') return (
    <div className="box" id="actions"><div id="aGuess">
      <h3>What would you take here?</h3>
      <div className="small hint">Bear entered at the dashed line. You see only what he saw.</div>
      {sizeable(t) && (
        <div id="sizeRow" style={p.flashSize ? { background: 'rgba(230,180,80,.25)', transition: 'background .2s' } : undefined}>
          <div className="lbl">How strong is the setup?</div>
          <div className="row" style={{ marginTop: 4 }}>
            <button className={'seg' + (p.size === 'Daytrade' ? ' on' : '')} id="bDay" onClick={() => p.onSize('Daytrade')} title="All confluences: bias, pattern, 15m divergence, 5m trigger">Daytrade<kbd>D</kbd></button>
            <button className={'seg' + (p.size === 'Lotto' ? ' on' : '')} id="bLotto" onClick={() => p.onSize('Lotto')} title="Only one or two confluences">Lotto<kbd>L</kbd></button>
          </div>
        </div>
      )}
      <div className="row">
        <button className="calls" id="bCalls" onClick={() => p.onAnswer('C')}>Calls<kbd>C</kbd></button>
        <button className="puts" id="bPuts" onClick={() => p.onAnswer('P')}>Puts<kbd>P</kbd></button>
        <button id="bSkip" onClick={p.onSkip} title="Skip this trade">Skip<kbd>K</kbd></button>
      </div>
    </div></div>
  );
  if (stage === 'replay') {
    const price = optAt(t, step), r = pctAt(t, step), end = step >= maxStep(t), ue = p.userExit, wrong = p.guess !== t.r;
    return (
      <div className="box" id="actions"><div id="aReplay">
        <div id="verdict"><Verdict trade={t} guess={p.guess} size={p.size} /></div>
        <div id="pnl">
          {wrong && <span className="hidemob"><span className="small">Bear's {sideName(t.r)} (you picked {sideName(p.guess || '')})</span><br /></span>}
          ${price.toFixed(2)} <span className={tone(r)}>{pct(r)}</span> <span className="small">{step} min in</span>
        </div>
        <div className="row plan"><span className="hidemob">Auto-sell at</span>
          <select id="pT" aria-label="Profit target" value={p.plan.t} onChange={(e) => { p.onPlan({ ...p.plan, t: +e.target.value }); e.target.blur(); }}>
            <option value={0}>no target</option><option value={20}>+20%</option><option value={23}>+23%</option><option value={30}>+30%</option><option value={50}>+50%</option><option value={100}>+100%</option>
          </select>
          <span className="hidemob">or</span> <select id="pS" aria-label="Stop loss" value={p.plan.s} onChange={(e) => { p.onPlan({ ...p.plan, s: +e.target.value }); e.target.blur(); }}>
            <option value={0}>no stop</option><option value={CHART_STOP}>swing break (5m)</option><option value={20}>−20%</option><option value={30}>−30%</option><option value={40}>−40%</option><option value={50}>−50%</option>
          </select>
        </div>
        <div className="row">
          <button id="s1" disabled={end} onClick={() => p.onAdvance(1)}>+1m</button>
          <button id="s5" className="primary" disabled={end} onClick={() => p.onAdvance(5)}>+5m<kbd>→</kbd></button>
          <button id="s15" disabled={end} onClick={() => p.onAdvance(15)}>+15m</button>
          <button id="sEnd" disabled={end} onClick={() => p.onAdvance(99999)}>Close<kbd>E</kbd></button>
          <button id="bSell" disabled={!!ue} onClick={p.onSell}>Sell<kbd>S</kbd></button>
        </div>
        <div id="sold" className="small">{ue && (
          <>{ue.why === 'target' ? 'Target hit: auto-sold' : ue.why === 'stop' ? (p.plan.s === CHART_STOP ? 'A 5m candle closed past the entry swing: auto-sold' : 'Stop hit: auto-sold') : 'You sold'} at <b className={tone(ue.p)}>{pct(ue.p)}</b> after {ue.m} min{wrong ? " (Bear's side, so it doesn't count toward your average)" : ''}. Keep stepping to see what happened next.</>
        )}</div>
      </div></div>
    );
  }
  return (
    <div className="box" id="actions"><div id="aDone">
      <div id="verdict2"><Verdict trade={t} guess={p.guess} size={p.size} /></div>
      <div className="row"><button className="primary" id="bNext" style={{ flex: 1 }} onClick={p.onNext}>Next trade<kbd>Enter</kbd></button></div>
    </div></div>
  );
}
