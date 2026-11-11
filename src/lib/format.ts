export const fmtET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const fmtMD = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
export const pct = (v: number) => (v >= 0 ? '+' : '') + Math.round(v * 10) / 10 + '%';
export const tone = (v: number) => (v > 0 ? 'good' : v < 0 ? 'bad' : '');
