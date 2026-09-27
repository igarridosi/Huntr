"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { describeRange, type FilterSpec } from "@/lib/screener/filters";

/** Closes a popover on an outside press or Escape, and hands focus back to its trigger. */
function useDismiss(open: boolean, close: () => void, wrapper: React.RefObject<HTMLElement | null>, trigger: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, wrapper, trigger]);
}

/** The frame every filter sits in: its name, what it means, its value, and the way out. */
export function FilterTile({
  label,
  description,
  active,
  onRemove,
  children,
}: {
  label: string;
  description?: string;
  active: boolean;
  onRemove?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-xl py-1.5 pl-3 pr-1.5 ring-1 ring-inset transition-[background-color,box-shadow] duration-200 ease-out",
        active ? "bg-sunset-orange/[0.06] ring-sunset-orange/30" : "bg-snow-peak/[0.025] ring-wolf-border/45"
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1 text-[13px] font-medium text-snow-peak">
        <span className="truncate">{label}</span>
        {description ? (
          <Tooltip content={description} side="top">
            <button type="button" aria-label={`About ${label}`} className="shrink-0 rounded text-mist/50 transition-colors hover:text-mist">
              <Info className="h-3 w-3" />
            </button>
          </Tooltip>
        ) : null}
      </span>
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-mist/60 transition-[background-color,color,transform] duration-150 ease-out hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-90 motion-reduce:active:scale-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** The value button inside a tile, and the panel it opens. */
function ValueMenu({ label, set, children }: { label: string; set: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const dismiss = useCallback(() => setOpen(false), []);
  // Closing after a choice hands focus back to the button that opened it.
  const close = useCallback(() => {
    setOpen(false);
    document.getElementById(`${id}-trigger`)?.focus();
  }, [id]);
  useDismiss(open, dismiss, wrapper, trigger);
  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        ref={trigger}
        id={`${id}-trigger`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 max-w-[11rem] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium ring-1 ring-inset",
          "transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100",
          set
            ? "bg-sunset-orange/15 text-sunset-orange ring-sunset-orange/35 hover:bg-sunset-orange/20"
            : "bg-wolf-black/30 text-mist ring-wolf-border/50 hover:text-snow-peak hover:ring-wolf-border"
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          className="popover-materialize absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl bg-wolf-surface p-1.5 shadow-2xl shadow-wolf-black/50 ring-1 ring-inset ring-wolf-border/60"
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-150",
        selected ? "bg-sunset-orange/10 text-sunset-orange" : "text-snow-peak hover:bg-snow-peak/[0.06]"
      )}
    >
      <span>{children}</span>
      {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
    </button>
  );
}

/** A number field in display units ("15" for 15x, "10" for 10%), empty for an open end. */
function Bound({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium text-mist">{label}</span>
      <span className="flex h-9 items-center rounded-lg bg-wolf-black/40 px-2.5 ring-1 ring-inset ring-wolf-border/60 focus-within:ring-sunset-orange/50">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Any"
          className="w-full min-w-0 bg-transparent font-mono text-[13px] tabular-nums text-snow-peak outline-none placeholder:text-mist/50"
        />
        <span className="shrink-0 pl-1 font-mono text-[12px] text-mist">{suffix}</span>
      </span>
    </label>
  );
}

const suffixOf = (spec: FilterSpec) =>
  spec.format === "multiple" ? "x" : spec.format === "percent" || spec.format === "signed_percent" ? "%" : spec.format === "money" ? "B" : "";

/** One numeric filter: presets for the common questions, a range for everything else. */
export function RangeFilterControl({
  spec,
  range,
  onChange,
  onRemove,
}: {
  spec: FilterSpec;
  range: { min: number | null; max: number | null };
  onChange: (min: number | null, max: number | null) => void;
  onRemove: () => void;
}) {
  const set = range.min !== null || range.max !== null;
  const isPreset = spec.presets.some((p) => p.min === range.min && p.max === range.max);
  const toDisplay = (v: number | null) => (v === null ? "" : String(Number((v / spec.inputScale).toFixed(4))));
  const [lo, setLo] = useState(toDisplay(range.min));
  const [hi, setHi] = useState(toDisplay(range.max));

  const parse = (s: string): number | null => {
    const n = parseFloat(s.replace(",", "."));
    return Number.isFinite(n) ? n * spec.inputScale : null;
  };

  return (
    <FilterTile label={spec.label} description={spec.description} active={set} onRemove={onRemove}>
      <ValueMenu label={set ? describeRange(spec, range.min, range.max) : "Any"} set={set}>
        {(close) => (
          <div className="space-y-1">
            <Option
              selected={!set}
              onClick={() => {
                onChange(null, null);
                close();
              }}
            >
              Any
            </Option>
            {spec.presets.map((p) => (
              <Option
                key={p.label}
                selected={range.min === p.min && range.max === p.max}
                onClick={() => {
                  onChange(p.min, p.max);
                  setLo(toDisplay(p.min));
                  setHi(toDisplay(p.max));
                  close();
                }}
              >
                {p.label}
              </Option>
            ))}
            <form
              className="mt-1 space-y-2 border-t border-wolf-border/40 px-1 pb-1 pt-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                const min = parse(lo);
                const max = parse(hi);
                onChange(min !== null && max !== null && min > max ? max : min, min !== null && max !== null && min > max ? min : max);
                close();
              }}
            >
              <p className="px-1.5 text-[11px] font-medium text-mist">{set && !isPreset ? "Custom range" : "Or a custom range"}</p>
              <div className="flex gap-2">
                <Bound label="Min" value={lo} onChange={setLo} suffix={suffixOf(spec)} />
                <Bound label="Max" value={hi} onChange={setHi} suffix={suffixOf(spec)} />
              </div>
              <button
                type="submit"
                className="h-9 w-full rounded-lg bg-sunset-orange text-[13px] font-semibold text-wolf-black transition-[background-color,transform] duration-150 hover:bg-sunset-orange/90 active:scale-[0.98] motion-reduce:active:scale-100"
              >
                Apply range
              </button>
            </form>
          </div>
        )}
      </ValueMenu>
    </FilterTile>
  );
}

/** Sectors: several can be picked; none is every sector. */
export function SectorFilterControl({
  sectors,
  selected,
  onToggle,
  onClear,
}: {
  sectors: Array<{ name: string; count: number }>;
  selected: readonly string[];
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const set = selected.length > 0;
  const label = !set ? "All" : selected.length === 1 ? selected[0] : `${selected.length} sectors`;
  return (
    <FilterTile label="Sector" active={set} onRemove={set ? onClear : undefined}>
      <ValueMenu label={label} set={set}>
        {() => (
          <div className="scroll-quiet max-h-80 space-y-0.5 overflow-y-auto">
            {sectors.map((s) => {
              const on = selected.includes(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => onToggle(s.name)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-150",
                    on ? "text-snow-peak" : "text-mist hover:bg-snow-peak/[0.06] hover:text-snow-peak"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ring-1 ring-inset transition-colors",
                      on ? "bg-sunset-orange ring-sunset-orange text-wolf-black" : "ring-wolf-border"
                    )}
                  >
                    {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  </span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="font-mono text-[11px] tabular-nums text-mist/70">{s.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </ValueMenu>
    </FilterTile>
  );
}
