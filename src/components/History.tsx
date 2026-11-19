import { useEffect, useRef, useState } from 'react';
import type { Answer, TradeIndex } from '../types';
import { pct, tone } from '../lib/format';
import { sizeable } from '../lib/trade';
import { APP_BUILT, APP_COMMIT, APP_VERSION, COMMIT_URL } from '../version';

interface Row { t: TradeIndex; a: Answer }
const TOD: Record<string, string> = { open: 'Opening bell', morning: 'Morning', midday: 'Midday', late: 'Late' };
type Bias = 'with' | 'against' | null;
/** Did RSI Trader trade with the 4h RSI (above its median for calls, below for puts)? */
const bias4h = (t: TradeIndex): Bias => (!t.b4 ? null : (t.b4[0] >= t.b4[1]) === (t.r === 'C') ? 'with' : 'against');
const sideWord = (s: string) => (s === 'C' ? 'CALLS' : 'PUTS');
const missed = (a: Answer) => !a.match || a.sizeOk === false;

type Filter = 'all' | 'missed' | 'against' | 'lotto';
const FILTERS: [Filter, string][] = [['all', 'All'], ['missed', 'Missed'], ['against', 'Against 4h'], ['lotto', 'Lotto']];

/** A hit-rate line: right / total, as a bar with a tick at 50% (a coin flip). */
function Rate({ name, right, total }: { name: string; right: number; total: number }) {
  const p = total ? right / total : 0;
  return (
    <div className="rate">
      <div className="rate-top"><span>{name}</span><span className={p < 0.5 ? 'bad' : 'good'}>{right}/{total}</span></div>
      <div className="rate-bar" aria-hidden="true"><div className={'rate-fill ' + (p < 0.5 ? 'down' : 'up')} style={{ width: p * 100 + '%' }} /><div className="rate-mid" /></div>
    </div>
  );
}

interface Props { trades: Map<number, TradeIndex>; answers: Record<string, Answer>; skips: Record<string, number>; onClose: () => void; onOpen: (id: number) => void; onImport: (a: Record<string, Answer>, skips?: Record<string, number>) => number }

