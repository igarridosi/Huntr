# Huntr teaser

`huntr-teaser.html` is a 31.2-second release film in one self-contained file: no build step, no
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
- `DCF` — the calculator on one company: the three scenarios' values, margins of safety,
  enterprise values and slider settings, read by clicking Bear, Base and Bull. Read each one twice;
  the page updates asynchronously, so a first read can be stale.

Market figures date the film. Every source is listed in the HTML comment at the end of the file;
update it when you change them.

## Beats

| Beat | Time (s) | What happens |
|---|---|---|
| `field` | 0.00–31.20 | Grid drifts out and back on a sine; ends where it started |
| `cold-open` | 0.00–2.40 | Two tapes of company logos run in opposite directions; "For people who invest in companies, not funds." |
| `brand-mark` | 0.00–31.20 | The wolf lands at 0.1, is carried into the sidebar at 2.1–2.95, carried out to the end card at 27.4–28.3 |
| `window` | 2.05–27.90 | The app window; its sidebar highlight follows the section (Insights → AAPL 6.5 → Chart Builder 12.4 → Earnings 17.8 → DCF 22.6) |
| `insights` | 2.50–7.10 | Six cards cascade with prices counting; Radar gainers/losers with bars; the AAPL card is picked at 5.4 |
| `ticker-page` | 6.30–12.40 | The AAPL logo flies from its card to the page header (6.3–7.1); 52W bar; 1Y price draws with its value on the tip (7.65–8.95); Overview → Financials at 9.6, ten years of bars grow |
| `chart-builder` | 12.40–17.80 | Four companies land; hold slides to FCF margin; lines draw with a pill at each end; Quarterly → TTM at 15.4, curves smooth point by point to 16.77 |
| `earnings` | 17.80–22.60 | Five days of logos pop in by session with counts; MSFT picked 19.55; quick view slides in 19.9; EPS dots estimate → reported |
| `dcf` | 22.60–27.90 | Adobe: sliders sweep in; Base → Bear 24.3–24.9 (the delta turns red) → Bull 25.3–26.1 → Base 26.4–27.0 |
| `resolve` | 27.50–31.20 | Wordmark, URL, one line; settled by 29.02, held 2.2 s |

## Recording to MP4 at 60 fps

On a 1920×1080 display at 100% scaling, open the film full screen and paused:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --kiosk --user-data-dir="$TEMP/huntr-rec" "http://localhost:4173/huntr-teaser.html?record=1"
```

Start a lossless capture, then click into Chrome and press **R**:

```bash
ffmpeg -f gdigrab -framerate 60 -draw_mouse 0 -offset_x 0 -offset_y 0 -video_size 1920x1080 -i desktop -t 34 -c:v libx264rgb -preset ultrafast -crf 0 raw.mkv
```

Find the start. Paused at 0 the frame is already film frame 0 (the empty field), so look for
where the picture stops being frozen; the tape of marks moves from the first frame after R:

```bash
ffmpeg -i raw.mkv -vf "freezedetect=n=0.0003:d=0.5" -an -f null -
```

Trim to 31.2 s and encode, with `START` = the first `freeze_end` minus 0.017 (one frame):

```bash
ffmpeg -ss START -i raw.mkv -t 31.2 -vf fps=60 -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart huntr-teaser-1080p60.mp4
```

For the vertical cut add `&format=vertical` and capture `-video_size 1080x1920`, which needs a
monitor rotated to portrait. On a landscape screen the page letterboxes the frame smaller.
