import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Answer, ExitPlan, Filters, Series, Side, Size, Stage, Trade, UserExit } from './types';
import { loadSeries, loadTrades } from './lib/data';
import { useSaved } from './lib/storage';
import { rsiAt } from './lib/indicators';
import { firstTouch, maxStep, pctAt, sizeable } from './lib/trade';
import { relevantFor } from './lib/messages';
import { countCharts, importCharts } from './lib/charts';
import { fmtDay } from './lib/format';
import { Header } from './components/Header';
import { Chart } from './components/Chart';
import { BiasPanel } from './components/BiasPanel';
import { ActionBar } from './components/ActionBar';
import { TradePanel } from './components/TradePanel';
import { Results } from './components/Results';
import { History } from './components/History';
import { ChartsDialog } from './components/ChartsDialog';

const DEFAULT_FILTERS: Filters = { fTod: 'all', fSetup: 'all', fTk: 'all', fYr: 'all', fSeen: 'unseen' };
const DEFAULT_PLAN: ExitPlan = { t: 0, s: 0 };

function inPool(t: Trade, f: Filters, a: Answer | undefined) {
  return (f.fTod === 'all' || t.tod === f.fTod) && (f.fSetup === 'all' || t.setup === f.fSetup) && (f.fTk === 'all' || t.tk === f.fTk) && (f.fYr === 'all' || t.d.slice(0, 4) === f.fYr) &&
    (f.fSeen === 'any' || (f.fSeen === 'unseen' && !a) || (f.fSeen === 'miss' && !!a && !!a.g && (!a.match || a.sizeOk === false)));
}

/** One round: guess (side + size) → replay minute by minute → done. */
interface Round { trade: Trade; stage: Stage; step: number; guess: Side | null; size: Size | null; userExit: UserExit | null; review: boolean }