export function History({ trades, answers, skips, onClose, onOpen, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState(0);
  const rows: Row[] = Object.keys(answers).map((id) => ({ t: trades.get(+id)!, a: answers[id] })).filter((r) => r.t && r.a.g);
  rows.sort((x, y) => (y.a.ts || 0) - (x.a.ts || 0) || y.t.id - x.t.id);
  const graded = rows.filter((r) => r.a.sizeOk != null), sizeRight = graded.filter((r) => r.a.sizeOk).length;
  const same = rows.filter((r) => r.a.match).length;
  const skipped = Object.keys(skips).map((id) => trades.get(+id)).filter((t): t is TradeIndex => !!t && !answers[t.id]);
  const counted = rows.filter((r) => r.a.match && typeof r.a.exit === 'number');
  const avgExit = counted.length ? counted.reduce((s, r) => s + (r.a.exit as number), 0) / counted.length : null;
  const early = counted.filter((r) => r.t.t1 != null && (r.a.exit as number) < (r.t.t1 as number)).length;
  const withT1 = counted.filter((r) => r.t.t1 != null).length;

  const shown = rows.filter((r) => filter === 'all' ? true : filter === 'missed' ? missed(r.a) : filter === 'against' ? bias4h(r.t) === 'against' : r.t.setup === 'Lotto');
  const selRow = Math.min(sel, Math.max(0, shown.length - 1));
  // ↑ ↓ move through the table, Enter opens the review (the app's own shortcuts are off while History is open)
  const nav = useRef<(e: KeyboardEvent) => void>(() => {});
  nav.current = (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
    if (e.key === 'ArrowDown') { setSel(Math.min(shown.length - 1, selRow + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setSel(Math.max(0, selRow - 1)); e.preventDefault(); }
    else if (e.key === 'Enter' && shown[selRow]) { onOpen(shown[selRow].t.id); e.preventDefault(); }
  };
  useEffect(() => { const h = (e: KeyboardEvent) => nav.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  useEffect(() => { document.querySelector('#histList tr.sel')?.scrollIntoView({ block: 'nearest' }); }, [selRow, filter]);

  const rate = (name: string, of: Row[], ok: (r: Row) => boolean) => of.length ? <Rate key={name} name={name} right={of.filter(ok).length} total={of.length} /> : null;
  const withB = rows.filter((r) => bias4h(r.t) === 'with'), against = rows.filter((r) => bias4h(r.t) === 'against');
  const misses = rows.filter((r) => missed(r.a));

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
      <div className="hist-head">
        <h2>History</h2>
        <span className="small">Saved in this browser only: use Export to back it up or move it to another device.</span>
        <button id="bHistClose" onClick={onClose}>Close<kbd>Esc</kbd></button>
      </div>
      {!rows.length ? <div className="hist-empty small">No trades yet. Play one and it shows up here.</div> : <>
      <div className="kpis">
        <div><span>Played</span><b>{rows.length}</b><em>{skipped.length} skipped</em></div>
        <div><span>Side match</span><b>{Math.round((same / rows.length) * 100)}%</b><em>{same} of {rows.length}</em></div>
        <div><span>Size match</span><b>{graded.length ? Math.round((sizeRight / graded.length) * 100) + '%' : '–'}</b><em>{sizeRight} of {graded.length} labelled</em></div>
        <div><span>Avg exit · you</span><b className={avgExit == null ? '' : tone(avgExit)}>{avgExit == null ? '–' : pct(avgExit)}</b><em>{counted.length} on his side</em></div>
        <div><span>Sold below his 1st trim</span><b className={early ? 'bad' : ''}>{early}</b><em>of {withT1} he trimmed</em></div>
      </div>
      <div className="hist-body">
        <section className="hist-main">
          <div className="hist-tools">
            <h3>Trades · {shown.length}</h3>
            <div className="chips" role="group" aria-label="Show">
              {FILTERS.map(([k, label]) => <button key={k} aria-pressed={filter === k} onClick={() => { setFilter(k); setSel(0); }}>{label}</button>)}
            </div>
          </div>
          <table className="hist-table">
            <thead><tr><th>Date</th><th>Contract</th><th className="hidemob">4h</th><th>Side</th><th className="hidemob">Size</th><th className="num">You</th><th className="num hidemob">His 1st trim</th><th className="hidemob">Note</th></tr></thead>
            <tbody id="histList">
              {shown.map(({ t, a }, i) => { const hasExit = typeof a.exit === 'number', b = bias4h(t); return (
                <tr key={t.id} data-id={t.id} className={(i === selRow ? 'sel ' : '') + (missed(a) ? 'miss' : '')} onClick={() => onOpen(t.id)} onMouseEnter={() => setSel(i)}>
                  <td className="dim">{t.d.slice(2)} {t.hm}</td>
                  <td>{t.tk} {t.k}{t.r} <span className="small">{t.setup}</span></td>
                  <td className={'hidemob ' + (b === 'against' ? 'bad' : 'dim')}>{b === 'with' ? 'WITH' : b === 'against' ? 'AGAINST' : '–'}</td>
                  <td className={a.match ? '' : 'bad'}>{a.match ? '✓' : '✗'} {sideWord(a.g)}</td>
                  <td className="hidemob">{!sizeable(t) ? <span className="dim" title="RSI Trader didn't label this Daytrade or Lotto, so size isn't graded">— {t.setup.toUpperCase()}</span> : a.size ? <span className={a.sizeOk ? '' : 'bad'}>{a.sizeOk ? '✓' : '✗'} {a.size.toUpperCase()}</span> : '–'}</td>
                  <td className={'num ' + (hasExit ? (a.match ? tone(a.exit!) : 'dim') : '')} title={a.match ? undefined : "On RSI Trader's side; not counted in your average"}>{hasExit ? pct(a.exit!) + (a.match ? '' : '*') : '–'}</td>
                  <td className="num hidemob dim">{t.t1 != null ? pct(t.t1) : '–'}</td>
                  <td className="hidemob small">{(a.note || '').slice(0, 60)}</td>
                </tr>
              ); })}
            </tbody>
          </table>
          <div className="small hist-keys">↑ ↓ move · Enter or tap opens the review · ✗ = differs from RSI Trader · * = exit on his side, not counted in your average</div>
        </section>
        <aside className="hist-side">
          <section>
            <h3>Hit rate by situation</h3>
            {rate('Side, with the 4h bias', withB, (r) => r.a.match)}
            {rate('Side, against the 4h bias', against, (r) => r.a.match)}
            {rate('Size: Daytrade', graded.filter((r) => r.t.setup === 'Daytrade'), (r) => !!r.a.sizeOk)}
            {rate('Size: Lotto', graded.filter((r) => r.t.setup === 'Lotto'), (r) => !!r.a.sizeOk)}
            {Object.keys(TOD).map((k) => rate('Side, ' + TOD[k].toLowerCase(), rows.filter((r) => r.t.tod === k), (r) => r.a.match))}
            <div className="small" style={{ marginTop: 10 }}>The tick is 50%, a coin flip. "With the 4h bias" means he traded the way the 4h RSI leaned; against it, he was fading a stretched 4h.</div>
          </section>
          <section>
            <h3 className="bad">Missed · {misses.length}</h3>
            {!misses.length ? <div className="small">Nothing missed yet.</div> : <ol className="misses">
              {misses.slice(0, 8).map(({ t, a }) => (
                <li key={t.id}><button className="link-row" onClick={() => onOpen(t.id)}>
                  <span className="mono">{t.tk} {t.k}{t.r} · {t.d.slice(2)}</span>
                  <span className="small">{!a.match ? 'Side: you picked ' + sideWord(a.g).toLowerCase() + ', he took ' + sideWord(t.r).toLowerCase() : 'Size: you said ' + a.size + ', he said ' + t.setup}{bias4h(t) === 'against' && !a.match ? ' (he faded the 4h)' : ''}</span>
                </button></li>
              ))}
            </ol>}
            {misses.length > 8 && <button className="link" onClick={() => { setFilter('missed'); setSel(0); }}>Show all {misses.length} in the table</button>}
          </section>
        </aside>
      </div>
      </>}
      <div className="box hist-foot">
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
