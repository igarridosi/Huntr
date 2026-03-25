"use client";

import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  Grid2x2,
  HeartHandshake,
  House,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  TrendingUp,
} from "lucide-react";

const menuItems = [
  { href: "#hero", label: "The Product", icon: House },
  { href: "#features", label: "Core Features", icon: Grid2x2 },
  { href: "#radar", label: "Opportunity Radar", icon: Radar },
  { href: "#dcf", label: "DCF Valuation", icon: TrendingUp },
  { href: "#earnings", label: "Earnings", icon: CalendarDays },
  { href: "#portfolios", label: "Portfolios", icon: BriefcaseBusiness },
  { href: "#transparency", label: "Transparency", icon: HeartHandshake },
] as const;

export function LandingSideMenu() {
  const [hidden, setHidden] = useState(true);
  const [activeHref, setActiveHref] = useState<(typeof menuItems)[number]["href"]>("#hero");

  useEffect(() => {
    const sections = menuItems
      .map((item) => document.querySelector(item.href))
      .filter((section): section is HTMLElement => Boolean(section));

    const updateActiveSection = () => {
      if (sections.length === 0) return;

      const anchorY = 150;
      let best = sections[0];
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        if (rect.bottom < anchorY) {
          continue;
        }

        const distance = Math.abs(rect.top - anchorY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = section;
        }
      }

      setActiveHref(`#${best.id}` as (typeof menuItems)[number]["href"]);
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        aria-label="Show side menu"
        className="fixed left-3 top-1/2 z-50 hidden -translate-y-1/2 rounded-r-xl border border-wolf-border/55 bg-wolf-black/85 px-2.5 py-3.5 text-mist shadow-lg shadow-wolf-black/40 backdrop-blur-md transition hover:text-snow-peak md:inline-flex"
      >
        <PanelLeftOpen className="h-4.5 w-4.5" />
      </button>
    );
  }

  return (
    <aside className="fixed left-4 top-1/2 z-50 hidden -translate-y-1/2 rounded-2xl border border-wolf-border/50 bg-wolf-black/80 p-2.5 shadow-xl shadow-wolf-black/45 backdrop-blur-md md:block">
      <nav aria-label="Landing sections" className="flex flex-col gap-2">
        {menuItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`group flex items-center gap-2.5 rounded-lg border px-2.5 py-2.5 text-[12px] transition ${
              activeHref === item.href
                ? "border-sunset-orange/45 bg-sunset-orange/12 text-snow-peak"
                : "border-transparent text-mist hover:border-wolf-border/60 hover:bg-wolf-surface/55 hover:text-snow-peak"
            }`}
          >
            <item.icon className="h-4 w-4" />
            <span className="whitespace-nowrap pr-1">{item.label}</span>
          </a>
        ))}

        <button
          type="button"
          onClick={() => setHidden(true)}
          className="mt-1 inline-flex items-center gap-2.5 rounded-lg border border-wolf-border/45 bg-wolf-black/35 px-2.5 py-2.5 text-[12px] text-mist transition hover:text-snow-peak"
        >
          <PanelLeftClose className="h-4 w-4" />
          <span>Hide menu</span>
        </button>
      </nav>
    </aside>
  );
}
