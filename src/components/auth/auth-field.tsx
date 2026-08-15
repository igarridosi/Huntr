"use client";

import { useId, useState, type ComponentType, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff, type LucideProps } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  icon: ComponentType<LucideProps>;
  /** Renders a reveal toggle and manages the input type. */
  revealable?: boolean;
  /** Shown next to the label — used for "Forgot password?". */
  action?: ReactNode;
  error?: boolean;
  hint?: ReactNode;
}

/**
 * Labelled input with a leading icon, and an optional reveal toggle for
 * passwords — typing a password blind is the usual cause of a failed sign-in.
 */
export function AuthField({
  label,
  icon: Icon,
  revealable = false,
  action,
  error = false,
  hint,
  className,
  type = "text",
  ...props
}: AuthFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [revealed, setRevealed] = useState(false);

  const resolvedType = revealable ? (revealed ? "text" : "password") : type;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>

      <div className="relative">
        <Icon
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist/70"
        />
        <Input
          id={id}
          type={resolvedType}
          aria-invalid={error || undefined}
          aria-describedby={hint ? hintId : undefined}
          className={cn(
            "h-11 pl-9",
            revealable && "pr-11",
            error && "border-bearish/70 focus-visible:ring-bearish",
            className
          )}
          {...props}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-mist transition-colors hover:text-snow-peak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>

      {hint && (
        <div id={hintId} className="text-xs">
          {hint}
        </div>
      )}
    </div>
  );
}
