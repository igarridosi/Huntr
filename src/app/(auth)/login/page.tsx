"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, AuthNotice } from "@/components/auth/auth-feedback";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { humanizeAuthError } from "@/lib/auth-errors";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkEmail") === "1") {
      setNotice("Account created. Check your inbox to confirm it, then sign in.");
    } else if (params.get("reset") === "1") {
      setNotice("Password updated. Sign in with your new password.");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) throw signInError;

      router.replace(ROUTES.APP);
      router.refresh();
    } catch (err) {
      setError(humanizeAuthError(err, "Couldn't sign you in. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  /**
   * Reset needs the address, and asking for it in a separate screen loses what
   * is already typed — so the field on screen is reused, and it only prompts
   * when empty.
   */
  async function handleForgotPassword() {
    setError(null);
    setNotice(null);

    const address = email.trim();
    if (!address) {
      setError("Enter your email address above, then choose “Forgot password?”.");
      return;
    }

    setSendingReset(true);

    try {
      const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
      const baseUrl = (configuredSiteUrl || window.location.origin).replace(/\/+$/, "");

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${baseUrl}/reset-password`,
      });

      if (resetError) throw resetError;

      // Deliberately not confirming whether the address exists — that would let
      // anyone probe for registered users.
      setNotice(`If an account exists for ${address}, a reset link is on its way.`);
    } catch (err) {
      setError(humanizeAuthError(err, "Couldn't send the reset link. Please try again."));
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            href={ROUTES.SIGNUP}
            className="font-medium text-sunset-orange transition-colors hover:text-sunset-orange/80"
          >
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {notice && <AuthNotice>{notice}</AuthNotice>}

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
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          action={
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={sendingReset}
              className="cursor-pointer text-xs text-sunset-orange transition-colors hover:text-sunset-orange/80 disabled:opacity-60"
            >
              {sendingReset ? "Sending…" : "Forgot password?"}
            </button>
          }
        />

        {error && <AuthError>{error}</AuthError>}

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (
            <Spinner size="sm" color="white" />
          ) : (
            <>
              Sign in
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
