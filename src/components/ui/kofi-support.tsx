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

const KOFI_FONT_LINK = /<link[^>]*fonts\.googleapis\.com[^>]*>/i;

/**
 * The widget markup carries its own Google Fonts stylesheet, so a page with
 * three buttons ends up with three identical <link>s. Keep the first one the
 * document already has and drop the copies.
 */
function stripDuplicateFontLink(html: string): string {
  const alreadyLoaded = document.querySelector(
    'link[rel="stylesheet"][href*="fonts.googleapis.com"]'
  );
  return alreadyLoaded ? html.replace(KOFI_FONT_LINK, "") : html;
}

interface KoFiSupportProps {
  text?: string;
  className?: string;
  color?: string;
}

export function KoFiSupport({
  text = "Support Huntr on Ko-fi",
  className,
  color = "#ff8f44",
}: KoFiSupportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const renderWidget = () => {
      if (!window.kofiwidget2 || !hostRef.current) return;

      window.kofiwidget2.init(text, color, "E1E21WMFA8");
      hostRef.current.innerHTML = stripDuplicateFontLink(window.kofiwidget2.getHTML());
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

  return <div ref={hostRef} className={cn("kofi-support-widget", className)} />;
}
