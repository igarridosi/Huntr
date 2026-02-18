import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange focus-visible:ring-offset-2 focus-visible:ring-offset-wolf-black disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-sunset-orange text-wolf-black hover:bg-sunset-orange/90 shadow-sm",
        secondary:
          "bg-wolf-surface text-snow-peak border border-wolf-border hover:bg-wolf-border/50",
        ghost:
          "text-snow-peak hover:bg-wolf-surface hover:text-snow-peak",
        outline:
          "border border-wolf-border bg-transparent text-snow-peak hover:bg-wolf-surface",
        destructive:
          "bg-bearish text-snow-peak hover:bg-bearish/80",
        link: "text-sunset-orange underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs rounded-md",
        lg: "h-12 px-6 text-base rounded-xl",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
