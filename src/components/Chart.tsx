import { useEffect, useRef, useState } from 'react';
import type { Series, Stage, Trade, UserExit } from '../types';
import type { Divergence } from '../lib/divergence';
import { aggBars, bands, niceStep, rsi } from '../lib/indicators';
import { fmtET, fmtMD } from '../lib/format';

interface Props {
  trade: Trade | null;
  series: Series | null; // bars for the shown timeframe (5-minute series, or 1-minute for tf 1)
  step: number; tf: number; stage: Stage; userExit: UserExit | null;
  swing?: number | null; // entry swing level (shown after answering)
  divs?: Divergence[]; // divergences on this timeframe, as indexes into its bars (shown after answering)
}
interface Geo { i0: number; bw: number; padL: number; nb: number }

/** Candles + RSI with Bollinger Bands on the RSI, drawn on a canvas. Shows only bars completed by the replay cursor. */
export function Chart(props: Props) {
  const { trade, tf } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const geo = useRef<Geo | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [size, setSize] = useState(0);

  useEffect(() => setHover(null), [trade, tf]);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ro = new ResizeObserver(() => setSize(cv.clientWidth * 10000 + cv.clientHeight));
    ro.observe(cv); return () => ro.disconnect();
  }, []);
  useEffect(() => { if (ref.current) geo.current = draw(ref.current, props, hover); }); // cheap enough to redraw every render
  void size;

  const onPointer = (e: React.PointerEvent) => {
    const g = geo.current; if (!g || !ref.current) return;
    const r = ref.current.getBoundingClientRect(), i = g.i0 + Math.floor((e.clientX - r.left - g.padL) / g.bw);
    const next = i >= g.i0 && i < g.nb ? i : null;
    if (next !== hover) setHover(next);
  };
  return <canvas id="chart" ref={ref} onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setHover(null)} />;
}

