"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { LogIn, Star, UserPlus } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

export type AuthGateReason =
  | "watchlist"
  | "dcf"
  | "portfolio"
  | "deepData"
  | "addTicker"
  | "generic";

const REASON_COPY: Record<AuthGateReason, { title: string; description: string }> = {
  watchlist: {
    title: "Create a free account to save your watchlist",
    description:
      "You can browse quotes and charts without signing up, but saving tickers, notes and alerts requires an account.",
  },
  dcf: {
    title: "Create a free account to save your DCF scenarios",
    description:
      "The DCF calculator works without an account, but saving and reloading scenarios per ticker requires signing up.",
  },
  portfolio: {
    title: "Create a free account to track your portfolio",
    description:
      "Portfolio tracking is only available to registered users — sign up free to add positions and track performance.",
  },
  deepData: {
    title: "Create a free account to unlock extended history",
    description:
      "Extended historical data (20Y financials, full earnings history) is only available to registered users to keep this data source sustainable.",
  },
  addTicker: {
    title: "Create a free account to add new tickers",
    description:
      "Adding a ticker that isn't yet in Huntr's database is only available to registered users.",
  },
  generic: {
    title: "Create a free account",
    description: "Sign up to unlock saving your data on Huntr.",
  },
};

interface AuthGateContextValue {
  openGate: (reason?: AuthGateReason) => void;
}

const AuthGateContext = createContext<AuthGateContextValue | undefined>(undefined);

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [reason, setReason] = useState<AuthGateReason | null>(null);

  const openGate = useCallback((nextReason: AuthGateReason = "generic") => {
    setReason(nextReason);
  }, []);

  const close = useCallback(() => setReason(null), []);

  const value = useMemo(() => ({ openGate }), [openGate]);
  const copy = reason ? REASON_COPY[reason] : null;

  return (
    <AuthGateContext.Provider value={value}>
      {children}
      <Dialog open={reason !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-sm p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
              <Star className="w-5 h-5 text-sunset-orange" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-snow-peak">
                {copy?.title}
              </h3>
              <p className="text-xs text-mist mt-1.5">{copy?.description}</p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="gap-1.5"
                onClick={() => {
                  close();
                  router.push(ROUTES.SIGNUP);
                }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Create free account
              </Button>
              <Button
                variant="ghost"
                className="gap-1.5"
                onClick={() => {
                  close();
                  router.push(ROUTES.LOGIN);
                }}
              >
                <LogIn className="w-3.5 h-3.5" />
                I already have an account
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  const context = useContext(AuthGateContext);
  if (context === undefined) {
    throw new Error("useAuthGate must be used within an AuthGateProvider");
  }
  return context;
}
