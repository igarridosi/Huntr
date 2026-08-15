import { AlertCircle, CheckCircle2, Check, X } from "lucide-react";
import type { PasswordRule } from "@/lib/auth-errors";
import { cn } from "@/lib/utils";

/**
 * Announced politely rather than silently swapped in, so someone using a screen
 * reader hears why a submit failed instead of the form appearing to do nothing.
 */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-2.5 rounded-lg border border-bearish/25 bg-bearish/10 px-3 py-2.5 text-sm text-bearish"
    >
      <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2.5 rounded-lg border border-sunset-orange/25 bg-sunset-orange/10 px-3 py-2.5 text-sm text-sunset-orange"
    >
      <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

/** Requirements shown as they are met, rather than as an error after submitting. */
export function PasswordRules({ rules }: { rules: PasswordRule[] }) {
  return (
    <ul className="mt-2 grid gap-1.5">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={cn(
            "flex items-center gap-1.5 transition-colors",
            rule.passed ? "text-bullish" : "text-mist/70"
          )}
        >
          {rule.passed ? (
            <Check aria-hidden className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <X aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-50" />
          )}
          <span>{rule.label}</span>
          <span className="sr-only">{rule.passed ? " — met" : " — not met"}</span>
        </li>
      ))}
    </ul>
  );
}
