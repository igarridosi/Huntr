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
import { AuthGateDialog, type AuthGateReason } from "@/components/auth/auth-gate-dialog";
import { ROUTES } from "@/lib/constants";
import { withReturnPath } from "@/lib/auth-callback";

export type { AuthGateReason };

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

  // Signing up or in brings them back to the page they were on, where the
  // thing they reached for is.
  const goTo = useCallback(
    (route: string) => {
      close();
      router.push(withReturnPath(route, `${window.location.pathname}${window.location.search}`));
    },
    [close, router]
  );

  const value = useMemo(() => ({ openGate }), [openGate]);

  return (
    <AuthGateContext.Provider value={value}>
      {children}
      <AuthGateDialog
        reason={reason}
        onClose={close}
        onSignup={() => goTo(ROUTES.SIGNUP)}
        onLogin={() => goTo(ROUTES.LOGIN)}
      />
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
