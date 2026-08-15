"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, PasswordRules } from "@/components/auth/auth-feedback";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { checkPassword, humanizeAuthError, passwordMeetsRules } from "@/lib/auth-errors";

type Stage = "verifying" | "ready" | "invalid";

/**
 * Landing page for the recovery link sent from the sign-in screen. Without it
 * "Forgot password?" would mail out a link with nowhere to go.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>("verifying");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = checkPassword(password);
  const strongEnough = passwordMeetsRules(password);
  const mismatch = confirmTouched && confirmPassword.length > 0 && confirmPassword !== password;
  const canSubmit = strongEnough && confirmPassword === password;

  // The link arrives either as a PKCE `code` to exchange or as a hash the
  // client picks up on its own, so both paths are handled before giving up.
  useEffect(() => {
    let active = true;

    const verify = async () => {
      const code = new URLSearchParams(window.location.search).get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        setStage(exchangeError ? "invalid" : "ready");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setStage(data.session ? "ready" : "invalid");
    };

    void verify();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setStage("ready");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSubmit) {
      setError("Check the requirements below before continuing.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      await supabase.auth.signOut();
      router.replace(`${ROUTES.LOGIN}?reset=1`);
    } catch (err) {
      setError(humanizeAuthError(err, "Couldn't update your password. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  if (stage === "verifying") {
    return (
      <AuthShell
        title="Checking your link"
        subtitle="One moment while we verify it."
        footer={null}
      >
        <div className="flex justify-center py-6">
          <Spinner size="sm" />
        </div>
      </AuthShell>
    );
  }

  if (stage === "invalid") {
    return (
      <AuthShell
        title="This link has expired"
        subtitle="Reset links are single-use and short-lived. Request a fresh one and it will work."
        footer={
          <Link
            href={ROUTES.LOGIN}
            className="font-medium text-sunset-orange transition-colors hover:text-sunset-orange/80"
          >
            Back to sign in
          </Link>
        }
      >
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => router.push(ROUTES.LOGIN)}
        >
          Request a new link
          <ArrowRight className="h-4 w-4" />
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something you haven't used here before."
      footer={
        <Link
          href={ROUTES.LOGIN}
          className="font-medium text-sunset-orange transition-colors hover:text-sunset-orange/80"
        >
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <AuthField
          label="New password"
          icon={Lock}
          revealable
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          autoFocus
          hint={<PasswordRules rules={rules} />}
        />

        <AuthField
          label="Confirm new password"
          icon={ShieldCheck}
          revealable
          placeholder="Repeat your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onBlur={() => setConfirmTouched(true)}
          required
          autoComplete="new-password"
          error={mismatch}
          hint={
            mismatch ? (
              <span className="text-bearish">Both passwords must match.</span>
            ) : undefined
          }
        />

        {error && <AuthError>{error}</AuthError>}

        <Button type="submit" size="lg" className="w-full" disabled={loading || !canSubmit}>
          {loading ? (
            <Spinner size="sm" color="white" />
          ) : (
            <>
              Update password
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
