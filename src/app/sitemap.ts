import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://huntrvalue.me";

  // Core Pages
  const corePages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/app`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/app/watchlist`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
  ];

  // Example subset of priority programmable SEO pages (Big Tech seed)
  // In a full production env, you might fetch these from Supabase/DB
  // or use Next.js dynamic sitemap.xml features with `generateSitemaps`.
  const seedTickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B"];
  const tickerPages = seedTickers.map((ticker) => ({
    url: `${baseUrl}/symbol/${ticker}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7, // Slightly lower than home/app, but high enough for discovery
  }));

  return [...corePages, ...tickerPages];
}
