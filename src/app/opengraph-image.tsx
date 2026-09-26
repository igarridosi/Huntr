import { ImageResponse } from "next/og";
import { ARROW, WOLF } from "@/components/ui/brand-mark";

export const alt = "Huntr, the Wolf of Value Street";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card shown when a link is shared (X, LinkedIn, Slack, search): the
 * vector mark and the wordmark on the product's dark surface, drawn at build
 * time from the same paths as the favicon, so it is always sharp.
 */
/** Outfit, the product's face, fetched as TTF for just the glyphs drawn; the default face if Google is unreachable. */
async function outfit(weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Outfit:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

const TAGLINE = "Stock analysis for value investors";

export default async function OpenGraphImage() {
  const [bold, regular] = await Promise.all([outfit(700, "HUNTR"), outfit(400, TAGLINE)]);
  const fonts = [
    ...(bold ? [{ name: "Outfit", data: bold, weight: 700 as const }] : []),
    ...(regular ? [{ name: "Outfit", data: regular, weight: 400 as const }] : []),
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(ellipse at 50% 40%, #16262a 0%, #0B1416 70%)",
          color: "#F2F4F3",
          fontFamily: "Outfit",
        }}
      >
        <svg width="360" height="276" viewBox="54 30 470 361">
          <path fill="#F2F4F3" fillRule="evenodd" d={WOLF} />
          <path fill="#E8682A" fillRule="evenodd" d={ARROW} />
        </svg>
        <div style={{ marginTop: 28, fontSize: 104, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }}>HUNTR</div>
        <div style={{ marginTop: 18, fontSize: 30, color: "#8C9DA1", letterSpacing: 1 }}>
          {TAGLINE}
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
