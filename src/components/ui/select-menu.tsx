"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectMenuOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectMenuGroup<T extends string> {
  label: string;
  options: ReadonlyArray<SelectMenuOption<T>>;
}

interface SelectMenuProps<T extends string> {
  groups: ReadonlyArray<SelectMenuGroup<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * A dropdown we actually own.
 *
 * A native `<select>` hands its popup to the operating system: the panel's
 * border, its width, its row height and its highlight colour are all outside
 * the page's reach, which is why the dark theme still opened a list ringed in
 * white with rows sized for a desktop form. Only the option colours were ever
 * really ours.
 *
 * This renders the list itself, so the panel matches every other surface in
 * the app and the rows are sized for reading rather than for the platform's
 * defaults. Keyboard behaviour is rebuilt to match what the native control
 * gave for free - arrows to move, Enter to take, Escape to leave, focus
 * returned to the trigger - since replacing the element means replacing that
 * too.
 */
export function SelectMenu<T extends string>({
  groups,
  value,
  onChange,
  ariaLabel,
  className,
}: SelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listId = useId();

  const flat = groups.flatMap((group) => group.options);
  const selected = flat.find((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, flat.findIndex((option) => option.value === value))
  );

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Pointer down rather than click: a menu should be gone by the time the
  // press that dismissed it completes, not a frame later.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const commit = (next: T) => {
    onChange(next);
    close(true);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex(Math.max(0, flat.findIndex((option) => option.value === value)));
        setOpen(true);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(flat.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(flat.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = flat[activeIndex];
      if (option) commit(option.value);
    }
  };

  let runningIndex = -1;

  return (
    <div
      ref={wrapperRef}
      className={cn("relative min-w-[11rem]", className)}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((previous) => !previous)}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3.5 text-[13px] font-medium",
          "bg-snow-peak/[0.04] text-snow-peak ring-1 ring-inset ring-wolf-border/45",
          "transition-[background-color,box-shadow,transform] duration-150 ease-out",
          "hover:bg-snow-peak/[0.07] hover:ring-wolf-border/70",
          "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-sunset-orange/60"
        )}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-mist transition-transform duration-150 ease-out",
            open && "rotate-180",
            "motion-reduce:transition-none"
          )}
        />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            // Tied to the trigger's width rather than sized to its content: a
            // panel that is a few pixels narrower than the button that opened
            // it reads as misaligned, and the labels are short enough that
            // matching costs nothing.
            "popover-materialize scroll-quiet absolute right-0 z-50 mt-2 max-h-[24rem] w-full origin-top-right",
            "overflow-y-auto rounded-xl bg-wolf-surface/95 p-2 shadow-2xl ring-1 ring-inset ring-wolf-border/60 backdrop-blur-xl"
          )}
        >
          {groups.map((group) => (
            <div key={group.label} className="mb-1 last:mb-0">
              <p className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.09em] text-mist/50">
                {group.label}
              </p>
              {group.options.map((option) => {
                runningIndex += 1;
                const isSelected = option.value === value;
                const isActive = runningIndex === activeIndex;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => commit(option.value)}
                    onPointerEnter={() => setActiveIndex(flat.findIndex((o) => o.value === option.value))}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left text-[13px]",
                      "transition-[background-color,color,transform] duration-150 ease-out",
                      "active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100",
                      isSelected ? "text-sunset-orange" : "text-snow-peak",
                      // Pointer and keyboard share one highlight, so moving
                      // between the two never leaves two rows looking active.
                      isActive && !isSelected && "bg-snow-peak/[0.06]",
                      isActive && isSelected && "bg-sunset-orange/15",
                      !isActive && isSelected && "bg-sunset-orange/10"
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
