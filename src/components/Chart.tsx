import { useEffect, useRef, useState } from 'react';
import type { EtfSeries, Series, Stage, Trade, UserExit } from '../types';
import type { Divergence } from '../lib/divergence';
import { aggBars, bands, niceStep, rsi, trama, vwapOnChart } from '../lib/indicators';
import { fmtET, fmtMD } from '../lib/format';

interface Props {
  trade: Trade | null;
  message?: string; // shown instead of a blank chart while data loads
  series: Series | null; // bars for the shown timeframe (5-minute series, or 1-minute for tf 1)
  step: number; tf: number; stage: Stage; userExit: UserExit | null;
  swing?: number | null; // entry swing level (shown after answering)
  divs?: Divergence[]; // divergences on this timeframe, as indexes into its bars (shown after answering)
  showTrama?: boolean; // TRAMA 34 overlay
  showVwap?: boolean; etf?: EtfSeries | null; // session VWAP from the ETF's bars
}
interface Geo { i0: number; bw: number; padL: number; nb: number; maxPan: number; slots: number }
/** Review-only view: `pan` bars scrolled back from the default right edge, `zoom` > 1 shows fewer bars. */
export interface View { pan: number; zoom: number }
const NO_VIEW: View = { pan: 0, zoom: 1 };

/** Candles + RSI with Bollinger Bands on the RSI, drawn on a canvas. Shows only bars completed by the replay cursor. */
export function Chart(props: Props) {
  const { trade, tf } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const geo = useRef<Geo | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [size, setSize] = useState(0);
  const [view, setView] = useState<View>(NO_VIEW);
  const canMove = props.stage === 'done' && !!props.trade;
  const drag = useRef<{ x: number; pan: number; moved: boolean } | null>(null);
  const pinch = useRef(new Map<number, number>()); // pointerId -> clientX, for two-finger zoom
  const pinchStart = useRef<{ d: number; zoom: number } | null>(null);

  useEffect(() => setHover(null), [trade, tf]);
  useEffect(() => setView(NO_VIEW), [trade, tf, props.stage]); // every new trade, timeframe or stage starts at the default view
  const zoomBy = (f: number) => setView((v) => ({ ...v, zoom: Math.max(0.25, Math.min(6, v.zoom * f)) }));
  // wheel zoom needs a non-passive listener so the page doesn't scroll at the same time
  useEffect(() => {
    const cv = ref.current; if (!cv || !canMove) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [canMove]);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ro = new ResizeObserver(() => setSize(cv.clientWidth * 10000 + cv.clientHeight));
    ro.observe(cv);
    const onWin = () => setSize(window.innerWidth * 10000 + window.innerHeight); // height changes don't resize the canvas itself
    window.addEventListener('resize', onWin);
    return () => { ro.disconnect(); window.removeEventListener('resize', onWin); };
  }, []);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    if (window.innerWidth > 1000) { // desktop: fill the window below the chart's own top (header height varies)
      const topY = cv.getBoundingClientRect().top + window.scrollY, below = 34; // card padding + page padding
      const h = Math.max(420, Math.min(1400, Math.round(window.innerHeight - topY - below)));
      if (cv.style.height !== h + 'px') cv.style.height = h + 'px';
    } else if (cv.style.height) cv.style.height = ''; // tablets and phones: CSS sizes it to clear the pinned bar
    geo.current = draw(cv, props, hover, canMove ? view : NO_VIEW);
  }); // cheap enough to redraw every render
  // animate the loading bar only while a loading message is up
  const loadingMsg = props.message && !props.trade ? props.message : undefined;
  useEffect(() => {
    if (!loadingMsg) return;
    let id = 0;
    const loop = () => { if (ref.current) draw(ref.current, { ...props, trade: null }, null); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [loadingMsg]); // eslint-disable-line react-hooks/exhaustive-deps
  void size;

  const hoverAt = (clientX: number) => {
    const g = geo.current; if (!g || !ref.current) return;
    const r = ref.current.getBoundingClientRect(), i = g.i0 + Math.floor((clientX - r.left - g.padL) / g.bw);
    const next = i >= g.i0 && i < g.nb ? i : null;
    if (next !== hover) setHover(next);
  };
  const onDown = (e: React.PointerEvent) => {
    hoverAt(e.clientX);
    if (!canMove) return;
    pinch.current.set(e.pointerId, e.clientX);
    if (pinch.current.size === 2) { const [a, b] = [...pinch.current.values()]; pinchStart.current = { d: Math.abs(a - b) || 1, zoom: view.zoom }; drag.current = null; return; }
    drag.current = { x: e.clientX, pan: view.pan, moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const g = geo.current;
    if (canMove && pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, e.clientX);
    if (canMove && pinchStart.current && pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()], z = pinchStart.current.zoom * (Math.abs(a - b) || 1) / pinchStart.current.d;
      setView((v) => ({ ...v, zoom: Math.max(0.25, Math.min(6, z)) })); return;
    }
    if (canMove && drag.current && g) {
      const dx = e.clientX - drag.current.x;
      if (Math.abs(dx) > 3) drag.current.moved = true;
      if (drag.current.moved) { // dragging right shows older bars
        const pan = Math.max(0, Math.min(g.maxPan, Math.round(drag.current.pan + dx / g.bw)));
        if (pan !== view.pan) setView((v) => ({ ...v, pan }));
        if (hover != null) setHover(null);
        return;
      }
    }
    hoverAt(e.clientX);
  };
  const onUp = (e: React.PointerEvent) => { pinch.current.delete(e.pointerId); if (pinch.current.size < 2) pinchStart.current = null; drag.current = null; };
  const moved = view.pan !== 0 || view.zoom !== 1;
  return (
    <div className={'chartwrap' + (canMove ? ' movable' : '')}>
      <canvas id="chart" ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={(e) => { onUp(e); setHover(null); }} onDoubleClick={() => setView(NO_VIEW)} />
      {canMove && <div className="chartnav">
        <span className="hint">Drag to scroll back · wheel or pinch to zoom</span>
        <button onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">−</button>
        <button onClick={() => zoomBy(1.4)} aria-label="Zoom in">+</button>
        {moved && <button onClick={() => setView(NO_VIEW)}>Reset view</button>}
      </div>}
    </div>
  );
}

function draw(cv: HTMLCanvasElement, { trade: cur, message, series, step, tf, stage, userExit, swing, divs, showTrama, showVwap, etf }: Props, hover: number | null, view: View = NO_VIEW): Geo | null {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const x = cv.getContext('2d')!; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  if (!cur || !series || !series.t.length) {
    const msg = message || (cur ? (series ? 'No chart data for this day.' : 'Loading chart…') : '');
    x.fillStyle = '#7D878C'; x.font = "15px 'IBM Plex Sans Condensed', system-ui"; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(msg, W / 2, H / 2);
    if (msg) { // a small pulsing bar so it reads as loading, not broken
      const ph = (Date.now() / 600) % 1, bw0 = Math.min(160, W * 0.4);
      x.fillStyle = '#23282B'; x.fillRect(W / 2 - bw0 / 2, H / 2 + 18, bw0, 3);
      x.fillStyle = '#F0A830'; x.fillRect(W / 2 - bw0 / 2 + ph * (bw0 - 40), H / 2 + 18, 40, 3);
    }
    return null;
  }
  const entrySec = cur.t, cursor = entrySec + step * 60;
  const B = aggBars(series, cursor, tf), nb = B.t.length; if (!nb) return null;
  const closeSec = entrySec + cur.path[cur.path.length - 1][0] * 60;
  const barSec = tf * 60, wide = W >= 700 && tf !== 1; // 1-minute view always slides with the replay
  const padL = 8, padR = wide ? 62 : 52, top = 8, hP = Math.round((H - 40) * 0.68), hR = H - 40 - hP - 14, yR0 = top + hP + 14;
  let ie = 0;
  for (let i = 0; i < nb; i++) if (B.t[i] + barSec <= entrySec) ie = i;
  let i0: number, slots: number;
  if (wide) { // whole session: history on the left, empty space for the rest of the day
    i0 = Math.max(0, ie - (tf === 5 ? 150 : 110));
    // future space: the rest of the day at review; while playing, one hour past the replay cursor
    const restOfDay = Math.ceil((closeSec - (B.t[ie] + barSec)) / barSec) + 2;
    const ahead = Math.ceil((step * 60 + 3600) / barSec) + 2;
    slots = ie - i0 + 1 + (stage === 'done' ? restOfDay : Math.min(restOfDay, ahead));
  } else { // phones: fixed candle width, window slides with the replay
    slots = Math.max(30, Math.floor((W - padL - padR) / (tf === 1 && W >= 700 ? 6 : 4.5)));
    i0 = Math.max(0, nb + (stage === 'guess' ? 6 : 4) - slots);
  }
  // review: scroll back (pan) and zoom around the default window; the right edge never passes the default
  const total = i0 + slots, zSlots = Math.max(20, Math.min(total, Math.round(slots / view.zoom)));
  const maxPan = total - zSlots, pan = Math.max(0, Math.min(maxPan, view.pan));
  slots = zSlots; i0 = total - pan - zSlots;
  const nbv = Math.min(nb, i0 + slots); // last bar on screen (exclusive)
  const bw = (W - padL - padR) / slots, xi = (i: number) => padL + (i - i0 + 0.5) * bw;
  let lo = Infinity, hi = -Infinity;
  for (let i = i0; i < nbv; i++) { if (B.l[i] < lo) lo = B.l[i]; if (B.h[i] > hi) hi = B.h[i]; }
  const showSwing = stage !== 'guess' && swing != null;
  let swingBox: [number, number, number, number] | null = null; // x, y, w, h of the "swing stop" label
  if (showSwing) { lo = Math.min(lo, swing as number); hi = Math.max(hi, swing as number); }
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const yp = (v: number) => top + ((hi - v) / (hi - lo)) * hP;
  x.font = "11px 'IBM Plex Mono', ui-monospace, monospace"; x.textBaseline = 'middle';
  const stepP = niceStep((hi - lo) / (wide ? 6 : 5));
  for (let p = Math.ceil(lo / stepP) * stepP; p < hi; p += stepP) {
    x.strokeStyle = '#1B1F21'; x.beginPath(); x.moveTo(padL, yp(p)); x.lineTo(W - padR, yp(p)); x.stroke();
    x.fillStyle = '#7D878C'; x.fillText(p.toFixed(stepP < 1 ? 2 : stepP < 10 ? 1 : 0), W - padR + 6, yp(p));
  }
  let lastDay = '';
  const everyN = Math.max(1, Math.round(70 / bw));
  // while playing on a wide screen, say what time the right edge is (the window grows as you step)
  const edgeLabel = wide && stage !== 'done';
  for (let i = i0; i < i0 + slots; i++) {
    if (i >= nb && !wide) break;
    const ts = i < nb ? B.t[i] : B.t[nb - 1] + (i - nb + 1) * barSec, dte = new Date(ts * 1000), dayS = fmtMD.format(dte);
    if (dayS !== lastDay && i < nb) {
      if (lastDay || i > i0) { x.strokeStyle = '#2E3437'; x.setLineDash([2, 4]); x.beginPath(); x.moveTo(xi(i) - bw / 2, top); x.lineTo(xi(i) - bw / 2, H - 22); x.stroke(); x.setLineDash([]); }
      x.fillStyle = '#9AA4A9'; x.fillText(dayS, xi(i) - bw / 2 + 4, H - 6); lastDay = dayS;
    }
    if ((i - i0) % everyN === 0 && xi(i) > 22 && xi(i) < W - padR - (edgeLabel ? 70 : 16)) { x.fillStyle = '#7D878C'; x.textAlign = 'center'; x.fillText(fmtET.format(dte), xi(i), H - 18); x.textAlign = 'left'; }
  }
  for (let i = i0; i < nbv; i++) {
    // up candles hollow blue, down candles solid orange: shape and colour both carry direction
    const up = B.c[i] >= B.o[i]; x.strokeStyle = x.fillStyle = up ? '#63B3ED' : '#F08A3C';
    const y1 = yp(Math.max(B.o[i], B.c[i])), y2 = yp(Math.min(B.o[i], B.c[i]));
    const cw = Math.max(2, bw * 0.64), cx = xi(i) - cw / 2, ch = Math.max(1, y2 - y1);
    x.beginPath(); x.moveTo(xi(i), yp(B.h[i])); x.lineTo(xi(i), y1); x.moveTo(xi(i), y1 + ch); x.lineTo(xi(i), yp(B.l[i])); x.stroke();
    if (up && cw >= 4) x.strokeRect(Math.round(cx) + 0.5, Math.round(y1) + 0.5, Math.round(cw) - 1, Math.max(1, Math.round(ch) - 1));
    else x.fillRect(cx, y1, cw, ch);
  }
  if (showVwap && etf) { // breaks between sessions (no line overnight)
    const V = vwapOnChart(B, etf, tf);
    x.strokeStyle = '#7FD4C1'; x.lineWidth = 1.4; x.beginPath(); let st = false;
    for (let j = i0; j < nbv; j++) { const v = V[j]; if (v == null) { st = false; continue; } if (!st) { x.moveTo(xi(j), yp(v)); st = true; } else x.lineTo(xi(j), yp(v)); }
    x.stroke(); x.lineWidth = 1;
  }
  if (showTrama) { // TRAMA 34 on this timeframe, computed over all bars so it is settled by the first one shown
    const T = trama(B.h, B.l, B.c, 34);
    x.strokeStyle = '#C9A6FF'; x.lineWidth = 1.8; x.beginPath(); let st = false;
    for (let j = i0; j < nbv; j++) { const v = T[j]; if (v == null) continue; if (!st) { x.moveTo(xi(j), yp(v)); st = true; } else x.lineTo(xi(j), yp(v)); }
    x.stroke(); x.lineWidth = 1;
  }
  if (showSwing) {
    const ys = yp(swing as number), lbl = 'swing stop'; // short: it sits beside the axis; the lesson explains the rule
    x.strokeStyle = 'rgba(240,138,60,.85)'; x.setLineDash([6, 4]); x.beginPath(); x.moveTo(padL, ys); x.lineTo(W - padR, ys); x.stroke(); x.setLineDash([]);
    // right end of the line, beside the price axis: the empty rest-of-day area on desktop
    const ly = ys + (cur.r === 'C' ? 11 : -11), lw = x.measureText(lbl).width + 10, lx = W - padR - lw - 4;
    x.fillStyle = 'rgba(14,17,18,.92)'; x.fillRect(lx, ly - 8, lw, 16);
    x.fillStyle = '#F08A3C'; x.fillText(lbl, lx + 5, ly);
    swingBox = [lx, ly - 8, lw, 16];
  }
  if (edgeLabel) {
    const edgeT = B.t[nb - 1] + (i0 + slots - nb) * barSec, txt = fmtET.format(new Date(edgeT * 1000)) + ' →';
    x.fillStyle = '#F0A830'; x.textAlign = 'right'; x.fillText(txt, W - padR - 2, H - 18); x.textAlign = 'left';
  }
  const divColor = (d: Divergence) => (d.type === 'bull' ? '#63B3ED' : '#F08A3C');
  const showDivs = stage !== 'guess' && divs ? divs.filter((d) => d.i1 >= i0 && d.i2 < nbv) : [];
  for (const d of showDivs) {
    const v1 = d.type === 'bull' ? B.l[d.i1] : B.h[d.i1], v2 = d.type === 'bull' ? B.l[d.i2] : B.h[d.i2];
    x.strokeStyle = divColor(d); x.lineWidth = 2; x.beginPath(); x.moveTo(xi(d.i1), yp(v1)); x.lineTo(xi(d.i2), yp(v2)); x.stroke(); x.lineWidth = 1;
    // label kept clear of the "Entry" / instrument labels along the top
    // at the middle of the line, pushed away from price (below lows, above highs), not by the entry
    const dl = d.type === 'bull' ? 'Bull div?' : 'Bear div?', dw = x.measureText(dl).width;
    let ext = d.type === 'bull' ? Infinity : -Infinity;
    for (let j = d.i1; j <= d.i2; j++) ext = d.type === 'bull' ? Math.min(ext, B.l[j]) : Math.max(ext, B.h[j]);
    const dy = Math.min(top + hP - 8, Math.max(top + 28, yp(ext) + (d.type === 'bull' ? 14 : -14)));
    const dx = Math.max(padL + 4, Math.min((xi(d.i1) + xi(d.i2)) / 2 - dw / 2, W - padR - dw - 8));
    x.fillStyle = 'rgba(14,17,18,.88)'; x.fillRect(dx - 3, dy - 8, x.measureText(dl).width + 6, 16);
    x.fillStyle = divColor(d); x.fillText(dl, dx, dy);
  }
  const xe = padL + (ie - i0 + 1) * bw + ((entrySec - (B.t[ie] + barSec)) / barSec) * bw;
  if (xe > padL && xe < W - padR) {
    x.strokeStyle = '#F0A830'; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(xe, top); x.lineTo(xe, H - 28); x.stroke(); x.setLineDash([]);
    const et = stage === 'guess' ? 'RSI Trader enters here' : 'Entry';
    x.fillStyle = '#F0A830'; x.fillText(et, Math.min(xe + 5, W - padR - x.measureText(et).width - 4), top + 8);
  }
  // the amber last-price tag only when the newest bar is on screen (scrolled back, it would read as the current price)
  const lp = B.c[nbv - 1];
  if (pan === 0) { x.fillStyle = '#F0A830'; x.fillRect(W - padR + 2, yp(lp) - 8, padR - 4, 16); x.fillStyle = '#0E1112'; x.fillText(lp.toFixed(lp > 2000 ? 1 : 2), W - padR + 5, yp(lp)); }
  if (stage !== 'guess') for (const e of cur.ev) {
    if (e.k !== 'trim' || e.m > step) continue;
    const xs = xe + ((e.m * 60) / barSec) * bw; if (xs < padL || xs > W - padR) continue;
    x.fillStyle = '#F0A830'; x.beginPath(); x.moveTo(xs, top + hP - 4); x.lineTo(xs - 5, top + hP + 6); x.lineTo(xs + 5, top + hP + 6); x.fill();
  }
  if (userExit && stage !== 'guess') {
    const xu = xe + ((userExit.m * 60) / barSec) * bw;
    if (xu > padL && xu < W - padR) {
      x.strokeStyle = '#63B3ED'; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(xu, top); x.lineTo(xu, top + hP); x.stroke(); x.setLineDash([]);
      // label with the time and result, kept on screen
      const lbl = 'Sold ' + fmtET.format(new Date((entrySec + userExit.m * 60) * 1000)) + ' ' + (userExit.p >= 0 ? '+' : '') + userExit.p.toFixed(0) + '%';
      const lw = x.measureText(lbl).width + 8, lx = Math.min(xu + 4, W - padR - lw - 2);
      let ly = top + 24;
      if (swingBox) { // move it clear of the "swing stop" label if they would overlap
        const [sx, sy, sw, sh] = swingBox, hits = (y: number) => lx - 2 < sx + sw && lx - 2 + lw > sx && y - 8 < sy + sh && y + 8 > sy;
        if (hits(ly)) ly = sy + sh + 12 < top + hP - 8 ? sy + sh + 12 : sy - 12;
      }
      x.fillStyle = 'rgba(14,17,18,.88)'; x.fillRect(lx - 2, ly - 8, lw, 16);
      x.fillStyle = userExit.p >= 0 ? '#63B3ED' : '#F08A3C'; x.fillText(lbl, lx + 2, ly);
    }
  }
  // RSI panel
  const R = rsi(B.c), bb = bands(R), yr = (v: number) => yR0 + ((100 - v) / 100) * hR;
  x.strokeStyle = '#1B1F21';
  for (const v of [30, 50, 70]) { x.beginPath(); x.moveTo(padL, yr(v)); x.lineTo(W - padR, yr(v)); x.stroke(); x.fillStyle = '#7D878C'; x.fillText(String(v), W - padR + 6, yr(v)); }
  x.strokeStyle = '#23282B'; x.strokeRect(padL, yR0, W - padL - padR, hR);
  const line = (arr: (number | null)[], color: string, width: number) => {
    x.strokeStyle = color; x.lineWidth = width; x.beginPath(); let st = false;
    for (let j = i0; j < nbv; j++) { const v = arr[j]; if (v == null) continue; if (!st) { x.moveTo(xi(j), yr(v)); st = true; } else x.lineTo(xi(j), yr(v)); }
    x.stroke(); x.lineWidth = 1;
  };
  line(bb.up, '#5B6469', 1); line(bb.lo, '#5B6469', 1); line(bb.mid, '#B89AE0', 1.2); line(R, '#9fe3f0', 1.6);
  for (const d of showDivs) {
    const r1 = R[d.i1], r2 = R[d.i2]; if (r1 == null || r2 == null) continue;
    x.strokeStyle = divColor(d); x.lineWidth = 2; x.beginPath(); x.moveTo(xi(d.i1), yr(r1)); x.lineTo(xi(d.i2), yr(r2)); x.stroke(); x.lineWidth = 1;
  }
  x.fillStyle = '#7D878C';
  x.fillText('RSI ' + (R[nbv - 1] == null ? '' : (R[nbv - 1] as number).toFixed(1)) + '   median ' + (bb.mid[nbv - 1] == null ? '' : (bb.mid[nbv - 1] as number).toFixed(1)), padL + 6, yR0 + 10);
  x.fillText(cur.ci + ' · ' + tf + ' min', padL + 6, top + 8);
  if (hover != null && hover >= i0 && hover < nbv) { // crosshair readout
    const hx = xi(hover), d = new Date(B.t[hover] * 1000), rv = R[hover], mv = bb.mid[hover];
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.moveTo(hx, top); x.lineTo(hx, yR0 + hR); x.stroke();
    const txt = fmtMD.format(d) + ' ' + fmtET.format(d) + '  O ' + B.o[hover].toFixed(2) + '  H ' + B.h[hover].toFixed(2) + '  L ' + B.l[hover].toFixed(2) + '  C ' + B.c[hover].toFixed(2) + (rv == null ? '' : '  RSI ' + rv.toFixed(1) + (mv == null ? '' : ' (med ' + mv.toFixed(1) + ')'));
    const tw = Math.min(W - padR - padL - 8, x.measureText(txt).width + 12);
    x.fillStyle = 'rgba(18,22,23,.96)'; x.fillRect(padL + 4, top + 18, tw, 20); x.fillStyle = '#D9DEE0'; x.fillText(txt, padL + 10, top + 28, tw - 12);
  }
  return { i0, bw, padL, nb: nbv, maxPan, slots };
}
