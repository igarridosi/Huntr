import type { Metadata } from "next";

/** Per-route layouts override this; it only covers the group's shared default. */
export const metadata: Metadata = {
  title: "Sign In — Huntr",
  description: "Sign in to your Huntr account. The Wolf of Value Street.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Each screen owns its own full-height frame via AuthShell.
  return <div className="min-h-svh bg-wolf-black">{children}</div>;
}
