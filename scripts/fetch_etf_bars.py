"""Fetch regular-hours 5-minute ETF bars with consolidated (SIP) volume from Alpaca, for every month
the app has chart bars for, and write public/data/etf/<CI>_YYYY-MM.js for the VWAP overlay.

Each file holds, per bar: t (epoch minutes, bar start), c (ETF close), w (session VWAP so far, from
09:30 ET, hlc3 x volume, as TradingView's default VWAP). Credentials come from the environment's
network secrets (the proxy adds Alpaca's headers); run: python scripts/fetch_etf_bars.py
"""
import json, os, sys, time, urllib.request, urllib.parse, datetime as dt
from zoneinfo import ZoneInfo
ET = ZoneInfo('America/New_York')
ETF = {'SPX500': 'SPY', 'NDQ100': 'QQQ', 'IWM': 'IWM'}
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
OUT = os.path.join(ROOT, 'etf')

def get(sym, start, end):
    bars, tok = [], None
    while True:
        q = {'timeframe': '5Min', 'start': start, 'end': end, 'feed': 'sip', 'adjustment': 'raw', 'limit': 10000}
        if tok: q['page_token'] = tok
        url = f'https://data.alpaca.markets/v2/stocks/{sym}/bars?' + urllib.parse.urlencode(q)
        for a in range(5):
            try:
                with urllib.request.urlopen(url, timeout=60) as r: d = json.load(r); break
            except Exception as e:
                if a == 4: raise
                time.sleep(2 ** a)
        bars += d.get('bars') or []
        tok = d.get('next_page_token')
        if not tok: return bars
        time.sleep(0.35)

def month_file(ci, ym):
    y, m = map(int, ym.split('-'))
    start = dt.datetime(y, m, 1, tzinfo=dt.timezone.utc) - dt.timedelta(days=1)
    end = (dt.datetime(y + (m == 12), m % 12 + 1, 1, tzinfo=dt.timezone.utc) + dt.timedelta(days=1))
    end = min(end, dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=20))  # free plan: no data from the last 15 min
    raw = get(ETF[ci], start.isoformat().replace('+00:00', 'Z'), end.isoformat().replace('+00:00', 'Z'))
    T, C, W = [], [], []
    day, pv, vv = None, 0.0, 0.0
    for b in raw:
        t = dt.datetime.fromisoformat(b['t'].replace('Z', '+00:00')); le = t.astimezone(ET)
        mins = le.hour * 60 + le.minute
        if mins < 570 or mins >= 960: continue  # 09:30-16:00 ET only
        if le.date() != day: day, pv, vv = le.date(), 0.0, 0.0
        pv += (b['h'] + b['l'] + b['c']) / 3 * b['v']; vv += b['v']
        T.append(int(t.timestamp() // 60)); C.append(round(b['c'], 4)); W.append(round(pv / vv, 4) if vv else round(b['c'], 4))
    obj = {'sym': ETF[ci], 't': [T[0]] + [b - a for a, b in zip(T, T[1:])] if T else [], 'c': C, 'w': W}
    key = f'{ci}_{ym}'
    with open(os.path.join(OUT, key + '.js'), 'w') as f:
        f.write(f'(window.RSI_ETF=window.RSI_ETF||{{}})["{key}"]=' + json.dumps(obj, separators=(',', ':')) + ';')
    return len(T)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    keys = sorted(f[:-3] for f in os.listdir(os.path.join(ROOT, 'bars')) if f.endswith('.js'))
    done = 0
    for k in keys:
        ci, ym = k.rsplit('_', 1)
        if ci not in ETF: print('skip', k); continue
        if os.path.exists(os.path.join(OUT, k + '.js')) and '--force' not in sys.argv: continue
        n = month_file(ci, ym); done += 1
        print(k, n, flush=True); time.sleep(0.35)
    with open(os.path.join(OUT, 'index.js'), 'w') as f:
        f.write('window.RSI_ETF_KEYS=' + json.dumps(sorted(x[:-3] for x in os.listdir(OUT) if x.endswith('.js') and x != 'index.js')) + ';')
    print('fetched', done)
