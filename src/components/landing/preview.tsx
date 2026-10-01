import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Repeat2,
  TrendingUp,
} from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";

type Row = {
  ticker: string;
  name: string;
  domain: string;
  value: string;
  /** Second figure, under the value. */
  detail: string;
  /** 0–1: how strongly the row scores on the cluster's signal. */
  strength: number;
};

type Cluster = {
  title: string;
  icon: LucideIcon;
  iconClass: string;
  /** Tone of the value column. */
  tone: "up" | "down" | "neutral";
  rows: Row[];
};

/*
 * Illustrative rows: plausible for each cluster, not a live feed. The app
 * fills the same panels from market data.
 */
const clusters: Cluster[] = [
  {
    title: "Top Gainers",
    icon: ArrowUpRight,
    iconClass: "text-bullish",
    tone: "up",
    rows: [
      { ticker: "PLTR", name: "Palantir", domain: "palantir.com", value: "+8.9%", detail: "$31.42", strength: 1 },
      { ticker: "AMD", name: "AMD", domain: "amd.com", value: "+5.2%", detail: "$164.80", strength: 0.6 },
      { ticker: "CRWD", name: "CrowdStrike", domain: "crowdstrike.com", value: "+4.1%", detail: "$342.15", strength: 0.47 },
      { ticker: "SHOP", name: "Shopify", domain: "shopify.com", value: "+3.6%", detail: "$78.06", strength: 0.4 },
    ],
  },
  {
    title: "Top Losers",
    icon: ArrowDownRight,
    iconClass: "text-bearish",
    tone: "down",
    rows: [
      { ticker: "INTC", name: "Intel", domain: "intel.com", value: "−6.8%", detail: "$21.37", strength: 1 },
      { ticker: "NKE", name: "Nike", domain: "nike.com", value: "−5.1%", detail: "$73.90", strength: 0.75 },
      { ticker: "BA", name: "Boeing", domain: "boeing.com", value: "−4.3%", detail: "$158.22", strength: 0.63 },
      { ticker: "PFE", name: "Pfizer", domain: "pfizer.com", value: "−3.2%", detail: "$26.41", strength: 0.47 },
    ],
  },
  {
    title: "Income Leaders",
    icon: DollarSign,
    iconClass: "text-golden-hour",
    tone: "neutral",
    rows: [
      { ticker: "MO", name: "Altria", domain: "altria.com", value: "7.9%", detail: "yield", strength: 1 },
      { ticker: "VZ", name: "Verizon", domain: "verizon.com", value: "6.4%", detail: "yield", strength: 0.81 },
      { ticker: "T", name: "AT&T", domain: "att.com", value: "5.6%", detail: "yield", strength: 0.71 },
      { ticker: "O", name: "Realty Income", domain: "realtyincome.com", value: "5.4%", detail: "yield", strength: 0.68 },
    ],
  },
  {
    title: "Unusual Volume",
    icon: AlertTriangle,
    iconClass: "text-sunset-orange",
    tone: "neutral",
    rows: [
      { ticker: "NVDA", name: "NVIDIA", domain: "nvidia.com", value: "3.2×", detail: "avg vol", strength: 1 },
      { ticker: "TSLA", name: "Tesla", domain: "tesla.com", value: "2.7×", detail: "avg vol", strength: 0.84 },
      { ticker: "SOFI", name: "SoFi", domain: "sofi.com", value: "2.4×", detail: "avg vol", strength: 0.75 },
      { ticker: "UBER", name: "Uber", domain: "uber.com", value: "2.1×", detail: "avg vol", strength: 0.66 },
    ],
  },
  {
    title: "Buyback Leaders",
    icon: Repeat2,
    iconClass: "text-bullish",
    tone: "neutral",
    rows: [
      { ticker: "AAPL", name: "Apple", domain: "apple.com", value: "3.4%", detail: "buyback yield", strength: 1 },
      { ticker: "GOOGL", name: "Alphabet", domain: "abc.xyz", value: "2.6%", detail: "buyback yield", strength: 0.76 },
      { ticker: "META", name: "Meta", domain: "meta.com", value: "2.1%", detail: "buyback yield", strength: 0.62 },
      { ticker: "ORCL", name: "Oracle", domain: "oracle.com", value: "1.8%", detail: "buyback yield", strength: 0.53 },
    ],
  },
  {
    title: "Breaking 52W High",
    icon: TrendingUp,
    iconClass: "text-sunset-orange",
    tone: "up",
    rows: [
      { ticker: "COST", name: "Costco", domain: "costco.com", value: "+1.8%", detail: "over prior high", strength: 1 },
      { ticker: "JPM", name: "JPMorgan", domain: "jpmorganchase.com", value: "+1.2%", detail: "over prior high", strength: 0.67 },
      { ticker: "AVGO", name: "Broadcom", domain: "broadcom.com", value: "+0.9%", detail: "over prior high", strength: 0.5 },
      { ticker: "LLY", name: "Eli Lilly", domain: "lilly.com", value: "+0.4%", detail: "over prior high", strength: 0.22 },
    ],
  },
];

const toneClass = { up: "text-bullish", down: "text-bearish", neutral: "text-golden-hour" } as const;
const barClass = { up: "bg-bullish/10", down: "bg-bearish/10", neutral: "bg-sunset-orange/10" } as const;

function RadarCard({ cluster }: { cluster: Cluster }) {
  const Icon = cluster.icon;
  return (
    <article className="huntr-grain group rounded-2xl border border-wolf-border/50 bg-wolf-surface/40 p-4 transition-colors duration-300 hover:border-sunset-orange/35">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-mist">{cluster.title}</h3>
        <Icon className={`h-4 w-4 ${cluster.iconClass}`} />
      </div>

      <ol className="space-y-1.5">
        {cluster.rows.map((row) => (
          <li key={row.ticker} className="relative overflow-hidden rounded-lg border border-wolf-border/35 bg-wolf-black/40">
            {/* How strongly the row scores, as a wash behind it */}
            <div aria-hidden className={`absolute inset-y-0 left-0 ${barClass[cluster.tone]}`} style={{ width: `${row.strength * 100}%` }} />
            <div className="relative flex items-center gap-2.5 px-2.5 py-2">
              <TickerLogo
                ticker={row.ticker}
                src={`https://cdn.tickerlogos.com/${row.domain}`}
                className="h-6 w-6"
                imageClassName="rounded-md"
                fallbackClassName="rounded-md text-[8px]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold leading-tight text-snow-peak">{row.ticker}</p>
                <p className="truncate text-[10px] leading-tight text-mist">{row.name}</p>
              </div>
              <div className="text-right">
                <p className={`font-mono text-xs font-semibold tabular-nums ${toneClass[cluster.tone]}`}>{row.value}</p>
                <p className="font-mono text-[9px] text-mist/80">{row.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function Preview() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-16">

      <div className="mb-8 max-w-3xl">
        <h2 className="text-3xl font-bold tracking-tight text-snow-peak sm:text-4xl">Opportunity Radar</h2>
        <p className="mt-2 text-base text-mist">
          Exclusive radar clusters designed to surface high-conviction opportunities before broad market attention.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clusters.map((cluster) => (
          <RadarCard key={cluster.title} cluster={cluster} />
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-mist/55">Values shown are illustrative.</p>
    </section>
  );
}
