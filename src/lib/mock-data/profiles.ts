import type { StockProfile } from "@/types/stock";

/**
 * Mock stock profiles for core tickers in the Huntr universe.
 * Data approximates real-world company information.
 */
export const stockProfiles: StockProfile[] = [
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    industry: "Consumer Electronics",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "Apple designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories. The company also sells digital content, apps, and services.",
    logo_url: "/logos/aapl.svg",
    website: "https://apple.com",
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corporation",
    sector: "Technology",
    industry: "Software — Infrastructure",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "Microsoft develops and licenses consumer and enterprise software, cloud infrastructure, and productivity tools. Key products include Azure, Office 365, Windows, and LinkedIn.",
    logo_url: "/logos/msft.svg",
    website: "https://microsoft.com",
  },
  {
    ticker: "GOOGL",
    name: "Alphabet Inc.",
    sector: "Communication Services",
    industry: "Internet Content & Information",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "Alphabet is the parent company of Google, the world's largest search engine and online advertising platform. Also operates YouTube, Google Cloud, Waymo, and other technology ventures.",
    logo_url: "/logos/googl.svg",
    website: "https://abc.xyz",
  },
  {
    ticker: "AMZN",
    name: "Amazon.com, Inc.",
    sector: "Consumer Cyclical",
    industry: "Internet Retail",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "Amazon is the world's largest online retailer and cloud computing provider via AWS. The company also operates subscription services, advertising, and physical retail stores.",
    logo_url: "/logos/amzn.svg",
    website: "https://amazon.com",
  },
  {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    sector: "Technology",
    industry: "Semiconductors",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "NVIDIA designs GPUs and system-on-chip units for gaming, professional visualization, data center, and automotive markets. A dominant force in AI and accelerated computing.",
    logo_url: "/logos/nvda.svg",
    website: "https://nvidia.com",
  },
  {
    ticker: "META",
    name: "Meta Platforms, Inc.",
    sector: "Communication Services",
    industry: "Internet Content & Information",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "Meta operates the world's largest social media platforms including Facebook, Instagram, WhatsApp, and Messenger. Also invests heavily in virtual reality through Reality Labs.",
    logo_url: "/logos/meta.svg",
    website: "https://meta.com",
  },
  {
    ticker: "TSLA",
    name: "Tesla, Inc.",
    sector: "Consumer Cyclical",
    industry: "Auto Manufacturers",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "Tesla designs, develops, manufactures, and sells electric vehicles, energy generation and storage systems. The company also offers vehicle service, insurance, and autonomous driving software.",
    logo_url: "/logos/tsla.svg",
    website: "https://tesla.com",
  },
  {
    ticker: "JPM",
    name: "JPMorgan Chase & Co.",
    sector: "Financial Services",
    industry: "Banks — Diversified",
    exchange: "NYSE",
    currency: "USD",
    country: "US",
    description:
      "JPMorgan Chase is the largest U.S. bank by assets, providing investment banking, financial services, asset management, and consumer and commercial banking worldwide.",
    logo_url: "/logos/jpm.svg",
    website: "https://jpmorganchase.com",
  },
  {
    ticker: "JNJ",
    name: "Johnson & Johnson",
    sector: "Healthcare",
    industry: "Drug Manufacturers — General",
    exchange: "NYSE",
    currency: "USD",
    country: "US",
    description:
      "Johnson & Johnson is a diversified healthcare company developing pharmaceuticals, medical devices, and consumer health products globally. A Dividend Aristocrat with 60+ years of consecutive increases.",
    logo_url: "/logos/jnj.svg",
    website: "https://jnj.com",
  },
  {
    ticker: "KO",
    name: "The Coca-Cola Company",
    sector: "Consumer Defensive",
    industry: "Beverages — Non-Alcoholic",
    exchange: "NYSE",
    currency: "USD",
    country: "US",
    description:
      "Coca-Cola is the world's largest beverage company, manufacturing and distributing over 200 brands of non-alcoholic beverages globally. A Dividend King with 60+ years of consecutive increases.",
    logo_url: "/logos/ko.svg",
    website: "https://coca-colacompany.com",
  },
  {
    ticker: "COST",
    name: "Costco Wholesale Corporation",
    sector: "Consumer Defensive",
    industry: "Discount Stores",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "Costco operates a chain of membership-only warehouse clubs providing a wide selection of merchandise at low prices. Known for extremely low margins offset by high inventory turnover and membership fees.",
    logo_url: "/logos/cost.svg",
    website: "https://costco.com",
  },
  {
    ticker: "V",
    name: "Visa Inc.",
    sector: "Financial Services",
    industry: "Credit Services",
    exchange: "NYSE",
    currency: "USD",
    country: "US",
    description:
      "Visa operates the world's largest electronic payments network, facilitating digital payments among consumers, merchants, financial institutions, and governments. Known for exceptionally high profit margins.",
    logo_url: "/logos/v.svg",
    website: "https://visa.com",
  },
  {
    ticker: "O",
    name: "Realty Income Corporation",
    sector: "Real Estate",
    industry: "REIT — Retail",
    exchange: "NYSE",
    currency: "USD",
    country: "US",
    description:
      "Realty Income is a real estate investment trust (REIT) that invests in freestanding, single-tenant commercial properties. Known as 'The Monthly Dividend Company' for its monthly dividend payments and 100+ consecutive quarterly increases.",
    logo_url: "/logos/o.svg",
    website: "https://realtyincome.com",
  },
  {
    ticker: "DUOL",
    name: "Duolingo, Inc.",
    sector: "Technology",
    industry: "Education & Training Services",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "Duolingo builds mobile-first language learning and literacy products powered by adaptive AI and gamified learning loops.",
    logo_url: "",
    website: "https://duolingo.com",
  },
  {
    ticker: "CRWD",
    name: "CrowdStrike Holdings, Inc.",
    sector: "Technology",
    industry: "Software — Infrastructure",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "CrowdStrike provides cloud-native endpoint security, threat intelligence, and identity protection through the Falcon platform.",
    logo_url: "",
    website: "https://crowdstrike.com",
  },
  {
    ticker: "PLTR",
    name: "Palantir Technologies Inc.",
    sector: "Technology",
    industry: "Software — Infrastructure",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "Palantir develops data integration and decision intelligence platforms used by commercial enterprises and government agencies.",
    logo_url: "",
    website: "https://palantir.com",
  },
  {
    ticker: "SNOW",
    name: "Snowflake Inc.",
    sector: "Technology",
    industry: "Software — Application",
    exchange: "NYSE",
    currency: "USD",
    country: "US",
    description:
      "Snowflake operates a cloud-native data platform for warehousing, analytics, data sharing, and AI workloads.",
    logo_url: "",
    website: "https://snowflake.com",
  },
  {
    ticker: "DASH",
    name: "DoorDash, Inc.",
    sector: "Consumer Cyclical",
    industry: "Internet Retail",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    description:
      "DoorDash operates on-demand local commerce and delivery logistics across restaurants, grocery, and retail categories.",
    logo_url: "",
    website: "https://doordash.com",
  },
];

/**
 * Quick lookup map: ticker -> StockProfile
 */
export const profilesByTicker: Record<string, StockProfile> = Object.fromEntries(
  stockProfiles.map((p) => [p.ticker, p])
);
