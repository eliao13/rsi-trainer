import { useRef } from 'react';
import type { Answer, TradeIndex } from '../types';
import { pct, tone } from '../lib/format';
import { sizeable } from '../lib/trade';
import { APP_BUILT, APP_COMMIT, APP_VERSION, COMMIT_URL } from '../version';

interface Row { t: TradeIndex; a: Answer }
const TOD: Record<string, string> = { open: 'Opening bell', morning: 'Morning', midday: 'Midday', late: 'Late' };

function Breakdown({ rows, label, keyOf, fmt }: { rows: Row[]; label: string; keyOf: (r: Row) => string; fmt?: (k: string) => string }) {
  const g: Record<string, { n: number; m: number; ex: number; ne: number }> = {};
  for (const r of rows) {
    const k = keyOf(r), v = (g[k] ||= { n: 0, m: 0, ex: 0, ne: 0 });
    v.n++; if (r.a.match) v.m++;
    if (r.a.match && typeof r.a.exit === 'number') { v.ex += r.a.exit; v.ne++; }
  }
  return (
    <div><table><tbody>
      <tr><th>{label}</th><th style={{ textAlign: 'right' }}>n</th><th style={{ textAlign: 'right' }}>Side</th><th style={{ textAlign: 'right' }}>Avg exit</th></tr>
      {Object.keys(g).sort().map((k) => { const v = g[k], av = v.ne ? v.ex / v.ne : null; return (
        <tr key={k}><td>{fmt ? fmt(k) : k}</td><td style={{ textAlign: 'right', fontWeight: 400 }}>{v.n}</td><td style={{ textAlign: 'right' }}>{Math.round((v.m / v.n) * 100)}%</td><td style={{ textAlign: 'right' }} className={av == null ? '' : tone(av)}>{av == null ? '–' : pct(av)}</td></tr>
      ); })}
    </tbody></table></div>
  );
}

interface Props { trades: Map<number, TradeIndex>; answers: Record<string, Answer>; skips: Record<string, number>; onClose: () => void; onOpen: (id: number) => void; onImport: (a: Record<string, Answer>, skips?: Record<string, number>) => number }

