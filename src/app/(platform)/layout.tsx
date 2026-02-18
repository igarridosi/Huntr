"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { CommandPalette } from "@/components/search/command-palette";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearchClick = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleMenuClick = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const handleCloseMobile = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-wolf-black">
      {/* Desktop Sidebar */}
      <Sidebar onSearchClick={handleSearchClick} />

      {/* Mobile Sidebar */}
      <MobileSidebar
        open={mobileMenuOpen}
        onClose={handleCloseMobile}
        onSearchClick={handleSearchClick}
      />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Topbar */}
        <Topbar
          onSearchClick={handleSearchClick}
          onMenuClick={handleMenuClick}
        />

        {/* Page Content */}
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      {/* Command Palette (global) */}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
