import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account — Huntr",
  description: "Create your free Huntr account and start analyzing companies.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
