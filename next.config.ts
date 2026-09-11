import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Third parties the app actually loads. Without them listed the policy
      // was blocking our own analytics, the Ko-fi widget and the Tally feedback
      // form — every page logged CSP violations and none of the three ran.
      // script-src-elem is set explicitly: browsers fall back to script-src for
      // element loads only when it is absent, which made the errors confusing.
      [
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "https://www.googletagmanager.com",
        "https://storage.ko-fi.com",
        "https://tally.so",
      ].join(" "),
      [
        "script-src-elem 'self' 'unsafe-inline'",
        "https://www.googletagmanager.com",
        "https://storage.ko-fi.com",
        "https://tally.so",
      ].join(" "),
      // The Ko-fi widget pulls its own webfont from Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      [
        "connect-src 'self'",
        "https://*.supabase.co",
        "https://*.supabase.com",
        "wss://*.supabase.co",
        // GA4 beacons, and the logo lookup in TickerLogo
        "https://www.google-analytics.com",
        "https://*.google-analytics.com",
        "https://*.analytics.google.com",
        "https://www.googletagmanager.com",
        "https://www.allinvestview.com",
        "https://tally.so",
      ].join(" "),
      // Ko-fi and Tally both open their widgets in an iframe
      "frame-src 'self' https://ko-fi.com https://storage.ko-fi.com https://tally.so",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // A self-contained server under .next/standalone, with only the node_modules
  // it actually needs. It is what the Dockerfile copies.
  //
  // Not on Vercel. Contrary to the usual advice, Vercel does not ignore this
  // setting on Next 16: its build step reads `.next/next-server.js.nft.json`,
  // a trace file the standalone output does not emit, and the deployment
  // fails with ENOENT. Vercel sets VERCEL=1 in every build, so the switch is
  // keyed on that.
  output: process.env.VERCEL ? undefined : "standalone",
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

// `ANALYZE=true npm run build` writes an interactive treemap per bundle to
// .next/analyze/. Off by default; it is a diagnostic, not part of the build.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
