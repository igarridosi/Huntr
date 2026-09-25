# Huntr teaser

`huntr-teaser.html` is a 50-second release film in one self-contained file: no build step, no
dependencies. Google Fonts is the only request, and it falls back to system fonts offline. Open it
in Chrome over any static server:

```bash
python -m http.server 4173 --directory teaser
```

Then open `http://localhost:4173/huntr-teaser.html`.

| Parameter | Effect |
|---|---|
| `?format=vertical` | 1080×1920 phone crop; the panel becomes the frame instead of the widescreen shrinking |
| `?t=9000` | open paused on one frame (milliseconds) |
| `?record=1` | paused at 0, cursor hidden — for capture |
| `?loop=1` | loop playback (the last frame's field matches the first) |
| `?reduced=1` | force the reduced-motion path (it also follows `prefers-reduced-motion`) |
| `?hud=1` | show the time code |

Keys: **Space** play/pause · **←/→** one second · **R** restart.

`window.teaser` exposes `seek(ms)`, `play()`, `pause()`, `frame(n)` (frame *n* at 60 fps),
`duration`, `frames`, `beats` and `ready` (resolves once fonts are in).

## Checking frames

**A hidden browser pane freezes animation.** The desktop app's browser pane, a background tab or
a window behind another window stops `requestAnimationFrame`, so watching it tells you nothing.
Verify frames with `seek()`, not by eye:

```js
await teaser.ready; teaser.seek(20600);   // the earnings quick view
```

Every frame is a pure function of time: `seek(t)` renders the same pixels however you got there.

## Filling CONFIG

Everything on screen comes from `CONFIG` at the top of the script, plus two embedded blobs:

- `LOGO_DATA` — each company's logo as a data URI: the images huntrvalue.me itself shows
  (`assets.parqet.com/logos/symbol/{TICKER}?format=png`), downloaded once so the film plays offline.
  A ticker without an entry falls back to the app's monogram tile. To add one, embed its PNG the
  same way; the cold-open tapes show every logo in `LOGO_DATA`, in order.
- `WOLF_DATA` — the brand mark, `public/logo/HunterLogoCut-removebg.png`.
- `INSIGHTS`, `RADAR` — six Insights cards (ticker, name, price, day %) and the Radar's 1D gainers
  and losers, as the Insights page lists them on the day you capture.
- `SYMBOL` — the ticker page: header figures, the 1Y price path (`prices`, first and last must be
  the page's exact prices), and ten fiscal years of revenue, free cash flow and net income from
  the company's 10-K filings.
- `CHART_A`, `CHART_B` — two Annual comparisons (a metric, its y ticks, and up to four companies of
  ten fiscal-year points each); `VISA` — one company on several metrics, TTM rows of
  `capex:dividends:buybacks:operating cash flow` in $B.
- `EARNINGS` — one week of the calendar (first two tickers per session and the session totals),
  and the quick view of `focus`.
- `DCF` — the calculator on one company: the three scenarios' values and slider settings, and `mc`,
  the Monte Carlo as the product computes it, read by clicking Bear, Base and Bull. Read each one twice;
  the page updates asynchronously, so a first read can be stale.

Market figures date the film. Every source is listed in the HTML comment at the end of the file;
update it when you change them.

## Beats

The film is authored in film time and plays `STRETCH` (1.3×) slower; the times below, `teaser.beats`
and `seek()` are all real, played time. Change `STRETCH` to change the pace of the whole film at once.

| Beat | Time (s) | What happens |
|---|---|---|
| `field` | 0.00–50.31 | Grid drifts out and back on a sine; ends where it started |
| `cold-open` | 0.00–3.12 | Two tapes of company logos; "For people who invest in companies, not funds." |
| `brand-mark` | 0.00–50.31 | The wolf lands at 0.13, is carried into the sidebar (2.73–3.84), to the top-right as the window leaves (41.08–42.25), and into the end card (45.37–46.54) |
| `window` | 2.67–41.66 | The app window; its highlight follows the section. The AAPL entry opens under Insights at 8.3 and closes as the Chart Builder opens at 18.2 |
| `insights` | 3.25–9.23 | Six cards cascade with prices counting; Radar gainers/losers; the AAPL card is picked at 7.02 |
| `ticker-page` | 8.19–18.20 | The AAPL logo flies into the header; the 1Y price draws, its value counting in the chart header (9.95–11.64); Financials at 12.48: revenue, FCF, net income, then EBITDA, EPS, capex at 15.28 |
| `chart-builder` | 18.20–28.60 | Annual FCF margin for MSFT, META, GOOGL (19.7); Return on equity for KO, PEP, MNST (21.97); Visa alone on TTM, its four metrics with their values beside the chart (25.2–27.6) |
| `earnings` | 28.60–34.84 | Five days of logos pop in by session; MSFT picked 30.88; quick view slides in 31.33; EPS estimate → reported |
| `dcf` | 34.84–41.73 | Adobe: sliders sweep in; the Monte Carlo grows at 36.34; Base → Bear → Bull → Base (37.05–40.56) |
| `more` | 41.47–45.89 | "There's more to discover." Six tiles: Screener, Portfolios, Watchlists, Transcripts, Reverse DCF, JSON export |
| `resolve` | 45.50–50.31 | Wordmark, URL, "Made for the investor in you."; settled by 47.48, held 2.8 s |

## Recording to MP4 at 60 fps

On a 1920×1080 display at 100% scaling, open the film full screen and paused:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --kiosk --user-data-dir="$TEMP/huntr-rec" "http://localhost:4173/huntr-teaser.html?record=1"
```

Start a lossless capture, then click into Chrome and press **R**:

```bash
ffmpeg -f gdigrab -framerate 60 -draw_mouse 0 -offset_x 0 -offset_y 0 -video_size 1920x1080 -i desktop -t 53 -c:v libx264rgb -preset ultrafast -crf 0 raw.mkv
```

Find the start. Paused at 0 the frame is already film frame 0 (the empty field), so look for
where the picture stops being frozen; the tape of marks moves from the first frame after R:

```bash
ffmpeg -i raw.mkv -vf "freezedetect=n=0.0003:d=0.5" -an -f null -
```

Trim to 50.31 s and encode, with `START` = the first `freeze_end` minus 0.017 (one frame):

```bash
ffmpeg -ss START -i raw.mkv -t 50.31 -vf fps=60 -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart huntr-teaser-1080p60.mp4
```

For the vertical cut add `&format=vertical` and capture `-video_size 1080x1920`, which needs a
monitor rotated to portrait. On a landscape screen the page letterboxes the frame smaller.
