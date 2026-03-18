"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { CommandPalette } from "@/components/search/command-palette";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);

  const isInsightsRoute = pathname === ROUTES.APP_INSIGHTS;
  const useDesktopOverlaySidebar = pathname.startsWith("/app") && !isInsightsRoute;

  const handleSearchClick = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleMenuClick = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const handleDesktopMenuClick = useCallback(() => {
    if (useDesktopOverlaySidebar) {
      setDesktopMenuOpen((prev) => !prev);
    }
  }, [useDesktopOverlaySidebar]);

  const handleCloseMobile = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    setDesktopMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-wolf-black">
      {/* Desktop Sidebar */}
      <Sidebar
        onSearchClick={handleSearchClick}
        overlay={useDesktopOverlaySidebar}
        open={useDesktopOverlaySidebar ? desktopMenuOpen : true}
        onClose={() => setDesktopMenuOpen(false)}
      />

      {/* Mobile Sidebar */}
      <MobileSidebar
        open={mobileMenuOpen}
        onClose={handleCloseMobile}
        onSearchClick={handleSearchClick}
      />

      {/* Main Content Area */}
      <div
        className={cn(
          "flex flex-col min-h-screen",
          !useDesktopOverlaySidebar && "lg:pl-64"
        )}
      >
        {/* Topbar */}
        <Topbar
          onSearchClick={handleSearchClick}
          onMenuClick={handleMenuClick}
          onDesktopMenuClick={handleDesktopMenuClick}
          showDesktopMenuToggle={useDesktopOverlaySidebar}
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
