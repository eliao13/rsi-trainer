# Changelog

The version and build are shown next to the title (e.g. `v2.3.0 · a0ad476`) and in History. Quote both when reporting a bug.

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
