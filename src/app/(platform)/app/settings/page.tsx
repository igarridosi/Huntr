"use client";

import { Settings } from "lucide-react";
import { AccountCard } from "@/components/settings/account-card";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { PrivacyCard } from "@/components/settings/privacy-card";
import { DataCard } from "@/components/settings/data-card";
import { DangerZone } from "@/components/settings/danger-zone";
import { useSupabase } from "@/providers/supabase-provider";

/**
 * Two columns on a wide screen, one on a narrow one. The identity side
 * sits on the left — who you are, what you hold — and the side that
 * changes how the product behaves sits on the right, so a choice never
 * has to be hunted for twice. Deleting the account spans both: it is
 * not one column's business.
 */
export default function SettingsPage() {
  // The route is behind the middleware, so a reader here always has an account.
  const { user } = useSupabase();

  return (
    <div className="w-full space-y-6 pb-4">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sunset-orange/15 bg-sunset-orange/10">
          <Settings className="h-5 w-5 text-sunset-orange" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-[-0.02em] text-snow-peak">Settings</h1>
          <p className="mt-0.5 text-xs text-mist">Your account, how the terminal looks, and what it records.</p>
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          {user ? <AccountCard /> : null}
          {user ? <DataCard signedIn /> : null}
          {/* Under "Your data", because exporting it is what you do before
              deleting it — and because the column has the room. */}
          {user ? <DangerZone email={user.email ?? null} /> : null}
        </div>
        <div className="space-y-4">
          <AppearanceCard />
          <PrivacyCard />
        </div>
      </div>
    </div>
  );
}
