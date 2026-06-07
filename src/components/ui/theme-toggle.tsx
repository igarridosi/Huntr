"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/providers/theme-provider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

/**
 * Animated Sun / Moon toggle button.
 * Reads and writes the global theme via ThemeProvider.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-lg",
        "text-mist hover:text-snow-peak",
        "hover:bg-wolf-surface transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange",
        className
      )}
    >
      {/* Sun — visible in dark mode (clicking switches to light) */}
      <Sun
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          isLight
            ? "opacity-0 rotate-90 scale-50"
            : "opacity-100 rotate-0 scale-100"
        )}
      />
      {/* Moon — visible in light mode (clicking switches to dark) */}
      <Moon
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          isLight
            ? "opacity-100 rotate-0 scale-100"
            : "opacity-0 -rotate-90 scale-50"
        )}
      />
    </button>
  );
}
