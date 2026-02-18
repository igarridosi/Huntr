import * as React from "react";
import { cn } from "@/lib/utils";

// ---- Separator ----
interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => {
    const separatorClassName = cn(
      "shrink-0 bg-wolf-border",
      orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
      className
    );

    if (decorative) {
      return (
        <div
          ref={ref}
          aria-hidden="true"
          className={separatorClassName}
          {...props}
        />
      );
    }

    if (orientation === "vertical") {
      return (
        <div
          ref={ref}
          role="separator"
          aria-orientation="vertical"
          className={separatorClassName}
          {...props}
        />
      );
    }

    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation="horizontal"
        className={separatorClassName}
        {...props}
      />
    );
  }
);
Separator.displayName = "Separator";

export { Separator };
