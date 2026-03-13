"use client";

import { useRouter } from "next/navigation";
import { Settings, Shield, LogOut, Mail, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { useSupabase } from "@/providers/supabase-provider";

export default function SettingsPage() {
  const router = useRouter();
  const { supabase, user, isLoading } = useSupabase();

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
          <Settings className="w-5 h-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">Settings</h1>
          <p className="text-xs text-mist mt-0.5">Manage your account and session</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-sunset-orange" /> Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-snow-peak">
              <Mail className="w-4 h-4 text-mist" />
              <span>{isLoading ? "Loading..." : (user?.email ?? "Not available")}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-mist">
              <Shield className="w-3.5 h-3.5" />
              Data is now scoped to your authenticated account.
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="destructive"
              className="gap-2"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push(ROUTES.LOGIN);
              }}
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
