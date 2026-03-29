import { Metadata } from "next";
import TickerClientLayout from "./client-layout";
import Script from "next/script";
import { getProfile, getPrice } from "@/lib/api/yahoo";

// Proxy function to get real API data
async function getTickerData(ticker: string) {
  const [profile, quote] = await Promise.all([
    getProfile(ticker).catch(() => null),
    getPrice(ticker).catch(() => null),
  ]);

  return {
    ticker,
    name: profile?.name || `${ticker} Corp`,
    price: quote?.price || 0,
    currency: profile?.currency || "USD",
    exchange: profile?.exchange || "NASDAQ",
    change: quote?.day_change || 0,
    changePercent: quote?.day_change_percent || 0,
    marketCap: quote?.market_cap || 0,
    peRatio: quote?.pe_ratio || 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const ticker = (resolvedParams.ticker ?? "").toUpperCase();
  const tickerData = await getTickerData(ticker);

  return {
    title: `${tickerData.name} (${ticker}) | Stock Price $${tickerData.price} & Valuation`,
    description: `Deep tactical financial analysis for ${tickerData.name} (${ticker}). View fundamental metrics (P/E ${tickerData.peRatio}), real-time charts, and calculate fair value on Huntr.`,
    alternates: {
      canonical: `https://huntrvalue.me/symbol/${ticker}`,
    },
    openGraph: {
      title: `${tickerData.name} (${ticker}) Stock Price & Fundamental Analysis | Huntr`,
      description: `Analyze ${tickerData.name} like a pro value investor. Access institutional-grade metrics, DCF valuations, and multi-chart views.`,
      url: `https://huntrvalue.me/symbol/${ticker}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${tickerData.name} (${ticker}) Key Metrics & Valuation`,
      description: `Find out the true value of ${tickerData.name} using our advanced DCF models and real-time fundamentals.`,
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
  const resolvedParams = await params;
  const ticker = (resolvedParams.ticker ?? "").toUpperCase();
  const quoteData = await getTickerData(ticker);

  // FinancialQuote Schema JSON-LD Construction
  const financialQuoteSchema = {
    "@context": "https://schema.org",
    "@type": "FinancialQuote", // Or a composite of FinancialProduct / Dataset used for stock snippets
    "tickerSymbol": quoteData.ticker,
    "exchange": quoteData.exchange,
    "price": quoteData.price,
    "priceCurrency": quoteData.currency,
    "priceChange": quoteData.change,
    "priceChangePercent": quoteData.changePercent,
    "quoteTime": quoteData.updatedAt,
    "marketCap": quoteData.marketCap,
    "peRatio": quoteData.peRatio,
    "url": `https://huntrvalue.me/symbol/${quoteData.ticker}`
  };

  return (
    <>
      <Script
        id={`financial-quote-schema-${ticker}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(financialQuoteSchema) }}
      />
      
      <TickerClientLayout>
        {children}
      </TickerClientLayout>
    </>
  );
}
