"use client";

import { useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ExpandChartDialogProps {
  title: string;
  children: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
}

export function ExpandChartDialog({
  title,
  children,
  headerRight,
  footer,
}: ExpandChartDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-wolf-border/60 bg-wolf-black/30 text-mist hover:text-snow-peak hover:bg-wolf-border/30 transition-colors"
        aria-label={`Expand ${title} chart`}
        title="Expand chart"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="max-w-6xl w-[95vw] p-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b border-wolf-border/50">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-sm md:text-base">{title}</DialogTitle>
            <div className="flex items-center gap-2">
              {headerRight}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Close chart dialog"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="p-4 md:p-6">{children}</div>
        {footer ? (
          <div className="px-5 py-3 border-t border-wolf-border/50 bg-wolf-black/20">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
