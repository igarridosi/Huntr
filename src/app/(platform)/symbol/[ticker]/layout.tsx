import { Metadata } from "next";
import TickerClientLayout from "./client-layout";
// We don't have a direct server-side function to get the company name yet. 
// But as a fallback we can use the Ticker symbol, or later integrate a server-side fetch from supabase or an API.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const ticker = (resolvedParams.ticker ?? "").toUpperCase();

  return {
    title: `${ticker} Stock Overview, Financials & Valuation`,
    description: `Deep tactical financial analysis for ${ticker}. View fundamental metrics, real-time charts, and calculate fair value with customized DCF models on Huntr.`,
    alternates: {
      canonical: `https://huntrvalue.me/symbol/${ticker}`,
    },
    openGraph: {
      title: `${ticker} Stock Price & Fundamental Analysis | Huntr`,
      description: `Analyze ${ticker} like a pro value investor. Access institutional-grade metrics, DCF valuations, and multi-chart views.`,
      url: `https://huntrvalue.me/symbol/${ticker}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${ticker} Key Metrics & Valuation`,
      description: `Find out the true value of ${ticker} using our advanced DCF models and real-time fundamentals.`,
    },
  };
}

export default async function TickerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ticker: string }>;
}) {
  return (
    <TickerClientLayout>
      {children}
    </TickerClientLayout>
  );
}
