"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Bug, Lightbulb } from "lucide-react";

declare global {
  interface Window {
    Tally?: {
      openPopup: (formId: string, options?: Record<string, unknown>) => void;
      closePopup?: (formId: string) => void;
    };
  }
}

const TALLY_FORM_ID = "XxEBqz";
const TALLY_SCRIPT_ID = "tally-widget-script";
const TALLY_SCRIPT_SRC = "https://tally.so/widgets/embed.js";

export function TallyFeedbackWidget() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/") return;

    const existing = document.getElementById(TALLY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) return;

    const script = document.createElement("script");
    script.id = TALLY_SCRIPT_ID;
    script.src = TALLY_SCRIPT_SRC;
    script.async = true;
    document.head.appendChild(script);
  }, [pathname]);

  if (pathname === "/") return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70]">
      <button
        type="button"
        onClick={() => {
          if (!window.Tally?.openPopup) return;

          window.Tally.openPopup(TALLY_FORM_ID, {
            layout: "modal",
            width: 700,
            overlay: true,
            hideTitle: false,
            hiddenFields: {
              pathname,
              source: "huntr-widget",
            },
          });
        }}
        className="inline-flex items-center gap-2 rounded-full border border-wolf-border/60 bg-wolf-black/85 px-4 py-2 text-sm font-medium text-snow-peak shadow-lg shadow-wolf-black/45 backdrop-blur-md transition hover:border-sunset-orange/45 hover:bg-wolf-surface"
        aria-label="Report an idea or bug"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sunset-orange/15 text-sunset-orange">
          <Bug className="h-3.5 w-3.5" />
        </span>
        <span>Report idea or bug</span>
      </button>
    </div>
  );
}
