import Image from "next/image";
import Link from "next/link";
import { FooterLink } from "@/components/landing/footer-link";
import { ROUTES } from "@/lib/constants";

/** X's mark. Not in the icon set the app uses (lucide has no brand logos). */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * The night sky over the ruins closes the page: the same palette as the
 * header (black, teal, the orange horizon). The links come first, and the
 * illustration follows at full width and its own 16:9, pulled up under them
 * so they sit in its empty sky. Its horizon is 27vw below its top and the
 * pull is at most 18vw, so at any width the text stays clear of the light.
 * A phone gets it at 4:3, cropped towards the statue, rather than a strip.
 * The sky fades in from transparent: the backdrop's light above runs
 * straight into the stars.
 */

/** Opaque from 40% down; above, an eased fade so the sky has no top edge. */
const SKY_FADE =
  "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.12) 9%, rgba(0,0,0,0.35) 18%, rgba(0,0,0,0.62) 26%, rgba(0,0,0,0.85) 33%, black 40%)";


const X_URL = "https://x.com/e4e_codex";
const KOFI_URL = "https://ko-fi.com/E1E21WMFA8";

/** The app's sections, as the landing presents them. */
const product = [
  { label: "Opportunity Radar", href: ROUTES.APP_INSIGHTS },
  { label: "DCF Calculator", href: ROUTES.APP_DCF_CALCULATOR },
  { label: "Earnings", href: ROUTES.APP_EARNINGS },
  { label: "Portfolios", href: ROUTES.APP_PORTFOLIOS },
  { label: "Chart Builder", href: ROUTES.APP_CHART_BUILDER },
  { label: "Stock Screener", href: ROUTES.APP_SCREENER },
  { label: "Watchlists", href: ROUTES.APP_WATCHLISTS },
];

/** Back up the landing itself. */
const explore = [
  { label: "The toolkit", href: "/#features" },
  { label: "Product tour", href: "/#radar" },
  { label: "Built in public", href: "/#transparency" },
  { label: "Explore as guest", href: ROUTES.APP },
];

export function Footer() {
  const currentYear = new Date().getUTCFullYear();

  return (
    <footer className="relative isolate">
      <div className="mx-auto max-w-6xl px-6 pt-24 sm:pt-32">
        <div className="grid grid-cols-2 gap-x-10 gap-y-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight text-snow-peak">HUNTR</span>
              <span className="rounded border border-wolf-border/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-mist">
                Beta
              </span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-mist/80">
              Fundamental analysis for the modern value investor. Built in public, improved every week.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Link href={ROUTES.SIGNUP} className="rounded-lg bg-sunset-orange px-3.5 py-1.5 text-xs font-semibold text-wolf-black transition-[background-color,transform] duration-200 hover:bg-golden-hour active:scale-[0.96]">
                Start free
              </Link>
              <a
                href={X_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow HUNTR on X"
                className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-wolf-border/60 px-2.5 text-xs text-mist transition-[color,border-color,transform] duration-200 hover:border-sunset-orange/50 hover:text-snow-peak active:scale-[0.96]"
              >
                <XLogo className="h-3 w-3" />
                @e4e_codex
              </a>
            </div>
          </div>

          {/* Semantic navigation for SEO sitelinks */}
          <nav aria-label="Product" className="flex flex-col gap-3 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-sunset-orange">Product</span>
            {product.map((item) => (
              <FooterLink key={item.label} href={item.href}>
                {item.label}
              </FooterLink>
            ))}
          </nav>
          <nav aria-label="Explore" className="flex flex-col gap-3 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-sunset-orange">Explore</span>
            {explore.map((item) => (
              <FooterLink key={item.label} href={item.href}>
                {item.label}
              </FooterLink>
            ))}
          </nav>
          <nav aria-label="Community" className="flex flex-col gap-3 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-sunset-orange">Community</span>
            <FooterLink href={KOFI_URL} external>
              Support on Ko-fi
            </FooterLink>
            <FooterLink href={X_URL} external>
              Follow on X
            </FooterLink>
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-snow-peak/10 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-mist/80">
            Data for research and education. Nothing on HUNTR is investment advice.
          </p>
          <p className="text-xs text-mist/60">© {currentYear} HUNTR. All rights reserved.</p>
        </div>
      </div>

      {/* The illustration, pulled up under the text into its own empty sky */}
      <div
        aria-hidden
        className="pointer-events-none relative -z-10 -mt-[12vw] aspect-[4/3] w-full sm:-mt-[18vw] sm:aspect-[16/9]"
        style={{ maskImage: SKY_FADE, WebkitMaskImage: SKY_FADE }}
      >
        <Image
          src="/logo/huntr_footer_4k.webp"
          alt=""
          fill
          sizes="100vw"
          quality={90}
          className="select-none object-cover object-[68%_100%] sm:object-center"
        />
      </div>
    </footer>
  );
}
