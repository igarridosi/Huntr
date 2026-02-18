/**
 * Minimal landing footer.
 */
export function Footer() {
  const currentYear = new Date().getUTCFullYear();

  return (
    <footer className="border-t border-wolf-border/40 px-6 py-8">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold tracking-tight text-snow-peak">
            HUNTR
          </span>
          <span className="text-[10px] text-mist font-medium border border-wolf-border/60 rounded px-1.5 py-0.5 uppercase tracking-wider">
            Beta
          </span>
        </div>

        {/* Tagline */}
        <p className="text-xs text-mist/60 text-center">
          The Wolf of Value Street — Tactical financial analysis.
        </p>

        {/* Copyright */}
        <p className="text-xs text-mist/40">
          © {currentYear} Huntr. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
