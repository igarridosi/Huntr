import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-sunset-orange/15 text-sunset-orange border border-sunset-orange/20",
        secondary: "bg-wolf-surface text-mist border border-wolf-border",
        bullish: "bg-emerald-400/15 text-emerald-400 border border-emerald-400/20",
        bearish: "bg-bearish/15 text-bearish border border-bearish/20",
        golden: "bg-golden-hour/15 text-golden-hour border border-golden-hour/20",
        outline: "bg-transparent text-snow-peak border border-wolf-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
