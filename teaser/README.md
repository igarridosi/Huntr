# Huntr teaser

`huntr-teaser.html` is a 32.8-second release film in one self-contained file: no build step, no
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
- `CHART` — four series of 40 quarters; `ttm` must be the ratio of the four-quarter sums, the way
  the Chart Builder computes a ratio's TTM.
- `EARNINGS` — one week of the calendar (first two tickers per session and the session totals),
  and the quick view of `focus`.
- `DCF` — the calculator on one company: the three scenarios' values and slider settings, and `mc`,
  the Monte Carlo as the product computes it, read by clicking Bear, Base and Bull. Read each one twice;
  the page updates asynchronously, so a first read can be stale.

Market figures date the film. Every source is listed in the HTML comment at the end of the file;
update it when you change them.

## Beats

| Beat | Time (s) | What happens |
|---|---|---|
| `field` | 0.00–32.80 | Grid drifts out and back on a sine; ends where it started |
| `cold-open` | 0.00–2.40 | Two tapes of company logos; "For people who invest in companies, not funds." |
| `brand-mark` | 0.00–32.80 | The wolf lands at 0.1, is carried into the sidebar at 2.1–2.95, out to the end card at 29.0–29.9 |
| `window` | 2.05–29.45 | The app window; its highlight follows the section (Insights → AAPL 6.5 → Chart Builder 14.0 → Earnings 19.4 → DCF 24.2) |
| `insights` | 2.50–7.10 | Six cards cascade with prices counting; Radar gainers/losers with bars; the AAPL card is picked at 5.4 |
| `ticker-page` | 6.30–14.00 | The AAPL logo flies into the page header (6.3–7.1); 1Y price draws with its value below the tip (7.65–8.95); Financials at 9.6: revenue, FCF, net income; then EBITDA, EPS, capex at 11.75 — never more than three |
| `chart-builder` | 14.00–19.40 | Four companies land; the hold slides to FCF margin; lines draw with a pill at each end; Quarterly → TTM at 17.0, curves smooth point by point to 18.37 |
| `earnings` | 19.40–24.20 | Five days of logos pop in by session with counts; MSFT picked 21.15; quick view slides in 21.5; EPS estimate → reported |
| `dcf` | 24.20–29.50 | Adobe: sliders sweep in; Monte Carlo grows at 25.35; Base → Bear 25.9–26.5 (delta turns red) → Bull 26.9–27.7 → Base 28.0–28.6, the orange line riding the distribution |
| `resolve` | 29.10–32.80 | Wordmark, URL, one line; settled by 30.62, held 2.2 s |

## Recording to MP4 at 60 fps

On a 1920×1080 display at 100% scaling, open the film full screen and paused:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --kiosk --user-data-dir="$TEMP/huntr-rec" "http://localhost:4173/huntr-teaser.html?record=1"
```

Start a lossless capture, then click into Chrome and press **R**:

```bash
ffmpeg -f gdigrab -framerate 60 -draw_mouse 0 -offset_x 0 -offset_y 0 -video_size 1920x1080 -i desktop -t 36 -c:v libx264rgb -preset ultrafast -crf 0 raw.mkv
```

Find the start. Paused at 0 the frame is already film frame 0 (the empty field), so look for
where the picture stops being frozen; the tape of marks moves from the first frame after R:

```bash
ffmpeg -i raw.mkv -vf "freezedetect=n=0.0003:d=0.5" -an -f null -
```

Trim to 32.8 s and encode, with `START` = the first `freeze_end` minus 0.017 (one frame):

```bash
ffmpeg -ss START -i raw.mkv -t 32.8 -vf fps=60 -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart huntr-teaser-1080p60.mp4
```

For the vertical cut add `&format=vertical` and capture `-video_size 1080x1920`, which needs a
monitor rotated to portrait. On a landscape screen the page letterboxes the frame smaller.