function draw(cv: HTMLCanvasElement, { trade: cur, series, step, tf, stage, userExit, swing, divs }: Props, hover: number | null): Geo | null {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const x = cv.getContext('2d')!; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  if (!cur || !series || !series.t.length) {
    x.fillStyle = '#8b93a7'; x.font = '14px system-ui';
    x.fillText(cur ? (series ? 'No chart data for this day.' : 'Loading chart…') : '', 20, 30);
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
    slots = ie - i0 + 1 + Math.ceil((closeSec - (B.t[ie] + barSec)) / barSec) + 2;
  } else { // phones: fixed candle width, window slides with the replay
    slots = Math.max(30, Math.floor((W - padL - padR) / (tf === 1 && W >= 700 ? 6 : 4.5)));
    i0 = Math.max(0, nb + (stage === 'guess' ? 6 : 4) - slots);
  }
  const bw = (W - padL - padR) / slots, xi = (i: number) => padL + (i - i0 + 0.5) * bw;
  let lo = Infinity, hi = -Infinity;
  for (let i = i0; i < nb; i++) { if (B.l[i] < lo) lo = B.l[i]; if (B.h[i] > hi) hi = B.h[i]; }
  const showSwing = stage !== 'guess' && swing != null;
  if (showSwing) { lo = Math.min(lo, swing as number); hi = Math.max(hi, swing as number); }
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const yp = (v: number) => top + ((hi - v) / (hi - lo)) * hP;
  x.font = '11px system-ui'; x.textBaseline = 'middle';
  const stepP = niceStep((hi - lo) / (wide ? 6 : 5));
  for (let p = Math.ceil(lo / stepP) * stepP; p < hi; p += stepP) {
    x.strokeStyle = '#1b2130'; x.beginPath(); x.moveTo(padL, yp(p)); x.lineTo(W - padR, yp(p)); x.stroke();
    x.fillStyle = '#8b93a7'; x.fillText(p.toFixed(stepP < 1 ? 2 : stepP < 10 ? 1 : 0), W - padR + 6, yp(p));
  }
  let lastDay = '';
  const everyN = Math.max(1, Math.round(70 / bw));
  for (let i = i0; i < i0 + slots; i++) {
    if (i >= nb && !wide) break;
    const ts = i < nb ? B.t[i] : B.t[nb - 1] + (i - nb + 1) * barSec, dte = new Date(ts * 1000), dayS = fmtMD.format(dte);
    if (dayS !== lastDay && i < nb) {
      if (lastDay || i > i0) { x.strokeStyle = '#2a3142'; x.setLineDash([2, 4]); x.beginPath(); x.moveTo(xi(i) - bw / 2, top); x.lineTo(xi(i) - bw / 2, H - 22); x.stroke(); x.setLineDash([]); }
      x.fillStyle = '#5b8def'; x.fillText(dayS, xi(i) - bw / 2 + 4, H - 6); lastDay = dayS;
    }
    if ((i - i0) % everyN === 0 && xi(i) > 22 && xi(i) < W - padR - 16) { x.fillStyle = '#8b93a7'; x.textAlign = 'center'; x.fillText(fmtET.format(dte), xi(i), H - 18); x.textAlign = 'left'; }
  }
  for (let i = i0; i < nb; i++) {
    const up = B.c[i] >= B.o[i]; x.strokeStyle = x.fillStyle = up ? '#2ebd85' : '#f6465d';
    x.beginPath(); x.moveTo(xi(i), yp(B.h[i])); x.lineTo(xi(i), yp(B.l[i])); x.stroke();
    const y1 = yp(Math.max(B.o[i], B.c[i])), y2 = yp(Math.min(B.o[i], B.c[i]));
    x.fillRect(xi(i) - Math.max(1, bw * 0.35), y1, Math.max(2, bw * 0.7), Math.max(1, y2 - y1));
  }
  if (showSwing) {
    const ys = yp(swing as number), lbl = (cur.r === 'C' ? 'Entry swing low' : 'Entry swing high') + (wide ? ': stop on a 5m close past it' : ' (5m-close stop)');
    x.strokeStyle = 'rgba(246,70,93,.8)'; x.setLineDash([6, 4]); x.beginPath(); x.moveTo(padL, ys); x.lineTo(W - padR, ys); x.stroke(); x.setLineDash([]);
    const ly = ys + (cur.r === 'C' ? 11 : -11), lw = x.measureText(lbl).width + 10;
    x.fillStyle = 'rgba(11,14,20,.85)'; x.fillRect(padL + 2, ly - 8, lw, 16);
    x.fillStyle = 'rgba(246,70,93,.95)'; x.fillText(lbl, padL + 7, ly);
  }
  const divColor = (d: Divergence) => (d.type === 'bull' ? '#2ebd85' : '#f6465d');
  const showDivs = stage !== 'guess' && divs ? divs.filter((d) => d.i1 >= i0 && d.i2 < nb) : [];
  for (const d of showDivs) {
    const v1 = d.type === 'bull' ? B.l[d.i1] : B.h[d.i1], v2 = d.type === 'bull' ? B.l[d.i2] : B.h[d.i2];
    x.strokeStyle = divColor(d); x.lineWidth = 2; x.beginPath(); x.moveTo(xi(d.i1), yp(v1)); x.lineTo(xi(d.i2), yp(v2)); x.stroke(); x.lineWidth = 1;
    // label kept clear of the "Entry" / instrument labels along the top
    const dl = d.type === 'bull' ? 'Bull div?' : 'Bear div?';
    const dy = Math.min(top + hP - 8, Math.max(top + 28, yp(v2) + (d.type === 'bull' ? 13 : -13)));
    const dx = Math.min(xi(d.i2) + 4, W - padR - x.measureText(dl).width - 8);
    x.fillStyle = 'rgba(11,14,20,.85)'; x.fillRect(dx - 3, dy - 8, x.measureText(dl).width + 6, 16);
    x.fillStyle = divColor(d); x.fillText(dl, dx, dy);
  }
  const xe = padL + (ie - i0 + 1) * bw + ((entrySec - (B.t[ie] + barSec)) / barSec) * bw;
  if (xe > padL) {
    x.strokeStyle = '#e6b450'; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(xe, top); x.lineTo(xe, H - 28); x.stroke(); x.setLineDash([]);
    const et = stage === 'guess' ? 'Bear enters here' : 'Entry';
    x.fillStyle = '#e6b450'; x.fillText(et, Math.min(xe + 5, W - padR - x.measureText(et).width - 4), top + 8);
  }
  const lp = B.c[nb - 1];
  x.fillStyle = '#5b8def'; x.fillRect(W - padR + 2, yp(lp) - 8, padR - 4, 16); x.fillStyle = '#fff'; x.fillText(lp.toFixed(lp > 2000 ? 1 : 2), W - padR + 5, yp(lp));
  if (stage !== 'guess') for (const e of cur.ev) {
    if (e.k !== 'trim' || e.m > step) continue;
    const xs = xe + ((e.m * 60) / barSec) * bw; if (xs < padL) continue;
    x.fillStyle = '#5b8def'; x.beginPath(); x.moveTo(xs, top + hP - 4); x.lineTo(xs - 5, top + hP + 6); x.lineTo(xs + 5, top + hP + 6); x.fill();
  }
  if (userExit && stage !== 'guess') {
    const xu = xe + ((userExit.m * 60) / barSec) * bw;
    if (xu > padL) { x.strokeStyle = '#fff'; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(xu, top); x.lineTo(xu, top + hP); x.stroke(); x.setLineDash([]); x.fillStyle = '#fff'; x.fillText('You sold', xu + 4, top + 22); }
  }
  // RSI panel
  const R = rsi(B.c), bb = bands(R), yr = (v: number) => yR0 + ((100 - v) / 100) * hR;
  x.strokeStyle = '#1b2130';
  for (const v of [30, 50, 70]) { x.beginPath(); x.moveTo(padL, yr(v)); x.lineTo(W - padR, yr(v)); x.stroke(); x.fillStyle = '#8b93a7'; x.fillText(String(v), W - padR + 6, yr(v)); }
  x.strokeStyle = '#262c3a'; x.strokeRect(padL, yR0, W - padL - padR, hR);
  const line = (arr: (number | null)[], color: string, width: number) => {
    x.strokeStyle = color; x.lineWidth = width; x.beginPath(); let st = false;
    for (let j = i0; j < nb; j++) { const v = arr[j]; if (v == null) continue; if (!st) { x.moveTo(xi(j), yr(v)); st = true; } else x.lineTo(xi(j), yr(v)); }
    x.stroke(); x.lineWidth = 1;
  };
  line(bb.up, 'rgba(230,180,80,.7)', 1); line(bb.lo, 'rgba(230,180,80,.7)', 1); line(bb.mid, 'rgba(200,170,230,.9)', 1.2); line(R, '#9fe3f0', 1.6);
  for (const d of showDivs) {
    const r1 = R[d.i1], r2 = R[d.i2]; if (r1 == null || r2 == null) continue;
    x.strokeStyle = divColor(d); x.lineWidth = 2; x.beginPath(); x.moveTo(xi(d.i1), yr(r1)); x.lineTo(xi(d.i2), yr(r2)); x.stroke(); x.lineWidth = 1;
  }
  x.fillStyle = '#8b93a7';
  x.fillText('RSI ' + (R[nb - 1] == null ? '' : (R[nb - 1] as number).toFixed(1)) + '   median ' + (bb.mid[nb - 1] == null ? '' : (bb.mid[nb - 1] as number).toFixed(1)), padL + 6, yR0 + 10);
  x.fillText(cur.ci + ' · ' + tf + ' min', padL + 6, top + 8);
  if (hover != null && hover >= i0 && hover < nb) { // crosshair readout
    const hx = xi(hover), d = new Date(B.t[hover] * 1000), rv = R[hover], mv = bb.mid[hover];
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.moveTo(hx, top); x.lineTo(hx, yR0 + hR); x.stroke();
    const txt = fmtMD.format(d) + ' ' + fmtET.format(d) + '  O ' + B.o[hover].toFixed(2) + '  H ' + B.h[hover].toFixed(2) + '  L ' + B.l[hover].toFixed(2) + '  C ' + B.c[hover].toFixed(2) + (rv == null ? '' : '  RSI ' + rv.toFixed(1) + (mv == null ? '' : ' (med ' + mv.toFixed(1) + ')'));
    const tw = Math.min(W - padR - padL - 8, x.measureText(txt).width + 12);
    x.fillStyle = 'rgba(23,27,36,.95)'; x.fillRect(padL + 4, top + 18, tw, 20); x.fillStyle = '#e6e9ef'; x.fillText(txt, padL + 10, top + 28, tw - 12);
  }
  return { i0, bw, padL, nb };
}
