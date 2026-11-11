(function () {
  'use strict';
  var T = window.BEAR_TRADES || [];
  var BY_ID = {}; T.forEach(function (t) { BY_ID[t.id] = t; });
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'bearTrainerV1';
  var store = { a: {}, f: null };
  try { var s = localStorage.getItem(KEY); if (s) store = JSON.parse(s) || store; } catch (e) {}
  if (!store.a) store.a = {};
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

  // cur = trade on screen; stage: guess | replay | done; review = reopened from history
  var cur = null, stage = 'guess', step = 0, tf = 5, series = null, userExit = null, guess = null, size = null, review = false, hover = null, geo = null;
  var sessionLosses = 0;
  var fmtET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
  var fmtDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  var fmtMD = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  function pct(v) { return (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10) + '%'; }
  function cls(v) { return v > 0 ? 'good' : v < 0 ? 'bad' : ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sizeable(t) { return t.setup === 'Daytrade' || t.setup === 'Lotto'; }

  // ---------- data loading ----------
  var loading = {};
  function loadBars(ci, yr) {
    var k = ci + '_' + yr;
    if (window.BEAR_BARS && window.BEAR_BARS[k]) return Promise.resolve(window.BEAR_BARS[k]);
    if (loading[k]) return loading[k];
    loading[k] = new Promise(function (res) {
      var sc = document.createElement('script'); sc.src = 'data/bars_' + k + '.js';
      sc.onload = function () { res((window.BEAR_BARS || {})[k] || null); };
      sc.onerror = function () { res(null); };
      document.head.appendChild(sc);
    });
    return loading[k];
  }
  function buildSeries(t) {
    var yr = +t.d.slice(0, 4), mo = +t.d.slice(5, 7), dy = +t.d.slice(8, 10);
    var years = (mo === 1 && dy <= 9) ? [yr - 1, yr] : [yr];
    return Promise.all(years.map(function (y) { return loadBars(t.ci, y); })).then(function (parts) {
      var tt = [], o = [], h = [], l = [], c = [];
      parts.forEach(function (p) { if (!p) return; var sc = p.scale;
        for (var i = 0; i < p.t.length; i++) { tt.push(p.t[i]); o.push(p.o[i] / sc); h.push(p.h[i] / sc); l.push(p.l[i] / sc); c.push(p.c[i] / sc); } });
      return { t: tt, o: o, h: h, l: l, c: c };
    });
  }

  // ---------- indicators ----------
  function rsi(c, n) {
    var out = new Array(c.length).fill(null); if (c.length <= n) return out;
    var g = 0, l = 0, i;
    for (i = 1; i <= n; i++) { var d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (i = n + 1; i < c.length; i++) { var d2 = c[i] - c[i - 1]; g = (g * (n - 1) + (d2 > 0 ? d2 : 0)) / n; l = (l * (n - 1) + (d2 < 0 ? -d2 : 0)) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    return out;
  }
  function bands(v, n, k) {
    var mid = new Array(v.length).fill(null), up = mid.slice(), lo = mid.slice();
    for (var i = 0; i < v.length; i++) {
      if (i < n - 1 || v[i - n + 1] === null) continue;
      var s = 0, j; for (j = i - n + 1; j <= i; j++) s += v[j];
      var m = s / n, q = 0; for (j = i - n + 1; j <= i; j++) q += (v[j] - m) * (v[j] - m);
      var sd = Math.sqrt(q / n); mid[i] = m; up[i] = m + k * sd; lo[i] = m - k * sd;
    }
    return { mid: mid, up: up, lo: lo };
  }
  // bars completed by cursor time (seconds), aggregated to `mins` minutes
  function aggBars(cursorSec, mins) {
    var S = series, n = mins / 5, out = { t: [], o: [], h: [], l: [], c: [] }, lastG = null;
    for (var i = 0; i < S.t.length; i++) {
      if ((S.t[i] + 1) * 300 > cursorSec) break;
      var g = Math.floor(S.t[i] / n);
      if (g !== lastG) { out.t.push(g * n * 300); out.o.push(S.o[i]); out.h.push(S.h[i]); out.l.push(S.l[i]); out.c.push(S.c[i]); lastG = g; }
      else { var k = out.t.length - 1; if (S.h[i] > out.h[k]) out.h[k] = S.h[i]; if (S.l[i] < out.l[k]) out.l[k] = S.l[i]; out.c[k] = S.c[i]; }
    }
    return out;
  }
  // RSI, median and bands on a timeframe at the entry candle: [rsi, median, upper, lower]
  function rsiAtEntry(mins) {
    if (!series) return null;
    var B = aggBars(cur.t, mins); if (B.c.length < 60) return null;
    var c = B.c.slice(-300), R = rsi(c, 14), bb = bands(R, 34, 2), i = R.length - 1;
    return bb.mid[i] == null ? null : [R[i], bb.mid[i], bb.up[i], bb.lo[i]];
  }

  // ---------- chart ----------
  function draw() {
    var cv = $('chart'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H); geo = null;
    if (!cur || !series || !series.t.length) { x.fillStyle = '#8b93a7'; x.font = '14px system-ui'; x.fillText(cur ? (series ? 'No chart data for this day.' : 'Loading chart…') : '', 20, 30); return; }
    var entrySec = cur.t, cursor = entrySec + step * 60;
    var B = aggBars(cursor, tf), nb = B.t.length; if (!nb) return;
    var closeSec = entrySec + (cur.path[cur.path.length - 1][0]) * 60;
    var barSec = tf * 60, wide = W >= 700;
    var padL = 8, padR = wide ? 62 : 52, top = 8, hP = Math.round((H - 40) * 0.68), hR = (H - 40) - hP - 14, yR0 = top + hP + 14;
    var ie = 0, i; for (i = 0; i < nb; i++) if (B.t[i] + barSec <= entrySec) ie = i;
    var i0, slots;
    if (wide) { // whole session visible: history on the left, empty space for the rest of the day
      i0 = Math.max(0, ie - (tf === 5 ? 150 : 110));
      slots = (ie - i0 + 1) + Math.ceil((closeSec - (B.t[ie] + barSec)) / barSec) + 2;
    } else { // phones: fixed candle width, window slides with the replay
      slots = Math.max(30, Math.floor((W - padL - padR) / 4.5));
      var rightPad = stage === 'guess' ? 6 : 4;
      i0 = Math.max(0, nb + rightPad - slots);
    }
    var bw = (W - padL - padR) / slots;
    var xi = function (i) { return padL + (i - i0 + 0.5) * bw; };
    var lo = Infinity, hi = -Infinity;
    for (i = i0; i < nb; i++) { if (B.l[i] < lo) lo = B.l[i]; if (B.h[i] > hi) hi = B.h[i]; }
    var pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
    var yp = function (v) { return top + (hi - v) / (hi - lo) * hP; };
    x.font = '11px system-ui'; x.textBaseline = 'middle';
    var stepP = niceStep((hi - lo) / (wide ? 6 : 5));
    for (var p = Math.ceil(lo / stepP) * stepP; p < hi; p += stepP) { x.strokeStyle = '#1b2130'; x.beginPath(); x.moveTo(padL, yp(p)); x.lineTo(W - padR, yp(p)); x.stroke(); x.fillStyle = '#8b93a7'; x.fillText(p.toFixed(stepP < 1 ? 2 : stepP < 10 ? 1 : 0), W - padR + 6, yp(p)); }
    var lastDay = '', everyN = Math.max(1, Math.round(70 / bw));
    for (i = i0; i < i0 + slots; i++) {
      if (i >= nb && !wide) break;
      var ts = i < nb ? B.t[i] : B.t[nb - 1] + (i - nb + 1) * barSec; var dte = new Date(ts * 1000), dayS = fmtMD.format(dte);
      if (dayS !== lastDay && i < nb) { if (lastDay || i > i0) { x.strokeStyle = '#2a3142'; x.setLineDash([2, 4]); x.beginPath(); x.moveTo(xi(i) - bw / 2, top); x.lineTo(xi(i) - bw / 2, H - 22); x.stroke(); x.setLineDash([]); } x.fillStyle = '#5b8def'; x.fillText(dayS, xi(i) - bw / 2 + 4, H - 6); lastDay = dayS; }
      if ((i - i0) % everyN === 0 && xi(i) > 22 && xi(i) < W - padR - 16) { x.fillStyle = '#8b93a7'; x.textAlign = 'center'; x.fillText(fmtET.format(dte), xi(i), H - 18); x.textAlign = 'left'; }
    }
    for (i = i0; i < nb; i++) {
      var up = B.c[i] >= B.o[i]; x.strokeStyle = x.fillStyle = up ? '#2ebd85' : '#f6465d';
      x.beginPath(); x.moveTo(xi(i), yp(B.h[i])); x.lineTo(xi(i), yp(B.l[i])); x.stroke();
      var y1 = yp(Math.max(B.o[i], B.c[i])), y2 = yp(Math.min(B.o[i], B.c[i]));
      x.fillRect(xi(i) - Math.max(1, bw * 0.35), y1, Math.max(2, bw * 0.7), Math.max(1, y2 - y1));
    }
    var xe = padL + (ie - i0 + 1) * bw + ((entrySec - (B.t[ie] + barSec)) / barSec) * bw;
    if (xe > padL) {
      x.strokeStyle = '#e6b450'; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(xe, top); x.lineTo(xe, H - 28); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#e6b450'; var et = stage === 'guess' ? 'Bear enters here' : 'Entry'; x.fillText(et, Math.min(xe + 5, W - padR - x.measureText(et).width - 4), top + 8);
    }
    var lp = B.c[nb - 1]; x.fillStyle = '#5b8def'; x.fillRect(W - padR + 2, yp(lp) - 8, padR - 4, 16); x.fillStyle = '#fff'; x.fillText(lp.toFixed(lp > 2000 ? 1 : 2), W - padR + 5, yp(lp));
    if (stage !== 'guess') cur.ev.forEach(function (e) {
      if (e.k !== 'trim' || e.m > step) return;
      var xs = xe + (e.m * 60 / barSec) * bw; if (xs < padL) return; x.fillStyle = '#5b8def'; x.beginPath(); x.moveTo(xs, top + hP - 4); x.lineTo(xs - 5, top + hP + 6); x.lineTo(xs + 5, top + hP + 6); x.fill();
    });
    if (userExit && stage !== 'guess') { var xu = xe + (userExit.m * 60 / barSec) * bw; if (xu > padL) { x.strokeStyle = '#fff'; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(xu, top); x.lineTo(xu, top + hP); x.stroke(); x.setLineDash([]); x.fillStyle = '#fff'; x.fillText('You sold', xu + 4, top + 22); } }
    // RSI panel
    var R = rsi(B.c, 14), bb = bands(R, 34, 2);
    var yr = function (v) { return yR0 + (100 - v) / 100 * hR; };
    x.strokeStyle = '#1b2130'; [30, 50, 70].forEach(function (v) { x.beginPath(); x.moveTo(padL, yr(v)); x.lineTo(W - padR, yr(v)); x.stroke(); x.fillStyle = '#8b93a7'; x.fillText(String(v), W - padR + 6, yr(v)); });
    x.strokeStyle = '#262c3a'; x.strokeRect(padL, yR0, W - padL - padR, hR);
    function line(arr, color, width) { x.strokeStyle = color; x.lineWidth = width; x.beginPath(); var st = false; for (var j = i0; j < nb; j++) { if (arr[j] === null) continue; if (!st) { x.moveTo(xi(j), yr(arr[j])); st = true; } else x.lineTo(xi(j), yr(arr[j])); } x.stroke(); x.lineWidth = 1; }
    line(bb.up, 'rgba(230,180,80,.7)', 1); line(bb.lo, 'rgba(230,180,80,.7)', 1); line(bb.mid, 'rgba(200,170,230,.9)', 1.2); line(R, '#9fe3f0', 1.6);
    x.fillStyle = '#8b93a7'; x.fillText('RSI ' + (R[nb - 1] == null ? '' : R[nb - 1].toFixed(1)) + '   median ' + (bb.mid[nb - 1] == null ? '' : bb.mid[nb - 1].toFixed(1)), padL + 6, yR0 + 10);
    x.fillText(cur.ci + ' · ' + tf + ' min', padL + 6, top + 8);
    geo = { i0: i0, bw: bw, padL: padL, nb: nb };
    // crosshair
    if (hover != null && hover >= i0 && hover < nb) {
      var hx = xi(hover);
      x.strokeStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.moveTo(hx, top); x.lineTo(hx, yR0 + hR); x.stroke();
      var txt = fmtMD.format(new Date(B.t[hover] * 1000)) + ' ' + fmtET.format(new Date(B.t[hover] * 1000)) + '  O ' + B.o[hover].toFixed(2) + '  H ' + B.h[hover].toFixed(2) + '  L ' + B.l[hover].toFixed(2) + '  C ' + B.c[hover].toFixed(2) + (R[hover] == null ? '' : '  RSI ' + R[hover].toFixed(1) + (bb.mid[hover] == null ? '' : ' (med ' + bb.mid[hover].toFixed(1) + ')'));
      var tw = Math.min(W - padR - padL - 8, x.measureText(txt).width + 12);
      x.fillStyle = 'rgba(23,27,36,.95)'; x.fillRect(padL + 4, top + 18, tw, 20); x.fillStyle = '#e6e9ef'; x.fillText(txt, padL + 10, top + 28, tw - 12);
    }
  }
  function niceStep(v) { var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  function onPointer(e) {
    if (!geo) return; var r = $('chart').getBoundingClientRect();
    var i = geo.i0 + Math.floor((e.clientX - r.left - geo.padL) / geo.bw);
    var nh = i >= geo.i0 && i < geo.nb ? i : null; if (nh !== hover) { hover = nh; draw(); }
  }

  // ---------- flow ----------
  var FILTERS = ['fTod', 'fSetup', 'fTk', 'fYr', 'fSeen'];
  function pool() {
    var tod = $('fTod').value, su = $('fSetup').value, tk = $('fTk').value, yr = $('fYr').value, seen = $('fSeen').value;
    return T.filter(function (t) {
      var a = store.a[t.id];
      return (tod === 'all' || t.tod === tod) && (su === 'all' || t.setup === su) && (tk === 'all' || t.tk === tk) && (yr === 'all' || t.d.slice(0, 4) === yr) &&
        (seen === 'any' || (seen === 'unseen' && !a) || (seen === 'miss' && a && a.g && (!a.match || a.sizeOk === false)));
    });
  }
  function biasRow(name, b, note) {
    if (!b) return '<tr><td class="dim">' + name + '</td><td class="dim">' + (note || 'Not enough history') + '</td></tr>';
    var side = b[0] >= b[1] ? '<span class="good">Above median</span>' : '<span class="bad">Below median</span>';
    var band = b[0] > b[2] ? ' · <span class="warn">above upper band</span>' : b[0] < b[3] ? ' · <span class="warn">below lower band</span>' : ' · inside bands';
    return '<tr><td class="dim">' + name + ' RSI ' + b[0].toFixed(1) + '<br><span class="small">median ' + b[1].toFixed(1) + ', bands ' + b[3].toFixed(0) + '–' + b[2].toFixed(0) + '</span></td><td>' + side + '<span style="font-weight:400">' + band + '</span></td></tr>';
  }
  function renderBias() {
    if (!cur) return;
    var loadingNote = series ? null : 'Loading…';
    $('biasTable').innerHTML = biasRow('4-hour', cur.b4) + biasRow('Daily', cur.bd) + biasRow('15-min', rsiAtEntry(15), loadingNote) + biasRow('5-min', rsiAtEntry(5), loadingNote);
  }
  function optAt(m) { var p = cur.path, v = p[0][1]; for (var i = 0; i < p.length; i++) { if (p[i][0] <= m) v = p[i][1]; else break; } return v / 100; }
  function maxStep() { return cur.path[cur.path.length - 1][0]; }
  function show(ids, on) { ids.forEach(function (id) { $(id).classList.toggle('hidden', !on); }); }

  // Bear's messages are logged per day; hide the ones clearly about a different ticker.
  var FAM = { QQQ: ['QQQ', 'NQ', 'NDX', 'NAS', 'NASDAQ', 'TQQQ', 'SQQQ'], SPY: ['SPY', 'SPX', 'ES', 'SPX500'], SPX: ['SPX', 'SPY', 'ES', 'SPX500'], IWM: ['IWM', 'RTY', 'RUT'] };
  var TICK_RE = /\b(QQQ|TQQQ|SQQQ|SPY|SPX|IWM|NQ|ES|NDX|RTY|RUT|NVDA|TSLA|AAPL|AMD|META|MSFT|AMZN|GOOGL?|NFLX|COIN|DIA|UVXY|VIX|VXX|TLT|GLD|SLV|BTC|ETH|SMCI|AVGO|PLTR|MSTR|BA|DJT|ARM|MU)\b/g;
  function relevant(e) {
    if (!e.x) return true;
    var m = String(e.x).toUpperCase().match(TICK_RE); if (!m) return true;
    var fam = FAM[cur.tk] || [cur.tk];
    return m.some(function (k) { return fam.indexOf(k) >= 0; });
  }

  function loadTrade(t) {
    cur = t; userExit = null; guess = null; size = null; step = 0; stage = 'guess'; hover = null; series = null;
    show(['tradeBox', 'doneBox', 'emptyBox', 'aReplay', 'aDone'], false);
    show(['aGuess', 'biasBox', 'actions'], true);
    $('sizeRow').classList.toggle('hidden', !sizeable(t));
    ['bDay', 'bLotto'].forEach(function (id) { $(id).classList.remove('on'); });
    $('note').value = '';
    $('head').innerHTML = '<span class="big">' + esc(t.tk) + '</span><span>' + fmtDay.format(new Date(t.t * 1000)) + ' · ' + t.hm + ' ET</span>';
    renderBias(); draw();
    var want = t;
    buildSeries(t).then(function (S) { if (cur !== want) return; series = S; renderBias(); draw(); if (stage === 'done') renderLesson(); });
  }
  function next() {
    review = false;
    var P = pool();
    if (P.length > 1 && cur) P = P.filter(function (t) { return t !== cur; });
    if (!P.length) {
      cur = null; series = null; show(['actions', 'biasBox', 'tradeBox', 'doneBox'], false); show(['emptyBox'], true); $('head').innerHTML = ''; draw(); stats(); return;
    }
    loadTrade(P[Math.floor(Math.random() * P.length)]);
    $('head').insertAdjacentHTML('beforeend', '<span class="dim hidemob">' + P.length + ' trades in this set</span>');
    stats();
  }
  function pickSize(s) {
    if (stage !== 'guess' || !sizeable(cur)) return;
    size = s; $('bDay').classList.toggle('on', s === 'Daytrade'); $('bLotto').classList.toggle('on', s === 'Lotto');
  }
  function answer(g) {
    if (stage !== 'guess' || !cur) return;
    if (sizeable(cur) && !size) { flash($('sizeRow')); return; }
    guess = g; stage = 'replay';
    var match = g === cur.r, sizeOk = sizeable(cur) ? size === cur.setup : null;
    var prev = store.a[cur.id] || {};
    store.a[cur.id] = { g: g, match: match, size: size, sizeOk: sizeOk, ts: Date.now(), note: prev.note || '' }; save();
    show(['aGuess'], false); show(['aReplay', 'tradeBox'], true);
    revealHead();
    $('timeline').innerHTML = ''; $('sold').textContent = ''; $('bSell').disabled = false;
    shown = 0; render(); stats();
  }
  function revealHead() {
    var side = cur.r === 'C' ? 'calls' : 'puts';
    var v = (guess === cur.r ? '<b class="good">Same side as Bear.</b>' : '<b class="bad">Bear took ' + side + '.</b>');
    if (sizeable(cur) && size) v += size === cur.setup ? ' <span class="good">Size right: ' + cur.setup + '.</span>' : ' <span class="bad">He called it a ' + cur.setup + '.</span>';
    $('verdict').innerHTML = v; $('verdict2').innerHTML = v;
    $('bearTrade').innerHTML = 'Bear bought <b>' + esc(cur.tk) + ' ' + cur.k + cur.r + '</b> exp ' + cur.exp.slice(5) + ' at <b>$' + cur.e.toFixed(2) + '</b> <span class="pill">' + esc(cur.setup === 'From note' ? 'From a note' : cur.setup) + '</span> <span class="pill">' + side + '</span>' +
      (cur.note ? '<div class="small" style="margin-top:6px;white-space:pre-line">His note: “' + esc(cur.note) + '”</div>' : '');
  }
  function flash(el) { el.style.transition = 'background .2s'; el.style.background = 'rgba(230,180,80,.25)'; setTimeout(function () { el.style.background = ''; }, 500); }
  var shown = 0, hiddenMsgs = 0;
  function render() {
    var price = optAt(step), p = (price / cur.e - 1) * 100;
    $('pnl').innerHTML = '$' + price.toFixed(2) + ' <span class="' + cls(p) + '">' + pct(p) + '</span> <span class="small">' + step + ' min in</span>';
    var evs = cur.ev.filter(function (e) { return e.m <= step; });
    for (; shown < evs.length; shown++) {
      var e = evs[shown];
      if (!relevant(e)) { hiddenMsgs++; continue; }
      var d = document.createElement('div'), tm = fmtET.format(new Date((cur.t + e.m * 60) * 1000));
      var label = e.k === 'trim' ? '<b class="good">Bear trims' + (e.p != null ? ' at ' + pct(e.p) : '') + '</b>' : e.k === 'update' ? '<b>Bear update' + (e.p != null ? ': ' + pct(e.p) : '') + '</b>' : '<span class="dim">Bear:</span>';
      d.innerHTML = '<span class="tm">' + tm + '</span>' + label + (e.x ? ' ' + esc(e.x) : '');
      $('timeline').prepend(d);
    }
    var end = step >= maxStep();
    ['s1', 's5', 's15', 'sEnd'].forEach(function (id) { $(id).disabled = end; });
    draw();
    if (end) finish();
  }
  function advance(n) { if (stage !== 'replay') return; step = Math.min(maxStep(), step + n); render(); }
  function sell() {
    if (userExit || stage !== 'replay') return; var price = optAt(step); userExit = { m: step, p: (price / cur.e - 1) * 100 };
    store.a[cur.id].exit = userExit.p; store.a[cur.id].exitM = step; save();
    $('bSell').disabled = true; $('sold').innerHTML = 'You sold at <b class="' + cls(userExit.p) + '">' + pct(userExit.p) + '</b>. Keep stepping to see what happened next.'; draw(); stats();
  }
  // Bear's management, roughly: first trim around +23%, then stop to break-even on the rest.
  function bearStyle() {
    var trimmed = false, last = 0;
    for (var i = 0; i < cur.path.length; i++) {
      var r = (cur.path[i][1] / 100 / cur.e - 1) * 100; last = r;
      if (!trimmed) { if (r >= 23) trimmed = true; else if (r <= -30) return { r: -30, txt: 'never reached +23%; hit the assumed −30% stop' }; }
      else if (r <= 0) return { r: 11.5, txt: 'half off at +23%, rest stopped at break-even' };
    }
    return trimmed ? { r: (23 + last) / 2, txt: 'half off at +23%, rest held to the close' } : { r: last, txt: 'never reached +23%; held to the close' };
  }
  function finish() {
    if (stage === 'done') return; stage = 'done';
    var a = store.a[cur.id] || {};
    var trims = cur.ev.filter(function (e) { return e.k === 'trim' && e.p != null; }).map(function (e) { return e.p; });
    var closeP = (optAt(maxStep()) / cur.e - 1) * 100, bs = bearStyle();
    var mine = userExit ? userExit : (typeof a.exit === 'number' && review ? { p: a.exit, m: a.exitM } : null);
    var rows = [
      ['Your call', guess ? (guess === 'C' ? 'Calls' : 'Puts') + (guess === cur.r ? ' <span class="good">✓</span>' : ' <span class="bad">✗</span>') : '<span class="dim">Not answered</span>'],
    ];
    if (sizeable(cur)) rows.push(['Your size', size ? size + (size === cur.setup ? ' <span class="good">✓</span>' : ' <span class="bad">✗ (' + cur.setup + ')</span>') : '<span class="dim">–</span>']);
    rows.push(
      ['Bear\'s posted trims', trims.length ? trims.map(pct).join(', ') : 'None posted'],
      ['Best the option reached (model)', '<span class="' + cls(cur.mx) + '">' + pct(cur.mx) + '</span> after ' + cur.mxm + ' min'],
      ['Option at the close (model)', '<span class="' + cls(closeP) + '">' + pct(closeP) + '</span>'],
      ['Bear-style exit', '<span class="' + cls(bs.r) + '">' + pct(bs.r) + '</span><div class="small" style="font-weight:400">' + bs.txt + '</div>'],
      ['Your exit', mine ? '<span class="' + cls(mine.p) + '">' + pct(mine.p) + '</span>' + (mine.m != null ? ' after ' + mine.m + ' min' : '') : 'Held to the close <span class="' + cls(closeP) + '">' + pct(closeP) + '</span>']
    );
    if (trims.length && Math.max.apply(null, trims) > cur.mx + 10) rows.push(['<span class="warn">Note</span>', '<span class="warn" style="font-weight:400">The price model never reached his posted trim. Trust his post over the model here.</span>']);
    $('sumTable').innerHTML = rows.map(function (r) { return '<tr><td class="dim">' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('');
    if (!review && store.a[cur.id] && !userExit) { store.a[cur.id].exit = closeP; save(); }
    var finalExit = mine ? mine.p : closeP;
    if (!review && guess && finalExit < 0) sessionLosses++;
    $('tilt').classList.toggle('hidden', review || sessionLosses < 2);
    $('tilt').textContent = 'That\'s ' + sessionLosses + ' losing trades this session. Bear\'s "2 lives" rule: after two losers, he stops for the day. Take a break before the next one?';
    $('note').value = a.note || '';
    renderLesson(); showImg();
    show(['aReplay'], false); show(['aDone', 'doneBox'], true);
    if (hiddenMsgs) $('timeline').insertAdjacentHTML('beforeend', '<div class="small">' + hiddenMsgs + ' of Bear\'s messages about other tickers that day are hidden.</div>');
    hiddenMsgs = 0; stats();
  }
  function renderLesson() {
    var L = [], r15 = rsiAtEntry(15), withBias = cur.b4 ? ((cur.b4[0] >= cur.b4[1]) === (cur.r === 'C')) : null;
    if (cur.b4 && (cur.b4[0] > cur.b4[2] || cur.b4[0] < cur.b4[3])) {
      var trendUp = cur.b4[0] > cur.b4[2];
      L.push('The 4h RSI was <b>' + (trendUp ? 'above its upper band' : 'below its lower band') + '</b>. His rule: don\'t fight that trend until it closes back inside. ' + ((trendUp === (cur.r === 'C')) ? 'He traded with it.' : 'He traded against it, so treat this as a scalp.'));
    } else if (withBias !== null) {
      L.push(withBias ? 'Bear traded <b>with</b> the 4h bias (RSI ' + (cur.r === 'C' ? 'above' : 'below') + ' its median).' : 'Bear traded <b>against</b> the 4h bias. By his checklist that makes it a scalp, so expect quick trims, not a runner.');
    }
    if (r15) {
      if (r15[0] < r15[3]) L.push('The 15m RSI was <b>below its lower band</b>, which he reads as a temporary bottom. ' + (cur.r === 'C' ? 'He bought calls into it, a band fade.' : 'He still took puts, so he saw continuation.'));
      else if (r15[0] > r15[2]) L.push('The 15m RSI was <b>above its upper band</b>, which he reads as a temporary top. ' + (cur.r === 'P' ? 'He bought puts into it, a band fade.' : 'He still took calls, so he saw continuation.'));
      else {
        var below = r15[0] < r15[1], fade = below === (cur.r === 'C');
        L.push('The 15m RSI was ' + (below ? 'below' : 'above') + ' its median and inside the bands. ' + (fade ? (cur.r === 'C' ? 'He bought the dip, expecting RSI to reclaim the median.' : 'He shorted the pop, expecting RSI to lose the median.') : 'He traded in the direction of the 15m.'));
      }
    }
    if (sizeable(cur)) L.push(cur.setup === 'Daytrade' ? 'He labelled this a <b>Daytrade</b>: all confluences present, full size.' : 'He labelled this a <b>Lotto</b>: only one or two confluences, small size.');
    L.push('<span class="small">Look for the pattern (wedge, channel, flag, double top/bottom, trendline) and the key level in his chart below. That\'s what the RSI alone can\'t show.</span>');
    $('lesson').innerHTML = L.map(function (s) { return '<p>' + s + '</p>'; }).join('');
  }
  function stats() {
    var ids = Object.keys(store.a), n = 0, m = 0, sz = 0, szOk = 0, ex = [];
    ids.forEach(function (id) { var a = store.a[id]; if (!a.g) return; n++; if (a.match) m++; if (a.sizeOk != null) { sz++; if (a.sizeOk) szOk++; } if (typeof a.exit === 'number') ex.push(a.exit); });
    var avg = ex.length ? ex.reduce(function (s, v) { return s + v; }, 0) / ex.length : null;
    $('stats').innerHTML = '<div><b>' + n + '</b>done</div><div><b>' + (n ? Math.round(m / n * 100) + '%' : '–') + '</b>same side</div><div><b>' + (sz ? Math.round(szOk / sz * 100) + '%' : '–') + '</b>size right</div><div><b class="' + (avg === null ? '' : cls(avg)) + '">' + (avg === null ? '–' : pct(avg)) + '</b>avg exit</div>';
  }

  // ---------- review a past trade ----------
  function reopen(id) {
    var t = BY_ID[id], a = store.a[id]; if (!t || !a) return;
    closeHistory(); review = true; loadTrade(t);
    guess = a.g; size = a.size || null; stage = 'replay';
    if (typeof a.exitM === 'number') userExit = { m: a.exitM, p: a.exit };
    show(['aGuess'], false); show(['tradeBox'], true); revealHead();
    $('timeline').innerHTML = ''; shown = 0; hiddenMsgs = 0; step = maxStep(); render();
    window.scrollTo(0, 0);
  }

  // ---------- history ----------
  function openHistory() {
    var rows = Object.keys(store.a).map(function (id) { return { id: +id, a: store.a[id], t: BY_ID[id] }; }).filter(function (r) { return r.t && r.a.g; });
    rows.sort(function (x, y) { return (y.a.ts || 0) - (x.a.ts || 0) || y.id - x.id; });
    $('histSummary').innerHTML = rows.length ? '<div class="small">' + rows.length + ' trades played. Your progress is saved in this browser only, so use Export to back it up or move it to another device.</div>' : '<div class="small">No trades yet.</div>';
    function group(key, label, fmt) {
      var g = {};
      rows.forEach(function (r) { var k = key(r); if (!g[k]) g[k] = { n: 0, m: 0, ex: 0, ne: 0 }; g[k].n++; if (r.a.match) g[k].m++; if (typeof r.a.exit === 'number') { g[k].ex += r.a.exit; g[k].ne++; } });
      var ks = Object.keys(g).sort();
      return '<div><table><tr><th>' + label + '</th><th style="text-align:right">n</th><th style="text-align:right">Side</th><th style="text-align:right">Avg exit</th></tr>' + ks.map(function (k) { var v = g[k], av = v.ne ? v.ex / v.ne : null; return '<tr><td>' + esc(fmt ? fmt(k) : k) + '</td><td style="text-align:right;font-weight:400">' + v.n + '</td><td style="text-align:right">' + Math.round(v.m / v.n * 100) + '%</td><td style="text-align:right" class="' + (av == null ? '' : cls(av)) + '">' + (av == null ? '–' : pct(av)) + '</td></tr>'; }).join('') + '</table></div>';
    }
    var TOD = { open: 'Opening bell', morning: 'Morning', midday: 'Midday', late: 'Late' };
    $('histBreak').innerHTML = rows.length ? group(function (r) { return r.t.setup; }, 'Setup') + group(function (r) { return r.t.tk + ' ' + (r.t.r === 'C' ? 'calls' : 'puts'); }, 'Bear\'s trade') + group(function (r) { return r.t.tod; }, 'Entry time', function (k) { return TOD[k] || k; }) +
      group(function (r) { if (!r.t.b4) return 'Unknown'; var w = (r.t.b4[0] >= r.t.b4[1]) === (r.t.r === 'C'); return w ? 'With 4h bias' : 'Against 4h bias'; }, 'Bear vs 4h bias') : '';
    $('histList').innerHTML = rows.map(function (r) {
      var t = r.t, a = r.a, trims = t.ev.filter(function (e) { return e.k === 'trim' && e.p != null; });
      return '<tr data-id="' + t.id + '"><td>' + t.d.slice(2) + ' ' + t.hm + '</td><td>' + esc(t.tk) + ' ' + t.r + ' <span class="small">' + esc(t.setup) + '</span></td><td>' + (a.g === 'C' ? 'Calls' : 'Puts') + ' ' + (a.match ? '<span class="good">✓</span>' : '<span class="bad">✗</span>') + '</td><td class="hidemob">' + (a.size ? esc(a.size) + ' ' + (a.sizeOk ? '<span class="good">✓</span>' : '<span class="bad">✗</span>') : '–') + '</td><td class="' + (typeof a.exit === 'number' ? cls(a.exit) : '') + '">' + (typeof a.exit === 'number' ? pct(a.exit) : '–') + '</td><td class="hidemob">' + (trims.length ? pct(trims[0].p) : '–') + '</td><td class="hidemob small">' + esc((a.note || '').slice(0, 60)) + '</td></tr>';
    }).join('');
    $('history').classList.remove('hidden');
  }
  function closeHistory() { $('history').classList.add('hidden'); }
  function exportProgress() {
    var blob = new Blob([JSON.stringify({ v: 1, a: store.a }, null, 1)], { type: 'application/json' });
    var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = 'bear-trainer-progress.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  }
  function importProgress(file) {
    file.text().then(function (txt) {
      var d = JSON.parse(txt), n = 0; if (!d || !d.a) throw new Error('bad file');
      Object.keys(d.a).forEach(function (id) { var mine = store.a[id], theirs = d.a[id]; if (!mine || (theirs.ts || 0) > (mine.ts || 0)) { store.a[id] = theirs; n++; } });
      save(); stats(); openHistory(); alert('Imported ' + n + ' trades.');
    }).catch(function () { alert('That file doesn\'t look like a Bear Trainer export.'); });
  }

  // ---------- Bear's chart screenshots (kept on this device in IndexedDB) ----------
  var dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) { var r = indexedDB.open('bearCharts', 1); r.onupgradeneeded = function () { r.result.createObjectStore('img'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; });
    return dbP;
  }
  function idb(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction('img', mode), st = tx.objectStore('img'), out = fn(st); tx.oncomplete = function () { res(out instanceof IDBRequest ? out.result : out); }; tx.onerror = function () { rej(tx.error); }; }); }); }
  function imgCount() { return idb('readonly', function (st) { return st.count(); }).catch(function () { return 0; }); }
  function idFromName(name) { var m = /(?:^|\/)0*(\d+)_\d{4}-\d\d-\d\d_[^\/]*\.(png|jpe?g|webp)$/i.exec(name); return m ? +m[1] : null; }
  function shrink(blob) { // downscale so ~2,000 charts fit comfortably in browser storage
    if (!window.createImageBitmap) return Promise.resolve(blob);
    return createImageBitmap(blob).then(function (bm) {
      var sc = Math.min(1, 1600 / bm.width), c = document.createElement('canvas'); c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc);
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); bm.close && bm.close();
      return new Promise(function (res) { c.toBlob(function (b) { res(b && b.size < blob.size ? b : blob); }, 'image/webp', 0.82); });
    }).catch(function () { return blob; });
  }
  function loadFflate() {
    if (window.fflate) return Promise.resolve(window.fflate);
    return new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = 'vendor/fflate.min.js'; sc.onload = function () { res(window.fflate); }; sc.onerror = function () { rej(new Error('could not load the unzip library')); }; document.head.appendChild(sc); });
  }
  function importCharts(files) {
    var list = Array.prototype.slice.call(files), entries = [], zips = [];
    list.forEach(function (f) { if (/\.zip$/i.test(f.name)) zips.push(f); else { var id = idFromName(f.webkitRelativePath || f.name); if (id != null) entries.push({ id: id, get: function () { return Promise.resolve(f); } }); } });
    var status = $('chartsStatus');
    var unzip = zips.length ? loadFflate().then(function (ff) {
      return Promise.all(zips.map(function (z) { return z.arrayBuffer().then(function (buf) {
        status.textContent = 'Unzipping ' + z.name + '…';
        var files = ff.unzipSync(new Uint8Array(buf), { filter: function (f) { return idFromName(f.name) != null; } });
        Object.keys(files).forEach(function (name) { var id = idFromName(name), ext = name.split('.').pop().toLowerCase(); entries.push({ id: id, get: function () { return Promise.resolve(new Blob([files[name]], { type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' })); } }); });
      }); }));
    }) : Promise.resolve();
    return unzip.then(function () {
      if (!entries.length) { status.textContent = 'No chart images found. Files should be named like 3174_2026-08-11_….png.'; return; }
      var done = 0, i = 0;
      function nextOne() {
        if (i >= entries.length) return Promise.resolve();
        var e = entries[i++];
        return e.get().then(shrink).then(function (b) { return idb('readwrite', function (st) { st.put(b, e.id); }); }).then(function () { done++; if (done % 20 === 0 || done === entries.length) status.textContent = 'Saved ' + done + ' of ' + entries.length + ' charts…'; return nextOne(); });
      }
      return nextOne().then(function () { status.textContent = 'Done. ' + done + ' charts saved in this browser.'; chartsLabel(); if (stage === 'done') showImg(); });
    }).catch(function (err) { status.textContent = 'Import failed: ' + (err && err.message || err); });
  }
  function chartsLabel() { imgCount().then(function (n) { $('bCharts').textContent = n ? 'Bear\'s charts (' + n + ')' : 'Load Bear\'s charts'; }); }
  var imgUrl = null;
  function showImg() {
    var wrap = $('imgWrap'), want = cur; wrap.innerHTML = '';
    if (imgUrl) { URL.revokeObjectURL(imgUrl); imgUrl = null; }
    if (!cur.img) { wrap.innerHTML = '<div class="small" style="margin-top:8px">No chart screenshot for this trade.</div>'; return; }
    idb('readonly', function (st) { return st.get(cur.id); }).catch(function () { return null; }).then(function (b) {
      if (cur !== want) return;
      if (b) { imgUrl = URL.createObjectURL(b); wrap.innerHTML = '<img id="bearimg" alt="Bear\'s chart for this trade">'; $('bearimg').src = imgUrl; return; }
      var gh = ghConf();
      if (gh) {
        wrap.innerHTML = '<div class="small" style="margin-top:8px">Loading Bear\'s chart…</div>';
        fetchGh(gh, want).then(function (blob) { return shrink(blob).then(function (sb) { return idb('readwrite', function (st) { st.put(sb, want.id); }).then(function () { return sb; }); }); }).then(function (sb) {
          if (cur !== want) return; imgUrl = URL.createObjectURL(sb); wrap.innerHTML = '<img id="bearimg" alt="Bear\'s chart for this trade">'; $('bearimg').src = imgUrl; chartsLabel();
        }).catch(function (err) { if (cur === want) wrap.innerHTML = '<div class="small warn" style="margin-top:8px">Couldn\'t load the chart from GitHub (' + esc(err.message) + ').</div>'; });
        return;
      }
      wrap.innerHTML = '<div class="small" style="margin-top:8px">Bear posted a chart for this trade. <a href="#" id="loadLink" style="color:var(--accent)">Load Bear\'s charts</a> to see his pattern and levels here.</div>';
      $('loadLink').onclick = function (e) { e.preventDefault(); openCharts(); };
    });
  }
  // ---------- private GitHub repo as a chart source ----------
  var GHKEY = 'bearTrainerGh';
  function ghConf() { try { var c = JSON.parse(localStorage.getItem(GHKEY) || 'null'); return c && c.repo && c.token ? c : null; } catch (e) { return null; } }
  function fetchGh(gh, t) {
    var path = t.img.replace(/^(\.\.\/)+/, '').split('/').map(encodeURIComponent).join('/');
    return fetch('https://api.github.com/repos/' + gh.repo + '/contents/' + path, { headers: { Authorization: 'Bearer ' + gh.token, Accept: 'application/vnd.github.raw' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? 'not found in ' + gh.repo : r.status === 401 ? 'token rejected' : 'HTTP ' + r.status); return r.blob(); });
  }
  function saveGh() {
    var repo = $('ghRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''), token = $('ghToken').value.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) { $('ghStatus').textContent = 'Enter owner/repo and a token.'; return; }
    $('ghStatus').textContent = 'Checking…';
    fetch('https://api.github.com/repos/' + repo, { headers: { Authorization: 'Bearer ' + token } }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 404 ? 'repo not found, or the token can\'t see it' : 'HTTP ' + r.status);
      try { localStorage.setItem(GHKEY, JSON.stringify({ repo: repo, token: token })); } catch (e) {}
      $('ghToken').value = ''; $('ghStatus').textContent = 'Connected to ' + repo + '.'; if (stage === 'done') showImg();
    }).catch(function (e) { $('ghStatus').textContent = 'Failed: ' + e.message; });
  }
  function openCharts() {
    var gh = ghConf(); $('ghRepo').value = gh ? gh.repo : ''; $('ghStatus').textContent = gh ? 'Connected to ' + gh.repo + '.' : ''; $('chartsDlg').classList.remove('hidden'); imgCount().then(function (n) { $('chartsStatus').textContent = n ? n + ' charts are saved in this browser.' : 'No charts loaded yet.'; }); }

  // ---------- wiring ----------
  $('bCalls').onclick = function () { answer('C'); };
  $('bPuts').onclick = function () { answer('P'); };
  $('bDay').onclick = function () { pickSize('Daytrade'); };
  $('bLotto').onclick = function () { pickSize('Lotto'); };
  $('bSkip').onclick = next; $('bNext').onclick = next;
  $('s1').onclick = function () { advance(1); }; $('s5').onclick = function () { advance(5); }; $('s15').onclick = function () { advance(15); }; $('sEnd').onclick = function () { advance(99999); };
  $('bSell').onclick = sell;
  $('tf5').onclick = function () { tf = 5; hover = null; $('tf5').classList.add('on'); $('tf15').classList.remove('on'); draw(); };
  $('tf15').onclick = function () { tf = 15; hover = null; $('tf15').classList.add('on'); $('tf5').classList.remove('on'); draw(); };
  $('filterToggle').onclick = function () { $('filters').classList.toggle('open'); };
  $('bHistory').onclick = openHistory; $('bHistClose').onclick = closeHistory;
  $('histList').onclick = function (e) { var tr = e.target.closest('tr'); if (tr) reopen(+tr.dataset.id); };
  $('bExport').onclick = exportProgress; $('bImport').onclick = function () { $('importFile').click(); };
  $('importFile').onchange = function () { if (this.files[0]) importProgress(this.files[0]); this.value = ''; };
  $('note').oninput = function () { if (cur && store.a[cur.id]) { store.a[cur.id].note = this.value; save(); } };
  $('bCharts').onclick = openCharts; $('bChartsClose').onclick = function () { $('chartsDlg').classList.add('hidden'); };
  $('bPickFolder').onclick = function () { $('folderIn').click(); }; $('bPickFiles').onclick = function () { $('filesIn').click(); };
  $('folderIn').onchange = $('filesIn').onchange = function () { if (this.files.length) importCharts(this.files); this.value = ''; };
  $('bGhSave').onclick = saveGh;
  $('bGhClear').onclick = function () { try { localStorage.removeItem(GHKEY); } catch (e) {} $('ghStatus').textContent = 'Token removed from this browser.'; };
  $('bChartsClear').onclick = function () { if (!confirm('Remove all saved charts from this browser?')) return; idb('readwrite', function (st) { st.clear(); }).then(function () { $('chartsStatus').textContent = 'Removed.'; chartsLabel(); }); };
  document.addEventListener('click', function (e) { if (e.target.id === 'bearimg') { var m = $('imgModal'); m.querySelector('img').src = e.target.src; m.classList.remove('hidden'); } });
  $('imgModal').onclick = function () { this.classList.add('hidden'); };
  var cv = $('chart');
  cv.addEventListener('pointermove', onPointer); cv.addEventListener('pointerdown', onPointer);
  cv.addEventListener('pointerleave', function () { if (hover != null) { hover = null; draw(); } });
  FILTERS.forEach(function (id) { $(id).onchange = function () { store.f = {}; FILTERS.forEach(function (k) { store.f[k] = $(k).value; }); save(); next(); }; });
  if (store.f) FILTERS.forEach(function (k) { if (store.f[k] != null) $(k).value = store.f[k]; });
  var rT; window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(draw, 60); });
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === 'escape') { closeHistory(); $('chartsDlg').classList.add('hidden'); $('imgModal').classList.add('hidden'); return; }
    if (k === 'h') { $('history').classList.contains('hidden') ? openHistory() : closeHistory(); return; }
    if (!$('history').classList.contains('hidden')) return;
    if (stage === 'guess') { if (k === 'c') answer('C'); else if (k === 'p') answer('P'); else if (k === 'd') pickSize('Daytrade'); else if (k === 'l') pickSize('Lotto'); else if (k === 'k') next(); else return; }
    else if (stage === 'replay') { if (e.key === 'ArrowRight') advance(e.shiftKey ? 15 : 5); else if (k === 's') sell(); else if (k === 'e') advance(99999); else return; }
    else if (stage === 'done') { if (k === 'enter' || k === 'n' || k === ' ') next(); else return; }
    e.preventDefault();
  });
  chartsLabel();
  if (!T.length) { $('head').innerHTML = '<span class="bad">Could not load data/trades.js. Keep index.html next to its data folder.</span>'; }
  else next();
  window.__trainer = { get cur() { return cur; }, get series() { return series; }, get stage() { return stage; }, answer: answer, pickSize: pickSize, advance: advance, next: next, sell: sell, reopen: reopen, importCharts: importCharts };
})();
