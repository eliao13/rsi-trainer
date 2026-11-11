import { useRef } from 'react';
import type { Answer, Trade } from '../types';
import { pct, tone } from '../lib/format';
import { postedTrims } from '../lib/trade';

interface Row { t: Trade; a: Answer }
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

interface Props { trades: Map<number, Trade>; answers: Record<string, Answer>; onClose: () => void; onOpen: (id: number) => void; onImport: (a: Record<string, Answer>) => number }

export function History({ trades, answers, onClose, onOpen, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rows: Row[] = Object.keys(answers).map((id) => ({ t: trades.get(+id)!, a: answers[id] })).filter((r) => r.t && r.a.g);
  rows.sort((x, y) => (y.a.ts || 0) - (x.a.ts || 0) || y.t.id - x.t.id);

  const exportProgress = () => {
    const u = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, a: answers }, null, 1)], { type: 'application/json' }));
    const el = document.createElement('a'); el.href = u; el.download = 'bear-trainer-progress.json'; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
  const importProgress = async (f: File) => {
    try { const d = JSON.parse(await f.text()); if (!d || !d.a) throw new Error(); alert('Imported ' + onImport(d.a) + ' trades.'); }
    catch { alert("That file doesn't look like a Bear Trainer export."); }
  };

  return (
    <div id="history">
      <div className="box">
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}><h3 style={{ margin: 0 }}>Your history</h3><button id="bHistClose" onClick={onClose}>Close<kbd>Esc</kbd></button></div>
        <div id="histSummary"><div className="small">{rows.length ? `${rows.length} trades played. Average exits count only trades where you picked Bear's side (* = not counted). Your progress is saved in this browser only, so use Export to back it up or move it to another device.` : 'No trades yet.'}</div></div>
        {rows.length > 0 && (
          <div className="bd" id="histBreak">
            <Breakdown rows={rows} label="Setup" keyOf={(r) => r.t.setup} />
            <Breakdown rows={rows} label="Bear's trade" keyOf={(r) => r.t.tk + ' ' + (r.t.r === 'C' ? 'calls' : 'puts')} />
            <Breakdown rows={rows} label="Entry time" keyOf={(r) => r.t.tod} fmt={(k) => TOD[k] || k} />
            <Breakdown rows={rows} label="Bear vs 4h bias" keyOf={(r) => (!r.t.b4 ? 'Unknown' : (r.t.b4[0] >= r.t.b4[1]) === (r.t.r === 'C') ? 'With 4h bias' : 'Against 4h bias')} />
          </div>
        )}
        <div className="small">Tap a trade to replay how it played out.</div>
        <table>
          <thead><tr><th>Date</th><th>Trade</th><th>Your call</th><th className="hidemob">Size</th><th>Your exit</th><th className="hidemob">Bear's 1st trim</th><th className="hidemob">Note</th></tr></thead>
          <tbody id="histList">
            {rows.map(({ t, a }) => { const tr = postedTrims(t), hasExit = typeof a.exit === 'number'; return (
              <tr key={t.id} data-id={t.id} onClick={() => onOpen(t.id)}>
                <td>{t.d.slice(2)} {t.hm}</td>
                <td>{t.tk} {t.r} <span className="small">{t.setup}</span></td>
                <td>{a.g === 'C' ? 'Calls' : 'Puts'} {a.match ? <span className="good">✓</span> : <span className="bad">✗</span>}</td>
                <td className="hidemob">{a.size ? <>{a.size} {a.sizeOk ? <span className="good">✓</span> : <span className="bad">✗</span>}</> : '–'}</td>
                <td className={hasExit ? (a.match ? tone(a.exit!) : 'dim') : ''} title={a.match ? undefined : "On Bear's side; not counted in your average"}>{hasExit ? pct(a.exit!) + (a.match ? '' : '*') : '–'}</td>
                <td className="hidemob">{tr.length ? pct(tr[0]) : '–'}</td>
                <td className="hidemob small">{(a.note || '').slice(0, 60)}</td>
              </tr>
            ); })}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 14 }}>
          <button id="bExport" onClick={exportProgress}>Export progress</button>
          <button id="bImport" onClick={() => fileRef.current?.click()}>Import progress</button>
          <input type="file" ref={fileRef} id="importFile" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importProgress(f); e.target.value = ''; }} />
        </div>
      </div>
    </div>
  );
}
