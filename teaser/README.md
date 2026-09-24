# Huntr teaser

`huntr-teaser.html` is a 27.9-second release film in one self-contained file: no build step, no
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
`duration`, `frames`, `beats`, `still` and `ready` (resolves once fonts are in).

## Checking frames

**A hidden browser pane freezes animation.** The desktop app's browser pane, a background tab or
a window behind another window stops `requestAnimationFrame`, so watching it tells you nothing.
Verify frames with `seek()`, not by eye:

```js
await teaser.ready; teaser.seek(16180);   // the stillness before the failing check
```

Every frame is a pure function of time: `seek(t)` renders the same pixels however you got there.

## Filling CONFIG

Everything on screen comes from the `CONFIG` object at the top of the script.

- `LOGOS` — `{ "MSFT": "https://…/msft.svg" }`. Empty by default, so every company shows the
  app's monogram tile (its first two letters). Adding a real company's logo to a promotional film
  is a trademark decision; make it deliberately.
- `ILLUSTRATIVE` — the valuation scene. It is labelled "Illustrative figures" on screen and must
  stay a made-up company. A film that published a value per share for a real ticker would
  contradict what the film is about. `price`, `bear`, `base` and `bull` drive the counter, the
  delta chip and the three Monte Carlo centres.
- `CHART` — four series of 40 quarters: `q` is each quarter's FCF margin, `ttm` is the same
  length and must be the ratio of the four-quarter sums (ΣFCF / Σrevenue). That is how the Chart
  Builder computes a ratio's TTM (`src/lib/chart-builder/resolve.ts`); it is not a mean of four
  margins. `from`/`to` are the first and last quarter-end dates.
- `REAL` — the company whose value is withheld. `figures` are three numbers from one filing,
  `accession` is that filing, and `checks` are the product's own five results for the ticker,
  read off huntrvalue.me (DCF Calculator → ticker → Auto-Populate). Copy them as they are: they
  change with the data, and a pass the product did not give is a claim the film cannot make.
- `SCREENER` — ticker, name, and the twelve most recent TTM values (the last one is shown).

Every real figure has to be reproducible from an SEC accession. List the sources in the HTML
comment at the end of the file when you change them. The current ones were pulled from
`data.sec.gov` XBRL company facts on 2026-09-25, and the method is written down there.

## Beats

| Beat | Time (s) | What happens |
|---|---|---|
| `field` | 0.00–27.90 | Grid drifts out and back on a sine; paused during the stillness; ends where it started |
| `cold-open` | 0.00–2.70 | A value ticks and lands; a tape of company marks runs; "The number is the easy part." |
| `mark` | 2.40–24.70 | Persistent HUNTR · huntrvalue.me, until the end card takes over |
| `chart-builder` | 2.70–8.70 | Four companies land 3.15–3.36 · the hold slides under FCF margin 4.15 · lines draw 4.7 with a pill at each live end · Quarterly → TTM at 6.2, curves smooth point by point 6.35–7.57 |
| `valuation` | 8.70–14.20 | Knob Base → Bear 10.6 → Bull 11.6–12.4 → Base 12.7–13.3; value counts through, delta chip flips at the price, the fan and the Monte Carlo follow |
| `failing-check` | 14.20–18.50 | JPM: four checks resolve in a run 15.50–16.03 · **still 16.03–16.33** · Usable margin record fails 16.33 on a 700 ms beat · "Withheld" 16.70 |
| `real-panel` | 14.20–21.10 | The JPM panel: in from the right at 14.3, out to the right at 20.7 |
| `provenance` | 18.10–21.10 | Three stamps under the figures already on screen: 18.5, 19.0, 19.5 |
| `screener` | 21.10–24.50 | Eleven companies with marks and TTM trend flow past; 800+ counts up |
| `resolve` | 24.30–27.90 | Wordmark, URL, one line; settled by 25.66, held 2.2 s |

## Recording to MP4 at 60 fps

On a 1920×1080 display at 100% scaling, open the film full screen and paused:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --kiosk --user-data-dir="$TEMP/huntr-rec" "http://localhost:4173/huntr-teaser.html?record=1"
```

Start a lossless capture, then click into Chrome and press **R**:

```bash
ffmpeg -f gdigrab -framerate 60 -draw_mouse 0 -offset_x 0 -offset_y 0 -video_size 1920x1080 -i desktop -t 31 -c:v libx264rgb -preset ultrafast -crf 0 raw.mkv
```

Find the start. Paused at 0 the frame is already film frame 0 (the empty field), so look for
where the picture stops being frozen; the tape of marks moves from the first frame after R:

```bash
ffmpeg -i raw.mkv -vf "freezedetect=n=0.0003:d=0.5" -an -f null -
```

Trim to 27.9 s and encode, with `START` = the first `freeze_end` minus 0.017 (one frame):

```bash
ffmpeg -ss START -i raw.mkv -t 27.9 -vf fps=60 -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart huntr-teaser-1080p60.mp4
```

For the vertical cut add `&format=vertical` and capture `-video_size 1080x1920`, which needs a
monitor rotated to portrait. On a landscape screen the page letterboxes the frame smaller.
