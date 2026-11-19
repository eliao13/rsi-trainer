import { useState } from 'react';
import type { ExitPlan, Side, Size, Stage, Trade, UserExit } from '../types';
import { CHART_STOP } from '../types';
import { optAt, pctAt, sideName, sizeable, maxStep } from '../lib/trade';
import { pct, tone } from '../lib/format';
import { CLEAR_AFTER, type PileStatus } from '../lib/pile';

interface Props {
  trade: Trade; stage: Stage; step: number; guess: Side | null; size: Size | null; userExit: UserExit | null; review: boolean;
  pile?: PileStatus; pileN?: number;
  flashSize: boolean; plan: ExitPlan; tf: number; onPlan: (p: ExitPlan) => void;
  onSize: (s: Size) => void; onAnswer: (g: Side) => void; onSkip: () => void; onAdvance: (n: number) => void; onSell: () => void; onNext: () => void;
}

export function Verdict({ trade, guess, size, pile, pileN }: { trade: Trade; guess: Side | null; size: Size | null; pile?: PileStatus; pileN?: number }) {
  return (
    <>
      {guess === trade.r ? <b className="good">Same side as RSI Trader.</b> : <b className="bad">RSI Trader took {sideName(trade.r)}.</b>}
      {sizeable(trade) && size && (size === trade.setup ? <span className="good"> Size right: {trade.setup}.</span> : <span className="bad"> He called it a {trade.setup}.</span>)}
      {pile && <span className="pile-note"> {pile === 'added' ? 'Added to your mistakes pile.' : pile === 'reset' ? 'Still on your pile: the count starts again.' : pile === 'cleared' ? 'Cleared from your mistakes pile.' : 'Right ' + (pileN ?? 1) + ' of ' + CLEAR_AFTER + ': once more to clear it.'}</span>}
    </>
  );
}

/** "+50% target · swing-break stop" (or the short form for phones), or that there is no plan. */
export function planText(plan: ExitPlan, short = false): string {
  const parts: string[] = [];
  if (plan.t) parts.push('+' + plan.t + '%' + (short ? '' : ' target'));
  if (plan.s === CHART_STOP) parts.push(short ? 'swing stop' : 'swing-break stop');
  else if (plan.s) parts.push('−' + plan.s + '% stop');
  return parts.length ? parts.join(' · ') : short ? 'none' : 'none, you sell by hand';
}

function PlanSelects({ plan, onPlan }: { plan: ExitPlan; onPlan: (p: ExitPlan) => void }) {
  return (
    <div className="row plan"><span className="hidemob">Auto-sell at</span>
      <select id="pT" aria-label="Profit target" value={plan.t} onChange={(e) => { onPlan({ ...plan, t: +e.target.value }); e.target.blur(); }}>
        <option value={0}>no target</option><option value={20}>+20%</option><option value={23}>+23%</option><option value={30}>+30%</option><option value={50}>+50%</option><option value={100}>+100%</option>
      </select>
      <span className="hidemob">or</span> <select id="pS" aria-label="Stop loss" value={plan.s} onChange={(e) => { onPlan({ ...plan, s: +e.target.value }); e.target.blur(); }}>
        <option value={0}>no stop</option><option value={CHART_STOP}>swing break (5m)</option><option value={20}>−20%</option><option value={30}>−30%</option><option value={40}>−40%</option><option value={50}>−50%</option>
      </select>
    </div>
  );
}

