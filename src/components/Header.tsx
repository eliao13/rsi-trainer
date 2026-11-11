import { useState } from 'react';
import type { Answer, Filters } from '../types';
import { pct, tone } from '../lib/format';

interface Props { filters: Filters; onFilter: (f: Filters) => void; answers: Record<string, Answer>; chartCount: number; onHistory: () => void; onCharts: () => void }

export function Header({ filters, onFilter, answers, chartCount, onHistory, onCharts }: Props) {
  const [open, setOpen] = useState(false);
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => onFilter({ ...filters, [k]: e.target.value });
  return (
    <header>
      <h1>Bear Trainer</h1>
      <div className="hbtns">
        <button id="filterToggle" onClick={() => setOpen(!open)}>Filters</button>
        <button id="bHistory" onClick={onHistory}>History<kbd>H</kbd></button>
        <button id="bCharts" onClick={onCharts} title="Load Bear's chart screenshots from your device">{chartCount ? `Bear's charts (${chartCount})` : "Load Bear's charts"}</button>
      </div>
      <div id="filters" className={open ? 'open' : ''}>
        <label>Entry time<select id="fTod" value={filters.fTod} onChange={set('fTod')}><option value="all">All times</option><option value="open">Opening bell (9:30–9:45)</option><option value="morning">Morning (9:45–12)</option><option value="midday">Midday (12–2)</option><option value="late">Late (2–4)</option></select></label>
        <label>Setup<select id="fSetup" value={filters.fSetup} onChange={set('fSetup')}><option value="all">All</option><option>Daytrade</option><option>Lotto</option><option>Swing</option><option value="From note">Mentioned in a note</option></select></label>
        <label>Ticker<select id="fTk" value={filters.fTk} onChange={set('fTk')}><option value="all">All</option><option>QQQ</option><option>SPY</option><option>SPX</option><option>IWM</option></select></label>
        <label>Year<select id="fYr" value={filters.fYr} onChange={set('fYr')}><option value="all">All</option><option>2026</option><option>2025</option><option>2024</option><option>2023</option><option>2022</option></select></label>
        <label>Show<select id="fSeen" value={filters.fSeen} onChange={set('fSeen')}><option value="unseen">Trades I haven't done</option><option value="miss">Ones I got wrong</option><option value="any">Any trade</option></select></label>
      </div>
      <Stats answers={answers} />
    </header>
  );
}

/** Header numbers. Average exit counts only trades where you picked Bear's side. */
function Stats({ answers }: { answers: Record<string, Answer> }) {
  let n = 0, same = 0, sz = 0, szOk = 0;
  const ex: number[] = [];
  for (const a of Object.values(answers)) {
    if (!a.g) continue;
    n++; if (a.match) same++;
    if (a.sizeOk != null) { sz++; if (a.sizeOk) szOk++; }
    if (a.match && typeof a.exit === 'number') ex.push(a.exit);
  }
  const avg = ex.length ? ex.reduce((s, v) => s + v, 0) / ex.length : null;
  return (
    <div id="stats">
      <div><b>{n}</b>done</div>
      <div><b>{n ? Math.round((same / n) * 100) + '%' : '–'}</b>same side</div>
      <div><b>{sz ? Math.round((szOk / sz) * 100) + '%' : '–'}</b>size right</div>
      <div><b className={avg === null ? '' : tone(avg)}>{avg === null ? '–' : pct(avg)}</b>avg exit</div>
    </div>
  );
}
