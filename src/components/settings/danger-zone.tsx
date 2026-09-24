"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { SettingsSection } from "./settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteAccount } from "@/app/actions/account";
import { ROUTES } from "@/lib/constants";

/**
 * Deleting the account. Typing the email is the confirmation — a
 * "are you sure?" is clicked through on reflex, an address is not.
 */
export function DangerZone({ email }: { email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = Boolean(email) && typed.trim().toLowerCase() === email!.toLowerCase();

  const remove = async () => {
    setBusy(true);
    setError(null);
    const { ok, error: failure } = await deleteAccount(typed);
    setBusy(false);
    if (!ok) {
      setError(failure ?? "Could not delete the account.");
      return;
    }
    router.push(ROUTES.HOME);
    router.refresh();
  };

  return (
    <SettingsSection
      icon={AlertTriangle}
      tone="danger"
      title="Delete account"
      description="Removes the account and everything under it — watchlists, portfolios, saved valuations and charts. It cannot be undone, and nothing is kept. Export your data first if you want a copy."
    >
      {open ? (
        <div className="space-y-3 rounded-xl border border-bearish/25 bg-wolf-black/25 p-4">
          <div className="space-y-1.5">
            <label htmlFor="delete-confirm" className="text-xs text-mist">
              Type <span className="font-mono text-snow-peak">{email ?? "your email"}</span> to confirm
            </label>
            <Input
              id="delete-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email ?? ""}
              autoComplete="off"
              className="sm:max-w-sm"
            />
          </div>
          {error ? <p className="text-xs text-bearish">{error}</p> : null}
          <div className="flex items-center gap-2">
            <Button variant="destructive" size="sm" className="gap-2" disabled={!matches || busy} onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" />
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-bearish/40 text-bearish transition-transform duration-150 hover:bg-bearish/10 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete my account
        </Button>
      )}
    </SettingsSection>
  );
}
