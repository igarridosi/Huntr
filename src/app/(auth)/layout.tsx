import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — Huntr",
  description: "Sign in to your Huntr account. The Wolf of Value Street.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-wolf-black flex items-center justify-center px-4">
      {children}
    </div>
  );
}
