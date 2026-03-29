import type { Metadata } from "next";
import Script from "next/script";
import { Outfit } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/providers/query-provider";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { TallyFeedbackWidget } from "@/components/ui/tally-feedback";
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
  icons: {
    icon: [
      { url: "/logo/HunterLogoCut.png", type: "image/png" },
    ],
    shortcut: ["/logo/HunterLogoCut.png"],
    apple: [
      { url: "/logo/HunterLogoCut.png" },
    ],
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
        "logo": "https://huntrvalue.me/logo/HunterLogoCut.png",
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
        "operatingSystem": "WebBrowser",
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
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaMarkup) }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${outfit.variable} ${geistMono.variable} antialiased bg-wolf-black text-snow-peak`}
      >
        <SupabaseProvider>
          <QueryProvider>
            {/* Google Analytics */}
            <Script
              async
              src="https://www.googletagmanager.com/gtag/js?id=G-ZKVECX6NY1"
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-ZKVECX6NY1');`}
            </Script>
            {children}
            <TallyFeedbackWidget />
          </QueryProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
