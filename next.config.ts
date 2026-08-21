import type { NextConfig } from "next";

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

export default nextConfig;
