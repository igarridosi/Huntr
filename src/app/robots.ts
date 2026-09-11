import type { MetadataRoute } from "next";

/**
 * Served at /robots.txt by the App Router.
 *
 * Production used to answer this path with the Next 404 page, which crawlers
 * treat as "no rules" — so the API routes and the account settings page were
 * as crawlable as the landing page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/app/settings"],
    },
    sitemap: "https://huntrvalue.me/sitemap.xml",
  };
}
