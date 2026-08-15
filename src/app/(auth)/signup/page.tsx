"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, PasswordRules } from "@/components/auth/auth-feedback";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { checkPassword, humanizeAuthError, passwordMeetsRules } from "@/lib/auth-errors";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = checkPassword(password);
  const strongEnough = passwordMeetsRules(password);
  // Only a mismatch once they have moved on — flagging mid-typing reads as
  // an error for text that simply is not finished yet.
  const mismatch = confirmTouched && confirmPassword.length > 0 && confirmPassword !== password;
  const canSubmit = email.trim().length > 0 && strongEnough && confirmPassword === password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!strongEnough) {
      setError("Your password doesn't meet the requirements yet.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }

    setLoading(true);

    try {
      const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
      const baseUrl = (configuredSiteUrl || window.location.origin).replace(/\/+$/, "");

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${baseUrl}${ROUTES.LOGIN}` },
      });

      if (signUpError) throw signUpError;

      if (data.session) {
        router.replace(ROUTES.APP);
        router.refresh();
        return;
      }

      router.replace(`${ROUTES.LOGIN}?checkEmail=1`);
    } catch (err) {
      setError(humanizeAuthError(err, "Couldn't create your account. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free while Huntr is in beta. No card required."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={ROUTES.LOGIN}
            className="font-medium text-sunset-orange transition-colors hover:text-sunset-orange/80"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <AuthField
          label="Email"
          icon={Mail}
          type="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
        />

        <AuthField
          label="Password"
          icon={Lock}
          revealable
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          hint={<PasswordRules rules={rules} />}
        />

        <AuthField
          label="Confirm password"
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
              Create account
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>

        <p className="text-center text-xs leading-relaxed text-mist/70">
          By creating an account you agree to our terms and privacy policy.
        </p>
      </form>
    </AuthShell>
  );
}
