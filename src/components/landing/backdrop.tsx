/**
 * The header's light, continued down the page as one surface: a single layer
 * the width of the viewport, from the lower part of the hero (which fades to
 * transparent over it) to the end of the footer (whose illustration fades in
 * over it), so the colour flows from the header to the last line with no
 * edges, seams or empty corners. It repeats the header's logic — warm orange rising from one edge,
 * turning into the teal-blue band, sinking into black — alternating sides
 * on the way down. The waves overlap, so there is no dead stretch between
 * them. Positions and sizes are percentages of the layer, so it stretches
 * with however long the page is.
 *
 * Static: no animation, no scroll work. The grain on top dithers the soft
 * gradients, which on a dark ground would otherwise band.
 */

type Side = "left" | "right";

/** Wave centres, as % of the layer's height, and the edge each comes from. */
const WAVES: { y: number; side: Side; warmth: number }[] = [
  { y: 6, side: "left", warmth: 0.8 },
  { y: 16, side: "right", warmth: 0.85 },
  { y: 29, side: "left", warmth: 0.9 },
  { y: 42, side: "right", warmth: 0.85 },
  { y: 55, side: "left", warmth: 0.9 },
  { y: 68, side: "right", warmth: 0.85 },
  { y: 81, side: "left", warmth: 0.9 },
  { y: 94, side: "right", warmth: 0.75 },
];

/**
 * A radial fall-off with an eased edge. A plain colour-to-transparent stop
 * fades linearly and stops dead at the ellipse's rim, and on a dark ground
 * the eye reads that change of slope as a line. These stops follow a bell
 * curve instead, so the light thins out with no rim at all.
 */
const FALLOFF: [number, number][] = [
  [0, 1],
  [12, 0.94],
  [25, 0.8],
  [38, 0.6],
  [50, 0.42],
  [62, 0.26],
  [74, 0.13],
  [86, 0.05],
  [100, 0],
];

function glow(size: string, at: string, rgb: string, alpha: number) {
  const stops = FALLOFF.map(([pos, k]) => `rgba(${rgb},${(alpha * k).toFixed(4)}) ${pos}%`).join(", ");
  return `radial-gradient(ellipse ${size} at ${at}, ${stops})`;
}

function wave({ y, side, warmth }: (typeof WAVES)[number]) {
  const edge = side === "left" ? 0 : 100;
  const inward = side === "left" ? 22 : 78;
  return [
    // The warm core, half outside the viewport so it rises from the edge.
    glow("38% 7%", `${edge}% ${y}%`, "255,150,80", 0.32 * warmth),
    // The teal-blue band it turns into, further in and a little lower.
    glow("62% 10%", `${inward}% ${y + 2.5}%`, "44,98,115", 0.34),
    // A deeper teal veil, wide, so neighbouring waves meet in colour, not black.
    glow("90% 13%", `${side === "left" ? 35 : 65}% ${y + 4}%`, "23,58,68", 0.32),
  ];
}

/**
 * Where the hero ends (70svh into this layer: it starts 130svh down a 200svh
 * hero), its own wave picks up: warm on the left, as the header's is, so the
 * light seen fading out of the scene is the light that goes on.
 */
const SEAM = [
  glow("48% 520px", "0% 70svh", "255,150,80", 0.34),
  glow("70% 680px", "24% calc(70svh + 160px)", "44,98,115", 0.36),
  glow("95% 820px", "40% calc(70svh + 320px)", "23,58,68", 0.3),
];

const BACKGROUND = [...SEAM, ...WAVES.flatMap(wave)].join(", ");

/**
 * The layer's own top is under the hero's opaque part, but while the hero is
 * pinned that top passes through its fading lower edge: an eased fade-in,
 * complete well before the hero ends, keeps it from showing as a line.
 */
const FADE_IN =
  "linear-gradient(to bottom, rgba(0,0,0,0) 0, rgba(0,0,0,0.05) 8svh, rgba(0,0,0,0.2) 16svh, rgba(0,0,0,0.45) 26svh, rgba(0,0,0,0.72) 36svh, rgba(0,0,0,0.92) 46svh, black 56svh)";

export function LandingBackdrop() {
  return (
    // Starts 130svh down the page, 70svh before the end of the 200svh hero;
    // with reduced motion the hero is one screen, so 30svh.
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 top-[130svh] -z-10 motion-reduce:top-[30svh]"
      style={{
        maskImage: FADE_IN,
        WebkitMaskImage: FADE_IN,
      }}
    >
      <div className="absolute inset-0" style={{ backgroundImage: BACKGROUND }} />
      <div className="huntr-grain absolute inset-0 opacity-60 mix-blend-soft-light" />
    </div>
  );
}
