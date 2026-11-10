import csv,zipfile,lzma,struct,math,os,json,collections,glob
from datetime import datetime,date,timedelta,timezone
from zoneinfo import ZoneInfo
NY=ZoneInfo('America/New_York'); UTC=timezone.utc
os.chdir(os.path.expanduser('~/mnt/Downloads'))
OPT={'QQQ':'QQQUSUSD','SPY':'SPYUSUSD','SPX':'USA500IDXUSD','IWM':'IWMUSUSD'}
CHART={'QQQ':'USATECHIDXUSD','SPY':'USA500IDXUSD','SPX':'USA500IDXUSD','IWM':'IWMUSUSD'}
LABEL={'USATECHIDXUSD':'NDQ100','USA500IDXUSD':'SPX500','IWMUSUSD':'IWM'}
R=0.04; YEAR=365*24*60.0
_z={}
def zf(inst,yr):
    k=(inst,yr)
    if k not in _z:
        p=f'bear-backtest/raw/dukascopy_{inst}_{yr}_1min.zip'; _z[k]=zipfile.ZipFile(p) if os.path.exists(p) else None
    return _z[k]
def day_raw(inst,d):
    z=zf(inst,d.year)
    if z is None: return None
    try: raw=lzma.decompress(z.read(f'{inst}/{d.isoformat()}.bi5'))
    except KeyError: return None
    return [struct.unpack('>5if',raw[i:i+24]) for i in range(0,len(raw),24)]
