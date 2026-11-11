import { useEffect, useRef, useState } from 'react';
import { clearCharts, countCharts, forgetGh, ghConf, importCharts, saveGh } from '../lib/charts';

/** Load Bear's screenshots from this device or a private GitHub repo. */
export function ChartsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const folderRef = useRef<HTMLInputElement>(null), filesRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [repo, setRepo] = useState(ghConf()?.repo || '');
  const [token, setToken] = useState('');
  const [ghStatus, setGhStatus] = useState(ghConf() ? 'Connected to ' + ghConf()!.repo + '.' : '');

  useEffect(() => { countCharts().then((n) => setStatus(n ? n + ' charts are saved in this browser.' : 'No charts loaded yet.')); }, []);
  useEffect(() => { folderRef.current?.setAttribute('webkitdirectory', ''); }, []);

  const onFiles = async (fl: FileList | null) => {
    if (!fl?.length) return;
    try { await importCharts(fl, setStatus); } catch (e) { setStatus('Import failed: ' + (e as Error).message); }
    onChanged();
  };
  const connect = async () => {
    setGhStatus('Checking…');
    try { const r = await saveGh(repo, token); setToken(''); setGhStatus('Connected to ' + r + '.'); onChanged(); }
    catch (e) { setGhStatus('Failed: ' + (e as Error).message); }
  };

  return (
    <div id="chartsDlg" style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,10,.85)', zIndex: 25, overflow: 'auto', padding: 20 }}>
      <div className="box" style={{ maxWidth: 560, margin: '40px auto' }}>
        <h3>Bear's chart screenshots</h3>
        <p className="small">These come from Bear's paid channel, so they aren't published with this site. Load them from your own device. They're saved in this browser only and never uploaded.</p>
        <p className="small"><b>Desktop:</b> pick the <code>bear-ideas_charts_by_outcome</code> folder.<br /><b>Phone:</b> zip that folder on your computer, send the .zip to your phone, then pick it here.</p>
        <div className="row"><button id="bPickFolder" className="primary" onClick={() => folderRef.current?.click()}>Pick folder</button><button id="bPickFiles" onClick={() => filesRef.current?.click()}>Pick .zip or images</button></div>
        <input type="file" id="folderIn" ref={folderRef} multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        <input type="file" id="filesIn" ref={filesRef} accept="image/*,.zip,application/zip" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        <div id="chartsStatus" className="small" style={{ marginTop: 8 }}>{status}</div>
        <h3 style={{ marginTop: 16 }}>Or: load them from a private GitHub repo</h3>
        <p className="small">Put the <code>bear-ideas_charts_by_outcome</code> folder in a <b>private</b> repo. Create a fine-grained token with read-only <i>Contents</i> access to only that repo, and paste it here on each device. Charts are fetched when a trade is revealed and cached in this browser. The token is stored in this browser only.</p>
        <div className="row"><input id="ghRepo" placeholder="owner/repo" style={{ flex: 1, minWidth: 140 }} value={repo} onChange={(e) => setRepo(e.target.value)} /><input id="ghToken" type="password" placeholder="github_pat_…" style={{ flex: 2, minWidth: 160 }} value={token} onChange={(e) => setToken(e.target.value)} /></div>
        <div className="row"><button id="bGhSave" className="primary" onClick={connect}>Save</button><button id="bGhClear" onClick={() => { forgetGh(); setGhStatus('Token removed from this browser.'); }}>Forget token</button><span id="ghStatus" className="small">{ghStatus}</span></div>
        <div className="row"><button id="bChartsClose" onClick={onClose}>Close</button><button id="bChartsClear" onClick={async () => { if (!confirm('Remove all saved charts from this browser?')) return; await clearCharts(); setStatus('Removed.'); onChanged(); }}>Remove saved charts</button></div>
      </div>
    </div>
  );
}
