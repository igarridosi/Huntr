"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Bug, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

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
        className={cn(
          // Icon only, at every width. The label was already hidden on a phone
          // for covering content; a floating control that sits over the page on
          // every screen has the same problem on a laptop, and the icon plus
          // the tooltip carry the meaning on their own.
          "inline-flex h-11 w-11 items-center justify-center rounded-full",
          "bg-wolf-black/85 text-snow-peak ring-1 ring-inset ring-wolf-border/60 backdrop-blur-md",
          "shadow-lg shadow-wolf-black/45",
          "transition-[background-color,box-shadow,transform] duration-150 ease-out",
          "hover:bg-wolf-surface hover:ring-sunset-orange/45",
          "active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60"
        )}
        aria-label="Report an idea or bug"
        title="Report an idea or bug"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sunset-orange/15 text-sunset-orange">
          <Bug className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
