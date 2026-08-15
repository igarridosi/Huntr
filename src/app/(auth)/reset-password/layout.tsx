import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password — Huntr",
  description: "Choose a new password for your Huntr account.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
