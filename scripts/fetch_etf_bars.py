"""Fetch regular-hours ETF bars (SPY, QQQ, IWM) with consolidated (SIP) volume from Alpaca, for the
VWAP overlay. The app computes VWAP itself from these bars on each timeframe, as TradingView does.

  python scripts/fetch_etf_bars.py        5-minute bars for every month the app has chart bars for
                                          -> public/data/etf/<CI>_YYYY-MM.js
  python scripts/fetch_etf_bars.py --m1   1-minute bars for every trade day (the 1-minute chart only
                                          covers trade days) -> public/data/etf/m1_<CI>_YYYY.js
  add --force to refetch files that already exist

Each file holds: t (bar start in epoch minutes, delta-encoded), h, l, c (price x 1000, integers),
v (shares). Bars are 09:30-16:00 ET only, unadjusted. Credentials come from the environment's network
secrets: the proxy adds Alpaca's key headers for data.alpaca.markets.
"""
import json, os, sys, time, subprocess, urllib.request, urllib.parse, datetime as dt
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')
ETF = {'SPX500': 'SPY', 'NDQ100': 'QQQ', 'IWM': 'IWM'}  # chart instrument -> ETF RSI Trader trades
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ROOT = os.path.join(REPO, 'public', 'data')
OUT = os.path.join(ROOT, 'etf')
FORCE = '--force' in sys.argv


def iso(d):
    return d.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')


def get(sym, start, end, tf):
    """All bars between two datetimes, following pagination. The free plan refuses the last 15 minutes."""
    end = min(end, dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=20))
    bars, tok = [], None
    while True:
        q = {'timeframe': tf, 'start': iso(start), 'end': iso(end), 'feed': 'sip', 'adjustment': 'raw', 'limit': 10000}
        if tok:
            q['page_token'] = tok
        url = f'https://data.alpaca.markets/v2/stocks/{sym}/bars?' + urllib.parse.urlencode(q)
        for a in range(5):
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    d = json.load(r)
                break
            except Exception:
                if a == 4:
                    raise
                time.sleep(2 ** a)
        bars += d.get('bars') or []
        tok = d.get('next_page_token')
        if not tok:
            return bars
        time.sleep(0.3)


def regular_hours(raw):
    T, H, L, C, V = [], [], [], [], []
    for b in raw:
        t = dt.datetime.fromisoformat(b['t'].replace('Z', '+00:00'))
        le = t.astimezone(ET)
        mins = le.hour * 60 + le.minute
        if mins < 570 or mins >= 960:
            continue
        T.append(int(t.timestamp() // 60))
        H.append(round(b['h'] * 1000)); L.append(round(b['l'] * 1000)); C.append(round(b['c'] * 1000)); V.append(int(b['v']))
    return T, H, L, C, V


def write(name, glob, key, sym, cols):
    T, H, L, C, V = cols
    obj = {'sym': sym, 't': ([T[0]] + [b - a for a, b in zip(T, T[1:])]) if T else [], 'h': H, 'l': L, 'c': C, 'v': V}
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(f'(window.{glob}=window.{glob}||{{}})["{key}"]=' + json.dumps(obj, separators=(',', ':')) + ';')


def fetch_months():
    keys = sorted(f[:-3] for f in os.listdir(os.path.join(ROOT, 'bars')) if f.endswith('.js'))
    for k in keys:
        ci, ym = k.rsplit('_', 1)
        if ci not in ETF or (os.path.exists(os.path.join(OUT, k + '.js')) and not FORCE):
            continue
        y, m = map(int, ym.split('-'))
        start = dt.datetime(y, m, 1, tzinfo=dt.timezone.utc) - dt.timedelta(days=1)
        end = dt.datetime(y + (m == 12), m % 12 + 1, 1, tzinfo=dt.timezone.utc) + dt.timedelta(days=1)
        cols = regular_hours(get(ETF[ci], start, end, '5Min'))
        write(k + '.js', 'RSI_ETF', k, ETF[ci], cols)
        print(k, len(cols[0]), flush=True)
        time.sleep(0.3)
    names = sorted(x[:-3] for x in os.listdir(OUT) if x.endswith('.js') and x != 'index.js' and not x.startswith('m1_'))
    with open(os.path.join(OUT, 'index.js'), 'w') as f:
        f.write('window.RSI_ETF_KEYS=' + json.dumps(names) + ';')


def fetch_m1():
    days = json.loads(subprocess.check_output(['node', '-e', "global.window={};require('./public/data/trades_index.js');"
        "const s={};for(const t of window.BEAR_TRADES){(s[t.ci]=s[t.ci]||new Set()).add(t.d)};"
        "const o={};for(const k in s)o[k]=[...s[k]].sort();console.log(JSON.stringify(o))"], cwd=REPO))
    cache = os.path.join(OUT, '.m1cache')  # one file per ticker-day, so an interrupted run resumes
    os.makedirs(cache, exist_ok=True)
    for ci, ds in sorted(days.items()):
        if ci not in ETF:
            continue
        for d in ds:
            f = os.path.join(cache, f'{ci}_{d}.json')
            if os.path.exists(f) and not FORCE:
                continue
            day = dt.date.fromisoformat(d)
            start = dt.datetime(day.year, day.month, day.day, 9, 0, tzinfo=ET)
            cols = regular_hours(get(ETF[ci], start, start + dt.timedelta(hours=7.5), '1Min'))
            json.dump(cols, open(f, 'w'))
            print(ci, d, len(cols[0]), flush=True)
            time.sleep(0.3)
        years = {}
        for d in ds:
            cols = json.load(open(os.path.join(cache, f'{ci}_{d}.json')))
            acc = years.setdefault(d[:4], ([], [], [], [], []))
            for a, b in zip(acc, cols):
                a.extend(b)
        for yr, cols in sorted(years.items()):
            write(f'm1_{ci}_{yr}.js', 'RSI_ETF_M1', f'{ci}_{yr}', ETF[ci], cols)
            print('wrote', f'm1_{ci}_{yr}', len(cols[0]), flush=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    fetch_m1() if '--m1' in sys.argv else fetch_months()
