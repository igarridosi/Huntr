import type { Metadata } from "next";
import Script from "next/script";
import { Outfit } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/providers/query-provider";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { AuthGateProvider } from "@/providers/auth-gate-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { TallyFeedbackWidget } from "@/components/ui/tally-feedback";
import { PageViews } from "@/components/analytics/page-views";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-satoshi",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://huntrvalue.me"),
  title: {
    default: "Huntr | Tactical Stock Analysis Platform for Value Investors",
    template: "%s | Huntr",
  },
  description:
    "Discover undervalued stocks with Huntr. The ultimate financial terminal offering fundamental metrics, multi-chart overviews, and smart watchlists. Join the Wolf of Value Street.",
  keywords: [
    "financial analysis",
    "stock screener",
    "valuation metrics",
    "ROIC",
    "FCF yield",
    "dividends",
    "watchlist",
    "value investing",
    "financial terminal",
    "DCF models"
  ],
  authors: [{ name: "Huntr" }],
  creator: "Huntr",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://huntrvalue.me",
    siteName: "Huntr",
    title: "Huntr | Tactical Stock Analysis Platform for Value Investors",
    description:
      "Discover undervalued stocks with Huntr. The ultimate financial terminal offering fundamental metrics, multi-chart overviews, and smart watchlists. Join the Wolf of Value Street.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Huntr | Tactical Stock Analysis Platform for Value Investors",
    description:
      "Discover undervalued stocks with Huntr. The ultimate financial terminal offering fundamental metrics, multi-chart overviews, and smart watchlists. Join the Wolf of Value Street.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://huntrvalue.me/#organization",
        "name": "Huntr",
        "url": "https://huntrvalue.me/",
        "logo": "https://huntrvalue.me/icon.png",
        "sameAs": [
          "https://twitter.com/huntrvalue",
          "https://linkedin.com/company/huntrvalue"
        ],
        "slogan": "The Wolf of Value Street"
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://huntrvalue.me/#software",
        "name": "Huntr",
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Windows, macOS, Android, iOS, Web",
        "url": "https://huntrvalue.me/",
        "creator": {
          "@id": "https://huntrvalue.me/#organization"
        },
        "description": "Tactical financial analysis platform offering fundamental metrics, multi-chart overviews, and smart watchlists for demanding value investors.",
        "offers": {
          "@type": "Offer",
          "price": "0.00",
          "priceCurrency": "USD",
          "description": "Free tier available"
        }
      },
      {
        "@type": "FAQPage",
        "@id": "https://huntrvalue.me/#faq",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is Huntr?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Huntr is a tactical financial analysis platform designed specifically for value investors. It provides deep fundamental metrics, smart watchlists, and multi-chart views."
            }
          },
          {
            "@type": "Question",
            "name": "Does Huntr offer DCF (Discounted Cash Flow) models?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes, Huntr provides tools for DCF assumptions, Monte Carlo simulations, and EPS Multiple models to help you find the fair value of an asset."
            }
          }
        ]
      }
    ]
  };

  return (
    /* suppressHydrationWarning: the inline FOWT script may modify className
       before React hydrates — suppressing the mismatch warning is correct here. */
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* ── Anti-FOWT script ──────────────────────────────────────────────
            Runs synchronously before the first paint so the correct theme
            class is applied before any CSS is rendered.
            Dark is the default (no class needed); only "light" is added.
            The landing ("/") is always dark: see DARK_ONLY_PATHS.
        ──────────────────────────────────────────────────────────────── */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(location.pathname==='/')return;var t=localStorage.getItem('huntr-theme');var s=!t&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';if((t||s)==='light')document.documentElement.classList.add('light');}catch(e){}})();`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${outfit.variable} ${geistMono.variable} antialiased bg-wolf-black text-snow-peak`}
      >
        {/* JSON-LD lives in the body, not the head. Crawlers accept it anywhere
            in the document, while <head> is exactly where browser extensions
            inject their own scripts — and an injected sibling shifts the
            children React expects, producing a hydration mismatch we cannot
            fix from here. Out of the head, that class of clash goes away. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaMarkup) }}
        />
        <ThemeProvider>
          <SupabaseProvider>
            <QueryProvider>
              <AuthGateProvider>
                {/* Google Analytics. lazyOnload defers the 170 KB gtag bundle
                    until the page is idle, so it no longer competes with
                    hydration on a throttled connection. Page views still fire:
                    gtag('config') queues them until the script arrives. */}
                <Script
                  src="https://www.googletagmanager.com/gtag/js?id=G-ZKVECX6NY1"
                  strategy="lazyOnload"
                />
                <Script id="gtag-init" strategy="lazyOnload">
                  {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-ZKVECX6NY1');`}
                </Script>
                {/* First-party page views, recorded server-side through a
                    Server Action — see src/app/actions/analytics.ts. */}
                <PageViews />
                {children}
                <TallyFeedbackWidget />
              </AuthGateProvider>
            </QueryProvider>
          </SupabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
