import type { Trade } from '../types';

// Bear's chart screenshots come from his paid channel, so they are never published with the
// site. They are imported from the user's device, or fetched from their private GitHub repo,
// and cached in this browser's IndexedDB.

let dbP: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbP) {
    dbP = new Promise((resolve, reject) => {
      const r = indexedDB.open('bearCharts', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('img');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbP;
}
function tx<T>(mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('img', mode), req = fn(t.objectStore('img'));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

export const countCharts = () => tx<number>('readonly', (st) => st.count()).then((n) => n || 0).catch(() => 0);
export const getChart = (id: number) => tx<Blob>('readonly', (st) => st.get(id)).catch(() => undefined);
const putChart = (id: number, b: Blob) => tx('readwrite', (st) => { st.put(b, id); });
export const clearCharts = () => tx('readwrite', (st) => { st.clear(); });

/** Trade id from a screenshot filename like ".../0008_2022-06-06_Lotto_....png". */
export function idFromName(name: string): number | null {
  const m = /(?:^|\/)0*(\d+)_\d{4}-\d\d-\d\d_[^/]*\.(png|jpe?g|webp)$/i.exec(name);
  return m ? +m[1] : null;
}

/** Downscale so ~2,000 charts fit comfortably in browser storage. */
async function shrink(blob: Blob): Promise<Blob> {
  if (!('createImageBitmap' in window)) return blob;
  try {
    const bm = await createImageBitmap(blob);
    const sc = Math.min(1, 1600 / bm.width), c = document.createElement('canvas');
    c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc);
    c.getContext('2d')!.drawImage(bm, 0, 0, c.width, c.height); bm.close();
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/webp', 0.82));
    return out && out.size < blob.size ? out : blob;
  } catch { return blob; }
}

const mime = (name: string) => { const ext = name.split('.').pop()!.toLowerCase(); return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'; };

/** Import a folder, images, or .zip files. Reports progress through `onStatus`. */
export async function importCharts(files: FileList | File[], onStatus: (s: string) => void): Promise<number> {
  const entries: { id: number; get: () => Promise<Blob> }[] = [];
  for (const f of Array.from(files)) {
    if (/\.zip$/i.test(f.name)) {
      onStatus('Unzipping ' + f.name + '…');
      const { unzipSync } = await import('fflate');
      const unzipped = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (z) => idFromName(z.name) != null });
      for (const name of Object.keys(unzipped)) entries.push({ id: idFromName(name)!, get: async () => new Blob([unzipped[name]], { type: mime(name) }) });
    } else {
      const id = idFromName((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
      if (id != null) entries.push({ id, get: async () => f });
    }
  }
  if (!entries.length) { onStatus('No chart images found. Files should be named like 3174_2026-08-11_….png.'); return 0; }
  let done = 0;
  for (const e of entries) {
    await putChart(e.id, await shrink(await e.get()));
    done++;
    if (done % 20 === 0 || done === entries.length) onStatus('Saved ' + done + ' of ' + entries.length + ' charts…');
  }
  onStatus('Done. ' + done + ' charts saved in this browser.');
  return done;
}

// ---------- private GitHub repo as a chart source ----------
const GHKEY = 'bearTrainerGh';
export interface GhConf { repo: string; token: string }
export function ghConf(): GhConf | null {
  try { const c = JSON.parse(localStorage.getItem(GHKEY) || 'null'); return c && c.repo && c.token ? c : null; } catch { return null; }
}
export function forgetGh() { try { localStorage.removeItem(GHKEY); } catch { /* ignore */ } }

export async function saveGh(repoIn: string, token: string): Promise<string> {
  const repo = repoIn.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token.trim()) throw new Error('Enter owner/repo and a token.');
  const r = await fetch('https://api.github.com/repos/' + repo, { headers: { Authorization: 'Bearer ' + token.trim() } });
  if (!r.ok) throw new Error(r.status === 404 ? 'repo not found, or the token can\'t see it' : 'HTTP ' + r.status);
  try { localStorage.setItem(GHKEY, JSON.stringify({ repo, token: token.trim() })); } catch { /* ignore */ }
  return repo;
}

/** Fetch a trade's chart from the private repo and cache it. */
export async function fetchChartFromGh(gh: GhConf, t: Trade): Promise<Blob> {
  const path = t.img.replace(/^(\.\.\/)+/, '').split('/').map(encodeURIComponent).join('/');
  const r = await fetch('https://api.github.com/repos/' + gh.repo + '/contents/' + path, { headers: { Authorization: 'Bearer ' + gh.token, Accept: 'application/vnd.github.raw' } });
  if (!r.ok) throw new Error(r.status === 404 ? 'not found in ' + gh.repo : r.status === 401 ? 'token rejected' : 'HTTP ' + r.status);
  const small = await shrink(await r.blob());
  await putChart(t.id, small);
  return small;
}