/** Stage-dependent controls. On phones this is pinned to the bottom of the screen. */
export function ActionBar(p: Props) {
  const { trade: t, stage, step } = p;
  const [editPlan, setEditPlan] = useState(false);
  const hasPlan = !!(p.plan.t || p.plan.s);
  if (stage === 'guess') return (
    <div className="box" id="actions"><div id="aGuess">
      <h3>What would you take here?</h3>
      <div className="small hint">RSI Trader entered at the dashed line. You see only what he saw.</div>
      {sizeable(t) && (
        <div id="sizeRow" className={p.flashSize ? 'needsize' : ''}>
          {p.flashSize
            ? <div id="sizeHint" className="lbl warn" role="alert">Pick Daytrade or Lotto first, then Calls or Puts.</div>
            : <div className="lbl hide-narrow">How strong is the setup?</div>}
          <div className="row" style={{ marginTop: 4 }}>
            <button className={'seg' + (p.size === 'Daytrade' ? ' on' : '')} id="bDay" onClick={() => p.onSize('Daytrade')} title="All confluences: bias, pattern, 15m divergence, 5m trigger">Daytrade<kbd>D</kbd></button>
            <button className={'seg' + (p.size === 'Lotto' ? ' on' : '')} id="bLotto" onClick={() => p.onSize('Lotto')} title="Only one or two confluences">Lotto<kbd>L</kbd></button>
          </div>
        </div>
      )}
      {!sizeable(t) && <div id="noSize" className="small" style={{ marginTop: 6 }}>RSI Trader didn't label this one Daytrade or Lotto, so only the side is graded.</div>}
      {/* The exit plan carries over between rounds, so it is shown before every replay. */}
      <div id="planRow" className={'plan-sum' + (hasPlan ? ' active' : '')}>
        <span className="long">Exit plan: <b>{planText(p.plan)}</b></span><span className="short">Plan: <b>{planText(p.plan, true)}</b></span>
        <button id="bPlanChange" className="link" onClick={() => setEditPlan(!editPlan)}>{editPlan ? 'Done' : 'Change'}</button>
        {hasPlan && <button id="bPlanClear" className="link" onClick={() => { p.onPlan({ t: 0, s: 0 }); setEditPlan(false); }}>Clear</button>}
      </div>
      {editPlan && <PlanSelects plan={p.plan} onPlan={p.onPlan} />}
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
        <div id="verdict"><Verdict trade={t} guess={p.guess} size={p.size} pile={p.pile} pileN={p.pileN} /></div>
        <div id="pnl">
          {wrong && <span className="hidemob"><span className="small">RSI Trader's {sideName(t.r)} (you picked {sideName(p.guess || '')})</span><br /></span>}
          ${price.toFixed(2)} <span className={tone(r)}>{pct(r)}</span> <span className="small">{step} min in</span>
        </div>
        <PlanSelects plan={p.plan} onPlan={p.onPlan} />
        <div className="row">
          <button id="s1" disabled={end} onClick={() => p.onAdvance(1)}>+1m</button>
          <button id="s5" className="primary" disabled={end} onClick={() => p.onAdvance(5)}>+5m<kbd>→</kbd></button>
          <button id="s15" disabled={end} onClick={() => p.onAdvance(15)}>+15m</button>
          <button id="sEnd" disabled={end} onClick={() => p.onAdvance(99999)}>Close<kbd>E</kbd></button>
          <button id="bSell" disabled={!!ue} onClick={p.onSell}>Sell<kbd>S</kbd></button>
        </div>
        <div id="sold" className="small">{ue && (
          <>{ue.why === 'target' ? 'Target hit: auto-sold' : ue.why === 'stop' ? (p.plan.s === CHART_STOP ? 'A 5m candle closed past the entry swing: auto-sold' : 'Stop hit: auto-sold') : 'You sold'} at <b className={tone(ue.p)}>{pct(ue.p)}</b> after {ue.m} min{wrong ? " (RSI Trader's side, so it doesn't count toward your average)" : ''}.
            {p.tf !== 1 && t.t + ue.m * 60 <= Math.ceil(t.t / (p.tf * 60)) * p.tf * 60 ? ' That was inside the entry candle on this chart: tap 1 min to see where.' : ''} Keep stepping to see what happened next.</>
        )}</div>
      </div></div>
    );
  }
  return (
    <div className="box" id="actions"><div id="aDone">
      <div id="verdict2"><Verdict trade={t} guess={p.guess} size={p.size} pile={p.pile} pileN={p.pileN} /></div>
      <div className="row"><button className="primary" id="bNext" style={{ flex: 1 }} onClick={p.onNext}>Next trade<kbd>Enter</kbd></button></div>
    </div></div>
  );
}
