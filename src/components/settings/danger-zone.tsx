"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
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
    <div className="rounded-xl border border-bearish/30 bg-bearish/[0.04] p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-bearish" aria-hidden />
        <h2 className="text-base font-semibold text-snow-peak">Delete account</h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-mist">
        Removes the account and everything under it — watchlists, portfolios, saved valuations and charts. It cannot be
        undone, and nothing is kept. Export your data first if you want a copy.
      </p>

      {open ? (
        <div className="mt-4 space-y-3">
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
        <div className="mt-4">
          <Button variant="outline" size="sm" className="gap-2 border-bearish/40 text-bearish hover:bg-bearish/10" onClick={() => setOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete my account
          </Button>
        </div>
      )}
    </div>
  );
}
