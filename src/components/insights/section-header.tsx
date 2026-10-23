import type { ComponentType, ReactNode } from "react";

/**
 * The head of an Insights section card: the section's icon in a tile, its
 * title (and a line under it when it needs one), and its controls on the
 * right, where the eye ends the line. Shared so the sections read as one
 * page rather than blocks from different places.
 */
export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  titleId,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: ReactNode;
  titleId?: string;
  /** The section's controls. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunset-orange/[0.08] ring-1 ring-inset ring-sunset-orange/25">
          <Icon className="h-5 w-5 text-sunset-orange" />
        </div>
        <div className="min-w-0">
          <h2 id={titleId} className="text-[17px] font-semibold leading-tight tracking-[-0.015em] text-snow-peak">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-[12px] leading-snug text-mist">{subtitle}</p> : null}
        </div>
      </div>
      {children ? <div className="flex items-center gap-3 self-start sm:self-auto">{children}</div> : null}
    </div>
  );
}