export function History({ trades, answers, skips, onClose, onOpen, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rows: Row[] = Object.keys(answers).map((id) => ({ t: trades.get(+id)!, a: answers[id] })).filter((r) => r.t && r.a.g);
  rows.sort((x, y) => (y.a.ts || 0) - (x.a.ts || 0) || y.t.id - x.t.id);
  const graded = rows.filter((r) => r.a.sizeOk != null), sizeRight = graded.filter((r) => r.a.sizeOk).length;
  const same = rows.filter((r) => r.a.match).length;
  const skipped = Object.keys(skips).map((id) => trades.get(+id)).filter((t): t is TradeIndex => !!t && !answers[t.id]);

  const exportProgress = () => {
    const u = URL.createObjectURL(new Blob([JSON.stringify({ v: 2, app: APP_VERSION + '+' + APP_COMMIT, a: answers, skips }, null, 1)], { type: 'application/json' }));
    const el = document.createElement('a'); el.href = u; el.download = 'bear-trainer-progress.json'; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
  const importProgress = async (f: File) => {
    try { const d = JSON.parse(await f.text()); if (!d || !d.a) throw new Error(); alert('Imported ' + onImport(d.a, d.skips || {}) + ' trades.'); }
    catch { alert("That file doesn't look like a RSI Trainer export."); }
  };

  return (
    <div id="history">
      <div className="box">
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}><h3 style={{ margin: 0 }}>Your history</h3><button id="bHistClose" onClick={onClose}>Close<kbd>Esc</kbd></button></div>
        <div id="histSummary">
          {rows.length ? (
            <div className="stats-line">
              <span><b>{rows.length}</b> played</span>
              <span><b>{same}/{rows.length}</b> same side as RSI Trader</span>
              <span><b>{sizeRight}/{graded.length}</b> size right{rows.length > graded.length ? <span className="small"> ({rows.length - graded.length} not graded: Swing or note trades have no Daytrade/Lotto label)</span> : null}</span>
              <span><b>{skipped.length}</b> skipped</span>
            </div>
          ) : <div className="small">No trades yet.</div>}
          <div className="small">Average exits count only trades where you picked RSI Trader's side (* = not counted). Your progress is saved in this browser only, so use Export to back it up or move it to another device.</div>
        </div>
        {rows.length > 0 && (
          <div className="bd" id="histBreak">
            <Breakdown rows={rows} label="Setup" keyOf={(r) => r.t.setup} />
            <Breakdown rows={rows} label="RSI Trader's trade" keyOf={(r) => r.t.tk + ' ' + (r.t.r === 'C' ? 'calls' : 'puts')} />
            <Breakdown rows={rows} label="Entry time" keyOf={(r) => r.t.tod} fmt={(k) => TOD[k] || k} />
            <Breakdown rows={rows} label="RSI Trader vs 4h bias" keyOf={(r) => (!r.t.b4 ? 'Unknown' : (r.t.b4[0] >= r.t.b4[1]) === (r.t.r === 'C') ? 'With 4h bias' : 'Against 4h bias')} />
          </div>
        )}
        <div className="small">Tap a trade to replay how it played out.</div>
        <table>
          <thead><tr><th>Date</th><th>Trade</th><th>Your call</th><th className="hidemob">Size</th><th>Your exit</th><th className="hidemob">RSI Trader's 1st trim</th><th className="hidemob">Note</th></tr></thead>
          <tbody id="histList">
            {rows.map(({ t, a }) => { const hasExit = typeof a.exit === 'number'; return (
              <tr key={t.id} data-id={t.id} onClick={() => onOpen(t.id)}>
                <td>{t.d.slice(2)} {t.hm}</td>
                <td>{t.tk} {t.r} <span className="small">{t.setup}</span></td>
                <td>{a.g === 'C' ? 'Calls' : 'Puts'} {a.match ? <span className="good">✓</span> : <span className="bad">✗</span>}</td>
                <td className="hidemob">{!sizeable(t) ? <span className="dim" title="RSI Trader didn't label this Daytrade or Lotto, so size isn't graded">n/a</span> : a.size ? <>{a.size} {a.sizeOk ? <span className="good">✓</span> : <span className="bad">✗</span>}</> : '–'}</td>
                <td className={hasExit ? (a.match ? tone(a.exit!) : 'dim') : ''} title={a.match ? undefined : "On RSI Trader's side; not counted in your average"}>{hasExit ? pct(a.exit!) + (a.match ? '' : '*') : '–'}</td>
                <td className="hidemob">{t.t1 != null ? pct(t.t1) : '–'}</td>
                <td className="hidemob small">{(a.note || '').slice(0, 60)}</td>
              </tr>
            ); })}
          </tbody>
        </table>
        {skipped.length > 0 && (
          <div id="skipList" style={{ marginTop: 14 }}>
            <h3 style={{ marginBottom: 4 }}>Skipped ({skipped.length})</h3>
            <div className="small">RSI Trader took these; you passed. Set Show to "Ones I skipped" to try them again.
              {' '}{(() => { const c: Record<string, number> = {}; skipped.forEach((t) => { c[t.setup] = (c[t.setup] || 0) + 1; }); return 'By setup: ' + Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ') + '.'; })()}</div>
          </div>
        )}
        <div id="versionInfo" className="small" style={{ marginTop: 14 }}>
          You're using version <b>{APP_VERSION}</b>, build {COMMIT_URL ? <a href={COMMIT_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{APP_COMMIT}</a> : APP_COMMIT}
          {APP_BUILT ? ', built ' + new Date(APP_BUILT).toLocaleString() : ''}. Quote it when reporting a bug.
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button id="bExport" onClick={exportProgress}>Export progress</button>
          <button id="bImport" onClick={() => fileRef.current?.click()}>Import progress</button>
          <input type="file" ref={fileRef} id="importFile" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importProgress(f); e.target.value = ''; }} />
        </div>
      </div>
    </div>
  );
}
