export default function Home() {
  return (
    <div className="min-h-screen bg-wolf-black flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-5xl font-bold text-snow-peak tracking-tight font-[family-name:var(--font-heading)]">
            HUNTR
          </h1>
          <p className="text-mist text-lg">
            The Wolf of Value Street — Theme Validation
          </p>
        </div>

        {/* Color Palette Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Background colors */}
          <div className="bg-wolf-black border border-wolf-border rounded-xl p-6">
            <p className="text-mist text-sm mb-1">wolf-black</p>
            <p className="text-snow-peak font-mono font-[family-name:var(--font-mono)] font-tabular">
              #0B1416
            </p>
          </div>

          <div className="bg-wolf-surface rounded-xl p-6">
            <p className="text-mist text-sm mb-1">wolf-surface</p>
            <p className="text-snow-peak font-mono font-[family-name:var(--font-mono)] font-tabular">
              #162225
            </p>
          </div>

          {/* Accent colors */}
          <div className="bg-wolf-surface rounded-xl p-6 border-l-4 border-sunset-orange">
            <p className="text-mist text-sm mb-1">sunset-orange</p>
            <p className="text-sunset-orange font-mono font-[family-name:var(--font-mono)] font-tabular text-2xl font-bold">
              #FF8C42
            </p>
          </div>

          <div className="bg-wolf-surface rounded-xl p-6 border-l-4 border-golden-hour">
            <p className="text-mist text-sm mb-1">golden-hour</p>
            <p className="text-golden-hour font-mono font-[family-name:var(--font-mono)] font-tabular text-2xl font-bold">
              #FFBF69
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <button className="bg-sunset-orange text-wolf-black font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity">
            Start Hunting
          </button>
          <button className="bg-wolf-surface text-snow-peak font-semibold px-6 py-3 rounded-xl border border-wolf-border hover:border-mist transition-colors">
            Explore
          </button>
        </div>

        {/* Mock Financial Data Display */}
        <div className="bg-wolf-surface rounded-xl p-6 space-y-4">
          <h2 className="text-snow-peak font-semibold text-lg font-[family-name:var(--font-heading)]">
            AAPL — Apple Inc.
          </h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-mist text-xs uppercase tracking-wider">
                Price
              </p>
              <p className="text-snow-peak text-2xl font-mono font-[family-name:var(--font-mono)] font-tabular">
                $198.45
              </p>
            </div>
            <div>
              <p className="text-mist text-xs uppercase tracking-wider">
                Market Cap
              </p>
              <p className="text-snow-peak text-2xl font-mono font-[family-name:var(--font-mono)] font-tabular">
                $3.07T
              </p>
            </div>
            <div>
              <p className="text-mist text-xs uppercase tracking-wider">
                ROIC
              </p>
              <p className="text-sunset-orange text-2xl font-mono font-[family-name:var(--font-mono)] font-tabular">
                56.2%
              </p>
            </div>
          </div>

          {/* Bullish / Bearish Indicators */}
          <div className="flex gap-4 pt-2 border-t border-wolf-border">
            <span className="text-sunset-orange font-mono font-[family-name:var(--font-mono)] font-tabular text-sm">
              ▲ +2.34% Bullish
            </span>
            <span className="text-bearish font-mono font-[family-name:var(--font-mono)] font-tabular text-sm">
              ▼ -1.12% Bearish
            </span>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-mist text-sm">
          Fase 0 — Theme Foundation ✓
        </p>
      </div>
    </div>
  );
}
