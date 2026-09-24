"use client";

import { Settings } from "lucide-react";
import { AccountCard } from "@/components/settings/account-card";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { PrivacyCard } from "@/components/settings/privacy-card";
import { DataCard } from "@/components/settings/data-card";
import { DangerZone } from "@/components/settings/danger-zone";
import { useSupabase } from "@/providers/supabase-provider";

export default function SettingsPage() {
  // The route is behind the middleware, so a reader here always has an account.
  const { user } = useSupabase();

  return (
    <div className="w-full max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sunset-orange/15 bg-sunset-orange/10">
          <Settings className="h-5 w-5 text-sunset-orange" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">Settings</h1>
          <p className="mt-0.5 text-xs text-mist">Your account, how the terminal looks, and what it records.</p>
        </div>
      </div>


      {user ? <AccountCard /> : null}
      <AppearanceCard />
      <PrivacyCard />
      {user ? <DataCard signedIn /> : null}
      {user ? <DangerZone email={user.email ?? null} /> : null}
    </div>
  );
}
