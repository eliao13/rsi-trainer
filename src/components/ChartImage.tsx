import { useEffect, useState } from 'react';
import type { Trade } from '../types';
import { fetchChartFromGh, getChart, ghConf } from '../lib/charts';

/** Bear's screenshot for the trade: from this browser's cache, else the private repo, else a prompt to load charts. */
export function ChartImage({ trade, version, onLoadCharts, onChartSaved }: { trade: Trade; version: number; onLoadCharts: () => void; onChartSaved: () => void }) {
  const [state, setState] = useState<{ url?: string; msg?: string; loading?: boolean }>({});
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let url: string | undefined, live = true;
    const show = (b: Blob) => { url = URL.createObjectURL(b); if (live) setState({ url }); };
    setState({});
    if (!trade.img) { setState({ msg: 'none' }); return; }
    getChart(trade.id).then((b) => {
      if (!live) return;
      if (b) return show(b);
      const gh = ghConf();
      if (!gh) return setState({ msg: 'load' });
      setState({ loading: true });
      return fetchChartFromGh(gh, trade).then((blob) => { show(blob); onChartSaved(); }).catch((e: Error) => live && setState({ msg: "Couldn't load the chart from GitHub (" + e.message + ').' }));
    });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [trade, version]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div id="imgWrap">
      {state.url && <img id="bearimg" src={state.url} alt="Bear's chart for this trade" onClick={() => setZoom(true)} />}
      {state.loading && <div className="small" style={{ marginTop: 8 }}>Loading Bear's chart…</div>}
      {state.msg === 'none' && <div className="small" style={{ marginTop: 8 }}>No chart screenshot for this trade.</div>}
      {state.msg === 'load' && <div className="small" style={{ marginTop: 8 }}>Bear posted a chart for this trade. <a href="#" id="loadLink" style={{ color: 'var(--accent)' }} onClick={(e) => { e.preventDefault(); onLoadCharts(); }}>Load Bear's charts</a> to see his pattern and levels here.</div>}
      {state.msg && state.msg !== 'none' && state.msg !== 'load' && <div className="small warn" style={{ marginTop: 8 }}>{state.msg}</div>}
      {zoom && state.url && <div id="imgModal" onClick={() => setZoom(false)}><img src={state.url} alt="Bear's chart, full size" /></div>}
    </div>
  );
}
