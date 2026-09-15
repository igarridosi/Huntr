"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { CANVAS_THEMES, MAX_TITLE_LENGTH, type CanvasTheme } from "@/lib/chart-builder";

interface ChartTitleProps {
  title: string;
  subtitle?: string;
  theme: CanvasTheme;
  onTitleChange: (title: string) => void;
  onSubtitleChange: (subtitle: string) => void;
}

/**
 * Title and subtitle edited where they live. The DOM owns the text while
 * the user types; the spec takes it on blur or Enter so undo gets one step
 * per edit rather than one per keystroke.
 */
export function ChartTitle({ title, subtitle, theme, onTitleChange, onSubtitleChange }: ChartTitleProps) {
  const tokens = CANVAS_THEMES[theme];
  const titleRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  // Follow spec changes (undo, template) without fighting the caret.
  useEffect(() => {
    if (titleRef.current && document.activeElement !== titleRef.current && titleRef.current.textContent !== title) {
      titleRef.current.textContent = title;
    }
  }, [title]);
  useEffect(() => {
    const next = subtitle ?? "";
    if (subRef.current && document.activeElement !== subRef.current && subRef.current.textContent !== next) {
      subRef.current.textContent = next;
    }
  }, [subtitle]);

  const commit = (el: HTMLDivElement | null, current: string, apply: (v: string) => void, max: number) => {
    if (!el) return;
    const next = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    if (next !== el.textContent) el.textContent = next;
    if (next !== current) apply(next);
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.currentTarget.textContent = e.currentTarget === titleRef.current ? title : (subtitle ?? "");
      e.currentTarget.blur();
    }
  };

  const editable = cn(
    "mx-auto max-w-[90%] rounded-md px-1.5 outline-none transition-[box-shadow] duration-150",
    "hover:[box-shadow:inset_0_0_0_1px_var(--cb-grid)] focus:[box-shadow:inset_0_0_0_1px_var(--color-sunset-orange)]",
    "empty:before:content-[attr(data-placeholder)] empty:before:opacity-50"
  );

  return (
    <div className="flex flex-col items-center text-center" style={{ "--cb-grid": tokens.grid } as React.CSSProperties}>
      <div
        ref={titleRef}
        role="textbox"
        aria-label="Chart title"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder="Untitled chart"
        onBlur={() => commit(titleRef.current, title, onTitleChange, MAX_TITLE_LENGTH)}
        onKeyDown={onKey}
        className={cn(editable, "text-lg font-semibold leading-tight tracking-[-0.02em] sm:text-xl")}
        style={{ color: tokens.title }}
      >
        {title}
      </div>
      <div
        ref={subRef}
        role="textbox"
        aria-label="Chart subtitle"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder="Add a subtitle"
        onBlur={() => commit(subRef.current, subtitle ?? "", onSubtitleChange, 160)}
        onKeyDown={onKey}
        className={cn(editable, "mt-1 text-xs")}
        style={{ color: tokens.tick }}
      >
        {subtitle ?? ""}
      </div>
    </div>
  );
}
