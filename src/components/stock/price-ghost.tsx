/**
 * While the first prices load: the outline of a price chart, breathing
 * faintly, in the space the chart will take. A flat grey box the size of
 * the card read as broken; a ghost of the chart reads as "a chart, coming".
 */
const GHOST_PATH =
  "M0 70 L8 66 L16 68 L24 60 L32 63 L40 55 L48 58 L56 50 L64 54 L72 47 L80 52 L88 44 L96 40 L104 45 L112 38 L120 42 L128 34 L136 37 L144 30 L152 33 L160 26 L168 31 L176 24 L184 28 L192 20 L200 23";

export function PriceGhost() {
  return (
    <div aria-hidden className="relative h-full w-full overflow-hidden rounded-lg">
      <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="price-ghost h-full w-full">
        <path d={`${GHOST_PATH} L200 80 L0 80 Z`} className="fill-snow-peak/[0.04]" />
        <path d={GHOST_PATH} className="fill-none stroke-snow-peak/20" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