_s={}
def session(inst,d):
    k=(inst,d)
    if k in _s: return _s[k]
    rec=day_raw(inst,d); out=None
    if rec:
        o_utc=datetime(d.year,d.month,d.day,9,30,tzinfo=NY).astimezone(UTC); s0=o_utc.hour*3600+o_utc.minute*60
        out=[((t-s0)//60,o/1000,h/1000,l/1000,c/1000) for t,o,c,l,h,v in rec if 0<=(t-s0)//60<390 and v>0]
        if len(out)<200: out=None
    _s[k]=out; return out
def ncdf(x): return 0.5*(1+math.erf(x/math.sqrt(2)))
def bs(S,K,T,sig,right):
    if T<=0 or sig<=0: return max(0.0,(S-K) if right=='C' else (K-S))
    sq=sig*math.sqrt(T); d1=(math.log(S/K)+(R+sig*sig/2)*T)/sq; d2=d1-sq
    return S*ncdf(d1)-K*math.exp(-R*T)*ncdf(d2) if right=='C' else K*math.exp(-R*T)*ncdf(-d2)-S*ncdf(-d1)
bt={x['trade_id']:x for x in csv.DictReader(open('bear-backtest/backtest_trades.csv',encoding='utf-8-sig'))}
trades=list(csv.DictReader(open('bear-ideas_trades_with_charts.csv',encoding='utf-8-sig')))
ev=list(csv.DictReader(open('bear-ideas_alert_events.csv',encoding='utf-8-sig')))
for e in ev: e['_t']=datetime.fromisoformat(e['time_utc'].replace('Z','+00:00'))
ev.sort(key=lambda e:e['_t'])
byday=collections.defaultdict(list)
for e in ev: byday[e['_t'].astimezone(NY).date()].append(e)
imgs={}
for p in glob.glob('bear-ideas_charts_by_outcome/*/*'):
    imgs[os.path.basename(p).split('_')[0].lstrip('0')]='../'+p.replace(os.sep,'/')
out=[]; need=collections.defaultdict(set)
for t in trades:
    b=bt.get(t['trade_id'])
    if not b or b['status']!='priced': continue
    et=datetime.fromisoformat(t['entry_time_utc'].replace('Z','+00:00')).astimezone(NY); d0=et.date()
    exp=date.fromisoformat(t['expiry']); K=float(t['strike']); entry=float(t['entry_price']); sig=float(b['iv']); right=t['right']
    bars=session(OPT[t['ticker']],d0); mm=(et.hour*60+et.minute)-570
    exp_close=datetime(exp.year,exp.month,exp.day,16,0,tzinfo=NY)
    path=[]
    for (m,o,h,l,c) in bars:
        if m<=mm: continue
        now=datetime(d0.year,d0.month,d0.day,9,30,tzinfo=NY)+timedelta(minutes=m+1)
        T=max((exp_close-now).total_seconds()/60,0)/YEAR
        path.append([m-mm, round(bs(c,K,T,sig,right)*100)])
    if len(path)<3: continue
    close_t=datetime(d0.year,d0.month,d0.day,16,0,tzinfo=NY)
    evs=[]
    for e in byday.get(d0,[]):
        if not (et< e['_t'].astimezone(NY) <=close_t): continue
        mine = e.get('trade_id')==t['trade_id']
        if e['type'] in('trim','update'):
            if not mine: continue
            evs.append({'m':round((e['_t']-et).total_seconds()/60,1),'k':e['type'],'p':float(e['pct']) if e['pct']!='' else None,'x':e['text'][:300]})
        elif e['type'] in('note','contract_note'):
            if e['contract'] and e['contract']!=t['contract']: continue
            if not e['text'].strip(): continue
            evs.append({'m':round((e['_t']-et).total_seconds()/60,1),'k':'note','x':e['text'][:400]})
    ci=CHART[t['ticker']]
    for dd in range(-7,1): need[ci].add(d0+timedelta(days=dd))
    hh=et.hour*60+et.minute
    out.append({'id':int(t['trade_id']),'t':int(et.timestamp()),'d':d0.isoformat(),'hm':et.strftime('%H:%M'),'setup':t['setup'],'tk':t['ticker'],'r':right,'k':K,'exp':t['expiry'],'dte':int(b['dte']),
        'e':entry,'note':t['entry_note'][:300],'ci':LABEL[ci],'oc':t['outcome'],'trims':int(t['trims'] or 0),'best':t['best_pct'],
        'mx':float(b['max_pct']),'mxm':int(float(b['max_after_min'])),'cl':float(b['day0_close_pct']) if b['day0_close_pct']!='' else None,'r20':float(b['r_t20_s30']),
        'path':path,'ev':evs,'img':imgs.get(t['trade_id'],''),'tod':'open' if hh<585 else 'morning' if hh<720 else 'midday' if hh<840 else 'late'})

# ---------- higher-timeframe bias (RSI 14, median SMA 34, bands 2 sd; 4h/daily anchored 18:00 New York) ----------
import numpy as np
def all_minutes(inst):
    ms=[];cs=[]
    d=date(2022,6,1)
    while d<=date(2026,11,6):
        rec=day_raw(inst,d)
        if rec:
            base=int(datetime(d.year,d.month,d.day,tzinfo=UTC).timestamp())//60
            for tt,o,c,l,h,v in rec:
                if v>0: ms.append(base+tt//60); cs.append(c/1000)
        d+=timedelta(days=1)
    return np.array(ms),np.array(cs)
def ny_off(mn):  # minutes offset of New York from UTC at epoch-minute mn
    return int(datetime.fromtimestamp(mn*60,tz=UTC).astimezone(NY).utcoffset().total_seconds()//60)
class HTF:
    def __init__(self,inst,tfmin,anchor):
        self.m,self.c=all_minutes(inst); self.tf=tfmin; self.anchor=anchor
        # per-minute NY offset (changes only twice a year): compute per day
        days=self.m//1440; ud=np.unique(days); offs={int(d):ny_off(int(d)*1440+720) for d in ud}
        loc=self.m+np.array([offs[int(d)] for d in days])
        self.g=(loc-anchor)//tfmin
        idx=np.r_[np.nonzero(np.diff(self.g))[0],len(self.g)-1]
        self.bar_end_i=idx; self.cl=self.c[idx]; self.bg=self.g[idx]
        d=np.diff(self.cl); L=14
        self.ag=np.full(len(self.cl),np.nan); self.al=np.full(len(self.cl),np.nan); self.rsi=np.full(len(self.cl),np.nan)
        if len(d)>L:
            ag=np.where(d[:L]>0,d[:L],0).mean(); al=np.where(d[:L]<0,-d[:L],0).mean()
            for i in range(L,len(d)+1):
                if i>L:
                    x=d[i-1]; ag=(ag*(L-1)+max(x,0))/L; al=(al*(L-1)+max(-x,0))/L
                self.ag[i]=ag; self.al[i]=al; self.rsi[i]=100-100/(1+ag/al) if al>0 else 100
    def at(self,mn):
        i=np.searchsorted(self.m,mn,side='right')-1
        if i<0: return None
        price=self.c[i]; g=self.g[i]
        k=np.searchsorted(self.bg,g)-1   # last completed bar before the forming one
        if k<60 or np.isnan(self.ag[k]): return None
        x=price-self.cl[k]; L=14; ag=(self.ag[k]*(L-1)+max(x,0))/L; al=(self.al[k]*(L-1)+max(-x,0))/L
        r=100-100/(1+ag/al) if al>0 else 100.0
        w=np.r_[self.rsi[k-32:k+1],r]
        if np.isnan(w).any(): return None
        m=w.mean(); sd=w.std()
        return [round(float(r),1),round(float(m),1),round(float(m+2*sd),1),round(float(m-2*sd),1)]
HT={}
for ci in set(CHART.values()):
    anchor=18*60 if 'IDX' in ci else 9*60+30
    HT[ci]=(HTF(ci,240,anchor),HTF(ci,1440,anchor))
    print('htf built',ci,len(HT[ci][0].cl),'4h bars',len(HT[ci][1].cl),'daily bars')
for o in out:
    ci=CHART[o['tk']]; mn=o['t']//60
    o['b4']=HT[ci][0].at(mn); o['bd']=HT[ci][1].at(mn)
print('with 4h bias',sum(1 for o in out if o['b4']),'with daily',sum(1 for o in out if o['bd']))
# quick stat: does the 4h median side line up with outcome?
import statistics as _st
def grp(rows,lab):
    if len(rows)>30: print(f"  {lab:38} n={len(rows):5} +20/-30 rule avg {(_st.mean(o['r20'] for o in rows))*100:5.1f}%  hit+100 {sum(1 for o in rows if o['mx']>=100)/len(rows)*100:4.0f}%  close avg {_st.mean(o['cl'] for o in rows if o['cl'] is not None):6.1f}%")
A=[o for o in out if o['b4']]
grp([o for o in A if (o['r']=='C')==(o['b4'][0]>o['b4'][1])],'with 4h side (RSI vs median)')
grp([o for o in A if (o['r']=='C')!=(o['b4'][0]>o['b4'][1])],'against 4h side')
grp([o for o in A if o['b4'][0]>o['b4'][2] and o['r']=='C'],'calls, 4h RSI above upper band')
grp([o for o in A if o['b4'][0]>o['b4'][2] and o['r']=='P'],'puts, 4h RSI above upper band')
grp([o for o in A if o['b4'][0]<o['b4'][3] and o['r']=='P'],'puts, 4h RSI below lower band')
grp([o for o in A if o['b4'][0]<o['b4'][3] and o['r']=='C'],'calls, 4h RSI below lower band')
B=[o for o in out if o['bd']]
grp([o for o in B if (o['r']=='C')==(o['bd'][0]>o['bd'][1])],'with daily side')
grp([o for o in B if (o['r']=='C')!=(o['bd'][0]>o['bd'][1])],'against daily side')

json_dump=lambda o: json.dumps(o,separators=(',',':'))
open('bear-trainer/data/trades.js','w',encoding='utf-8').write('window.BEAR_TRADES='+json_dump(out)+';')
print('trades',len(out),round(os.path.getsize('bear-trainer/data/trades.js')/1e6,1),'MB', 'with img',sum(1 for o in out if o['img']))
# 5-min bars per chart instrument per year (only days needed)
missing=collections.Counter()
for inst,days in need.items():
    agg=collections.defaultdict(dict)  # year -> {bucket: [o,h,l,c]}
    for d in sorted(days):
        if d.weekday()>4: 
            rec=day_raw(inst,d)  # sunday evening session may exist; skip if none
        else: rec=day_raw(inst,d)
        if not rec:
            if d.weekday()<5: missing[inst]+=1
            continue
        base=int(datetime(d.year,d.month,d.day,tzinfo=UTC).timestamp())
        A=agg[d.year]
        for tt,o,c,l,h,v in rec:
            if v<=0: continue
            bkt=(base+tt)//300
            x=A.get(bkt)
            if x is None: A[bkt]=[o,h,l,c]
            else:
                if h>x[1]: x[1]=h
                if l<x[2]: x[2]=l
                x[3]=c
    for yr,A in agg.items():
        ks=sorted(A); div=100 if inst=='USATECHIDXUSD' else 10   # store price*10 (NDX) or *100
        obj={'t':ks,'o':[A[k][0]//div for k in ks],'h':[A[k][1]//div for k in ks],'l':[A[k][2]//div for k in ks],'c':[A[k][3]//div for k in ks],'scale':1000//div}
        fn=f'bear-trainer/data/bars_{LABEL[inst]}_{yr}.js'
        open(fn,'w').write(f'(window.BEAR_BARS=window.BEAR_BARS||{{}})["{LABEL[inst]}_{yr}"]='+json_dump(obj)+';')
        print(fn,len(ks),round(os.path.getsize(fn)/1e6,2),'MB')
print('missing weekdays',dict(missing))
