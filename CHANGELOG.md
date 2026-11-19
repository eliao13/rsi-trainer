# Changelog

The version and build are shown next to the title (e.g. `v2.3.0 · a0ad476`) and in History. Quote both when reporting a bug.

## 2.10.0
- Review chart: drag (or swipe) to scroll back through earlier bars, zoom with the mouse wheel, pinch or the −/+ buttons, double-click or "Reset view" to return
- Only after the trade ends, so nothing ahead of the replay is shown; the last-price tag hides while scrolled back

## 2.9.0
- Mistakes pile: trades you get wrong (side, or size where he labelled it) come back until you get them right twice in a row; a miss on a retry starts the count again
- "Show: Mistakes pile" (replaces "Ones I got wrong") drills it; History lists the pile with progress and a "Drill the pile" button (X)
- The result line says when a trade joins, moves along or clears the pile
- Trades you'd already missed, and misses in imported progress, are added to the pile

## 2.8.0
- Phones: shorter header (version moved to History), no extra rule above the chart, timeframes and the TRAMA/VWAP toggles on one line
- Replay: Sell is outlined in blue so it stands out from the time steps
- Wide screens: the header's contents line up with the page instead of running to the window edges
- History: "No trades yet" has the same side spacing as the rest of the page

## 2.7.0
- History in the Desk layout: headline numbers (played, side match, size match, your average exit, sold below his first trim)
- Trade table with All / Missed / Against 4h / Lotto filters, a 4h-bias column and tinted misses; ↑ ↓ to move, Enter or tap opens the review
- Hit rate by situation (with or against the 4h bias, Daytrade or Lotto, time of day) with a 50% tick
- List of missed trades with what differed; skipped trades, version info and export/import kept

## 2.6.0
- Review screen in the Desk layout: "Your calls vs RSI Trader" (side, size and exit side by side, with ✓/✗)
- "Exits · same entry, different rules": your exit, his posted trims, the rule-based exit, the chart stop, the best possible (hindsight) and holding to the close, each with a bar from a shared zero line
- Same numbers and notes as before; on phones the descriptions hide so the bars fit

## 2.5.1
- Dropdown lists (filters, exit plan) are dark with readable text instead of light grey on white

## 2.5.0
- New look ("Desk"): graphite background, IBM Plex fonts, hairline panels instead of rounded cards, keycap-style buttons, one amber accent
- Candles are hollow blue going up and solid orange going down (readable with red-green colour blindness); calls are blue, puts orange
- TRAMA (length 34, RSI Trader's setting, same maths as the TradingView script) on every timeframe, with an on/off toggle
- VWAP on the 1, 5 and 15-minute charts, built like TradingView's default (session from 09:30, hlc3 x volume) from real SPY/QQQ/IWM bars with full-market volume, and placed on the chart's index prices; on/off toggle

## 2.4.2
- Renamed: the app is now "RSI Trainer", and the trader is "RSI Trader" throughout (saved progress and loaded charts carry over)

## 2.4.1
- Trim posts like "TRIMMM!" or a bare "TRIM!" count in Bear's result
- Bear's exit is read from his messages ("close it out here", "all out", "taking full profit", "stopped out"), so "Best the option reached" says when the peak came after he was out, even with no trims posted
- The "Sold" label moves aside when it would cover the "swing stop" label
- Desktop: the chart height is measured from where it starts on the page, so the gap below it is the same at every window size (and large monitors fill up to 1400px)
- While playing, the chart's right edge is labelled with its time (e.g. "12:00 →")

## 2.4.0
- Desktop: the chart sizes to the window instead of a fixed 560px, so there's no empty space under it while playing
- While playing, the chart shows one hour past the replay cursor (growing as you step) instead of a mostly empty rest of day; the full day appears at review
- Review: "How it played out" sits under the chart; your journal and Bear's chart screenshot sit beside his messages, so the two columns balance
- "How it played out": explanations sit on their own full-width line under each number instead of ragged right-aligned text
- Tablets (701–1000px): answer bar pinned to the bottom, filters behind the Filters button, chart sized to the screen
- Replay controls stay on one row on desktop

## 2.3.0
- Version and build shown in the header and History, and included in progress exports
- Clicking Calls or Puts before picking a size now says "Pick Daytrade or Lotto first" until you do
- Rule-based exit trims half at Bear's own first trim for that trade (his +23% median when he posted none) and shows the arithmetic
- Trim posts without a % (e.g. "Trimming to runners here") count in Bear's result
- "Best the option reached" says when the peak came after his last post
- Divergence and swing-stop labels moved off the price action

## 2.2.0
- Bear's posted result comes first; model numbers grouped as estimates, with a "Model vs Bear" note when they disagree
- Swing stop ignores the candle Bear entered in
- 4h band rule shown with how often he actually went against it (~70%)
- Faster first load: trade index plus per-month detail and bar files; loading state instead of an empty chart
- "You sold" marker shows time and result; exit plan shown before every round with Change / Clear
- Swing and note trades say size isn't graded; skips are recorded, counted and filterable

## 2.1.0
- Swing-break stop, possible divergence markers, optional 1-minute chart
- Fixes for long links and header stats overflowing phone screens

## 2.0.0
- Rebuilt in React + TypeScript with tests, deployed by GitHub Actions
