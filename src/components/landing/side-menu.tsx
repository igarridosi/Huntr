"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  Grid2x2,
  HeartHandshake,
  House,
  PanelRightClose,
  PanelRightOpen,
  Radar,
  TrendingUp,
} from "lucide-react";
import { chromeOpacity, useIntroProgress } from "@/hooks/use-intro-progress";

const menuItems = [
  { href: "#hero", label: "The Product", icon: House },
  { href: "#features", label: "Core Features", icon: Grid2x2 },
  { href: "#radar", label: "Opportunity Radar", icon: Radar },
  { href: "#dcf", label: "DCF Valuation", icon: TrendingUp },
  { href: "#earnings", label: "Earnings", icon: CalendarDays },
  { href: "#portfolios", label: "Portfolios", icon: BriefcaseBusiness },
  { href: "#transparency", label: "Transparency", icon: HeartHandshake },
] as const;

/** Clearance below the sticky nav so the target heading is never tucked under it. */
const SCROLL_OFFSET = 88;
const MIN_DURATION = 900;
const MAX_DURATION = 1800;

/** Slow, symmetric ease so long jumps glide instead of snapping. */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function LandingSideMenu() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeHref, setActiveHref] = useState<(typeof menuItems)[number]["href"]>("#hero");
  const animationRef = useRef(0);
  const introProgress = useIntroProgress();

  // Cancel any in-flight glide when the reader takes over scrolling themselves.
  useEffect(() => {
    const cancel = () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
    };

    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });

    return () => {
      cancel();
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
    };
  }, []);

  const glideTo = useCallback((href: string) => {
    const section = document.querySelector(href);
    if (!section) return;

    const startY = window.scrollY;
    const targetY = Math.max(
      0,
      section.getBoundingClientRect().top + startY - SCROLL_OFFSET
    );
    const distance = targetY - startY;

    // Keep the address bar in sync without the jump a real hash change causes,
    // and without stacking a history entry per menu click.
    history.replaceState(null, "", href);

    if (Math.abs(distance) < 1) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, targetY);
      return;
    }

    // Longer trips take longer, but stay inside a predictable band.
    const duration = Math.min(
      MAX_DURATION,
      Math.max(MIN_DURATION, Math.abs(distance) * 0.55)
    );
    const startTime = performance.now();

    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const step = (now: number) => {
      const elapsed = Math.min((now - startTime) / duration, 1);
      window.scrollTo(0, startY + distance * easeInOutCubic(elapsed));

      if (elapsed < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        animationRef.current = 0;
      }
    };

    animationRef.current = requestAnimationFrame(step);
  }, []);

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

  const introOpacity = chromeOpacity(introProgress);
  const introHidden = introOpacity < 0.02;

  return (
    <aside
      className="fixed right-8 top-1/2 z-50 hidden -translate-y-1/2 rounded-2xl border border-wolf-border/50 bg-wolf-black/80 p-2.5 shadow-2xl shadow-wolf-black/60 backdrop-blur-md md:block"
      style={{ opacity: introOpacity, visibility: introHidden ? "hidden" : "visible" }}
      aria-hidden={introHidden}
    >
      <nav aria-label="Landing sections" className="flex flex-col gap-2">
        {menuItems.map((item) => {
          const isActive = activeHref === item.href;

          return (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) => {
                // Keep the anchor intact for middle-click and keyboard users,
                // but take over plain clicks to run the eased glide.
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                glideTo(item.href);
              }}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              className={`group flex items-center gap-2.5 rounded-lg border px-2.5 py-2.5 text-[12px] transition ${
                collapsed ? "justify-center" : ""
              } ${
                isActive
                  ? "border-sunset-orange/45 bg-sunset-orange/12 text-snow-peak"
                  : "border-transparent text-mist hover:border-wolf-border/60 hover:bg-wolf-surface/55 hover:text-snow-peak"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap pr-1">{item.label}</span>}
            </a>
          );
        })}

        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          title={collapsed ? "Expand menu" : undefined}
          className={`mt-1 inline-flex items-center gap-2.5 rounded-lg border border-wolf-border/45 bg-wolf-black/35 px-2.5 py-2.5 text-[12px] text-mist transition hover:text-snow-peak ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? (
            <PanelRightOpen className="h-4 w-4 shrink-0" />
          ) : (
            <PanelRightClose className="h-4 w-4 shrink-0" />
          )}
          {!collapsed && <span className="whitespace-nowrap">Collapse</span>}
        </button>
      </nav>
    </aside>
  );
}
