import { Metadata } from "next";
import TickerClientLayout from "./client-layout";
import Script from "next/script";
import { getStockProfile, getStockQuote } from "@/lib/api";

// Proxy function to get real API data
async function getTickerData(ticker: string) {
  const [profile, quote] = await Promise.all([
    getStockProfile(ticker).catch(() => null),
    getStockQuote(ticker).catch(() => null),
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

  const formatPrice = (val: number) => val.toFixed(2);
  const formatChange = (val: number) => (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2));

  return {
    title: `${tickerData.name} (${ticker}) | $${formatPrice(tickerData.price)} (${formatChange(tickerData.changePercent)}%)`,
    description: `Current quote for ${tickerData.name} (${ticker}) is $${formatPrice(tickerData.price)}. View deep financial metrics (P/E ${tickerData.peRatio}), real-time charts, and calculate fair value on Huntr.`,
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

  // Financial Data Schema JSON-LD Construction (Using Dataset to avoid validation errors)
  const financialQuoteSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": `${quoteData.name} (${quoteData.ticker}) Financial Data`,
    "description": `Real-time financial quote and valuation metrics for ${quoteData.name} (${quoteData.ticker}).`,
    "url": `https://huntrvalue.me/symbol/${quoteData.ticker}`,
    "keywords": [quoteData.ticker, "Stock Price", quoteData.exchange, "Financial Data"],
    "creator": {
      "@type": "Organization",
      "name": "Huntr"
    },
    "variableMeasured": [
      {
        "@type": "PropertyValue",
        "name": "Price",
        "value": quoteData.price,
        "unitText": quoteData.currency
      },
      {
        "@type": "PropertyValue",
        "name": "Price Change",
        "value": quoteData.change,
        "unitText": quoteData.currency
      },
      {
        "@type": "PropertyValue",
        "name": "Percent Change",
        "value": quoteData.changePercent,
        "unitText": "%"
      },
      {
        "@type": "PropertyValue",
        "name": "Market Cap",
        "value": quoteData.marketCap,
        "unitText": quoteData.currency
      },
      {
        "@type": "PropertyValue",
        "name": "P/E Ratio",
        "value": quoteData.peRatio,
        "measurementTechnique": "Financial Ratio"
      }
    ]
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
