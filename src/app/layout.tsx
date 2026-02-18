import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/providers/query-provider";
import { SupabaseProvider } from "@/providers/supabase-provider";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-satoshi",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Huntr — The Wolf of Value Street",
  description:
    "Tactical financial analysis platform. Hunt for value with precision.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${outfit.variable} ${geistMono.variable} antialiased bg-wolf-black text-snow-peak`}
      >
        <SupabaseProvider>
          <QueryProvider>
            {children}
          </QueryProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
