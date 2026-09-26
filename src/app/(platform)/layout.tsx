"use client";

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { DockSidebar } from "@/components/layout/dock-sidebar";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

// cmdk only matters once the palette opens, and it renders nothing while
// closed, so the chunk loads after hydration instead of with the page.
const CommandPalette = dynamic(
  () => import("@/components/search/command-palette").then((m) => m.CommandPalette),
  { ssr: false }
);

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dockExpanded, setDockExpanded] = useState(false);

  // Insights keeps the full sidebar beside the page; the other sections get
  // the rail, which leaves them the width and keeps the menu one click away.
  const isInsightsRoute = pathname === ROUTES.APP_INSIGHTS;
  const useDock = pathname.startsWith("/app") && !isInsightsRoute;

  const handleSearchClick = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleMenuClick = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const handleCloseMobile = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  // Navigating closes the open panel. A route change is a prop change from the
  // router's point of view, so it is handled like one: during render.
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    setDockExpanded(false);
  }

  return (
    <div className="min-h-screen bg-wolf-black">
      {/* Desktop navigation */}
      {useDock ? (
        <DockSidebar expanded={dockExpanded} onExpandedChange={setDockExpanded} onSearchClick={handleSearchClick} />
      ) : (
        <Sidebar onSearchClick={handleSearchClick} />
      )}

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
          useDock ? "lg:pl-20" : "lg:pl-64"
        )}
      >
        {/* Topbar */}
        <Topbar
          onSearchClick={handleSearchClick}
          onMenuClick={handleMenuClick}
        />

        {/* Page Content
            overflow-x-clip, not hidden: it stops any absolutely-positioned
            decoration (tooltips, popovers) from dragging the page sideways,
            without turning this into a scroll container — which would break the
            sticky topbar. Content that genuinely needs to scroll sideways, like
            wide tables, still does so in its own container. */}
        <main className="flex-1 overflow-x-clip px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      {/* Command Palette (global) */}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
