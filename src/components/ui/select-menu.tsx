"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectMenuOption<T extends string> {
  value: T;
  label: string;
  /** Extra words the search matches besides the label ("P/E", "NM"). */
  keywords?: string;
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
  /** A search field at the top of the list, for long lists. The placeholder names what is searched. */
  searchPlaceholder?: string;
}

/** Lower-case letters and digits only: "P/E (trailing)" and "pe trailing" match alike. */
const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * How well an option answers a query: 3 when the name starts with it read as
 * one word ("pe" is "P/E (trailing)"), 2 when every word starts a word of the
 * name or its keywords (or the query names the group), 1 when every word
 * starts a word of the group's name, 0 otherwise. Matching word starts rather than any substring keeps "pe"
 * from finding "Operating income".
 */
function score(label: string, keywords: string, group: string, words: string[]): number {
  const squash = (s: string) => fold(s).replace(/ /g, "");
  const query = words.join("");
  if (squash(label).startsWith(query) || fold(keywords).split(" ").some((k) => k && squash(k) === query) || squash(keywords) === query) return 3;
  const starts = (text: string) => {
    const parts = fold(text).split(" ");
    return words.every((w) => parts.some((part) => part.startsWith(w)));
  };
  if (starts(`${label} ${keywords}`)) return 2;
  // Naming the group ("per share", "cash flow") asks for all of it; two
  // letters are too few to mean a group rather than a metric.
  if (query.length >= 3 && squash(group).startsWith(query)) return 2;
  return starts(group) ? 1 : 0;
}

/**
 * The groups for a query: the options that match, best first, and the
 * groups in the order of their best option. A group's name only counts when
 * nothing matches by name, so "per share" finds that group but "pe" does not
 * bring it along behind P/E.
 */
function filterGroups<T extends string>(groups: ReadonlyArray<SelectMenuGroup<T>>, query: string): ReadonlyArray<SelectMenuGroup<T>> {
  const words = fold(query).split(" ").filter(Boolean);
  if (words.length === 0) return groups;
  const scored = groups.map((group) => ({
    group,
    options: group.options.map((option) => ({ option, score: score(option.label, option.keywords ?? "", group.label, words) })),
  }));
  const best = Math.max(0, ...scored.flatMap((g) => g.options.map((o) => o.score)));
  const floor = best >= 2 ? 2 : 1;
  return scored
    .map(({ group, options }) => {
      const kept = options.filter((o) => o.score >= floor).sort((x, y) => y.score - x.score);
      return { label: group.label, options: kept.map((o) => o.option), top: kept[0]?.score ?? 0 };
    })
    .filter((g) => g.options.length > 0)
    .sort((x, y) => y.top - x.top)
    .map(({ label, options }) => ({ label, options }));
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
  searchPlaceholder,
}: SelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const shown = useMemo(() => (searchPlaceholder ? filterGroups(groups, query) : groups), [groups, query, searchPlaceholder]);
  // Opens upward when the viewport has no room below: a menu near the
  // bottom of a scrolling panel would otherwise grow the panel instead of
  // showing its options.
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listId = useId();

  const flat = shown.flatMap((group) => group.options);
  const selected = groups.flatMap((group) => group.options).find((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, flat.findIndex((option) => option.value === value))
  );

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Pointer down rather than click: a menu should be gone by the time the
  // press that dismissed it completes, not a frame later.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const openMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setPlacement(below < 280 && rect.top > below ? "up" : "down");
    }
    setOpen(true);
  }, []);

  // The field takes the keyboard as the list opens: typing filters at once.
  useEffect(() => {
    if (open && searchPlaceholder) searchRef.current?.focus();
  }, [open, searchPlaceholder]);

  const commit = (next: T) => {
    onChange(next);
    close(true);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex(Math.max(0, flat.findIndex((option) => option.value === value)));
        openMenu();
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
    // In the search field a space is a character, not a choice.
    const typing = event.target === searchRef.current;
    if (event.key === "Enter" || (event.key === " " && !typing)) {
      event.preventDefault();
      const option = flat[activeIndex];
      if (option) commit(option.value);
    }
  };

  // Where each group starts in the flat option list. Counting with a mutable
  // index inside the JSX map is exactly the kind of render-time mutation the
  // React Compiler refuses to compile, and the offsets are trivially derived.
  const groupOffsets = shown.map((_, groupIndex) =>
    shown.slice(0, groupIndex).reduce((sum, group) => sum + group.options.length, 0)
  );

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
        onClick={() => (open ? setOpen(false) : openMenu())}
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
          className={cn(
            // At least as wide as the trigger (a narrower panel reads as
            // misaligned) and as wide as its longest label needs, so no option
            // is ever cut off in a narrow column.
            "popover-materialize scroll-quiet absolute right-0 z-50 max-h-[24rem] w-max min-w-full max-w-[min(20rem,calc(100vw-2rem))]",
            placement === "up" ? "bottom-full mb-2 origin-bottom-right" : "top-full mt-2 origin-top-right",
            "overflow-y-auto rounded-xl bg-wolf-surface/95 p-2 shadow-2xl ring-1 ring-inset ring-wolf-border/60 backdrop-blur-xl",
            searchPlaceholder && "min-w-[15rem] pt-0"
          )}
        >
          {searchPlaceholder ? (
            // Sticky, so the query stays in view while the results scroll.
            <div className="sticky top-0 z-10 -mx-2 mb-1 bg-wolf-surface/95 px-2 pb-1.5 pt-2 backdrop-blur-xl">
              <label className="flex h-9 items-center gap-2 rounded-lg bg-snow-peak/[0.05] px-2.5 ring-1 ring-inset ring-wolf-border/50 focus-within:ring-sunset-orange/50">
                <Search className="h-3.5 w-3.5 shrink-0 text-mist" aria-hidden />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  aria-controls={listId}
                  aria-activedescendant={flat[activeIndex] ? `${listId}-${flat[activeIndex].value}` : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-snow-peak outline-none placeholder:text-mist/60"
                />
              </label>
            </div>
          ) : null}
          <div id={listId} role="listbox" aria-label={ariaLabel}>
          {flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-mist">Nothing matches &ldquo;{query}&rdquo;</p>
          ) : null}
          {shown.map((group, groupIndex) => (
            <div key={group.label} className="mb-1 last:mb-0">
              <p className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.09em] text-mist/50">
                {group.label}
              </p>
              {group.options.map((option, optionIndex) => {
                const flatIndex = groupOffsets[groupIndex] + optionIndex;
                const isSelected = option.value === value;
                const isActive = flatIndex === activeIndex;

                return (
                  <button
                    key={option.value}
                    id={`${listId}-${option.value}`}
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
        </div>
      ) : null}
    </div>
  );
}
