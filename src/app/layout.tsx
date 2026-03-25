import type { Metadata } from "next";
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
    default: "Huntr — The Wolf of Value Street",
    template: "%s | Huntr",
  },
  description:
    "Tactical financial analysis platform. Fundamental metrics, multi-chart overviews, and smart watchlists for demanding value investors.",
  keywords: [
    "financial analysis",
    "stock screener",
    "valuation metrics",
    "ROIC",
    "FCF yield",
    "dividends",
    "watchlist",
    "value investing",
  ],
  authors: [{ name: "Huntr" }],
  creator: "Huntr",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://huntr.app",
    siteName: "Huntr",
    title: "Huntr — The Wolf of Value Street",
    description:
      "Tactical financial analysis for demanding investors. Metrics, charts, and watchlists — all in one premium dark interface.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Huntr — The Wolf of Value Street",
    description:
      "Hunt for value with precision. Financial analysis platform for investors.",
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
  return (
    <html lang="en" className="dark">
      <body
        suppressHydrationWarning
        className={`${outfit.variable} ${geistMono.variable} antialiased bg-wolf-black text-snow-peak`}
      >
        <SupabaseProvider>
          <QueryProvider>
            {children}
            <TallyFeedbackWidget />
          </QueryProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
