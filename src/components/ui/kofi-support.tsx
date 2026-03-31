"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    kofiwidget2?: {
      init: (text: string, color: string, id: string) => void;
      getHTML: () => string;
    };
  }
}

const KOFI_SCRIPT_ID = "kofi-widget-script";
const KOFI_SCRIPT_SRC = "https://storage.ko-fi.com/cdn/widget/Widget_2.js";

interface KoFiSupportProps {
  text?: string;
  className?: string;
  color?: string;
  position?: "right" | "left" | "above";
}

export function KoFiSupport({
  text = "Support Huntr on Ko-fi",
  className,
  color = "#ff8f44",
  position = "right",
}: KoFiSupportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const renderWidget = () => {
      if (!window.kofiwidget2 || !hostRef.current) return;

      window.kofiwidget2.init(text, color, "E1E21WMFA8");
      hostRef.current.innerHTML = window.kofiwidget2.getHTML();
    };

    if (window.kofiwidget2) {
      renderWidget();
      return;
    }

    let script = document.getElementById(KOFI_SCRIPT_ID) as HTMLScriptElement | null;
    const handleLoad = () => renderWidget();

    if (!script) {
      script = document.createElement("script");
      script.id = KOFI_SCRIPT_ID;
      script.src = KOFI_SCRIPT_SRC;
      script.async = true;
      script.onload = handleLoad;
      document.body.appendChild(script);
    } else {
      script.addEventListener("load", handleLoad);
    }

    return () => {
      script?.removeEventListener("load", handleLoad);
    };
  }, [text, color]);

  // Layout variations:
  // - right (default): [Ko-fi widget] [ProductHunt badge]
  // - left: [ProductHunt badge] [Ko-fi widget]
  // - above: stacked column with ProductHunt above Ko-fi

  const badge = (
    <a
      href="https://www.producthunt.com/products/huntr-4?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-huntr-5"
      target="_blank"
      rel="noopener noreferrer"
      className="product-hunt-badge"
      aria-label="Vote for Huntr on Product Hunt"
    >
      <img
        alt="Huntr - The terminal for value investors | Product Hunt"
        src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1108986&theme=light&t=1774944195458"
        style={{ maxWidth: 200, height: "auto" }}
      />
    </a>
  );

  if (position === "above") {
    return (
      <div className={cn("kofi-support-widget flex flex-col items-center gap-2", className)}>
        {badge}
        <div ref={hostRef} />
      </div>
    );
  }

  if (position === "left") {
    return (
      <div className={cn("kofi-support-widget flex items-center gap-3", className)}>
        {badge}
        <div ref={hostRef} />
      </div>
    );
  }

  // default: right
  return (
    <div className={cn("kofi-support-widget flex items-center gap-3", className)}>
      <div ref={hostRef} />
      {badge}
    </div>
  );
}
