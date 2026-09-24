"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Mail, User } from "lucide-react";
import { SettingRow, SettingsSection } from "./settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSupabase } from "@/providers/supabase-provider";
import { ROUTES } from "@/lib/constants";

const MIN_PASSWORD = 8;

export function AccountCard() {
  const router = useRouter();
  const { supabase, user, isLoading } = useSupabase();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null;

  const changePassword = async () => {
    if (password.length < MIN_PASSWORD) {
      setStatus({ ok: false, message: `Use at least ${MIN_PASSWORD} characters.` });
      return;
    }
    if (password !== confirm) {
      setStatus({ ok: false, message: "The two passwords do not match." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setStatus({ ok: false, message: error.message });
      return;
    }
    setPassword("");
    setConfirm("");
    setOpen(false);
    setStatus({ ok: true, message: "Password changed. Other devices stay signed in." });
  };

  return (
    <SettingsSection icon={User} title="Account" description="Who you are signed in as, and how you get back in.">
      <div className="space-y-3 rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-4">
        <div className="flex items-center gap-2 text-sm text-snow-peak">
          <Mail className="h-4 w-4 text-mist" aria-hidden />
          <span className="truncate">{isLoading ? "Loading…" : user?.email ?? "Not available"}</span>
        </div>
        {memberSince ? <p className="font-mono text-[11px] text-mist">Account created {memberSince}</p> : null}
      </div>

      <SettingRow label="Password" hint="Set a new one for this account. You will not be signed out.">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen((v) => !v)} disabled={!user}>
          <KeyRound className="h-3.5 w-3.5" />
          {open ? "Cancel" : "Change"}
        </Button>
      </SettingRow>

      {open ? (
        <div className="space-y-3 rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-xs text-mist">
                New password
              </label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD} characters`}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="text-xs text-mist">
                Repeat it
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Same again"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={changePassword} disabled={busy || !password || !confirm}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </div>
        </div>
      ) : null}

      {status ? (
        <p className={`text-xs ${status.ok ? "text-bullish" : "text-bearish"}`} role="status">
          {status.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={async () => {
            await supabase.auth.signOut();
            router.push(ROUTES.LOGIN);
          }}
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </Button>
      </div>
    </SettingsSection>
  );
}
