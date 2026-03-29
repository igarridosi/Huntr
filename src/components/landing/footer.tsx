import Link from "next/link";

/**
 * Minimal landing footer.
 */
export function Footer() {
  const currentYear = new Date().getUTCFullYear();

  return (
    <footer className="border-t border-wolf-border/40 px-6 py-12">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 mb-8">
        {/* Brand */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-snow-peak">
              HUNTR
            </span>
            <span className="text-[10px] text-mist font-medium border border-wolf-border/60 rounded px-1.5 py-0.5 uppercase tracking-wider">
              Beta
            </span>
          </div>
          <p className="text-sm text-mist/60 max-w-xs">
            Tactical financial analysis platform for demanding value investors.
          </p>
        </div>

        {/* Semantic Navigation for SEO Sitelinks */}
        <nav className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-sm">
          <div className="flex flex-col gap-3">
            <span className="font-semibold text-snow-peak">Features</span>
            <Link href="/app" className="text-mist/70 hover:text-orange-500 transition-colors">Stock Screener</Link>
            <Link href="/app/watchlist" className="text-mist/70 hover:text-orange-500 transition-colors">Smart Watchlists</Link>
            <Link href="/app" className="text-mist/70 hover:text-orange-500 transition-colors">DCF Models</Link>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-semibold text-snow-peak">Company</span>
            <Link href="/#pricing" className="text-mist/70 hover:text-orange-500 transition-colors">Pricing</Link>
            <Link href="https://twitter.com/huntrvalue" target="_blank" rel="noopener noreferrer" className="text-mist/70 hover:text-orange-500 transition-colors">Twitter</Link>
          </div>
        </nav>
      </div>

      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-wolf-border/20">
        <p className="text-xs text-mist/60 text-center">
          Accessible stock intelligence, built in public and improved with the community.
        </p>

        {/* Copyright */}
        <p className="text-xs text-mist/40">
          © {currentYear} Huntr. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
