import Link from "next/link";
import { ROUTES } from "@/lib/constants";

const previewTickers = [
  { ticker: "AAPL", name: "Apple Inc.", price: "$198.45", pe: "32.8", cap: "$3.07T" },
  { ticker: "MSFT", name: "Microsoft Corp.", price: "$420.72", pe: "35.1", cap: "$3.12T" },
  { ticker: "GOOGL", name: "Alphabet Inc.", price: "$175.98", pe: "24.2", cap: "$2.18T" },
  { ticker: "NVDA", name: "NVIDIA Corp.", price: "$875.30", pe: "65.4", cap: "$2.16T" },
  { ticker: "JPM", name: "JPMorgan Chase", price: "$242.15", pe: "12.8", cap: "$690B" },
];

/**
 * Mini preview of the platform UX — shows a fake watchlist snippet.
 */
export function Preview() {
  return (
    <section className="px-6 py-16 max-w-5xl mx-auto">
      {/* Mock browser frame */}
      <div className="rounded-2xl border border-wolf-border/50 bg-wolf-surface/60 backdrop-blur-sm overflow-hidden shadow-2xl shadow-wolf-black/40">
        {/* Fake title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-wolf-border/40 bg-wolf-surface/80">
          <span className="w-3 h-3 rounded-full bg-bearish/40" />
          <span className="w-3 h-3 rounded-full bg-golden-hour/40" />
          <span className="w-3 h-3 rounded-full bg-sunset-orange/40" />
          <span className="ml-3 text-[11px] text-mist/60 font-mono">
            huntr.app/app
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-wolf-border/30">
                <th className="px-5 py-3 text-[10px] text-mist uppercase tracking-wider font-semibold">
                  Ticker
                </th>
                <th className="px-5 py-3 text-[10px] text-mist uppercase tracking-wider font-semibold">
                  Name
                </th>
                <th className="px-5 py-3 text-[10px] text-mist uppercase tracking-wider font-semibold text-right">
                  Price
                </th>
                <th className="px-5 py-3 text-[10px] text-mist uppercase tracking-wider font-semibold text-right">
                  P/E
                </th>
                <th className="px-5 py-3 text-[10px] text-mist uppercase tracking-wider font-semibold text-right">
                  Market&nbsp;Cap
                </th>
              </tr>
            </thead>
            <tbody>
              {previewTickers.map((t) => (
                <tr
                  key={t.ticker}
                  className="border-b border-wolf-border/20 hover:bg-wolf-black/30 transition-colors"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={ROUTES.SYMBOL(t.ticker)}
                      className="text-sunset-orange font-bold text-sm font-mono hover:underline"
                    >
                      {t.ticker}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm text-snow-peak">
                    {t.name}
                  </td>
                  <td className="px-5 py-3 text-sm text-snow-peak font-mono font-tabular text-right">
                    {t.price}
                  </td>
                  <td className="px-5 py-3 text-sm text-mist font-mono font-tabular text-right">
                    {t.pe}
                  </td>
                  <td className="px-5 py-3 text-sm text-mist font-mono font-tabular text-right">
                    {t.cap}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Caption */}
      <p className="text-center text-xs text-mist/50 mt-4">
        Vista previa de la watchlist — datos reales de mock
      </p>
    </section>
  );
}
