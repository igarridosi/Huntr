import {
  BarChart3,
  Shield,
  Search,
  TrendingUp,
  Layers,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: BarChart3,
    title: "Financial Statements",
    description:
      "Income Statement, Balance Sheet y Cash Flow con 10 años de datos. Toggle anual/trimestral al instante.",
  },
  {
    icon: TrendingUp,
    title: "Valuation Metrics",
    description:
      "P/E, P/S, EV/EBITDA, ROIC, FCF Yield y más. Calculados en tiempo real desde los estados financieros.",
  },
  {
    icon: Search,
    title: "Command Palette",
    description:
      "Cmd+K para buscar cualquier ticker al instante. Prefetch inteligente para transiciones inmediatas.",
  },
  {
    icon: Layers,
    title: "Multi-Chart Overview",
    description:
      "10 gráficos simultáneos en la vista Overview. Revenue, EBITDA, FCF, EPS, márgenes — de un vistazo.",
  },
  {
    icon: Shield,
    title: "Watchlist Inteligente",
    description:
      "Añade tickers con un click. Tu watchlist personal con métricas clave, barra 52W y acceso directo.",
  },
  {
    icon: Zap,
    title: "Análisis de Dividendos",
    description:
      "Yield, Payout Ratio, DPS History y CAGR de dividendos. Todo lo que necesitas para evaluar income stocks.",
  },
];

/**
 * Features grid — 6 cards highlighting platform capabilities.
 */
export function Features() {
  return (
    <section className="relative px-6 py-24 max-w-6xl mx-auto">
      {/* Section header */}
      <div className="text-center space-y-3 mb-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-snow-peak tracking-tight">
          Your Tactical Advantage
        </h2>
        <p className="text-mist text-base sm:text-lg max-w-lg mx-auto">
          Cada herramienta diseñada para que tomes decisiones con datos, no con emociones.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((f) => (
          <div
            key={f.title}
            className="group rounded-xl border border-wolf-border/50 bg-wolf-surface/50 p-6 space-y-4 transition-all duration-300 hover:border-sunset-orange/40 hover:bg-wolf-surface"
          >
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-sunset-orange/10 text-sunset-orange group-hover:bg-sunset-orange/20 transition-colors">
              <f.icon className="w-5 h-5" />
            </div>

            {/* Text */}
            <h3 className="text-base font-semibold text-snow-peak">
              {f.title}
            </h3>
            <p className="text-sm text-mist leading-relaxed">
              {f.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