export function App() {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saved, updateSaved] = useSaved();
  const [round, setRound] = useState<Round | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [tf, setTf] = useState(5);
  const [poolSize, setPoolSize] = useState(0);
  const [flashSize, setFlashSize] = useState(false);
  const [sessionLosses, setSessionLosses] = useState(0);
  const [overlay, setOverlay] = useState<'history' | 'charts' | null>(null);
  const [chartCount, setChartCount] = useState(0);
  const [chartsVersion, setChartsVersion] = useState(0);

  const filters = saved.f || DEFAULT_FILTERS;
  const plan = saved.plan || DEFAULT_PLAN;
  const byId = useMemo(() => new Map((trades || []).map((t) => [t.id, t])), [trades]);

  // The latest round, readable synchronously by handlers (keyboard, tests) between renders.
  const roundRef = useRef<Round | null>(null);
  const setR = useCallback((r: Round | null) => { roundRef.current = r; setRound(r); }, []);

  const refreshCharts = useCallback(() => { countCharts().then(setChartCount); setChartsVersion((v) => v + 1); }, []);
  useEffect(() => { countCharts().then(setChartCount); }, []);
  useEffect(() => { loadTrades().then(setTrades).catch(() => setLoadError(true)); }, []);

  // Load the price bars for the trade on screen.
  const tradeOnScreen = round?.trade;
  useEffect(() => {
    if (!tradeOnScreen) return;
    let live = true;
    setSeries(null);
    loadSeries(tradeOnScreen).then((s) => live && setSeries(s));
    return () => { live = false; };
  }, [tradeOnScreen]);

  const start = useCallback((t: Trade, extra?: Partial<Round>) => {
    setR({ trade: t, stage: 'guess', step: 0, guess: null, size: null, userExit: null, review: false, ...extra });
    window.scrollTo(0, 0);
  }, [setR]);

  const next = useCallback((f: Filters = filters) => {
    if (!trades) return;
    let P = trades.filter((t) => inPool(t, f, saved.a[t.id]));
    const cur = roundRef.current?.trade;
    if (P.length > 1 && cur) P = P.filter((t) => t !== cur);
    setPoolSize(P.length);
    if (!P.length) { setR(null); return; }
    start(P[Math.floor(Math.random() * P.length)]);
  }, [trades, filters, saved.a, start, setR]);

  useEffect(() => { if (trades && !roundRef.current) next(); }, [trades]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilters = (f: Filters) => { updateSaved((s) => ({ ...s, f })); next(f); };
  const setPlan = (p: ExitPlan) => updateSaved((s) => ({ ...s, plan: p }));
  const patchAnswer = useCallback((id: number, patch: Partial<Answer>) => updateSaved((s) => ({ ...s, a: { ...s.a, [id]: { ...s.a[id], ...patch } as Answer } })), [updateSaved]);

  const pickSize = (size: Size) => { const r = roundRef.current; if (r && r.stage === 'guess' && sizeable(r.trade)) setR({ ...r, size }); };

  const answer = (g: Side) => {
    const r = roundRef.current; if (!r || r.stage !== 'guess') return;
    const t = r.trade;
    if (sizeable(t) && !r.size) { setFlashSize(true); setTimeout(() => setFlashSize(false), 500); return; }
    const prevNote = saved.a[t.id]?.note || '';
    updateSaved((s) => ({ ...s, a: { ...s.a, [t.id]: { g, match: g === t.r, size: r.size, sizeOk: sizeable(t) ? r.size === t.setup : null, ts: Date.now(), note: prevNote } } }));
    setR({ ...r, stage: 'replay', guess: g });
  };

  /** Moves the replay to `step`, applying an exit if given, and finishes at the close. */
  const moveTo = (r: Round, step: number, exit: UserExit | null) => {
    const t = r.trade, end = step >= maxStep(t), userExit = exit || r.userExit;
    if (exit && !r.review) patchAnswer(t.id, { exit: exit.p, exitM: exit.m, exitWhy: exit.why });
    if (end && !r.review) {
      const closeP = pctAt(t, maxStep(t));
      if (!userExit) patchAnswer(t.id, { exit: closeP });
      if (r.guess && (userExit ? userExit.p : closeP) < 0) setSessionLosses((n) => n + 1);
    }
    setR({ ...r, step, userExit, stage: end ? 'done' : 'replay' });
  };

  const advance = (n: number) => {
    const r = roundRef.current; if (!r || r.stage !== 'replay') return;
    const target = Math.min(maxStep(r.trade), r.step + n);
    const hit = !r.userExit && !r.review ? firstTouch(r.trade, r.step, target, plan) : null;
    if (hit) moveTo(r, hit.m, { m: hit.m, p: hit.p, why: hit.why });
    else moveTo(r, target, null);
  };

  const sell = () => {
    const r = roundRef.current; if (!r || r.stage !== 'replay' || r.userExit) return;
    moveTo(r, r.step, { m: r.step, p: pctAt(r.trade, r.step), why: 'manual' });
  };

  /** Reopen a past trade from History at its close, without changing what was recorded. */
  const reopen = (id: number) => {
    const t = byId.get(id), a = saved.a[id]; if (!t || !a) return;
    setOverlay(null);
    start(t, { stage: 'done', step: maxStep(t), guess: a.g, size: a.size || null, review: true, userExit: typeof a.exitM === 'number' ? { m: a.exitM, p: a.exit!, why: a.exitWhy } : null });
  };

  const importAnswers = (incoming: Record<string, Answer>) => {
    let n = 0;
    updateSaved((s) => {
      const a = { ...s.a };
      for (const id of Object.keys(incoming)) if (!a[id] || (incoming[id].ts || 0) > (a[id].ts || 0)) { a[id] = incoming[id]; n++; }
      return { ...s, a };
    });
    return n;
  };

  // Keyboard shortcuts (desktop).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase(), r = roundRef.current;
    if (k === 'escape') { setOverlay(null); return; }
    if (k === 'h') { setOverlay(overlay === 'history' ? null : 'history'); return; }
    if (overlay || !r) return;
    if (r.stage === 'guess') { if (k === 'c') answer('C'); else if (k === 'p') answer('P'); else if (k === 'd') pickSize('Daytrade'); else if (k === 'l') pickSize('Lotto'); else if (k === 'k') next(); else return; }
    else if (r.stage === 'replay') { if (e.key === 'ArrowRight') advance(e.shiftKey ? 15 : 5); else if (k === 's') sell(); else if (k === 'e') advance(99999); else return; }
    else { if (k === 'enter' || k === 'n' || k === ' ') next(); else return; }
    e.preventDefault();
  };
  useEffect(() => { const h = (e: KeyboardEvent) => keys.current(e); document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, []);

  // Hook for automated browser tests.
  useEffect(() => {
    (window as unknown as { __trainer: unknown }).__trainer = {
      get cur() { return roundRef.current?.trade || null; }, series, get stage() { return roundRef.current?.stage; },
      answer, pickSize, advance, next: () => next(), sell, reopen, importCharts, relevantFor,
    };
  });

  const t = round?.trade;
  const r15 = useMemo(() => (t ? rsiAt(series, t.t, 15) : null), [t, series]);
  const r5 = useMemo(() => (t ? rsiAt(series, t.t, 5) : null), [t, series]);

  if (loadError) return <div style={{ padding: 20 }} className="bad">Could not load data/trades.js.</div>;
  return (
    <>
      <Header filters={filters} onFilter={setFilters} answers={saved.a} chartCount={chartCount} onHistory={() => setOverlay('history')} onCharts={() => setOverlay('charts')} />
      <main>
        <section className="box">
          <div id="head">
            {t && <><span className="big">{t.tk}</span><span>{fmtDay.format(new Date(t.t * 1000))} · {t.hm} ET</span>{!round.review && <span className="dim hidemob">{poolSize} trades in this set</span>}</>}
          </div>
          <div className="tf">Chart: <button id="tf5" className={tf === 5 ? 'on' : ''} onClick={() => setTf(5)}>5 min</button><button id="tf15" className={tf === 15 ? 'on' : ''} onClick={() => setTf(15)}>15 min</button>
            <span className="tfnote">RSI 14 with Bollinger Bands on the RSI (34-bar median, 2σ). Tap or hover the chart to read a candle.</span></div>
          <Chart trade={t || null} series={series} step={round?.step || 0} tf={tf} stage={round?.stage || 'guess'} userExit={round?.userExit || null} />
        </section>
        <aside>
          {round && t ? (
            <>
              <ActionBar trade={t} stage={round.stage} step={round.step} guess={round.guess} size={round.size} userExit={round.userExit} review={round.review}
                flashSize={flashSize} plan={plan} onPlan={setPlan} onSize={pickSize} onAnswer={answer} onSkip={() => next()} onAdvance={advance} onSell={sell} onNext={() => next()} />
              {round.stage !== 'guess' && <TradePanel key={t.id} trade={t} step={round.step} stage={round.stage} />}
              {round.stage === 'done' && <Results trade={t} guess={round.guess} size={round.size} userExit={round.userExit} answer={saved.a[t.id]} review={round.review} r15={r15}
                sessionLosses={sessionLosses} chartsVersion={chartsVersion} onNote={(note) => saved.a[t.id] && patchAnswer(t.id, { note })} onLoadCharts={() => setOverlay('charts')} onChartSaved={() => countCharts().then(setChartCount)} />}
              <BiasPanel b4={t.b4} bd={t.bd} r15={r15} r5={r5} loading={!series} />
            </>
          ) : trades ? (
            <div className="box" id="emptyBox">No trades match these filters. Change a filter above, or set "Show" to "Any trade".</div>
          ) : null}
        </aside>
      </main>
      {overlay === 'history' && trades && <History trades={byId} answers={saved.a} onClose={() => setOverlay(null)} onOpen={reopen} onImport={importAnswers} />}
      {overlay === 'charts' && <ChartsDialog onClose={() => setOverlay(null)} onChanged={refreshCharts} />}
    </>
  );
}
